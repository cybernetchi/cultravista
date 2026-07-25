import { useState } from "react";
import { WebSidebar } from "./WebSidebar";
import { WebHeader } from "./WebHeader";
import { WebLibraryView } from "./WebLibraryView";
import { WebDetailPanel } from "./WebDetailPanel";
import { WebEditModal } from "./WebEditModal";
import { WebAnnotateModal } from "./WebAnnotateModal";
import { WebCropModal } from "./WebCropModal";
import { WebCreateModal } from "./WebCreateModal";
import { WebProfileView } from "./WebProfileView";
import { WebSettingsView } from "./WebSettingsView";
import { Scan, ViewMode } from "@/types/scan";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export function WebLayout() {
  const [activeTab, setActiveTab] = useState("library");
  const [viewMode, setViewMode] = useState<ViewMode>("library");
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const handleSelectScan = (scan: Scan) => {
    setSelectedScan(scan);
    setViewMode("detail");
  };

  const handleCloseScan = () => {
    setSelectedScan(null);
    setViewMode("library");
  };

  const handleStartCreate = () => {
    setViewMode("capture");
  };

  const handleSave = () => {
    toast.success("Changes saved successfully!");
    setViewMode("detail");
  };

  const handleCreateComplete = () => {
    toast.success("3D model saved to library!");
    setViewMode("library");
    setSelectedScan(null);
  };

  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
    setViewMode("library");
    setSelectedScan(null);
  };

  const getPageTitle = () => {
    switch (activeTab) {
      case "library": return "Library";
      case "profile": return "Profile";
      case "settings": return "Settings";
      default: return "Library";
    }
  };

  return (
    <div className="h-screen flex bg-background overflow-hidden">
      {/* Sidebar */}
      <WebSidebar
        activeTab={activeTab}
        onTabChange={handleTabChange}
        onStartCreate={handleStartCreate}
      />

      {/* Main content */}
      <div className="flex-1 flex flex-col min-w-0">
        <WebHeader 
          title={getPageTitle()}
          searchQuery={searchQuery}
          onSearchChange={setSearchQuery}
        />

        <div className="flex-1 flex min-h-0">
          {/* Content area */}
          <main className={cn(
            "flex-1 flex flex-col min-w-0",
            selectedScan && "transition-all duration-300"
          )}>
            {activeTab === "library" && (
              <WebLibraryView
                onSelectScan={handleSelectScan}
                searchQuery={searchQuery}
              />
            )}
            {activeTab === "profile" && <WebProfileView onSelectScan={handleSelectScan} />}
            {activeTab === "settings" && <WebSettingsView />}
          </main>

          {/* Detail panel */}
          {selectedScan && viewMode === "detail" && (
            <WebDetailPanel
              scan={selectedScan}
              onClose={handleCloseScan}
              onEdit={() => setViewMode("edit")}
              onAnnotate={() => setViewMode("annotate")}
              onCrop={() => setViewMode("crop")}
            />
          )}
        </div>
      </div>

      {/* Modals */}
      {viewMode === "capture" && (
        <WebCreateModal
          onClose={() => setViewMode("library")}
          onComplete={handleCreateComplete}
        />
      )}

      {viewMode === "edit" && selectedScan && (
        <WebEditModal
          scan={selectedScan}
          onClose={() => setViewMode("detail")}
          onSave={handleSave}
        />
      )}

      {viewMode === "annotate" && selectedScan && (
        <WebAnnotateModal
          scan={selectedScan}
          onClose={() => setViewMode("detail")}
          onSave={handleSave}
        />
      )}

      {viewMode === "crop" && selectedScan && (
        <WebCropModal
          scan={selectedScan}
          onClose={() => setViewMode("detail")}
          onSave={handleSave}
          onModelReplaced={(url) =>
            setSelectedScan((s) => (s ? { ...s, splatUrl: url } : s))
          }
        />
      )}
    </div>
  );
}
