# Shell-style icon bitmap (SHGetFileInfo + system icon handle) as PNG base64 on stdout.
# Same family of API Explorer uses for item icons; works for .lnk, .exe, .dll, etc.
#
# Single-item: pass -InputPath (writes one base64 line, no trailing newline beyond EOF).
# Batch: pass -PathsFile (UTF-8 text, one absolute path per non-empty line). Writes one
# base64 PNG line per input line; failures emit an empty line so callers align by index.
param(
    [Parameter(Mandatory = $false)][string]$InputPath = "",
    [Parameter(Mandatory = $false)][string]$PathsFile = "",
    [Parameter(Mandatory = $false)][int]$IconSize = 256
)

$ErrorActionPreference = 'Stop'

if ($IconSize -lt 16 -or $IconSize -gt 512) {
    $IconSize = 256
}

Add-Type -ReferencedAssemblies System.Drawing @'
using System;
using System.Drawing;
using System.Drawing.Drawing2D;
using System.Drawing.Imaging;
using System.IO;
using System.Runtime.InteropServices;

public static class FlowSwitchShellItemIcon
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public struct SHFILEINFO
    {
        public IntPtr hIcon;
        public int iIcon;
        public uint dwAttributes;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 260)]
        public string szDisplayName;
        [MarshalAs(UnmanagedType.ByValTStr, SizeConst = 80)]
        public string szTypeName;
    }

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "SHGetFileInfoW")]
    public static extern IntPtr SHGetFileInfoByPath(
        string pszPath,
        uint dwFileAttributes,
        ref SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode, EntryPoint = "SHGetFileInfoW")]
    public static extern IntPtr SHGetFileInfoByPidl(
        IntPtr pszPath,
        uint dwFileAttributes,
        ref SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern int SHParseDisplayName(
        string pszName,
        IntPtr pbc,
        out IntPtr ppidl,
        uint sfgaoIn,
        out uint psfgaoOut);

    [DllImport("user32.dll")]
    [return: MarshalAs(UnmanagedType.Bool)]
    public static extern bool DestroyIcon(IntPtr hIcon);

    [DllImport("user32.dll", CharSet = CharSet.Unicode, SetLastError = true)]
    public static extern int PrivateExtractIcons(
        string lpszFile,
        int nIconIndex,
        int cxIcon,
        int cyIcon,
        IntPtr[] phicon,
        int[] piconid,
        int nIcons,
        int flags);

    [DllImport("ole32.dll")]
    public static extern void CoTaskMemFree(IntPtr pv);

    const uint SHGFI_ICON = 0x00000100;
    const uint SHGFI_LARGEICON = 0x00000000;
    const uint SHGFI_PIDL = 0x00000008;

    static byte[] RenderScaledPngFromIconHandle(IntPtr hIcon, int sizePx)
    {
        Icon ico = (Icon)Icon.FromHandle(hIcon).Clone();
        DestroyIcon(hIcon);
        using (ico)
        using (Bitmap src = ico.ToBitmap())
        using (Bitmap scaled = new Bitmap(sizePx, sizePx, PixelFormat.Format32bppArgb))
        using (Graphics g = Graphics.FromImage(scaled))
        {
            g.InterpolationMode = InterpolationMode.HighQualityBicubic;
            g.SmoothingMode = SmoothingMode.HighQuality;
            g.PixelOffsetMode = PixelOffsetMode.HighQuality;
            g.Clear(Color.Transparent);
            g.DrawImage(src, new Rectangle(0, 0, sizePx, sizePx));
            using (MemoryStream ms = new MemoryStream())
            {
                scaled.Save(ms, ImageFormat.Png);
                return ms.ToArray();
            }
        }
    }

    static bool PathHintsGameLauncherMultiIcon(string path)
    {
        if (string.IsNullOrWhiteSpace(path)) return false;
        string p = path.ToLowerInvariant();
        return p.Contains("steam") || p.Contains("steamapps") || p.Contains("epic games")
            || p.Contains("gog galaxy") || p.Contains("ubisoft") || p.Contains("riot games")
            || p.Contains("battle.net") || p.Contains("ea games") || p.Contains("electronic arts");
    }

    static byte[] TryBestPrivateExtractIcons(string path, int sizePx)
    {
        int bestArea = 0;
        byte[] best = null;
        for (int idx = 0; idx < 56; idx++)
        {
            IntPtr[] phicon = new IntPtr[1];
            int[] piconid = new int[1];
            int n = PrivateExtractIcons(path, idx, sizePx, sizePx, phicon, piconid, 1, 0);
            if (n <= 0 || phicon[0] == IntPtr.Zero) break;
            IntPtr hIcon = phicon[0];
            try
            {
                using (Icon ico = (Icon)Icon.FromHandle(hIcon).Clone())
                {
                    DestroyIcon(hIcon);
                    hIcon = IntPtr.Zero;
                    using (Bitmap src = ico.ToBitmap())
                    {
                        int area = src.Width * src.Height;
                        if (area >= bestArea)
                        {
                            bestArea = area;
                            using (Bitmap scaled = new Bitmap(sizePx, sizePx, PixelFormat.Format32bppArgb))
                            using (Graphics g = Graphics.FromImage(scaled))
                            {
                                g.InterpolationMode = InterpolationMode.HighQualityBicubic;
                                g.SmoothingMode = SmoothingMode.HighQuality;
                                g.PixelOffsetMode = PixelOffsetMode.HighQuality;
                                g.Clear(Color.Transparent);
                                g.DrawImage(src, new Rectangle(0, 0, sizePx, sizePx));
                                using (MemoryStream ms = new MemoryStream())
                                {
                                    scaled.Save(ms, ImageFormat.Png);
                                    best = ms.ToArray();
                                }
                            }
                        }
                    }
                }
            }
            catch
            {
            }
            finally
            {
                if (hIcon != IntPtr.Zero) DestroyIcon(hIcon);
            }
        }
        return best;
    }

    public static byte[] GetPng(string path, int sizePx)
    {
        SHFILEINFO sfi = new SHFILEINFO();
        uint flags = SHGFI_ICON | SHGFI_LARGEICON;
        IntPtr ret = IntPtr.Zero;
        IntPtr pidl = IntPtr.Zero;
        bool usedPidl = false;
        if (!string.IsNullOrWhiteSpace(path) && path.StartsWith("shell:", StringComparison.OrdinalIgnoreCase))
        {
            uint attrs = 0;
            int parseHr = SHParseDisplayName(path, IntPtr.Zero, out pidl, 0, out attrs);
            if (parseHr == 0 && pidl != IntPtr.Zero)
            {
                usedPidl = true;
                ret = SHGetFileInfoByPidl(
                    pidl,
                    0,
                    ref sfi,
                    (uint)Marshal.SizeOf(typeof(SHFILEINFO)),
                    flags | SHGFI_PIDL
                );
            }
        }
        if (!usedPidl)
        {
            try
            {
                if (!string.IsNullOrWhiteSpace(path))
                {
                    string ext = Path.GetExtension(path);
                    if (ext != null && (ext.Equals(".exe", StringComparison.OrdinalIgnoreCase)
                        || ext.Equals(".dll", StringComparison.OrdinalIgnoreCase)))
                    {
                        if (PathHintsGameLauncherMultiIcon(path))
                        {
                            byte[] multi = TryBestPrivateExtractIcons(path, sizePx);
                            if (multi != null) return multi;
                        }
                        IntPtr[] phicon = new IntPtr[1];
                        int[] piconid = new int[1];
                        int n = PrivateExtractIcons(path, 0, sizePx, sizePx, phicon, piconid, 1, 0);
                        if (n > 0 && phicon[0] != IntPtr.Zero)
                        {
                            return RenderScaledPngFromIconHandle(phicon[0], sizePx);
                        }
                    }
                }
            }
            catch
            {
            }
            ret = SHGetFileInfoByPath(path, 0, ref sfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), flags);
        }
        if (sfi.hIcon == IntPtr.Zero || ret == IntPtr.Zero)
        {
            if (pidl != IntPtr.Zero) { CoTaskMemFree(pidl); }
            throw new InvalidOperationException("SHGetFileInfo returned no icon (ret=" + ret + ").");
        }
        try
        {
            return RenderScaledPngFromIconHandle(sfi.hIcon, sizePx);
        }
        finally
        {
            if (pidl != IntPtr.Zero) { CoTaskMemFree(pidl); }
        }
    }
}
'@

if ($PathsFile -ne "") {
    if (-not (Test-Path -LiteralPath $PathsFile)) {
        exit 2
    }
    $lines = Get-Content -LiteralPath $PathsFile -Encoding utf8
    foreach ($line in $lines) {
        $p = $line.Trim()
        if ($p -eq "") {
            continue
        }
        try {
            $bytes = [FlowSwitchShellItemIcon]::GetPng($p, $IconSize)
            [Console]::Out.WriteLine([Convert]::ToBase64String($bytes))
        }
        catch {
            [Console]::Out.WriteLine("")
        }
    }
    exit 0
}

if ($InputPath -eq "") {
    exit 2
}

$bytes = [FlowSwitchShellItemIcon]::GetPng($InputPath, $IconSize)
[Console]::Out.Write([Convert]::ToBase64String($bytes))
