import type { ContentFolder, ContentItem } from "../components/ContentManager";
import { AVAILABLE_APPS } from "../components/ContentManager";

type LibrarySelectionInput =
  | { kind: "item"; item: ContentItem }
  | { kind: "folder"; folder: ContentFolder };

const BROWSER_NAMES = new Set(
  [
    "Chrome",
    "Firefox",
    "Safari",
    "Edge",
    "Brave",
    "Opera",
    "Vivaldi",
  ].map((s) => s.toLowerCase()),
);

const FOLDER_OPENERS = new Set(
  [
    "File Explorer",
    "Visual Studio Code",
    "Windows Terminal",
    "Command Prompt",
    "PowerShell",
    "Sublime Text",
    "Atom",
    "IntelliJ IDEA",
  ].map((s) => s.toLowerCase()),
);

const OFFICE_APPS = new Set(
  [
    "Microsoft Word",
    "Microsoft Excel",
    "Microsoft PowerPoint",
    "Microsoft Outlook",
    "Adobe Acrobat",
  ].map((s) => s.toLowerCase()),
);

const MEDIA_APPS = new Set(
  [
    "Photos",
    "VLC Media Player",
    "Windows Media Player",
    "Adobe Photoshop",
    "Adobe Illustrator",
  ].map((s) => s.toLowerCase()),
);

const CODE_APPS = new Set(
  [
    "Visual Studio Code",
    "Visual Studio",
    "Sublime Text",
    "Atom",
    "IntelliJ IDEA",
  ].map((s) => s.toLowerCase()),
);

const TEXT_APPS = new Set(
  ["Notepad", "Notepad++", "Visual Studio Code"].map((s) => s.toLowerCase()),
);

const ARCHIVE_APPS = new Set(["WinRAR", "7-Zip"].map((s) => s.toLowerCase()));

function catalogFilter(pred: (name: string) => boolean): string[] {
  return AVAILABLE_APPS.filter((a) => pred(a));
}

function extOfFileItem(item: ContentItem): string {
  const fromName = item.name?.split(".").pop()?.toLowerCase() || "";
  const fromPath = item.path?.split(".").pop()?.toLowerCase() || "";
  return fromName.length <= 8 ? fromName : fromPath;
}

/**
 * Apps shown in “Opens with” for the library inspector — subset of {@link AVAILABLE_APPS}.
 */
export function getCompatibleOpensWithApps(
  selection: LibrarySelectionInput,
): string[] {
  if (selection.kind === "folder" || isFolderLikeItem(selection)) {
    return catalogFilter((a) => FOLDER_OPENERS.has(a.toLowerCase()));
  }
  const item = selection.item;
  if (item.type === "link") {
    return catalogFilter((a) => BROWSER_NAMES.has(a.toLowerCase()));
  }

  const ext = extOfFileItem(item);
  const groups: Array<Set<string>> = [];

  if (
    ["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp", "ico"].includes(ext)
  ) {
    groups.push(MEDIA_APPS);
  }
  if (["mp4", "avi", "mov", "mkv", "webm"].includes(ext)) {
    groups.push(MEDIA_APPS);
  }
  if (["mp3", "wav", "flac", "aac", "ogg", "m4a"].includes(ext)) {
    groups.push(MEDIA_APPS);
  }
  if (
    ["pdf"].includes(ext)
    || ["doc", "docx", "xls", "xlsx", "ppt", "pptx"].includes(ext)
  ) {
    groups.push(OFFICE_APPS);
  }
  if (
    [
      "zip",
      "rar",
      "7z",
      "tar",
      "gz",
    ].includes(ext)
  ) {
    groups.push(ARCHIVE_APPS);
  }
  if (
    [
      "txt",
      "md",
      "json",
      "xml",
      "csv",
      "log",
    ].includes(ext)
  ) {
    groups.push(TEXT_APPS);
  }
  if (
    [
      "js",
      "ts",
      "tsx",
      "jsx",
      "html",
      "css",
      "py",
      "java",
      "cs",
      "go",
      "rs",
      "cpp",
      "c",
      "h",
    ].includes(ext)
  ) {
    groups.push(CODE_APPS);
  }

  if (groups.length === 0) {
    return catalogFilter(
      (a) =>
        FOLDER_OPENERS.has(a.toLowerCase())
        || CODE_APPS.has(a.toLowerCase())
        || TEXT_APPS.has(a.toLowerCase())
        || OFFICE_APPS.has(a.toLowerCase())
        || MEDIA_APPS.has(a.toLowerCase())
        || ARCHIVE_APPS.has(a.toLowerCase()),
    );
  }

  const allow = new Set<string>();
  for (const g of groups) {
    for (const n of g) allow.add(n);
  }
  return AVAILABLE_APPS.filter((a) => allow.has(a.toLowerCase()));
}

function isFolderLikeItem(selection: LibrarySelectionInput): boolean {
  return (
    selection.kind === "item"
    && selection.item.type === "file"
    && Boolean(selection.item.isFolder)
  );
}
