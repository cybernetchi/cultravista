import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ThemeProvider } from "@/components/ThemeProvider";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/auth/ProtectedRoute";
import Index from "./pages/Index";
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
        <BrowserRouter>
          <AuthProvider>
            <Routes>
              {/* App requires an authenticated session. */}
              <Route
                path="/"
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
      </TooltipProvider>
    </ThemeProvider>
  </QueryClientProvider>
);

export default App;
