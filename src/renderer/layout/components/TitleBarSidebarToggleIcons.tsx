/**
 * Title-bar sidebar toggles: open state is shown by filling the narrow panel
 * (Cursor-style), not a separate background chip on the button.
 */
export function TitleBarSidebarToggleIcon({
  side,
  open,
  className,
}: {
  side: "left" | "right";
  open: boolean;
  className?: string;
}) {
  const stroke = 1.75;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
      aria-hidden
    >
      {side === "left" && open ? (
        <rect
          x="4"
          y="4.25"
          width="4.75"
          height="15.5"
          rx="1.25"
          fill="currentColor"
        />
      ) : null}
      {side === "right" && open ? (
        <rect
          x="15.25"
          y="4.25"
          width="4.75"
          height="15.5"
          rx="1.25"
          fill="currentColor"
        />
      ) : null}
      <rect
        x="3"
        y="3"
        width="18"
        height="18"
        rx="2"
        fill="none"
        stroke="currentColor"
        strokeWidth={stroke}
      />
      {side === "left" ? (
        <path
          d="M9 3v18"
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      ) : (
        <path
          d="M15 3v18"
          fill="none"
          stroke="currentColor"
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      )}
    </svg>
  );
}
