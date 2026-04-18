import { Monitor, Folder, Globe } from "lucide-react";

export function ProfileIconGlyph({
  icon,
  className = "w-4 h-4",
}: {
  icon: string;
  className?: string;
}) {
  switch (icon) {
    case "gaming":
      return <Monitor className={className} />;
    case "personal":
      return <Globe className={className} />;
    default:
      return <Folder className={className} />;
  }
}

/** Shorten auto-generated descriptions so the header stays scannable. */
export function shortenProfileDescriptionForHeader(description: string): string {
  const d = description.trim();
  if (/^Custom profile with \d+ apps?$/i.test(d)) {
    return "Custom profile";
  }
  if (/^Captured layout with \d+ apps?$/i.test(d)) {
    return "Captured layout";
  }
  return d;
}
