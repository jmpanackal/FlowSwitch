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

    [DllImport("shell32.dll", CharSet = CharSet.Unicode)]
    public static extern IntPtr SHGetFileInfo(
        string pszPath,
        uint dwFileAttributes,
        ref SHFILEINFO psfi,
        uint cbFileInfo,
        uint uFlags);

    const uint SHGFI_ICON = 0x00000100;
    const uint SHGFI_LARGEICON = 0x00000000;

    public static byte[] GetPng(string path, int sizePx)
    {
        SHFILEINFO sfi = new SHFILEINFO();
        uint flags = SHGFI_ICON | SHGFI_LARGEICON;
        IntPtr ret = SHGetFileInfo(path, 0, ref sfi, (uint)Marshal.SizeOf(typeof(SHFILEINFO)), flags);
        if (sfi.hIcon == IntPtr.Zero)
        {
            throw new InvalidOperationException("SHGetFileInfo returned no icon (ret=" + ret + ").");
        }
        using (Icon ico = Icon.FromHandle(sfi.hIcon))
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
