import { Canvas, useThree, useFrame, ThreeEvent } from "@react-three/fiber";
import { Splat, OrbitControls, PerspectiveCamera, Html, Billboard } from "@react-three/drei";
import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Vector3,
  BufferGeometry,
  BufferAttribute,
  ShaderMaterial,
  Points,
  Scene,
  WebGLRenderTarget,
  Color,
  EdgesGeometry,
  BoxGeometry,
  Vector2,
  DoubleSide,
} from "three";
import { Button } from "@/components/ui/button";
import { Maximize2, Minimize2, Move3D, Eye, ZoomIn, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import type { Annotation } from "@/types/scan";

interface GaussianSplatViewerProps {
  src: string;
  className?: string;
  onClose?: () => void;
  title?: string;
  /** Hotspots to render as markers. */
  annotations?: Annotation[];
  /** "edit" enables click-to-place; "crop" shows the crop box; "view" is read-only. */
  mode?: "view" | "edit" | "crop";
  selectedId?: string | null;
  onSelectAnnotation?: (id: string) => void;
  /** Called in edit mode when the user clicks the object to drop a marker. */
  onPlacePoint?: (p: [number, number, number]) => void;
  /** When set, fly the camera to this annotation index (tour playback). */
  tourIndex?: number | null;
  /** Receives the current camera pose (for "set camera view"). */
  onCameraPoseRef?: (getter: () => Annotation["cameraPose"]) => void;
  /** Crop mode: the live box to draw (rendered-space min/max). */
  cropBox?: { min: [number, number, number]; max: [number, number, number] } | null;
  /** Crop mode: called when a face handle is dragged to resize the box. */
  onCropBoxChange?: (b: { min: [number, number, number]; max: [number, number, number] }) => void;
}

// Remote (http) splats must be loaded through the Supabase `proxy` edge function:
// S3 serves the file but without an Access-Control-Allow-Origin header, so a
// direct browser fetch is blocked by CORS. The proxy re-serves it with CORS
// headers. Same-origin/relative URLs (e.g. local sample splats) pass through.
export function resolveSplatUrl(src: string): string {
  if (/^https?:\/\//i.test(src)) {
    const supabaseUrl =
      import.meta.env.VITE_SUPABASE_URL || "https://gwtfkqkcvdqpccyglaff.supabase.co";
    return `${supabaseUrl}/functions/v1/proxy?url=${encodeURIComponent(src)}`;
  }
  return src;
}

export interface SplatBounds {
  center: [number, number, number];
  radius: number;
}

interface SplatData {
  bounds: SplatBounds;
  // All point positions in rendered (flipped) world space, packed xyz.
  points: Float32Array;
}

// drei's <Splat> keeps point positions in instanced attributes, so a normal
// bounding-box can't measure it. Instead we parse the .splat file ourselves
// (antimatter15 format: 32 bytes/point, xyz float32 at offset 0).
//
// KIRI captures include the whole room, so the *mean* center and a high
// percentile radius frame the entire scene and leave the object of interest
// tiny. Instead we use the per-axis MEDIAN as the center (lands in the dense
// object cluster, ignoring far background) and a small multiple of the MEDIAN
// radial distance as the framing radius (the dense core), so the camera frames
// the object and lets the sparse background fall outside the view.
export function useSplatData(src: string): SplatData | null {
  const [data, setData] = useState<SplatData | null>(null);

  useEffect(() => {
    let active = true;
    setData(null);

    fetch(src)
      .then((r) => r.arrayBuffer())
      .then((buf) => {
        if (!active) return;
        const ROW = 32;
        const count = Math.floor(buf.byteLength / ROW);
        if (count === 0) return;
        const dv = new DataView(buf);

        const xs = new Float64Array(count);
        const ys = new Float64Array(count);
        const zs = new Float64Array(count);
        for (let i = 0; i < count; i++) {
          const o = i * ROW;
          xs[i] = dv.getFloat32(o, true);
          ys[i] = dv.getFloat32(o + 4, true);
          zs[i] = dv.getFloat32(o + 8, true);
        }

        const median = (arr: Float64Array) => {
          const sorted = Float64Array.from(arr).sort();
          return sorted[Math.floor(count / 2)];
        };
        const cx = median(xs), cy = median(ys), cz = median(zs);

        const dists = new Float64Array(count);
        for (let i = 0; i < count; i++) {
          const dx = xs[i] - cx, dy = ys[i] - cy, dz = zs[i] - cz;
          dists[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
        }
        dists.sort();
        const medianRadial = dists[Math.floor(count * 0.5)] || 1;
        const radius = medianRadial * 1.8;

        // Keep the points (in rendered, flipped space) so click-to-place can
        // snap a hotspot onto the nearest real surface point along the click ray.
        const points = new Float32Array(count * 3);
        for (let i = 0; i < count; i++) {
          points[3 * i] = xs[i];
          points[3 * i + 1] = -ys[i];
          points[3 * i + 2] = -zs[i];
        }

        setData({ bounds: { center: [cx, cy, cz], radius }, points });
      })
      .catch(() => {
        /* leave defaults; the splat still renders, just not auto-framed */
      });

    return () => {
      active = false;
    };
  }, [src]);

  return data;
}

// Given a click ray and the splat point cloud (rendered space), return a real
// surface point near the ray — so a hotspot anchors to actual geometry and
// stays put as the camera moves.
//
// Splats have wispy floaters in front of the solid surface, so we don't take the
// absolute front-most point (that snaps to a floater). Instead we collect every
// point within `threshold` of the ray, then take a low DEPTH percentile: this
// skips the sparse front floaters and lands on the dense visible surface.
function findSurfacePoint(
  ray: { origin: Vector3; direction: Vector3 },
  points: Float32Array,
  threshold: number
): [number, number, number] | null {
  const ox = ray.origin.x, oy = ray.origin.y, oz = ray.origin.z;
  const dx = ray.direction.x, dy = ray.direction.y, dz = ray.direction.z;
  const t2 = threshold * threshold;
  const n = points.length / 3;

  const candT: number[] = []; // depth along ray for each near-ray candidate
  const candI: number[] = []; // index of each candidate
  let fbPerp = Infinity, fbIdx = -1; // global closest-to-ray fallback

  for (let i = 0; i < n; i++) {
    const px = points[3 * i] - ox;
    const py = points[3 * i + 1] - oy;
    const pz = points[3 * i + 2] - oz;
    const t = px * dx + py * dy + pz * dz; // projection along the ray
    if (t <= 0) continue; // behind the camera
    const perp2 = px * px + py * py + pz * pz - t * t;
    if (perp2 < fbPerp) { fbPerp = perp2; fbIdx = i; }
    if (perp2 < t2) {
      candT.push(t);
      candI.push(i);
    }
  }

  let idx: number;
  if (candI.length > 0) {
    // 10th-percentile depth among near-ray points = the dense front surface.
    const order = candI.map((_, k) => k).sort((a, b) => candT[a] - candT[b]);
    idx = candI[order[Math.floor(order.length * 0.1)]];
  } else if (fbIdx >= 0) {
    idx = fbIdx;
  } else {
    return null;
  }
  return [points[3 * idx], points[3 * idx + 1], points[3 * idx + 2]];
}

// The rendered center accounts for drei's 180°-about-X load flip (Y/Z negated).
export function renderedCenter(bounds: SplatBounds | null): Vector3 {
  if (!bounds) return new Vector3(0, 0, 0);
  return new Vector3(bounds.center[0], -bounds.center[1], -bounds.center[2]);
}

// Frame the camera/orbit pivot on the object once bounds are known.
function CameraRig({ bounds }: { bounds: SplatBounds | null }) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: { set: (x: number, y: number, z: number) => void }; update: () => void }
    | null;

  useEffect(() => {
    if (!bounds) return;
    const c = renderedCenter(bounds);
    const fovRad = (50 * Math.PI) / 180;
    const dist = (bounds.radius / Math.sin(fovRad / 2)) * 0.8;

    camera.position.set(c.x, c.y, c.z + dist);
    camera.near = Math.max(dist / 1000, 0.001);
    camera.far = dist * 100;
    camera.updateProjectionMatrix();

    if (controls?.target) {
      controls.target.set(c.x, c.y, c.z);
      controls.update();
    }
  }, [bounds, camera, controls]);

  return null;
}

