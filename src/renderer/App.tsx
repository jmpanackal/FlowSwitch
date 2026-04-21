import React from "react";
import MainLayout from "./layout/MainLayout";
import { TooltipProvider } from "./layout/components/ui/tooltip";

function App() {
  return (
    <TooltipProvider delayDuration={380} skipDelayDuration={120}>
      <MainLayout />
    </TooltipProvider>
  );
}

export default App;
