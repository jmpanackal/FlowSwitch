import { useCallback, useEffect, useRef, useState } from "react";

type HotkeyRecorderFieldProps = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
};

const MODIFIER_KEYS = new Set([
  "Control",
  "Shift",
  "Alt",
  "Meta",
]);

function acceleratorKeyFromEvent(e: KeyboardEvent): string | null {
  const { key } = e;
  const code = e.code || "";

  if (key === "Escape") return null;
  if (MODIFIER_KEYS.has(key)) return null;

  if (code.startsWith("Digit")) return code.replace("Digit", "");
  if (code.startsWith("Numpad")) {
    const rest = code.slice("Numpad".length);
    if (/^\d$/.test(rest)) return rest;
    const numpadMap: Record<string, string> = {
      Add: "numadd",
      Subtract: "numsub",
      Multiply: "nummult",
      Divide: "numdiv",
      Decimal: "numdec",
    };
    return numpadMap[rest] || null;
  }

  if (key.length === 1) {
    const ch = key.toUpperCase();
    if (/^[A-Z0-9]$/.test(ch)) return ch;
    if (ch === " ") return "Space";
    if (ch === "+" || key === "+") return "Plus";
    if (ch === "-" || key === "-") return "Minus";
    return null;
  }

  const fk = /^F([1-9]|1[0-2])$/i.exec(key);
  if (fk) return `F${fk[1]}`;

  const codeMap: Record<string, string> = {
    Space: "Space",
    Minus: "Minus",
    Equal: "Equal",
    BracketLeft: "BracketLeft",
    BracketRight: "BracketRight",
    Backslash: "Backslash",
    Semicolon: "Semicolon",
    Quote: "Quote",
    Comma: "Comma",
    Period: "Period",
    Slash: "Slash",
    Backquote: "`",
    Tab: "Tab",
    Enter: "Enter",
    Backspace: "Backspace",
    Delete: "Delete",
    Insert: "Insert",
    Home: "Home",
    End: "End",
    PageUp: "PageUp",
    PageDown: "PageDown",
    ArrowUp: "Up",
    ArrowDown: "Down",
    ArrowLeft: "Left",
    ArrowRight: "Right",
  };
  if (code && codeMap[code]) return codeMap[code];

  return null;
}

function modifierPrefixParts(e: KeyboardEvent): string[] {
  const parts: string[] = [];
  if (e.ctrlKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  if (e.metaKey) parts.push("Super");
  return parts;
}

/** Live string shown while keys are held (modifiers + trailing + if needed). */
function chordPreviewFromEvent(e: KeyboardEvent): string {
  const mods = modifierPrefixParts(e);
  const keyPart = acceleratorKeyFromEvent(e);
  if (keyPart) {
    return mods.length > 0 ? `${mods.join("+")}+${keyPart}` : keyPart;
  }
  if (mods.length > 0) return `${mods.join("+")}+`;
  return "";
}

/** Final accelerator when user presses a non-modifier key (or a lone F-key / etc.). */
function chordCompleteFromEvent(e: KeyboardEvent): string | null {
  const keyPart = acceleratorKeyFromEvent(e);
  if (!keyPart) return null;
  const mods = modifierPrefixParts(e);
  if (mods.length > 0) return `${mods.join("+")}+${keyPart}`;
  return keyPart;
}

export function HotkeyRecorderField({
  value,
  onChange,
  disabled = false,
}: HotkeyRecorderFieldProps) {
  const [recording, setRecording] = useState(false);
  const [livePreview, setLivePreview] = useState("");
  const recordingRef = useRef(false);

  useEffect(() => {
    recordingRef.current = recording;
    if (!recording) setLivePreview("");
  }, [recording]);

  const stopRecording = useCallback(() => {
    setRecording(false);
    setLivePreview("");
  }, []);

  useEffect(() => {
    if (!recording) return;

    const onKeyDown = (e: KeyboardEvent) => {
      if (!recordingRef.current) return;
      e.preventDefault();
      e.stopPropagation();

      if (e.key === "Escape") {
        stopRecording();
        return;
      }

      setLivePreview(chordPreviewFromEvent(e));

      const complete = chordCompleteFromEvent(e);
      if (complete) {
        onChange(complete);
        stopRecording();
      }
    };

    window.addEventListener("keydown", onKeyDown, true);
    return () => window.removeEventListener("keydown", onKeyDown, true);
  }, [recording, onChange, stopRecording]);

  const displayValue = recording
    ? (livePreview || value || "Press keys…")
    : value;

  return (
    <div className="space-y-2">
      <div className="flex gap-2">
        <input
          type="text"
          readOnly={recording}
          value={displayValue}
          onChange={(ev) => {
            if (!recording) onChange(ev.target.value);
          }}
          placeholder="Ctrl+Shift+W or F9"
          disabled={disabled}
          className="min-w-0 flex-1 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-sm text-flow-text-primary transition-colors placeholder:text-flow-text-muted focus:border-flow-accent-blue focus:outline-none focus:ring-2 focus:ring-flow-accent-blue/50 disabled:opacity-50"
        />
        <button
          type="button"
          disabled={disabled}
          onClick={() => setRecording((r) => !r)}
          className={`shrink-0 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-50 ${
            recording
              ? "border-flow-accent-red/40 bg-flow-accent-red/15 text-flow-accent-red hover:bg-flow-accent-red/25"
              : "border-flow-border bg-flow-surface text-flow-text-secondary hover:bg-flow-bg-secondary hover:text-flow-text-primary"
          }`}
        >
          {recording ? "Cancel" : "Record"}
        </button>
        <button
          type="button"
          disabled={disabled || !value}
          onClick={() => onChange("")}
          className="shrink-0 rounded-lg border border-flow-border bg-flow-bg-secondary px-3 py-2 text-sm text-flow-text-muted hover:text-flow-text-primary disabled:opacity-40"
        >
          Clear
        </button>
      </div>
      <p className="text-xs text-flow-text-muted">
        While recording, the field updates as you press keys. Any combination works (including a
        single key such as F9). Save the profile to apply globally; shortcuts must stay unique.
      </p>
    </div>
  );
}
