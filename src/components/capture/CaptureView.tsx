// Mobile capture screen — the real alpha capture flow on the phone.
// Same pipeline as the web side (WebCreateModal): the user picks photos/video
// (camera or gallery), we upload to KIRI via `useKiriUpload`, then
// `useProcessingFlow` polls KIRI + the Lambda PLY→splat conversion. No KIRI
// logic is duplicated here — it all lives in src/hooks/useCapture.ts.
import { useState, useRef, useCallback, useEffect } from "react";
import { X, Camera, Images, Check, Trash2, FileVideo, RotateCcw, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { useKiriUpload, useProcessingFlow } from "@/hooks/useCapture";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

// Real flow states (no simulated timers).
type CreateState = "idle" | "uploading" | "processing" | "complete" | "error";

interface UploadedFile {
  file: File;
  preview: string;
  type: "video" | "image";
}

interface CaptureViewProps {
  onClose: () => void;
  onComplete: () => void;
  /** Reports whether an upload/processing run is in flight, so the parent can
      keep this component mounted (hidden) after close — the client drives the
      KIRI→Lambda handoff, so unmounting mid-run would stall the capture. */
  onBusyChange?: (busy: boolean) => void;
}

export function CaptureView({ onClose, onComplete, onBusyChange }: CaptureViewProps) {
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [title, setTitle] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serialize, setSerialize] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);

  // Two inputs: `capture="environment"` opens the rear camera directly on a
  // phone; the gallery input allows multi-select for a photo set.
  const cameraInputRef = useRef<HTMLInputElement>(null);
  const galleryInputRef = useRef<HTMLInputElement>(null);

  const kiriUploadMutation = useKiriUpload();

  // Drives the KIRI status poll + fire-and-forget Lambda conversion, exactly as
  // WebCreateModal does. Only active once we're in the processing stage.
  const {
    isComplete: processingComplete,
    isConverting,
    isFailed: processingFailed,
  } = useProcessingFlow(serialize, captureId, createState === "processing");

  const isBusy = createState === "uploading" || createState === "processing";

  // Let the parent know when a run is in flight (see CaptureViewProps).
  useEffect(() => {
    onBusyChange?.(isBusy);
  }, [isBusy, onBusyChange]);

  // Warn before leaving mid-processing (the pipeline keeps running server-side,
  // but the user should know they're navigating away from live progress).
  useEffect(() => {
    if (!isBusy) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [isBusy]);

  // Advance to "complete" once KIRI + Lambda have both finished.
  useEffect(() => {
    if (processingComplete && !isConverting && createState === "processing") {
      setProgress(100);
      setCreateState("complete");
      toast.success("3D model created successfully!");
    }
  }, [processingComplete, isConverting, createState]);

  // Surface a KIRI/Lambda failure detected during processing.
  useEffect(() => {
    if (processingFailed && createState === "processing") {
      setError("Reconstruction failed. Please try again with more overlapping shots.");
      setCreateState("error");
      toast.error("Reconstruction failed.");
    }
  }, [processingFailed, createState]);

  // Revoke object URLs on unmount to avoid leaks.
  useEffect(() => {
    return () => {
      uploadedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const addFiles = useCallback((files: FileList | null) => {
    if (!files) return;
    const next: UploadedFile[] = [];
    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");
      if (isVideo || isImage) {
        next.push({ file, preview: URL.createObjectURL(file), type: isVideo ? "video" : "image" });
      }
    });
    if (next.length) setUploadedFiles((prev) => [...prev, ...next]);
  }, []);

  const handleInput = (ref: React.RefObject<HTMLInputElement>) => (e: React.ChangeEvent<HTMLInputElement>) => {
    addFiles(e.target.files);
    if (ref.current) ref.current.value = ""; // allow re-selecting the same file
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => {
      URL.revokeObjectURL(prev[index].preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleStart = async () => {
    if (uploadedFiles.length === 0) {
      setError("Add at least one photo or video first.");
      return;
    }
    if (!title.trim()) {
      setError("Give your capture a title.");
      return;
    }

    setError(null);
    setProgress(0);
    setCreateState("uploading");

    try {
      const result = await kiriUploadMutation.mutateAsync({
        files: uploadedFiles.map((f) => f.file),
        title,
        onProgress: (prog) => {
          setProgress(prog);
          if (prog >= 80) setCreateState("processing");
        },
      });
      setSerialize(result.serialize);
      setCaptureId(result.captureId);
      setCreateState("processing");
    } catch (err) {
      console.error("Mobile capture upload failed:", err);
      setError(err instanceof Error ? err.message : "Upload failed. Please try again.");
      setCreateState("error");
      toast.error("Upload failed. Please try again.");
    }
  };

  // Reset back to the picker (used for "Try again" / "Create another").
  const handleReset = () => {
    uploadedFiles.forEach((f) => URL.revokeObjectURL(f.preview));
    setUploadedFiles([]);
    setTitle("");
    setError(null);
    setProgress(0);
    setSerialize(null);
    setCaptureId(null);
    setCreateState("idle");
  };

  const videoCount = uploadedFiles.filter((f) => f.type === "video").length;
  const imageCount = uploadedFiles.filter((f) => f.type === "image").length;

  return (
    <div className="flex-1 flex flex-col bg-background">
      {/* Hidden file inputs */}
      <input
        ref={cameraInputRef}
        type="file"
        accept="image/*,video/*"
        capture="environment"
        className="hidden"
        onChange={handleInput(cameraInputRef)}
      />
      <input
        ref={galleryInputRef}
        type="file"
        accept="image/*,video/*"
        multiple
        className="hidden"
        onChange={handleInput(galleryInputRef)}
      />

      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2">
        <Button
          variant="icon"
          size="icon"
          onClick={() => {
            // Closing mid-run is fine: the parent keeps us mounted (hidden) so
            // the pipeline continues, and the library shows the processing card.
            if (isBusy) toast.info("Processing continues in the background.");
            onClose();
          }}
          aria-label="Close"
        >
          <X className="w-6 h-6" />
        </Button>
        <span className="text-sm font-semibold text-foreground">New Capture</span>
        <div className="w-10" /> {/* spacer to keep the title centered */}
      </div>

      {/* ---- Picker (idle) ---- */}
      {createState === "idle" && (
        <div className="flex-1 flex flex-col px-5 pb-8 overflow-y-auto animate-fade-in">
          {uploadedFiles.length === 0 ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-24 h-24 rounded-full bg-secondary flex items-center justify-center mb-6">
                <Camera className="w-10 h-10 text-muted-foreground" />
              </div>
              <p className="text-foreground font-medium text-lg mb-2">Capture a subject</p>
              <p className="text-muted-foreground text-sm max-w-xs mb-2">
                Take a video or several photos from all sides, at high and low angles.
              </p>
            </div>
          ) : (
            <div className="flex-1 pt-4">
              {/* File counts */}
              <div className="flex items-center gap-4 mb-3 text-sm text-muted-foreground">
                {imageCount > 0 && <span>{imageCount} photo{imageCount !== 1 ? "s" : ""}</span>}
                {videoCount > 0 && <span>{videoCount} video{videoCount !== 1 ? "s" : ""}</span>}
                <button className="ml-auto text-muted-foreground hover:text-destructive flex items-center gap-1" onClick={handleReset}>
                  <Trash2 className="w-4 h-4" /> Clear
                </button>
              </div>

              {/* Preview grid */}
              <div className="grid grid-cols-3 gap-2">
                {uploadedFiles.map((f, i) => (
                  <div key={i} className="relative aspect-square rounded-lg overflow-hidden bg-secondary">
                    {f.type === "video" ? (
                      <video src={f.preview} className="w-full h-full object-cover" />
                    ) : (
                      <img src={f.preview} alt={f.file.name} className="w-full h-full object-cover" />
                    )}
                    {f.type === "video" && (
                      <div className="absolute bottom-1 left-1 px-1 py-0.5 rounded bg-background/80">
                        <FileVideo className="w-3 h-3" />
                      </div>
                    )}
                    <button
                      onClick={() => handleRemoveFile(i)}
                      className="absolute top-1 right-1 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center"
                      aria-label="Remove"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>

              {/* Title */}
              <div className="mt-5">
                <label htmlFor="capture-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
                  Title
                </label>
                <Input
                  id="capture-title"
                  placeholder="Name this capture"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>
            </div>
          )}

          {error && (
            <p className="text-sm text-destructive mt-4 text-center" role="alert">
              {error}
            </p>
          )}

          {/* Source buttons */}
          <div className="grid grid-cols-2 gap-3 mt-6">
            <Button variant="outline" size="lg" className="h-14 gap-2" onClick={() => cameraInputRef.current?.click()}>
              <Camera className="w-5 h-5" />
              Camera
            </Button>
            <Button variant="outline" size="lg" className="h-14 gap-2" onClick={() => galleryInputRef.current?.click()}>
              <Images className="w-5 h-5" />
              Gallery
            </Button>
          </div>

          {uploadedFiles.length > 0 && (
            <Button variant="default" size="xl" className="w-full mt-3" onClick={handleStart}>
              Create 3D Model
            </Button>
          )}
        </div>
      )}

      {/* ---- Uploading / Processing ---- */}
      {(createState === "uploading" || createState === "processing") && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="w-24 h-24 mb-8 relative">
            <div className="absolute inset-0 border-4 border-secondary rounded-full" />
            <div
              className="absolute inset-0 border-4 border-primary rounded-full border-t-transparent animate-spin"
              style={{ animationDuration: "1s" }}
            />
          </div>

          <h2 className="text-2xl font-bold text-foreground mb-2">
            {createState === "uploading" ? "Uploading" : "Processing Scan"}
          </h2>
          <p className="text-muted-foreground text-center mb-8 max-w-xs">
            {createState === "uploading"
              ? "Sending your files for reconstruction…"
              : "Generating your 3D Gaussian Splat. Keep CultraVista open — this can take a few minutes."}
          </p>

          {createState === "uploading" && (
            <div className="w-full max-w-xs space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">UPLOADING</span>
                <span className="text-primary font-bold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}
        </div>
      )}

      {/* ---- Complete ---- */}
      {createState === "complete" && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-scale-in">
          <div className="w-24 h-24 mb-8 rounded-full bg-primary/20 flex items-center justify-center glow-green">
            <Check className="w-12 h-12 text-primary" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Processing Complete</h2>
          <p className="text-muted-foreground text-center mb-8">
            Your splat has finished processing.
          </p>
          <div className="w-full max-w-xs space-y-3">
            <Button variant="default" size="xl" className="w-full" onClick={onComplete}>
              Go to Library
            </Button>
            <Button variant="ghost" className="w-full gap-2" onClick={handleReset}>
              <RotateCcw className="w-4 h-4" />
              Create Another
            </Button>
          </div>
        </div>
      )}

      {/* ---- Error ---- */}
      {createState === "error" && (
        <div className="flex-1 flex flex-col items-center justify-center p-8 animate-fade-in">
          <div className="w-24 h-24 mb-8 rounded-full bg-destructive/20 flex items-center justify-center">
            <AlertTriangle className="w-12 h-12 text-destructive" />
          </div>
          <h2 className="text-2xl font-bold text-foreground mb-2">Something went wrong</h2>
          <p className="text-muted-foreground text-center mb-8 max-w-xs">{error}</p>
          <div className="w-full max-w-xs space-y-3">
            <Button
              variant="default"
              size="xl"
              className="w-full gap-2"
              onClick={() => {
                // Retry with the same files if we still have them, else start over.
                if (uploadedFiles.length > 0) {
                  handleStart();
                } else {
                  handleReset();
                }
              }}
            >
              {uploadedFiles.length > 0 ? "Try Again" : "Start Over"}
            </Button>
            <Button variant="ghost" className="w-full" onClick={onClose}>
              Close
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
