import { Suspense, useState, useEffect, useRef, useCallback } from "react";
import { Canvas, useThree } from "@react-three/fiber";
import { Splat, PerspectiveCamera } from "@react-three/drei";
import { useQueryClient } from "@tanstack/react-query";
import { StorageService } from "@/services/storageService";
import { CaptureService } from "@/services/captureService";
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
  /** When set, a freshly rendered snapshot is also uploaded and written back
      to this capture's `thumbnail`, so other devices (cold caches) show the
      model image immediately instead of the original source photo. */
  captureId?: string;
  className?: string;
}

// Marker appended to server-persisted snapshot URLs (fragments are ignored by
// HTTP) so we can tell a model snapshot from an original source photo and
// avoid re-uploading on every cold-cache render.
const SNAP_MARKER = "#cv-model-snap";

// Cache captured thumbnails by URL — in memory for this session, and in
// localStorage so revisits (and the other layout, web/mobile) show the model
// snapshot instantly instead of re-rendering it. Keyed by the splat URL, so an
// edited/cropped model (new URL) naturally gets a fresh snapshot.
const CACHE_PREFIX = "cv-splat-thumb:";
const thumbnailCache = new Map<string, string>();

function readCachedThumbnail(url: string): string | null {
  const mem = thumbnailCache.get(url);
  if (mem) return mem;
  try {
    const stored = localStorage.getItem(CACHE_PREFIX + url);
    if (stored) thumbnailCache.set(url, stored);
    return stored;
  } catch {
    return null;
  }
}

function writeCachedThumbnail(url: string, dataUrl: string) {
  thumbnailCache.set(url, dataUrl);
  try {
    localStorage.setItem(CACHE_PREFIX + url, dataUrl);
  } catch {
    // Quota exceeded / privacy mode — in-memory cache still applies.
  }
}

// One WebGL capture at a time — many library tiles would otherwise spin up too
// many GL contexts at once (mobile Safari in particular kills contexts fast).
//
// The active slot is tracked by an ownership token. The TILE that claimed the
// slot is solely responsible for releasing it (on capture, failure, or its own
// unmount) — never code inside the Canvas, because a Canvas whose WebGL context
// dies during init may unmount without running any scene cleanup, which would
// starve the queue and leave every other tile spinning forever. releaseCapture
// is idempotent per token, so a late/duplicate release can never free a slot
// that a different tile now holds.
type CaptureThunk = (token: symbol) => void;
const captureQueue: CaptureThunk[] = [];
let activeToken: symbol | null = null;

function processQueue() {
  if (activeToken || captureQueue.length === 0) return;
  const next = captureQueue.shift()!;
  const token = Symbol("splat-thumbnail-capture");
  activeToken = token;
  next(token);
}

function releaseCapture(token: symbol | null) {
  if (!token || activeToken !== token) return;
  activeToken = null;
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
  onFail,
}: {
  splatUrl: string;
  rawUrl: string;
  onCapture: (dataUrl: string) => void;
  onFail: () => void;
}) {
  const { gl, scene, camera } = useThree();
  const capturedRef = useRef(false);
  const framedRef = useRef(false);
  const data = useSplatData(splatUrl);

  const handleFramed = useCallback(() => {
    framedRef.current = true;
  }, []);

  // A lost WebGL context (common on mobile Safari, which caps live contexts)
  // means this capture can never produce a valid frame — fail over to the
  // static image instead of leaving the tile spinning.
  useEffect(() => {
    const el = gl.domElement;
    const onLost = (e: Event) => {
      e.preventDefault();
      if (!capturedRef.current) {
        capturedRef.current = true;
        onFail();
      }
    };
    el.addEventListener("webglcontextlost", onLost);
    return () => el.removeEventListener("webglcontextlost", onLost);
  }, [gl, onFail]);

  useEffect(() => {
    // Once the model is framed, render and check the frame actually contains
    // lit pixels before accepting it: drei's <Splat> sorts its gaussians in a
    // web worker, so early frames after a camera jump are often still black.
    // Retry until something renders; if nothing ever does (slow parse, failed
    // fetch, worker death), fail over to the static image — never cache black.
    const start = Date.now();

    const frameHasContent = (): boolean => {
      const ctx = gl.getContext();
      const w = gl.domElement.width;
      const h = gl.domElement.height;
      if (!ctx || w === 0 || h === 0) return false;
      // Sample three horizontal lines (25%, 50%, 75% height); a framed object
      // crosses at least one of them.
      const row = new Uint8Array(w * 4);
      let lit = 0;
      for (const fy of [0.25, 0.5, 0.75]) {
        ctx.readPixels(0, Math.floor(h * fy), w, 1, ctx.RGBA, ctx.UNSIGNED_BYTE, row);
        for (let i = 0; i < row.length; i += 4) {
          if (row[i] + row[i + 1] + row[i + 2] > 30) lit++;
        }
      }
      return lit > 8;
    };

    const tick = setInterval(() => {
      if (capturedRef.current) return;
      // Generous window: directly-uploaded splats (PR8) can be 60MB+ and are
      // fetched through the CORS proxy — download+parse alone can exceed the
      // old 12s budget that was tuned for smaller KIRI outputs.
      const timedOut = Date.now() - start > 55000;
      if (framedRef.current) {
        gl.render(scene, camera);
        if (frameHasContent()) {
          capturedRef.current = true;
          clearInterval(tick);
          const dataUrl = gl.domElement.toDataURL("image/jpeg", 0.85);
          writeCachedThumbnail(rawUrl, dataUrl);
          onCapture(dataUrl);
          return;
        }
      }
      if (timedOut) {
        capturedRef.current = true;
        clearInterval(tick);
        onFail();
      }
    }, 400);

    return () => clearInterval(tick);
  }, [gl, scene, camera, rawUrl, onCapture, onFail]);

  return <ThumbnailRig bounds={data?.bounds ?? null} onFramed={handleFramed} />;
}

