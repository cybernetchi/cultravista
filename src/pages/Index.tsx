import { useState } from "react";
import { useIsMobile } from "@/hooks/use-mobile";
import { MobileFrame } from "@/components/layout/MobileFrame";
import { BottomNav } from "@/components/layout/BottomNav";
import { LibraryView } from "@/components/library/LibraryView";
import { ScanDetailView } from "@/components/detail/ScanDetailView";
import { EditView } from "@/components/edit/EditView";
import { AnnotateView } from "@/components/annotate/AnnotateView";
import { CaptureView } from "@/components/capture/CaptureView";
import { ProfileView } from "@/components/profile/ProfileView";
import { SettingsView } from "@/components/settings/SettingsView";
import { WebLayout } from "@/components/web/WebLayout";
import { CaptureRecoveryManager } from "@/components/CaptureRecoveryManager";
import { Scan, ViewMode } from "@/types/scan";
import { toast } from "sonner";

const Index = () => {
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState("library");
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);

  // Use web layout for desktop
  if (!isMobile) {
    return (
      <>
        {/* Resumes captures left stuck in "Processing" by a closed tab. */}
        <CaptureRecoveryManager />
        <WebLayout />
      </>
    );
  }

  // Mobile layout
  const handleSelectScan = (scan: Scan) => {
    setSelectedScan(scan);
    setViewMode("detail");
  };

  const handleStartCapture = () => {
    setViewMode("capture");
  };

  const handleBack = () => {
    if (viewMode === "edit" || viewMode === "annotate") {
      setViewMode("detail");
    } else if (viewMode === "detail") {
      setViewMode("library");
      setSelectedScan(null);
    } else {
      setViewMode("library");
    }
  };

  const handleSave = () => {
    toast.success("Changes saved successfully!");
    setViewMode("detail");
  };

  const handleCaptureComplete = () => {
    toast.success("Scan saved to library!");
    setViewMode("library");
  };

  const handleTabChange = (tab: string) => {
    if (tab === "capture") {
      setViewMode("capture");
    } else {
      setActiveTab(tab);
      setViewMode("library");
      setSelectedScan(null);
    }
  };

  const renderMainContent = () => {
    if (viewMode === "capture") {
      return (
        <CaptureView
          onClose={() => setViewMode("library")}
          onComplete={handleCaptureComplete}
        />
      );
    }

    if (activeTab === "library") {
      switch (viewMode) {
        case "detail":
          return selectedScan ? (
            <ScanDetailView
              scan={selectedScan}
              onBack={handleBack}
              onEdit={() => setViewMode("edit")}
              onAnnotate={() => setViewMode("annotate")}
            />
          ) : null;
        case "edit":
          return selectedScan ? (
            <EditView scan={selectedScan} onBack={handleBack} onSave={handleSave} />
          ) : null;
        case "annotate":
          return selectedScan ? (
            <AnnotateView scan={selectedScan} onBack={handleBack} onSave={handleSave} />
          ) : null;
        default:
          return (
            <LibraryView
              onSelectScan={handleSelectScan}
              onStartCapture={handleStartCapture}
            />
          );
      }
    }

    if (activeTab === "profile") {
      return <ProfileView />;
    }

    if (activeTab === "settings") {
      return <SettingsView />;
    }

    return (
      <LibraryView
        onSelectScan={handleSelectScan}
        onStartCapture={handleStartCapture}
      />
    );
  };

  const showBottomNav = viewMode === "library" && activeTab !== "capture";

  return (
    <MobileFrame>
      {/* Resumes captures left stuck in "Processing" by a closed tab. */}
      <CaptureRecoveryManager />
      {renderMainContent()}
      {showBottomNav && (
        <BottomNav activeTab={activeTab} onTabChange={handleTabChange} />
      )}
    </MobileFrame>
  );
};

export default Index;
