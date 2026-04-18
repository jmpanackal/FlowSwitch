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

const frameStyles: Record<string, string> = {
  gaming:
    "border-violet-400/20 bg-violet-500/15 text-violet-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  personal:
    "border-emerald-400/20 bg-emerald-500/15 text-emerald-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
  work:
    "border-sky-400/20 bg-sky-500/15 text-sky-200 shadow-[inset_0_1px_0_0_rgba(255,255,255,0.06)]",
};

/** Profile type icon in a soft tinted tile for header identity. */
export function ProfileIconFrame({
  icon,
  className = "",
}: {
  icon: string;
  className?: string;
}) {
  const key =
    icon === "gaming" || icon === "personal" || icon === "work"
      ? icon
      : "work";
  const frame = frameStyles[key] || frameStyles.work;
  return (
    <div
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${frame} ${className}`}
      aria-hidden
    >
      <ProfileIconGlyph icon={icon} className="h-5 w-5 opacity-95" />
    </div>
  );
}
