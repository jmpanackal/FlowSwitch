import type { LucideIcon } from "lucide-react";
import {
  Monitor,
  Folder,
  Globe,
  GraduationCap,
  Code2,
  Palette,
  Video,
  Music,
  Dumbbell,
  Coffee,
  Rocket,
  Moon,
  Laptop,
} from "lucide-react";
import type { FlowProfileVisualIconId } from "../../../types/flow-profile";
import { normalizeProfileVisualIcon } from "../../../types/flow-profile";
import { safeIconSrc } from "../../utils/safeIconSrc";

const GLYPHS: Record<FlowProfileVisualIconId, LucideIcon> = {
  work: Folder,
  gaming: Monitor,
  personal: Globe,
  study: GraduationCap,
  development: Code2,
  creative: Palette,
  streaming: Video,
  music: Music,
  fitness: Dumbbell,
  coffee: Coffee,
  rocket: Rocket,
  moon: Moon,
  laptop: Laptop,
};

const insetTop = "shadow-[inset_0_1px_0_0_rgba(255,255,255,0.05)]";

const FRAME_BY_ID: Record<FlowProfileVisualIconId, string> = {
  work: `border border-white/[0.1] bg-sky-500/[0.12] text-sky-100 ${insetTop}`,
  gaming: `border border-white/[0.1] bg-violet-500/[0.12] text-violet-100 ${insetTop}`,
  personal: `border border-white/[0.1] bg-emerald-500/[0.12] text-emerald-100 ${insetTop}`,
  study: `border border-white/[0.1] bg-amber-500/[0.12] text-amber-100 ${insetTop}`,
  development: `border border-white/[0.1] bg-slate-500/[0.12] text-slate-100 ${insetTop}`,
  creative: `border border-white/[0.1] bg-fuchsia-500/[0.12] text-fuchsia-100 ${insetTop}`,
  streaming: `border border-white/[0.1] bg-rose-500/[0.12] text-rose-100 ${insetTop}`,
  music: `border border-white/[0.1] bg-pink-500/[0.12] text-pink-100 ${insetTop}`,
  fitness: `border border-white/[0.1] bg-orange-500/[0.12] text-orange-100 ${insetTop}`,
  coffee: `border border-white/[0.1] bg-stone-500/[0.12] text-stone-100 ${insetTop}`,
  rocket: `border border-white/[0.1] bg-indigo-500/[0.12] text-indigo-100 ${insetTop}`,
  moon: `border border-white/[0.1] bg-violet-950/[0.4] text-violet-100 ${insetTop}`,
  laptop: `border border-white/[0.1] bg-cyan-500/[0.12] text-cyan-100 ${insetTop}`,
};

export function ProfileIconGlyph({
  icon,
  className = "w-4 h-4",
}: {
  icon: string;
  className?: string;
}) {
  const raster = safeIconSrc(icon);
  if (raster) {
    return (
      <img
        src={raster}
        alt=""
        className={`object-cover ${className}`}
        draggable={false}
      />
    );
  }
  const id = normalizeProfileVisualIcon(icon);
  const Icon = GLYPHS[id];
  return <Icon className={className} />;
}

const frameSize: Record<"default" | "hero" | "sidebar", { box: string; glyph: string }> = {
  default: {
    box: "h-10 w-10 rounded-[11px]",
    glyph: "h-5 w-5",
  },
  hero: {
    box: "h-14 w-14 rounded-2xl sm:h-[4.25rem] sm:w-[4.25rem] md:h-[4.5rem] md:w-[4.5rem]",
    glyph: "h-7 w-7 sm:h-8 sm:w-8",
  },
  /** Library list / compact rows — same tint frames as default, smaller footprint. */
  sidebar: {
    box: "h-9 w-9 rounded-[10px]",
    glyph: "h-4 w-4",
  },
};

/** Profile visual icon in a soft tinted tile for header / cards. */
const customFrame = `border border-white/[0.1] bg-flow-bg-secondary/90 text-flow-text-primary ${insetTop}`;

export function ProfileIconFrame({
  icon,
  className = "",
  variant = "default",
}: {
  icon: string;
  className?: string;
  /** `hero` — profile header. `sidebar` — library list / compact cards. */
  variant?: "default" | "hero" | "sidebar";
}) {
  const raster = safeIconSrc(icon);
  const { box, glyph } = frameSize[variant];
  if (raster) {
    return (
      <div
        className={`flex shrink-0 items-center justify-center overflow-hidden [transform:translateZ(0)] ${box} ${customFrame} ${className}`}
        aria-hidden
      >
        <img
          src={raster}
          alt=""
          className={`${glyph} object-cover opacity-95`}
          draggable={false}
        />
      </div>
    );
  }
  const id = normalizeProfileVisualIcon(icon);
  const frame = FRAME_BY_ID[id];
  return (
    <div
      className={`flex shrink-0 items-center justify-center [transform:translateZ(0)] ${box} ${frame} ${className}`}
      aria-hidden
    >
      <ProfileIconGlyph icon={id} className={`${glyph} opacity-95`} />
    </div>
  );
}
