import React, { useMemo } from "react";
import { LaunchProgressOverlayRoot } from "./LaunchProgressOverlayRoot";
import MainLayout from "./layout/MainLayout";
import { TooltipProvider } from "./layout/components/ui/tooltip";

function readLaunchOverlayFlag(): boolean {
  try {
    const u = new URL(window.location.href);
    return u.searchParams.get("launchOverlay") === "1";
  } catch {
    return false;
  }
}

function App() {
  const isLaunchOverlay = useMemo(() => readLaunchOverlayFlag(), []);

  if (isLaunchOverlay) {
    return <LaunchProgressOverlayRoot />;
  }

  return (
    <TooltipProvider delayDuration={380} skipDelayDuration={120}>
      <MainLayout />
    </TooltipProvider>
  );
}

export default App;