// Renders a numbered marker per annotation as a screen-space dot button.
function Markers({
  annotations,
  selectedId,
  onSelect,
}: {
  annotations: Annotation[];
  selectedId?: string | null;
  onSelect?: (id: string) => void;
}) {
  return (
    <>
      {annotations.map((a, i) => (
        <Html key={a.id} position={a.position} center zIndexRange={[100, 0]} occlude={false}>
          <button
            onClick={(e) => {
              e.stopPropagation();
              onSelect?.(a.id);
            }}
            className={cn(
              "flex h-7 w-7 items-center justify-center rounded-full border-2 text-xs font-bold shadow-lg transition-transform hover:scale-110",
              selectedId === a.id
                ? "border-white bg-primary text-primary-foreground scale-110"
                : "border-white/80 bg-primary/80 text-primary-foreground"
            )}
            title={a.title ?? `Hotspot ${i + 1}`}
          >
            {i + 1}
          </button>
        </Html>
      ))}
    </>
  );
}

// Invisible bounding sphere used as a raycast proxy for click-to-place, since
// Gaussian splats themselves can't be reliably raycast.
// GPU "ID buffer" picking: render the point cloud to an offscreen pass where
// each point's color encodes its index, with depth testing on. Reading back the
// pixel under the click gives the front-most real point at exactly that pixel —
// pixel-perfect placement that doesn't depend on the splat material's depth.
const PICK_VERT = `
  attribute float aIndex;
  varying float vIndex;
  uniform float uSize;
  void main() {
    vIndex = aIndex;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`;
