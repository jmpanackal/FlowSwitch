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
