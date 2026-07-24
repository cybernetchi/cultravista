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
type MobileViewMode = "library" | "detail" | "capture";

const Index = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("library");
  const [viewMode, setViewMode] = useState<MobileViewMode>("library");
  const [selectedCapture, setSelectedCapture] = useState<Capture | null>(null);

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
    setViewMode("capture");
  };

  const handleBackToLibrary = () => {
    setViewMode("library");
    setSelectedCapture(null);
  };

  const handleTabChange = (tab: string) => {
    if (tab === "capture") {
      setViewMode("capture");
    } else {
      setActiveTab(tab);
      setViewMode("library");
      setSelectedCapture(null);
    }
  };

  const renderMainContent = () => {
    if (viewMode === "capture") {
      return (
        <CaptureView
          onClose={() => setViewMode("library")}
          onComplete={handleBackToLibrary}
        />
      );
    }

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

  const showBottomNav = viewMode === "library";

  return (
    <MobileFrame>
      {renderMainContent()}
      {showBottomNav && (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </MobileFrame>
  );
};

export default Index;