const PICK_FRAG = `
  precision highp float;
  varying float vIndex;
  void main() {
    float idx = vIndex;
    float r = mod(idx, 256.0);
    float g = mod(floor(idx / 256.0), 256.0);
    float b = mod(floor(idx / 65536.0), 256.0);
    gl_FragColor = vec4(r / 255.0, g / 255.0, b / 255.0, 1.0);
  }
`;

function PlacementPicker({
  bounds,
  points,
  onPlace,
}: {
  bounds: SplatBounds | null;
  points: Float32Array | null;
  onPlace: (p: [number, number, number]) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const size = useThree((s) => s.size);

  // Build the picking scene/target once per point cloud.
  const pick = useMemo(() => {
    if (!points) return null;
    const n = points.length / 3;
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(points, 3));
    const idx = new Float32Array(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    geo.setAttribute("aIndex", new BufferAttribute(idx, 1));
    const mat = new ShaderMaterial({
      vertexShader: PICK_VERT,
      fragmentShader: PICK_FRAG,
      uniforms: { uSize: { value: 5 * gl.getPixelRatio() } },
    });
    const scene = new Scene();
    scene.add(new Points(geo, mat));
    const target = new WebGLRenderTarget(1, 1);
    return { scene, target, geo, mat, buffer: new Uint8Array(4) };
  }, [points, gl]);

  useEffect(() => {
    return () => {
      if (pick) {
        pick.geo.dispose();
        pick.mat.dispose();
        pick.target.dispose();
      }
    };
  }, [pick]);

  // Render the id/depth pass and read back the front-most point at an NDC
  // coordinate (-1..1). Returns a real cloud point or null on a miss.
  const gpuPick = (ndcX: number, ndcY: number): [number, number, number] | null => {
    if (!pick || !points) return null;
    const dpr = gl.getPixelRatio();
    const w = Math.max(1, Math.floor(size.width * dpr));
    const h = Math.max(1, Math.floor(size.height * dpr));
    pick.target.setSize(w, h);

    // NDC +y is up and GL pixel origin is bottom-left, so no Y flip here.
    const px = Math.min(w - 1, Math.max(0, Math.floor((ndcX * 0.5 + 0.5) * w)));
    const py = Math.min(h - 1, Math.max(0, Math.floor((ndcY * 0.5 + 0.5) * h)));

    const prevTarget = gl.getRenderTarget();
    const prevColor = gl.getClearColor(new Color());
    const prevAlpha = gl.getClearAlpha();
    gl.setRenderTarget(pick.target);
    gl.setClearColor(0x000000, 0);
    gl.clear();
    gl.render(pick.scene, camera);
    gl.readRenderTargetPixels(pick.target, px, py, 1, 1, pick.buffer);
    gl.setRenderTarget(prevTarget);
    gl.setClearColor(prevColor, prevAlpha);

    const [r, g, b, a] = pick.buffer;
    if (a === 0) return null;
    const i = r + g * 256 + b * 65536;
    if (i < 0 || i >= points.length / 3) return null;
    return [points[3 * i], points[3 * i + 1], points[3 * i + 2]];
  };

  if (!bounds) return null;
  const c = renderedCenter(bounds);

  const handleClick = (e: ThreeEvent<MouseEvent>) => {
    if (e.delta > 6) return; // ignore orbit drags
    e.stopPropagation();
    const hit = gpuPick(e.pointer.x, e.pointer.y);
    if (hit) {
      onPlace(hit);
      return;
    }
    // Fallback: ray-snap, then the sphere intersection.
    const snapped = points ? findSurfacePoint(e.ray, points, bounds.radius * 0.08) : null;
    onPlace(snapped ?? [e.point.x, e.point.y, e.point.z]);
  };

  return (
    <mesh position={[c.x, c.y, c.z]} onClick={handleClick}>
      <sphereGeometry args={[bounds.radius * 1.5, 32, 32]} />
      <meshBasicMaterial transparent opacity={0} depthWrite={false} />
    </mesh>
  );
}

// Flies the camera to the active tour stop; frees orbit when tourIndex is null.
function TourController({
  annotations,
  tourIndex,
  bounds,
}: {
  annotations: Annotation[];
  tourIndex: number | null | undefined;
  bounds: SplatBounds | null;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as
    | { target: Vector3; update: () => void; enabled: boolean }
    | null;
  const goal = useRef<{ pos: Vector3; tgt: Vector3 } | null>(null);

  useEffect(() => {
    const active = tourIndex != null && annotations[tourIndex];
    if (!active) {
      goal.current = null;
      if (controls) controls.enabled = true;
      return;
    }
    const a = annotations[tourIndex as number];
    const center = renderedCenter(bounds);
    const marker = new Vector3(a.position[0], a.position[1], a.position[2]);

    let pos: Vector3;
    let tgt: Vector3;
    if (a.cameraPose) {
      pos = new Vector3(...a.cameraPose.position);
      tgt = new Vector3(...a.cameraPose.target);
    } else {
      tgt = marker.clone();
      const dir = marker.clone().sub(center);
      if (dir.lengthSq() < 1e-6) dir.set(0, 0, 1);
      dir.normalize();
      const d = (bounds?.radius ?? 1) * 1.4;
      pos = marker.clone().add(dir.multiplyScalar(d));
      pos.y += (bounds?.radius ?? 1) * 0.15;
    }
    goal.current = { pos, tgt };
    if (controls) controls.enabled = false;
  }, [tourIndex, annotations, bounds, controls]);

  useFrame(() => {
    const g = goal.current;
    if (!g || !controls) return;
    camera.position.lerp(g.pos, 0.08);
    controls.target.lerp(g.tgt, 0.08);
    controls.update();
  });

  return null;
}

// Exposes a getter for the current camera pose (used by "set camera view").
function CameraPoseProbe({
  onReady,
}: {
  onReady: (getter: () => Annotation["cameraPose"]) => void;
}) {
  const camera = useThree((s) => s.camera);
  const controls = useThree((s) => s.controls) as { target: Vector3 } | null;

  useEffect(() => {
    onReady(() => ({
      position: [camera.position.x, camera.position.y, camera.position.z],
      target: controls?.target
        ? [controls.target.x, controls.target.y, controls.target.z]
        : [0, 0, 0],
    }));
  }, [camera, controls, onReady]);

  return null;
}

// Crisp 12-edge wireframe geometry for a unit cube (reused, just scaled). Plain
// `wireframe` on a BoxGeometry shows the triangulation diagonals; EdgesGeometry
// gives clean box edges.
const UNIT_BOX_EDGES = new EdgesGeometry(new BoxGeometry(1, 1, 1));

type Vec3 = [number, number, number];

// Draw the whole gizmo on top of the splat regardless of camera angle. The box
// and the splat are both transparent and co-located, so three's back-to-front
// distance sort flips between them as you orbit — at some angles the splat would
// draw last and hide the box. A high renderOrder + depthTest:false pins the
// gizmo to draw last, always visible.
const GIZMO_RENDER_ORDER = 1000;

// One crop face: which axis/side it bounds, plus the transform that orients a
// unit plane (default normal +Z) to lie flat on that face, sized to the box.
interface CropFace {
  key: string;
  axis: 0 | 1 | 2;
  side: 0 | 1;
  pos: Vec3;
  rot: Vec3;
  /** In-plane size of the face quad. */
  planeScale: [number, number];
}

// An interactive crop-box gizmo (rendered-space min/max), modelled on Luma's:
// a translucent fill + crisp edges + a square handle on every face. Hovering or
// dragging a handle highlights that whole face; dragging slides it along its
// axis and reports the new box up via `onChange`. Orbit is suspended mid-drag.
function CropBoxGizmo({
  box,
  bounds,
  onChange,
}: {
  box: { min: Vec3; max: Vec3 };
  bounds: SplatBounds | null;
  onChange?: (b: { min: Vec3; max: Vec3 }) => void;
}) {
  const gl = useThree((s) => s.gl);
  const camera = useThree((s) => s.camera);
  const raycaster = useThree((s) => s.raycaster);
  const controls = useThree((s) => s.controls) as { enabled: boolean } | null;
  const [hovered, setHovered] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);

  // Latest box for the window drag listeners (closures would otherwise go stale).
  const boxRef = useRef(box);
  boxRef.current = box;

  const cx = (box.min[0] + box.max[0]) / 2;
  const cy = (box.min[1] + box.max[1]) / 2;
  const cz = (box.min[2] + box.max[2]) / 2;
  const sx = Math.max(1e-3, box.max[0] - box.min[0]);
  const sy = Math.max(1e-3, box.max[1] - box.min[1]);
  const sz = Math.max(1e-3, box.max[2] - box.min[2]);

  // Scene-relative sizes so handles/thickness stay sensible at any zoom.
  const sceneR = bounds?.radius ?? Math.max(sx, sy, sz);
  const minThick = sceneR * 0.02;

  // Begin an axis-constrained drag of one face. We track the pointer on the
  // window (not the handle mesh) so the drag survives the cursor leaving it.
  const startDrag = (face: CropFace) => (e: ThreeEvent<PointerEvent>) => {
    e.stopPropagation();
    if (!onChange) return;
    setDragging(face.key);
    if (controls) controls.enabled = false;
    gl.domElement.style.cursor = "grabbing";
    const { axis, side } = face;

    const onMove = (ev: PointerEvent) => {
      const rect = gl.domElement.getBoundingClientRect();
      const ndcX = ((ev.clientX - rect.left) / rect.width) * 2 - 1;
      const ndcY = -((ev.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(new Vector2(ndcX, ndcY), camera);
      const ray = raycaster.ray;

      const b = boxRef.current;
      // Reference point P = the current face centre; the face slides along axis n.
      const P: Vec3 = [
        (b.min[0] + b.max[0]) / 2,
        (b.min[1] + b.max[1]) / 2,
        (b.min[2] + b.max[2]) / 2,
      ];
      P[axis] = side === 0 ? b.min[axis] : b.max[axis];

      // Closest point between the pointer ray and the axis line through P:
      // solve for the offset t along the unit axis n. (Standard line–line
      // closest-point reduction with n a unit vector, so a = e = 1.)
      const O = ray.origin;
      const D = ray.direction; // normalised
      const rx = O.x - P[0], ry = O.y - P[1], rz = O.z - P[2];
      const bDotN = axis === 0 ? D.x : axis === 1 ? D.y : D.z;
      const dDotR = D.x * rx + D.y * ry + D.z * rz;
      const nDotR = axis === 0 ? rx : axis === 1 ? ry : rz;
      const denom = 1 - bDotN * bDotN;
      if (Math.abs(denom) < 1e-4) return; // ray ~parallel to axis: ignore
      const t = (nDotR - bDotN * dDotR) / denom;
      const coord = P[axis] + t;

      const next = { min: [...b.min] as Vec3, max: [...b.max] as Vec3 };
      if (side === 0) next.min[axis] = Math.min(coord, b.max[axis] - minThick);
      else next.max[axis] = Math.max(coord, b.min[axis] + minThick);
      onChange(next);
    };

    const onUp = () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      setDragging(null);
      if (controls) controls.enabled = true;
      gl.domElement.style.cursor = "";
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  // The six faces. `rot` orients a unit XY plane (normal +Z) onto each face;
  // `planeScale` is the face's in-plane extent.
  const faces: CropFace[] = [
    { key: "x0", axis: 0, side: 0, pos: [box.min[0], cy, cz], rot: [0, -Math.PI / 2, 0], planeScale: [sz, sy] },
    { key: "x1", axis: 0, side: 1, pos: [box.max[0], cy, cz], rot: [0, Math.PI / 2, 0], planeScale: [sz, sy] },
    { key: "y0", axis: 1, side: 0, pos: [cx, box.min[1], cz], rot: [Math.PI / 2, 0, 0], planeScale: [sx, sz] },
    { key: "y1", axis: 1, side: 1, pos: [cx, box.max[1], cz], rot: [-Math.PI / 2, 0, 0], planeScale: [sx, sz] },
    { key: "z0", axis: 2, side: 0, pos: [cx, cy, box.min[2]], rot: [0, Math.PI, 0], planeScale: [sx, sy] },
    { key: "z1", axis: 2, side: 1, pos: [cx, cy, box.max[2]], rot: [0, 0, 0], planeScale: [sx, sy] },
  ];

  return (
    <group>
      {/* Translucent fill (non-pickable, so it never blocks handles or orbit). */}
      <mesh
        position={[cx, cy, cz]}
        scale={[sx, sy, sz]}
        raycast={() => null}
        renderOrder={GIZMO_RENDER_ORDER}
      >
        <boxGeometry args={[1, 1, 1]} />
        <meshBasicMaterial
          color="#39FF14"
          transparent
          opacity={0.05}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>

      {/* Crisp edges. */}
      <lineSegments
        geometry={UNIT_BOX_EDGES}
        position={[cx, cy, cz]}
        scale={[sx, sy, sz]}
        raycast={() => null}
        renderOrder={GIZMO_RENDER_ORDER + 1}
      >
        <lineBasicMaterial color="#39FF14" transparent opacity={0.95} depthTest={false} />
      </lineSegments>

      {/* Per-face: full-face highlight (flat on the face) + a camera-facing
          square grab handle, so handles never collapse to a sliver edge-on. */}
      {onChange &&
        faces.map((f) => {
          const active = dragging === f.key || (!dragging && hovered === f.key);
          // Uniform, camera-facing handle size (grows a touch when active).
          const hs = sceneR * (active ? 0.085 : 0.06);
          return (
            <group key={f.key}>
              {/* Whole-face highlight — flat on the face, shown only when active. */}
              {active && (
                <mesh
                  position={f.pos}
                  rotation={f.rot}
                  scale={[f.planeScale[0], f.planeScale[1], 1]}
                  raycast={() => null}
                  renderOrder={GIZMO_RENDER_ORDER + 1}
                >
                  <planeGeometry args={[1, 1]} />
                  <meshBasicMaterial
                    color="#39FF14"
                    transparent
                    opacity={0.18}
                    side={DoubleSide}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              )}
              {/* Camera-facing square grab handle — the drag target. */}
              <Billboard position={f.pos}>
                <mesh
                  scale={[hs, hs, 1]}
                  renderOrder={GIZMO_RENDER_ORDER + 2}
                  onPointerDown={startDrag(f)}
                  onPointerOver={(e) => {
                    e.stopPropagation();
                    setHovered(f.key);
                    gl.domElement.style.cursor = "grab";
                  }}
                  onPointerOut={() => {
                    setHovered((h) => (h === f.key ? null : h));
                    if (!dragging) gl.domElement.style.cursor = "";
                  }}
                >
                  <planeGeometry args={[1, 1]} />
                  <meshBasicMaterial
                    color={active ? "#ffffff" : "#39FF14"}
                    transparent
                    opacity={active ? 1 : 0.9}
                    side={DoubleSide}
                    depthTest={false}
                    depthWrite={false}
                  />
                </mesh>
              </Billboard>
            </group>
          );
        })}
    </group>
  );
}

function SplatScene({
  src,
  annotations,
  mode,
  selectedId,
  onSelectAnnotation,
  onPlacePoint,
  tourIndex,
  onCameraPoseRef,
  cropBox,
  onCropBoxChange,
  onReady,
}: {
  src: string;
  annotations: Annotation[];
  mode: "view" | "edit" | "crop";
  selectedId?: string | null;
  onSelectAnnotation?: (id: string) => void;
  onPlacePoint?: (p: [number, number, number]) => void;
  tourIndex?: number | null;
  onCameraPoseRef?: (getter: () => Annotation["cameraPose"]) => void;
  cropBox?: { min: [number, number, number]; max: [number, number, number] } | null;
  onCropBoxChange?: (b: { min: [number, number, number]; max: [number, number, number] }) => void;
  onReady?: () => void;
}) {
  // Route remote splats through the CORS-enabling proxy before loading/parsing.
  const loadUrl = resolveSplatUrl(src);
  const data = useSplatData(loadUrl);
  const bounds = data?.bounds ?? null;
  const points = data?.points ?? null;

  // Keep the splat hidden until CameraRig has bounds to frame it with —
  // otherwise it first draws at the default camera (object off-center/low)
  // and visibly "pops" once the real framing lands. If bounds never resolve
  // (e.g. the parse fails), fall back to showing it after a grace period
  // rather than hiding the model forever.
  const [forceShow, setForceShow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setForceShow(true), 8000);
    return () => clearTimeout(t);
  }, []);
  const ready = bounds != null || forceShow;

  useEffect(() => {
    if (ready) onReady?.();
  }, [ready, onReady]);

  return (
    <>
      <PerspectiveCamera makeDefault position={[0, 0, 4]} fov={50} />
      <OrbitControls
        makeDefault
        enablePan
        enableZoom
        enableRotate
        enableDamping
        dampingFactor={0.1}
        minDistance={0.01}
        maxDistance={100000}
      />
      <CameraRig bounds={bounds} />
      <TourController annotations={annotations} tourIndex={tourIndex} bounds={bounds} />
      {onCameraPoseRef && <CameraPoseProbe onReady={onCameraPoseRef} />}
      <ambientLight intensity={0.6} />
      <directionalLight position={[10, 10, 5]} intensity={1} />
      <group visible={ready}>
        <Suspense fallback={null}>
          <Splat src={loadUrl} alphaTest={0.1} position={[0, 0, 0]} />
        </Suspense>
      </group>
      {mode === "edit" && onPlacePoint && (
        <PlacementPicker bounds={bounds} points={points} onPlace={onPlacePoint} />
      )}
      {mode === "crop" && cropBox && (
        <CropBoxGizmo box={cropBox} bounds={bounds} onChange={onCropBoxChange} />
      )}
      {mode !== "crop" && (
        <Markers annotations={annotations} selectedId={selectedId} onSelect={onSelectAnnotation} />
      )}
    </>
  );
}

function LoadingOverlay() {
  return (
    <div className="absolute inset-0 flex flex-col items-center justify-center bg-background/80 backdrop-blur-sm z-10">
      <Loader2 className="w-12 h-12 text-accent animate-spin mb-4" />
      <p className="text-foreground font-medium">Loading Gaussian Splat...</p>
      <p className="text-muted-foreground text-sm mt-1">This may take a moment</p>
    </div>
  );
}

export function GaussianSplatViewer({
  src,
  className,
  title = "3D Viewer",
  annotations = [],
  mode = "view",
  selectedId = null,
  onSelectAnnotation,
  onPlacePoint,
  tourIndex = null,
  onCameraPoseRef,
  cropBox,
  onCropBoxChange,
}: GaussianSplatViewerProps) {
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const toggleFullscreen = () => setIsFullscreen(!isFullscreen);

  // The overlay lifts when the scene is actually framed and visible (see
  // SplatScene's `ready`), not on a fixed timer.
  const handleSceneReady = useCallback(() => setIsLoading(false), []);

  // A splat that fails to fetch/parse throws through Suspense during render;
  // the boundary below swaps the canvas for an in-frame error state — without
  // it the error would unmount the entire app. Lift the loading overlay too,
  // or it would sit on top of the error message forever.
  const handleSceneError = useCallback(() => setIsLoading(false), []);

  return (
    <div className={cn(
      "relative bg-background border border-border rounded-lg overflow-hidden",
      isFullscreen && "fixed inset-4 z-50",
      className
    )}>
      {/* Header */}
      <div className="absolute top-0 left-0 right-0 z-20 flex items-center justify-between p-3 bg-gradient-to-b from-background/90 to-transparent">
        <div className="flex items-center gap-2">
          <Move3D className="w-5 h-5 text-accent" />
          <span className="text-foreground font-medium">{title}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={toggleFullscreen}
            className="h-8 w-8 text-muted-foreground hover:text-foreground"
          >
            {isFullscreen ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
          </Button>
        </div>
      </div>

      {/* Edit-mode hint */}
      {mode === "edit" && (
        <div className="absolute top-14 left-1/2 -translate-x-1/2 z-20 px-3 py-1.5 rounded-full bg-card/90 backdrop-blur-sm border border-border text-xs text-muted-foreground">
          Click the object to place a hotspot
        </div>
      )}

      {/* Canvas — keyed by src so a tripped boundary resets when the model changes. */}
      <div className="w-full h-full min-h-[400px]">
        {isLoading && <LoadingOverlay />}
        <ErrorBoundary
          key={src}
          onError={handleSceneError}
          fallback={
            <div className="w-full h-full min-h-[400px] flex flex-col items-center justify-center gap-3 p-6 text-center">
              <AlertTriangle className="w-8 h-8 text-destructive" />
              <p className="text-sm font-medium text-foreground">This 3D model could not be loaded</p>
              <p className="text-xs text-muted-foreground">
                The file may be missing, moved, or corrupted.
              </p>
            </div>
          }
        >
          <Canvas
            gl={{ antialias: true, alpha: true }}
            className="w-full h-full"
          >
            <SplatScene
              src={src}
              annotations={annotations}
              mode={mode}
              selectedId={selectedId}
              onSelectAnnotation={onSelectAnnotation}
              onPlacePoint={onPlacePoint}
              tourIndex={tourIndex}
              onCameraPoseRef={onCameraPoseRef}
              cropBox={cropBox}
              onCropBoxChange={onCropBoxChange}
              onReady={handleSceneReady}
            />
          </Canvas>
        </ErrorBoundary>
      </div>

      {/* Controls hint — touch wording on phones, mouse wording on larger screens */}
      <div className="absolute bottom-0 left-0 right-0 z-20 p-3 bg-gradient-to-t from-background/90 to-transparent">
        <div className="flex items-center justify-center gap-2">
          <div className="flex sm:hidden items-center gap-1 px-3 py-1.5 bg-card/80 backdrop-blur-sm rounded-full border border-border">
            <Eye className="w-4 h-4 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Drag to rotate</span>
            <span className="text-border mx-2">•</span>
            <ZoomIn className="w-4 h-4 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Pinch to zoom</span>
          </div>
          <div className="hidden sm:flex items-center gap-1 px-3 py-1.5 bg-card/80 backdrop-blur-sm rounded-full border border-border">
            <Eye className="w-4 h-4 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Drag to rotate</span>
            <span className="text-border mx-2">•</span>
            <ZoomIn className="w-4 h-4 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Scroll to zoom</span>
            <span className="text-border mx-2">•</span>
            <Move3D className="w-4 h-4 text-muted-foreground mr-1" />
            <span className="text-xs text-muted-foreground">Right-drag to pan</span>
          </div>
        </div>
      </div>

      {/* Fullscreen backdrop */}
      {isFullscreen && (
        <div
          className="fixed inset-0 bg-background/80 backdrop-blur-sm -z-10"
          onClick={toggleFullscreen}
        />
      )}
    </div>
  );
}
