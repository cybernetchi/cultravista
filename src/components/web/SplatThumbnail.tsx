import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Splat, PerspectiveCamera } from "@react-three/drei";
import {
  resolveSplatUrl,
  useSplatData,
  renderedCenter,
  type SplatBounds,
} from "./GaussianSplatViewer";

interface SplatThumbnailProps {
  /** Raw (possibly remote/S3) splat URL — resolved through the CORS proxy here. */
  splatUrl: string;
  /** Shown while the model snapshot is still being produced. */
  fallbackImage?: string;
  className?: string;
}

// Cache captured thumbnails by URL so we render each model only once per session.
const thumbnailCache = new Map<string, string>();

// One WebGL capture at a time — many library tiles would otherwise spin up too
// many GL contexts at once.
const captureQueue: Array<() => void> = [];
let isProcessingQueue = false;

function processQueue() {
  if (isProcessingQueue || captureQueue.length === 0) return;
  isProcessingQueue = true;
  const next = captureQueue.shift();
  if (next) next();
}

function finishCapture() {
  isProcessingQueue = false;
  // Small delay before the next capture so the WebGL context can be released.
  setTimeout(processQueue, 100);
}

// Frame the camera on the object the same way the main viewer does (median
// center + core radius), so KIRI whole-room captures don't render off-screen.
function ThumbnailRig({
  bounds,
  onFramed,
}: {
  bounds: SplatBounds | null;
  onFramed: () => void;
}) {
  const camera = useThree((s) => s.camera);

  useEffect(() => {
    if (!bounds) return;
    const c = renderedCenter(bounds);
    const fovRad = (45 * Math.PI) / 180;
    const dist = (bounds.radius / Math.sin(fovRad / 2)) * 0.85;
    // Slight downward tilt for a flattering 3/4 view.
    camera.position.set(c.x, c.y + bounds.radius * 0.15, c.z + dist);
    camera.lookAt(c.x, c.y, c.z);
    camera.near = Math.max(dist / 1000, 0.001);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();
    onFramed();
  }, [bounds, camera, onFramed]);

  return null;
}

function CaptureScene({
  splatUrl,
  rawUrl,
  onCapture,
}: {
  splatUrl: string;
  rawUrl: string;
  onCapture: (dataUrl: string) => void;
}) {
  const { gl, scene, camera } = useThree();
  const capturedRef = useRef(false);
  const framedRef = useRef(false);
  const data = useSplatData(splatUrl);

  const handleFramed = useCallback(() => {
    framedRef.current = true;
  }, []);

  useEffect(() => {
    // Poll until the model is both loaded (framed) and has had a moment to draw,
    // then grab a single frame. Falls back after a max wait so we never hang.
    const start = Date.now();
    const tick = setInterval(() => {
      if (capturedRef.current) return;
      const ready = framedRef.current;
      const timedOut = Date.now() - start > 6000;
      if (ready || timedOut) {
        capturedRef.current = true;
        clearInterval(tick);
        // One extra beat for the splat material to paint at the new framing.
        setTimeout(() => {
          gl.render(scene, camera);
          const dataUrl = gl.domElement.toDataURL("image/jpeg", 0.85);
          thumbnailCache.set(rawUrl, dataUrl);
          onCapture(dataUrl);
          finishCapture();
        }, 350);
      }
    }, 200);

    return () => {
      clearInterval(tick);
      if (!capturedRef.current) finishCapture();
    };
  }, [gl, scene, camera, rawUrl, onCapture]);

  return <ThumbnailRig bounds={data?.bounds ?? null} onFramed={handleFramed} />;
}

function SplatPreview({
  splatUrl,
  rawUrl,
  onCapture,
}: {
  splatUrl: string;
  rawUrl: string;
  onCapture?: (dataUrl: string) => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 3]} fov={45} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      <Suspense fallback={null}>
        <Splat src={splatUrl} />
      </Suspense>
      {onCapture && (
        <CaptureScene splatUrl={splatUrl} rawUrl={rawUrl} onCapture={onCapture} />
      )}
    </>
  );
}

export function SplatThumbnail({ splatUrl, fallbackImage, className }: SplatThumbnailProps) {
  // Route remote splats through the proxy (S3 has no CORS header), matching the viewer.
  const loadUrl = resolveSplatUrl(splatUrl);

  const [cachedThumbnail, setCachedThumbnail] = useState<string | null>(
    () => thumbnailCache.get(splatUrl) || null
  );
  const [isCapturing, setIsCapturing] = useState(false);
  const [hasRequestedCapture, setHasRequestedCapture] = useState(false);

  const handleCapture = useCallback((dataUrl: string) => {
    setCachedThumbnail(dataUrl);
    setIsCapturing(false);
  }, []);

  // Queue a one-time capture on mount if we don't already have a snapshot.
  useEffect(() => {
    if (!cachedThumbnail && !hasRequestedCapture) {
      setHasRequestedCapture(true);
      captureQueue.push(() => setIsCapturing(true));
      processQueue();
    }
  }, [cachedThumbnail, hasRequestedCapture]);

  return (
    <div className={`relative ${className}`}>
      {/* Final snapshot once captured. */}
      {cachedThumbnail && (
        <img
          src={cachedThumbnail}
          alt="Model thumbnail"
          className="absolute inset-0 w-full h-full object-cover"
        />
      )}

      {/* Fallback image + spinner while the snapshot is being produced. */}
      {!cachedThumbnail && (
        <div className="absolute inset-0 w-full h-full">
          {fallbackImage ? (
            <img src={fallbackImage} alt="" className="w-full h-full object-cover opacity-60" />
          ) : (
            <div className="w-full h-full bg-secondary animate-pulse" />
          )}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        </div>
      )}

      {/* Offscreen render that produces the snapshot, then unmounts. */}
      {isCapturing && !cachedThumbnail && (
        <Canvas
          className="!absolute inset-0 opacity-0 pointer-events-none"
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <SplatPreview splatUrl={loadUrl} rawUrl={splatUrl} onCapture={handleCapture} />
        </Canvas>
      )}
    </div>
  );
}
