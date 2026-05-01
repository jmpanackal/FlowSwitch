import React from "react";
import MainLayout from "./layout/MainLayout";
import { FlowSnackbarProvider } from "./layout/components/FlowSnackbar";
import { TooltipProvider } from "./layout/components/ui/tooltip";

function App() {
  return (
    <FlowSnackbarProvider>
      <TooltipProvider delayDuration={380} skipDelayDuration={120}>
        <MainLayout />
      </TooltipProvider>
    </FlowSnackbarProvider>
  );
}

export default App;
