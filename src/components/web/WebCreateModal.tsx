import { useState, useRef, useCallback, useEffect } from "react";
import { cn } from "@/lib/utils";
import { X, Upload, Film, Images, Check, FileVideo, Image as ImageIcon, Trash2, ChevronDown, ChevronRight, Box, Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useKiriUpload, useProcessingFlow, useDirectModelUpload, useUploadedCapturePoll } from "@/hooks/useCapture";
import { validateModelFile, formatBytes, type ModelKind } from "@/lib/uploadValidation";
import { toast } from "sonner";

type CreateState = "idle" | "uploading" | "processing" | "complete" | "error";

// Two ways to create a model: reconstruct from photos/video (KIRI), or bring a
// ready-made .ply/.splat exported from another app (Scaniverse, Polycam, Luma,
// SuperSplat) — PR8.
type UploadMode = "capture" | "model";

interface UploadedFile {
  file: File;
  preview: string;
  type: "video" | "image";
}

interface WebCreateModalProps {
  onClose: () => void;
  onComplete: () => void;
}

export function WebCreateModal({ onClose, onComplete }: WebCreateModalProps) {
  const [createState, setCreateState] = useState<CreateState>("idle");
  const [progress, setProgress] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadedFiles, setUploadedFiles] = useState<UploadedFile[]>([]);
  const [title, setTitle] = useState("");
  // Optional archival metadata captured up front (PR2); the rest is added via Edit.
  const [showDetails, setShowDetails] = useState(false);
  const [description, setDescription] = useState("");
  const [captureDate, setCaptureDate] = useState("");
  const [location, setLocation] = useState("");
  const [tagsInput, setTagsInput] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [serialize, setSerialize] = useState<string | null>(null);
  const [captureId, setCaptureId] = useState<string | null>(null);
  // PR8: direct upload of a .ply/.splat file
  const [uploadMode, setUploadMode] = useState<UploadMode>("capture");
  const [modelFile, setModelFile] = useState<{ file: File; kind: ModelKind } | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const modelInputRef = useRef<HTMLInputElement>(null);

  const kiriUploadMutation = useKiriUpload();
  const directUploadMutation = useDirectModelUpload();

  // Use processing flow for auto Lambda trigger (KIRI capture mode only)
  const {
    isComplete: processingComplete,
    isConverting,
    isFailed: processingFailed,
  } = useProcessingFlow(
    serialize,
    captureId,
    createState === "processing" && uploadMode === "capture"
  );

  // Direct-upload mode: poll the capture row while the Lambda converts a
  // user-provided PLY (no KIRI serialize involved).
  const { isComplete: uploadComplete, isFailed: uploadFailed } = useUploadedCapturePoll(
    captureId,
    createState === "processing" && uploadMode === "model"
  );

  // Handle completion of entire flow (KIRI + Lambda)
  useEffect(() => {
    if (uploadMode !== "capture") return;
    if (processingComplete && !isConverting && createState === "processing") {
      setCreateState("complete");
      toast.success("3D model created successfully!");
      console.log("Full processing complete - KIRI + Lambda done");
    }
  }, [processingComplete, isConverting, createState, uploadMode]);

  // Surface a KIRI/Lambda failure detected during processing (previously the
  // web modal span forever on failure; mobile already handled this).
  useEffect(() => {
    if (uploadMode !== "capture") return;
    if (processingFailed && createState === "processing") {
      setError("Reconstruction failed. Please try again with more overlapping shots.");
      setCreateState("error");
      toast.error("Reconstruction failed.");
    }
  }, [processingFailed, createState, uploadMode]);

  // Direct-upload completion/failure (PLY conversion result).
  useEffect(() => {
    if (uploadMode !== "model" || createState !== "processing") return;
    if (uploadComplete) {
      setCreateState("complete");
      toast.success("3D model uploaded successfully!");
    } else if (uploadFailed) {
      setError("Conversion failed. The PLY may not be a Gaussian Splat export — try re-exporting it.");
      setCreateState("error");
      toast.error("Conversion failed.");
    }
  }, [uploadComplete, uploadFailed, createState, uploadMode]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  // Validate and stage a user-picked .ply/.splat (single file).
  const handleModelFilePick = useCallback(async (file: File) => {
    setError(null);
    const result = await validateModelFile(file);
    if (!result.ok) {
      setError(result.error);
      toast.error(result.error);
      return;
    }
    setModelFile({ file, kind: result.kind });
    setUploadMode("model");
  }, []);

  const processFiles = useCallback((files: FileList | null) => {
    if (!files) return;

    // A dropped .ply/.splat means the user wants the direct-upload path —
    // switch modes instead of silently dropping the file.
    const modelCandidate = Array.from(files).find((f) => /\.(ply|splat)$/i.test(f.name));
    if (modelCandidate) {
      toast.info("Switched to 3D file upload");
      handleModelFilePick(modelCandidate);
      return;
    }

    const newFiles: UploadedFile[] = [];

    Array.from(files).forEach((file) => {
      const isVideo = file.type.startsWith("video/");
      const isImage = file.type.startsWith("image/");

      if (isVideo || isImage) {
        newFiles.push({
          file,
          preview: URL.createObjectURL(file),
          type: isVideo ? "video" : "image",
        });
      }
    });

    setUploadedFiles((prev) => [...prev, ...newFiles]);
  }, [handleModelFilePick]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (uploadMode === "model") {
      const file = e.dataTransfer.files?.[0];
      if (file) handleModelFilePick(file);
    } else {
      processFiles(e.dataTransfer.files);
    }
  }, [processFiles, handleModelFilePick, uploadMode]);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    // Reset input so same file can be selected again
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const handleModelFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) handleModelFilePick(file);
    if (modelInputRef.current) {
      modelInputRef.current.value = "";
    }
  };

  const handleRemoveFile = (index: number) => {
    setUploadedFiles((prev) => {
      const file = prev[index];
      URL.revokeObjectURL(file.preview);
      return prev.filter((_, i) => i !== index);
    });
  };

  const handleStartProcessing = async () => {
    if (uploadedFiles.length === 0) return;
    if (!title.trim()) {
      setError("Please enter a title for your model");
      return;
    }

    setCreateState("uploading");
    setProgress(0);
    setError(null);

    try {
      const files = uploadedFiles.map(f => f.file);
      
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const result = await kiriUploadMutation.mutateAsync({
        files,
        title,
        metadata: {
          description: description.trim() || null,
          capture_date: captureDate || null,
          location_text: location.trim() || null,
          tags,
        },
        onProgress: (prog) => {
          setProgress(prog);
          if (prog >= 80) {
            setCreateState("processing");
          }
        },
      });

      // Store serialize and captureId for processing flow
      setSerialize(result.serialize);
      setCaptureId(result.captureId);
      setCreateState("processing");
      
      console.log("Upload complete, processing will auto-trigger:", result);
    } catch (err) {
      console.error("Upload error:", err);
      setError(err instanceof Error ? err.message : "Upload failed");
      setCreateState("error");
      toast.error("Upload failed. Please try again.");
    }
  };

  // PR8: upload a user-provided .ply/.splat directly (no KIRI). On retry the
  // existing capture row is reused (captureId survives failures).
  const handleStartModelUpload = async () => {
    if (!modelFile) return;
    if (!title.trim()) {
      setError("Please enter a title for your model");
      return;
    }

    setCreateState("uploading");
    setProgress(0);
    setError(null);

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const tags = tagsInput
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean);

      const result = await directUploadMutation.mutateAsync({
        file: modelFile.file,
        kind: modelFile.kind,
        title,
        metadata: {
          description: description.trim() || null,
          capture_date: captureDate || null,
          location_text: location.trim() || null,
          tags,
        },
        existingCaptureId: captureId ?? undefined,
        onCaptureCreated: setCaptureId,
        onProgress: setProgress,
        signal: controller.signal,
      });

      if (result.kind === "ply") {
        // Lambda conversion runs server-side; the poll flips us to complete.
        setCreateState("processing");
      } else {
        setCreateState("complete");
        toast.success("3D model uploaded successfully!");
      }
    } catch (err) {
      if (err instanceof DOMException && err.name === "AbortError") {
        // User cancelled — the mutation already removed the placeholder row.
        setCaptureId(null);
        setCreateState("idle");
        setProgress(0);
        toast.info("Upload cancelled");
      } else {
        console.error("Direct upload error:", err);
        setError(err instanceof Error ? err.message : "Upload failed");
        setCreateState("error");
        toast.error("Upload failed. Please try again.");
      }
    } finally {
      abortRef.current = null;
    }
  };

  const handleCancelUpload = () => {
    abortRef.current?.abort();
  };

  const handleReset = () => {
    uploadedFiles.forEach((file) => URL.revokeObjectURL(file.preview));
    setUploadedFiles([]);
    setModelFile(null);
    setCreateState("idle");
    setProgress(0);
    setTitle("");
    setDescription("");
    setCaptureDate("");
    setLocation("");
    setTagsInput("");
    setShowDetails(false);
    setError(null);
    setSerialize(null);
    setCaptureId(null);
  };

  const videoCount = uploadedFiles.filter((f) => f.type === "video").length;
  const imageCount = uploadedFiles.filter((f) => f.type === "image").length;

  return (
    <div className="fixed inset-0 z-50 bg-background/98 backdrop-blur-xl flex animate-fade-in">
      {/* Left panel */}
      <div className="w-80 border-r border-border flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="font-semibold text-foreground">Create 3D Model</h2>
          <Button variant="icon" size="icon" onClick={onClose}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Instructions */}
        <div className="p-6 space-y-4">
          {/* Mode toggle: reconstruct from photos/video vs upload a ready 3D file */}
          <div className="grid grid-cols-2 gap-1 p-1 rounded-lg bg-secondary" role="tablist" aria-label="Creation mode">
            <button
              type="button"
              role="tab"
              aria-selected={uploadMode === "capture"}
              disabled={createState !== "idle"}
              onClick={() => { setUploadMode("capture"); setError(null); }}
              className={cn(
                "px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                uploadMode === "capture"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Capture
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={uploadMode === "model"}
              disabled={createState !== "idle"}
              onClick={() => { setUploadMode("model"); setError(null); }}
              className={cn(
                "px-2 py-1.5 rounded-md text-xs font-medium transition-colors disabled:opacity-50",
                uploadMode === "model"
                  ? "bg-background text-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              Upload 3D file
            </button>
          </div>

          <h3 className="font-medium text-foreground">How it works</h3>
          {uploadMode === "capture" ? (
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                Upload a video or multiple photos of your subject
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                Ensure the subject is captured from multiple angles
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                Our AI will process and generate a 3D Gaussian Splat
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                View and interact with your 3D model in the library
              </li>
            </ul>
          ) : (
            <ul className="space-y-3 text-sm text-muted-foreground">
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                Export a Gaussian Splat from Scaniverse, Polycam, Luma, or SuperSplat
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                Upload the .ply or .splat file here (up to 300 MB)
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                PLY files are converted to the web delivery format automatically
              </li>
              <li className="flex items-start gap-2">
                <span className="w-5 h-5 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                View and interact with your 3D model in the library
              </li>
            </ul>
          )}

          <div className="pt-4 border-t border-border">
            <Label htmlFor="model-title" className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2 block">
              Model Title
            </Label>
            <Input
              id="model-title"
              type="text"
              placeholder="Enter a name for your 3D model"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              disabled={createState !== "idle"}
              className="mb-4"
            />

            {/* Optional archival details (collapsible) */}
            <button
              type="button"
              onClick={() => setShowDetails((s) => !s)}
              disabled={createState !== "idle"}
              className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
            >
              {showDetails ? (
                <ChevronDown className="w-3.5 h-3.5" />
              ) : (
                <ChevronRight className="w-3.5 h-3.5" />
              )}
              Details (optional)
            </button>

            {showDetails && (
              <div className="mt-3 space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="model-desc" className="text-xs text-muted-foreground">Description</Label>
                  <Textarea
                    id="model-desc"
                    placeholder="Describe this artifact"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    disabled={createState !== "idle"}
                    rows={3}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model-date" className="text-xs text-muted-foreground">Capture date</Label>
                  <Input
                    id="model-date"
                    type="date"
                    value={captureDate}
                    onChange={(e) => setCaptureDate(e.target.value)}
                    disabled={createState !== "idle"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model-location" className="text-xs text-muted-foreground">Location</Label>
                  <Input
                    id="model-location"
                    placeholder="e.g. Sheung Wan, Hong Kong"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    disabled={createState !== "idle"}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="model-tags" className="text-xs text-muted-foreground">Tags</Label>
                  <Input
                    id="model-tags"
                    placeholder="comma, separated, tags"
                    value={tagsInput}
                    onChange={(e) => setTagsInput(e.target.value)}
                    disabled={createState !== "idle"}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="pt-4 border-t border-border">
            <h4 className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">Supported formats</h4>
            <div className="flex flex-wrap gap-2">
              {uploadMode === "capture" ? (
                <>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">MP4</span>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">MOV</span>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">JPG</span>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">PNG</span>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">HEIC</span>
                </>
              ) : (
                <>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">PLY</span>
                  <span className="px-2 py-1 rounded-md bg-secondary text-xs text-muted-foreground">SPLAT</span>
                </>
              )}
            </div>
          </div>
        </div>

        <div className="flex-1" />

        {/* Validation errors while still idle (e.g. bad file, missing title) */}
        {createState === "idle" && error && (
          <div className="p-4 border-t border-border">
            <p className="text-sm text-destructive text-center" role="alert">{error}</p>
          </div>
        )}

        {/* Status */}
        {createState !== "idle" && (
          <div className="p-4 border-t border-border">
            <div className="text-center">
              {createState === "uploading" && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {uploadMode === "model" ? "Uploading 3D file..." : "Uploading files..."}
                  </span>
                  <Progress value={progress} className="mt-3" />
                  <span className="text-xs text-muted-foreground mt-2 block">{progress}%</span>
                  {uploadMode === "model" && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-2 text-muted-foreground hover:text-destructive gap-1.5"
                      onClick={handleCancelUpload}
                    >
                      <Ban className="w-3.5 h-3.5" />
                      Cancel upload
                    </Button>
                  )}
                </>
              )}
              {createState === "processing" && (
                <>
                  <span className="text-sm text-muted-foreground">
                    {uploadMode === "model"
                      ? "Converting PLY to web format..."
                      : "Generating 3D Gaussian Splat..."}
                  </span>
                  <Progress value={progress} className="mt-3" />
                  <span className="text-xs text-muted-foreground mt-2 block">{progress}%</span>
                </>
              )}
              {createState === "complete" && (
                <>
                  <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-2">
                    <Check className="w-6 h-6 text-primary" />
                  </div>
                  <span className="text-sm text-primary font-medium">3D Model Ready!</span>
                </>
              )}
              {createState === "error" && (
                <>
                  <div className="w-12 h-12 rounded-full bg-destructive/20 flex items-center justify-center mx-auto mb-2">
                    <X className="w-6 h-6 text-destructive" />
                  </div>
                  <span className="text-sm text-destructive font-medium">Upload Failed</span>
                  {error && (
                    <span className="text-xs text-muted-foreground mt-1 block">{error}</span>
                  )}
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        <div className="p-4 border-t border-border">
          {createState === "idle" && (
            uploadMode === "capture" ? (
              <Button
                variant="capture"
                className="w-full gap-2"
                onClick={handleStartProcessing}
                disabled={uploadedFiles.length === 0}
              >
                <Upload className="w-5 h-5" />
                Process Files
              </Button>
            ) : (
              <Button
                variant="capture"
                className="w-full gap-2"
                onClick={handleStartModelUpload}
                disabled={!modelFile}
              >
                <Box className="w-5 h-5" />
                Upload 3D Model
              </Button>
            )
          )}
          {createState === "complete" && (
            <div className="space-y-3">
              <Button variant="capture" className="w-full gap-2" onClick={onComplete}>
                <Check className="w-4 h-4" />
                Save to Library
              </Button>
              <Button variant="ghost" className="w-full gap-2" onClick={handleReset}>
                Create Another
              </Button>
            </div>
          )}
          {createState === "error" && (
            <div className="space-y-3">
              <Button
                variant="capture"
                className="w-full gap-2"
                onClick={uploadMode === "model" ? handleStartModelUpload : handleStartProcessing}
              >
                <Upload className="w-4 h-4" />
                Try Again
              </Button>
              <Button variant="ghost" className="w-full gap-2" onClick={handleReset}>
                Start Over
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Center - Drop zone */}
      <div className="flex-1 flex flex-col p-8 bg-background/50">
        {/* File stats (capture mode only) */}
        {uploadMode === "capture" && uploadedFiles.length > 0 && createState === "idle" && (
          <div className="flex items-center gap-4 mb-4">
            {videoCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <FileVideo className="w-4 h-4 text-primary" />
                <span>{videoCount} video{videoCount !== 1 ? "s" : ""}</span>
              </div>
            )}
            {imageCount > 0 && (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <ImageIcon className="w-4 h-4 text-primary" />
                <span>{imageCount} image{imageCount !== 1 ? "s" : ""}</span>
              </div>
            )}
            <Button 
              variant="ghost" 
              size="sm" 
              className="ml-auto text-muted-foreground hover:text-destructive"
              onClick={handleReset}
            >
              <Trash2 className="w-4 h-4 mr-1" />
              Clear all
            </Button>
          </div>
        )}

        {/* Drop zone / Preview area */}
        <div 
          className={cn(
            "flex-1 relative rounded-2xl overflow-hidden",
            "border-2 border-dashed transition-all duration-300",
            isDragging 
              ? "border-primary bg-primary/5 scale-[1.02]" 
              : uploadedFiles.length > 0 
                ? "border-border bg-card" 
                : "border-border hover:border-primary/50 bg-card",
            createState !== "idle" && "pointer-events-none"
          )}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() =>
            createState === "idle" &&
            (uploadMode === "model" ? modelInputRef : fileInputRef).current?.click()
          }
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept="video/*,image/*"
            className="hidden"
            onChange={handleFileSelect}
          />
          <input
            ref={modelInputRef}
            type="file"
            accept=".ply,.splat"
            className="hidden"
            onChange={handleModelFileSelect}
          />

          {uploadMode === "model" ? (
            // ---- Direct 3D file upload (PR8) ----
            !modelFile ? (
              // Empty state
              <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
                <div className={cn(
                  "w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all duration-300",
                  isDragging ? "bg-primary/20 scale-110" : "bg-secondary"
                )}>
                  <Box className={cn(
                    "w-10 h-10 transition-colors",
                    isDragging ? "text-primary" : "text-muted-foreground"
                  )} />
                </div>
                <p className="text-foreground font-medium text-lg mb-2">
                  {isDragging ? "Drop your 3D file here" : "Drop a 3D file here or click to browse"}
                </p>
                <p className="text-muted-foreground text-sm mb-6 max-w-sm text-center px-4">
                  Bring a Gaussian Splat exported from Scaniverse, Polycam, Luma, or SuperSplat
                  (.ply or .splat, up to 300 MB)
                </p>
              </div>
            ) : createState === "idle" ? (
              // Staged file card
              <div className="absolute inset-0 flex items-center justify-center p-6">
                <div
                  className="w-full max-w-md rounded-xl border border-border bg-secondary/50 p-5 flex items-center gap-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="w-12 h-12 rounded-lg bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Box className="w-6 h-6 text-primary" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-foreground truncate">{modelFile.file.name}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">
                      {formatBytes(modelFile.file.size)}
                      <span className="ml-2 px-1.5 py-0.5 rounded bg-secondary text-[10px] uppercase tracking-wider">
                        {modelFile.kind}
                      </span>
                      {modelFile.kind === "ply" && (
                        <span className="ml-2 text-muted-foreground">will be converted (~2–3 min)</span>
                      )}
                    </p>
                  </div>
                  <Button
                    variant="icon"
                    size="icon"
                    className="flex-shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setModelFile(null)}
                    aria-label="Remove file"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ) : (
              // Uploading / converting / complete overlay
              <div className="absolute inset-0 flex flex-col items-center justify-center">
                {createState === "uploading" && (
                  <>
                    <div className="w-20 h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-6" />
                    <p className="text-foreground font-medium text-lg">Uploading 3D file...</p>
                    <p className="text-muted-foreground text-sm mt-2">
                      {modelFile.file.name} · {formatBytes(modelFile.file.size)}
                    </p>
                  </>
                )}
                {createState === "processing" && (
                  <>
                    <div className="relative w-24 h-24 mb-6">
                      <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                      <div
                        className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
                        style={{ animationDuration: "1.5s" }}
                      />
                    </div>
                    <p className="text-foreground font-medium text-lg">Converting PLY to web format</p>
                    <p className="text-muted-foreground text-sm mt-2">This takes about 2–3 minutes...</p>
                  </>
                )}
                {createState === "complete" && (
                  <>
                    <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-scale-in">
                      <Check className="w-12 h-12 text-primary" />
                    </div>
                    <p className="text-foreground font-medium text-lg">3D Model Uploaded!</p>
                    <p className="text-muted-foreground text-sm mt-2">Your Gaussian Splat is ready to view</p>
                  </>
                )}
              </div>
            )
          ) : uploadedFiles.length === 0 ? (
            // Empty state
            <div className="absolute inset-0 flex flex-col items-center justify-center cursor-pointer">
              <div className={cn(
                "w-24 h-24 rounded-full flex items-center justify-center mb-6 transition-all duration-300",
                isDragging ? "bg-primary/20 scale-110" : "bg-secondary"
              )}>
                <Upload className={cn(
                  "w-10 h-10 transition-colors",
                  isDragging ? "text-primary" : "text-muted-foreground"
                )} />
              </div>
              <p className="text-foreground font-medium text-lg mb-2">
                {isDragging ? "Drop files here" : "Drop files here or click to browse"}
              </p>
              <p className="text-muted-foreground text-sm mb-6">
                Upload a video or multiple photos for 3D reconstruction
              </p>
              <div className="flex items-center gap-8 text-muted-foreground">
                <div className="flex items-center gap-2">
                  <Film className="w-5 h-5" />
                  <span className="text-sm">Video</span>
                </div>
                <div className="text-border">or</div>
                <div className="flex items-center gap-2">
                  <Images className="w-5 h-5" />
                  <span className="text-sm">Multiple Photos</span>
                </div>
              </div>
            </div>
          ) : createState === "idle" ? (
            // File preview grid
            <div className="absolute inset-0 p-4 overflow-auto">
              <div className="grid grid-cols-4 gap-3">
                {uploadedFiles.map((file, index) => (
                  <div 
                    key={index} 
                    className="relative aspect-square rounded-lg overflow-hidden bg-secondary group"
                    onClick={(e) => e.stopPropagation()}
                  >
                    {file.type === "video" ? (
                      <video 
                        src={file.preview} 
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      <img 
                        src={file.preview} 
                        alt={file.file.name}
                        className="w-full h-full object-cover"
                      />
                    )}
                    <div className="absolute inset-0 bg-background/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                      <Button
                        variant="icon"
                        size="icon"
                        className="bg-destructive/80 hover:bg-destructive"
                        onClick={() => handleRemoveFile(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    {file.type === "video" && (
                      <div className="absolute bottom-1 left-1 px-1.5 py-0.5 rounded bg-background/80 text-xs">
                        <FileVideo className="w-3 h-3 inline mr-1" />
                        Video
                      </div>
                    )}
                  </div>
                ))}
                {/* Add more button */}
                <button
                  className="aspect-square rounded-lg border-2 border-dashed border-border hover:border-primary/50 flex flex-col items-center justify-center gap-2 transition-colors"
                  onClick={(e) => {
                    e.stopPropagation();
                    fileInputRef.current?.click();
                  }}
                >
                  <Upload className="w-6 h-6 text-muted-foreground" />
                  <span className="text-xs text-muted-foreground">Add more</span>
                </button>
              </div>
            </div>
          ) : (
            // Processing state
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              {createState === "uploading" && (
                <>
                  <div className="w-20 h-20 rounded-full border-4 border-primary/30 border-t-primary animate-spin mb-6" />
                  <p className="text-foreground font-medium text-lg">Uploading files...</p>
                  <p className="text-muted-foreground text-sm mt-2">
                    {uploadedFiles.length} file{uploadedFiles.length !== 1 ? "s" : ""} being uploaded
                  </p>
                </>
              )}
              {createState === "processing" && (
                <>
                  <div className="relative w-24 h-24 mb-6">
                    <div className="absolute inset-0 rounded-full border-4 border-primary/20" />
                    <div 
                      className="absolute inset-0 rounded-full border-4 border-transparent border-t-primary animate-spin"
                      style={{ animationDuration: "1.5s" }}
                    />
                    <div 
                      className="absolute inset-2 rounded-full border-4 border-transparent border-t-primary/60 animate-spin"
                      style={{ animationDuration: "2s", animationDirection: "reverse" }}
                    />
                  </div>
                  <p className="text-foreground font-medium text-lg">Generating 3D Gaussian Splat</p>
                  <p className="text-muted-foreground text-sm mt-2">This may take a few minutes...</p>
                </>
              )}
              {createState === "complete" && (
                <>
                  <div className="w-24 h-24 rounded-full bg-primary/20 flex items-center justify-center mb-6 animate-scale-in">
                    <Check className="w-12 h-12 text-primary" />
                  </div>
                  <p className="text-foreground font-medium text-lg">3D Model Created!</p>
                  <p className="text-muted-foreground text-sm mt-2">Your Gaussian Splat is ready to view</p>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
