// Dev-only harness for SplatThumbnail — renders the exact tile markup the
// mobile ScanCard and web WebScanCard use, against the public sample splats,
// with no auth required. Only mounted in dev builds (see App.tsx).
import { SplatThumbnail } from "@/components/web/SplatThumbnail";

export default function DevThumbTest() {
  return (
    <div className="min-h-screen bg-background p-6 space-y-6" data-testid="thumbtest">
      <h1 className="text-xl font-bold text-foreground">SplatThumbnail dev test</h1>

      {/* Mobile ScanCard shape: aspect-square button, thumbnail absolute inset-0 */}
      <div className="grid grid-cols-2 gap-3 max-w-sm">
        <button className="relative aspect-square rounded-2xl overflow-hidden bg-card" data-testid="tile-mobile">
          <SplatThumbnail
            splatUrl="/splat/samples/nike/output.splat"
            fallbackImage="/placeholder.svg"
            className="w-full h-full"
          />
          <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
            <h3 className="text-sm font-semibold text-foreground">nike (mobile shape)</h3>
          </div>
        </button>
        <button className="relative aspect-square rounded-2xl overflow-hidden bg-card" data-testid="tile-mobile-2">
          <SplatThumbnail
            splatUrl="/splat/samples/plush/output.splat"
            fallbackImage="https://this-host-does-not-exist.example/x.jpg"
            className="w-full h-full"
          />
          <div className="absolute bottom-0 left-0 right-0 p-3 z-20">
            <h3 className="text-sm font-semibold text-foreground">plush (dead fallback)</h3>
          </div>
        </button>
      </div>

      {/* Web WebScanCard shape: sized block */}
      <div className="w-64" data-testid="tile-web">
        <SplatThumbnail
          splatUrl="/splat/samples/nike/output.splat"
          fallbackImage="/placeholder.svg"
          className="w-full h-40 rounded-xl overflow-hidden"
        />
      </div>
    </div>
  );
}