export function SplatThumbnail({ splatUrl, fallbackImage, captureId, className }: SplatThumbnailProps) {
  // Route remote splats through the proxy (S3 has no CORS header), matching the viewer.
  const loadUrl = resolveSplatUrl(splatUrl);
  const queryClient = useQueryClient();

  const [cachedThumbnail, setCachedThumbnail] = useState<string | null>(
    () => readCachedThumbnail(splatUrl)
  );
  const [isCapturing, setIsCapturing] = useState(false);
  // Capture failed (lost context / timeout): show the static image, no spinner.
  // Not cached — a later mount may succeed and upgrade the tile.
  const [failed, setFailed] = useState(false);

  // The slot token this tile currently holds (null when queued or done).
  const tokenRef = useRef<symbol | null>(null);

  // Fire-and-forget: upload a fresh snapshot and point the capture row's
  // thumbnail at it (marked), unless the stored thumbnail already is one.
  const persistSnapshot = useCallback(
    async (dataUrl: string) => {
      if (!captureId || fallbackImage?.includes(SNAP_MARKER)) return;
      try {
        const blob = await (await fetch(dataUrl)).blob();
        const up = await StorageService.uploadThumbnail(blob, `model-snap-${captureId}.jpg`);
        if (up.success && up.url) {
          await CaptureService.updateCapture(captureId, { thumbnail: up.url + SNAP_MARKER });
          queryClient.invalidateQueries({ queryKey: ["captures"] });
        }
      } catch (error) {
        // Cosmetic optimisation only — never surface a failure to the user.
        console.warn("Model thumbnail persist failed:", error);
      }
    },
    [captureId, fallbackImage, queryClient]
  );

  const handleCapture = useCallback((dataUrl: string) => {
    setCachedThumbnail(dataUrl);
    setIsCapturing(false);
    releaseCapture(tokenRef.current);
    tokenRef.current = null;
    void persistSnapshot(dataUrl);
  }, [persistSnapshot]);

  const handleFail = useCallback(() => {
    setFailed(true);
    setIsCapturing(false);
    releaseCapture(tokenRef.current);
    tokenRef.current = null;
  }, []);

  // Queue a one-time capture; the cleanup removes our pending entry and
  // releases any slot we still hold, so an unmount mid-queue or mid-capture
  // (user navigates away) can never wedge the queue.
  useEffect(() => {
    if (cachedThumbnail) return;
    const thunk: CaptureThunk = (token) => {
      tokenRef.current = token;
      setIsCapturing(true);
    };
    captureQueue.push(thunk);
    processQueue();
    return () => {
      const i = captureQueue.indexOf(thunk);
      if (i >= 0) captureQueue.splice(i, 1);
      releaseCapture(tokenRef.current);
      tokenRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Watchdog outside the Canvas: if we hold the slot but no frame (or failure)
  // arrived — e.g. the Canvas died before its scene mounted — fail over rather
  // than spin forever. handleFail's release is token-idempotent, so firing
  // late is harmless.
  useEffect(() => {
    if (!isCapturing) return;
    // Must outlast CaptureScene's 55s content window (large PR8 uploads).
    const t = setTimeout(() => handleFail(), 60000);
    return () => clearTimeout(t);
  }, [isCapturing, handleFail]);

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

      {/* Static image: dimmed + spinner while capturing, full-strength if the
          snapshot failed and the photo is what we're left with. */}
      {!cachedThumbnail && (
        <div className="absolute inset-0 w-full h-full">
          {fallbackImage ? (
            <img
              src={fallbackImage}
              alt=""
              className={`w-full h-full object-cover ${failed ? "" : "opacity-60"}`}
              onError={(e) => {
                // A dead fallback URL (e.g. seeded external image) would leave
                // the tile black — swap in the bundled placeholder instead.
                const img = e.currentTarget;
                if (!img.src.endsWith("/placeholder.svg")) img.src = "/placeholder.svg";
              }}
            />
          ) : (
            <div className={`w-full h-full bg-secondary ${failed ? "" : "animate-pulse"}`} />
          )}
          {!failed && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          )}
        </div>
      )}

      {/* Offscreen render that produces the snapshot, then unmounts. */}
      {isCapturing && !cachedThumbnail && !failed && (
        <Canvas
          className="!absolute inset-0 opacity-0 pointer-events-none"
          gl={{ antialias: true, alpha: true, preserveDrawingBuffer: true }}
        >
          <SplatPreviewInner
            splatUrl={loadUrl}
            rawUrl={splatUrl}
            onCapture={handleCapture}
            onFail={handleFail}
          />
        </Canvas>
      )}
    </div>
  );
}

function SplatPreviewInner({
  splatUrl,
  rawUrl,
  onCapture,
  onFail,
}: {
  splatUrl: string;
  rawUrl: string;
  onCapture: (dataUrl: string) => void;
  onFail: () => void;
}) {
  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0.5, 3]} fov={45} />
      <ambientLight intensity={0.8} />
      <directionalLight position={[5, 5, 5]} intensity={0.5} />
      <Suspense fallback={null}>
        <Splat src={splatUrl} />
      </Suspense>
      <CaptureScene splatUrl={splatUrl} rawUrl={rawUrl} onCapture={onCapture} onFail={onFail} />
    </>
  );
}
