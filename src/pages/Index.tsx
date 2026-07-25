import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFrame } from "@/components/layout/MobileFrame";
import { BottomNav } from "@/components/layout/BottomNav";
import { LibraryView } from "@/components/library/LibraryView";
import { ScanDetailView } from "@/components/detail/ScanDetailView";
import { CaptureView } from "@/components/capture/CaptureView";
import { ProfileView } from "@/components/profile/ProfileView";
import { SettingsView } from "@/components/settings/SettingsView";
import { WebLayout } from "@/components/web/WebLayout";
import { Capture } from "@/services/captureService";

// Mobile view modes. Editing/annotation/cropping are desktop-only tools (see
// PR6 scope), so the mobile flow is just: browse → view → capture.
type MobileViewMode = "library" | "detail";

const Index = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("library");
  const [viewMode, setViewMode] = useState<MobileViewMode>("library");
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);
  // Capture screen visibility vs. lifecycle: the view stays MOUNTED while an
  // upload/KIRI run is in flight even if the user closes it, because the client
  // drives the KIRI→Lambda handoff — unmounting mid-run would stall the capture
  // at "Processing" forever. Closing just hides it; it unmounts when idle.
  const [captureOpen, setCaptureOpen] = useState(false);
  const [captureBusy, setCaptureBusy] = useState(false);

  // Use web layout for desktop
  if (!isMobile) {
    return <WebLayout />;
  }

  // Mobile layout
  const handleSelectCapture = (capture: Capture) => {
    setSelectedCapture(capture);
    setViewMode("detail");
  };

  const handleStartCapture = () => {
    setCaptureOpen(true);
  };

  const handleBackToLibrary = () => {
    setCaptureOpen(false);
    setViewMode("library");
    setSelectedCapture(null);
  };

  const handleTabChange = (tab: string) => {
    if (tab === "capture") {
      setCaptureOpen(true);
    } else {
      setActiveTab(tab);
      setViewMode("library");
      setSelectedCapture(null);
    }
  };

  const renderMainContent = () => {
    if (activeTab === "library") {
      if (viewMode === "detail" && selectedCapture) {
        return <ScanDetailView capture={selectedCapture} onBack={handleBackToLibrary} />;
      }
      return (
        <LibraryView
          onSelectCapture={handleSelectCapture}
          onStartCapture={handleStartCapture}
        />
      );
    }

    if (activeTab === "profile") {
      return <ProfileView />;
    }

    if (activeTab === "settings") {
      return <SettingsView />;
    }

    return (
      <LibraryView
        onSelectCapture={handleSelectCapture}
        onStartCapture={handleStartCapture}
      />
    );
  };

  const showBottomNav = viewMode === "library" && !captureOpen;

  return (
    <MobileFrame>
      {!captureOpen && renderMainContent()}
      {/* Mounted while open OR busy; hidden (not unmounted) when closed mid-run. */}
      {(captureOpen || captureBusy) && (
        <div className={captureOpen ? "flex-1 flex flex-col" : "hidden"}>
          <CaptureView
            onClose={() => setCaptureOpen(false)}
            onComplete={handleBackToLibrary}
            onBusyChange={setCaptureBusy}
          />
        </div>
      )}
      {showBottomNav && (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </MobileFrame>
  );
};

export default Index;
