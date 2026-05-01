/**
 * Canonical list of “Opens with” app labels for content library UI.
 * Lives outside React components so Vite Fast Refresh is not invalidated.
 */
export const AVAILABLE_APPS = [
  "Chrome",
  "Firefox",
  "Safari",
  "Edge",

  "Microsoft Word",
  "Microsoft Excel",
  "Microsoft PowerPoint",
  "Microsoft Outlook",

  "Visual Studio Code",
  "Visual Studio",
  "Sublime Text",
  "Atom",
  "IntelliJ IDEA",

  "Adobe Acrobat",
  "Notepad",
  "Notepad++",
  "Photos",
  "VLC Media Player",
  "Windows Media Player",
  "Adobe Photoshop",
  "Adobe Illustrator",

  "File Explorer",
  "WinRAR",
  "7-Zip",
  "Command Prompt",
  "PowerShell",

  "Discord",
  "Slack",
  "Microsoft Teams",
  "Zoom",

  "Figma",
  "Adobe XD",
  "Sketch",
  "Canva",
] as const;
