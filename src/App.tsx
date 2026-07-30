import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ErrorBoundary, AppErrorFallback } from "@/components/ErrorBoundary";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
import Landing from "./pages/Landing";
import Auth from "./pages/Auth";
import IframeViewer from "./pages/IframeViewer";
import Exhibit from "./pages/Exhibit";
import NotFound from "./pages/NotFound";
import DevThumbTest from "./pages/DevThumbTest";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ThemeProvider defaultTheme="dark" storageKey="cultravista-theme">
      <TooltipProvider>
        <Toaster />
        <Sonner />
        {/* Last line of defense: without a boundary, any uncaught render error
            (e.g. a splat that fails to load) unmounts the whole tree → black page. */}
        <ErrorBoundary fallback={<AppErrorFallback />}>
          <BrowserRouter>
            <AuthProvider>
              <Routes>
                {/* Public landing page; signed-in visitors are bounced to /app. */}
                <Route path="/" element={<Landing />} />
                {/* The app requires an authenticated session. */}
                <Route
                  path="/app"
                  element={
                    <ProtectedRoute>
                      <Index />
                    </ProtectedRoute>
                  }
                />
                <Route path="/auth" element={<Auth />} />
                {/* Public embeddable viewer — intentionally unauthenticated. */}
                <Route path="/iframe-viewer" element={<IframeViewer />} />
                {/* Public exhibit page — published captures only (RLS-enforced). */}
                <Route path="/exhibit/:slug" element={<Exhibit />} />
                {/* Dev-only thumbnail harness (not present in production builds). */}
                {import.meta.env.DEV && (
                  <Route path="/dev-thumbtest" element={<DevThumbTest />} />
                )}
                {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                <Route path="*" element={<NotFound />} />
              </Routes>
            </AuthProvider>
          </BrowserRouter>
        </ErrorBoundary>
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
