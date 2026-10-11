import { Toaster } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/NotFound";
import { Redirect, Route, Switch } from "wouter";
import ErrorBoundary from "./components/ErrorBoundary";
import { ThemeProvider } from "./contexts/ThemeContext";
import { TextEditProvider } from "./contexts/TextEditContext";
import Home from "./pages/Home";
import AnalysisStudio from "./pages/AnalysisStudio";
import DowntimeSummary from "./pages/DowntimeSummary";
import TroubleshootWiki from "./pages/TroubleshootWiki";
import PmTracker from "./pages/PmTracker";

function Router() {
  // make sure to consider if you need authentication for certain routes
  return (
    <Switch>
      <Route path={"/"} component={Home} />
      <Route path={"/analysis"} component={AnalysisStudio} />
      <Route path={"/summary"} component={DowntimeSummary} />
      <Route path={"/troubleshoot-wiki"} component={TroubleshootWiki} />
      <Route path={"/pm-tracker"} component={PmTracker} />
      <Route path={"/comparison"}>
        <Redirect to="/analysis?tab=compare" />
      </Route>
      <Route path={"/404"} component={NotFound} />
      {/* Final fallback route */}
      <Route component={NotFound} />
    </Switch>
  );
}

// NOTE: About Theme
// - First choose a default theme according to your design style (dark or light bg), than change color palette in index.css
//   to keep consistent foreground/background color across components
// - If you want to make theme switchable, pass `switchable` ThemeProvider and use `useTheme` hook

function App() {
  return (
    <ErrorBoundary>
      <ThemeProvider
        defaultTheme="light"
        // switchable
      >
        <TextEditProvider>
          <TooltipProvider>
            <Toaster />
            <Router />
          </TooltipProvider>
        </TextEditProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}

export default App;
