import { X } from "lucide-react";

const APP_VERSION = "0.1.0";

type AppChromeModalsProps = {
  preferencesOpen: boolean;
  aboutOpen: boolean;
  onClosePreferences: () => void;
  onCloseAbout: () => void;
};

export function AppChromeModals({
  preferencesOpen,
  aboutOpen,
  onClosePreferences,
  onCloseAbout,
}: AppChromeModalsProps) {
  return (
    <>
      {preferencesOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="app-prefs-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) onClosePreferences();
          }}
        >
          <div className="app-no-drag w-full max-w-md overflow-hidden rounded-xl border border-white/[0.1] bg-flow-bg-secondary shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <h2
                id="app-prefs-title"
                className="text-base font-semibold text-flow-text-primary"
              >
                App preferences
              </h2>
              <button
                type="button"
                onClick={onClosePreferences}
                className="rounded-lg p-2 text-flow-text-secondary hover:bg-white/[0.06] hover:text-flow-text-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="px-4 py-4 text-sm leading-relaxed text-flow-text-secondary">
              Global options (startup behavior, defaults, and updates) will live
              here as the app grows. Profile-specific options stay under the
              profile menu (⋯) → Profile preferences.
            </div>
            <div className="flex justify-end border-t border-white/[0.06] px-4 py-3">
              <button
                type="button"
                onClick={onClosePreferences}
                className="rounded-lg bg-flow-accent-blue px-4 py-2 text-sm font-medium text-flow-text-primary hover:bg-flow-accent-blue-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {aboutOpen ? (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/55 p-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="about-title"
          onClick={(e) => {
            if (e.target === e.currentTarget) onCloseAbout();
          }}
        >
          <div className="app-no-drag w-full max-w-md overflow-hidden rounded-xl border border-white/[0.1] bg-flow-bg-secondary shadow-2xl">
            <div className="flex items-center justify-between border-b border-white/[0.08] px-4 py-3">
              <h2
                id="about-title"
                className="text-base font-semibold text-flow-text-primary"
              >
                About FlowSwitch
              </h2>
              <button
                type="button"
                onClick={onCloseAbout}
                className="rounded-lg p-2 text-flow-text-secondary hover:bg-white/[0.06] hover:text-flow-text-primary"
                aria-label="Close"
              >
                <X className="h-5 w-5" strokeWidth={1.75} />
              </button>
            </div>
            <div className="flex flex-col gap-3 px-4 py-4 text-sm leading-relaxed text-flow-text-secondary">
              <p className="text-flow-text-primary">
                Version <span className="tabular-nums">{APP_VERSION}</span>
              </p>
              <p>
                FlowSwitch captures monitor layouts and launches your workspace
                profiles on demand.
              </p>
            </div>
            <div className="flex justify-end border-t border-white/[0.06] px-4 py-3">
              <button
                type="button"
                onClick={onCloseAbout}
                className="rounded-lg bg-flow-accent-blue px-4 py-2 text-sm font-medium text-flow-text-primary hover:bg-flow-accent-blue-hover"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
