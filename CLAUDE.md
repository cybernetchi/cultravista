# CLAUDE.md — CultraVista (cultravista)

> Project context and engineering plan for Claude Code. Place this file at the **root of the `cultravista` repo**. Run `/init` once if you want Claude Code to extend it, but keep the sections below intact.

## 1. What this project is

CultraVista is a web platform for **cultural-heritage 3D capture, curation, and publishing** using 3D Gaussian Splatting (3DGS). Operated by Space and Place Limited (HK), an HKSTP/TSSSU-incubated cultural-tech venture.

**Strategic stance (read before proposing architecture):** Mobile 3DGS *capture* is now commoditized (Scaniverse, Polycam, Luma, KIRI). We do **not** build our own capture/reconstruction. We integrate a third-party reconstruction API and concentrate engineering on the layer that is defensible and that capture apps don't provide: **curation, spatial storytelling, archival metadata/standards, and publishing.** Do not propose building an in-house splat trainer/reconstructor.

## 2. Tech stack

- **Frontend:** Vite + React 18 + TypeScript, react-router-dom. Routes today: `/` (app) and `/iframe-viewer` (embeddable viewer).
- **UI:** shadcn/ui + Tailwind CSS, dark theme, `lucide-react` icons. Component primitives live in `src/components/ui/`.
- **3D rendering:** `three` + `@react-three/fiber` + `@react-three/drei` (`<Splat>`). A legacy vanilla viewer also exists in `public/splat/`.
- **Backend:** Supabase (Postgres + Storage + Edge Functions, Deno). Project id in `supabase/config.toml`.
- **External services:** KIRI Engine 3DGS API (reconstruction); AWS S3 (asset storage) + AWS Lambda (PLY→splat conversion), called via edge functions.
- **Package manager:** bun (`bun.lockb`) — npm also works.

## 3. Current architecture (as built)

**Capture → render pipeline:**
1. User uploads images or a video (`src/components/capture/`, `src/hooks/useCapture.ts`).
2. `kiriService.ts` gets a token (`kiri-token` edge fn) and POSTs to KIRI `3dgs/image` or `3dgs/video` (`isMesh=0`), then polls (`kiri-status`) and fetches the model zip (`kiri-model-zip`) → PLY.
3. `storageService.ts` uploads to S3 via `s3-upload` edge fn.
4. `kiriService.convertPlyToSplat()` calls `ply-to-splat` edge fn → AWS Lambda (fire-and-forget, ~2–3 min, `EdgeRuntime.waitUntil`) which writes the `.splat` back and updates the DB row.
5. `captureService.ts` reads/writes the `captures` table; the viewer (`src/components/web/GaussianSplatViewer.tsx`, `viewerService.ts`, `/iframe-viewer`) renders it.

**Data model (current):** single `captures` table — `id, title, status (0=processing,1=complete,2=failed), thumbnail, file, serialize, folder_path, created_at, updated_at`. Storage bucket `captures`.

**Edge functions:** `kiri-token`, `kiri-status`, `kiri-model-zip`, `ply-to-splat`, `s3-upload`, `proxy`. All currently `verify_jwt = false`.

## 4. Known gaps / constraints (the reason for the milestone-4 plan)

- ⚠️ **Security: RLS is wide open.** Policies allow *anyone* to SELECT/INSERT/UPDATE/**DELETE** on `captures` and the storage bucket. There is no authentication. This must be fixed before any pilot or public launch. Treat as the highest-priority item.
- **No users / orgs / collections.** Nothing is owned or scoped.
- **No real metadata.** No provenance, date, location, rights/licence, description, or multilingual fields — it's a file store, not an archive.
- **"Annotation" is not spatial.** `src/components/annotate/AnnotateView.tsx` and `web/WebAnnotateModal.tsx` are 2D pen-stroke doodles drawn over a thumbnail JPG, not persisted, not anchored in 3D. This is the biggest product gap.
- **Legacy format.** Pipeline outputs the antimatter15 `.splat` format. No SPZ/SOG/glTF (relevant to the archival story).
- README is still the default Lovable template.

## 5. Conventions (follow these)

- TypeScript strict; clean, modular, **commented** code.
- Always include **error handling, loading states, and responsive (mobile + desktop) design** — these are hard project requirements.
- Keep capture **outsourced to KIRI**. Don't reintroduce in-house reconstruction.
- Secrets (KIRI key, AWS creds, Supabase service role) live in **edge-function env vars** — never commit them. The frontend may only use the Supabase anon/publishable key, and security must come from RLS (see PR1).
- **Plan before coding.** Use plan mode; for any schema/RLS change, show the migration and get approval before applying.
- **One slice per PR.** Build iteratively (an incubation requirement), each PR independently reviewable, with a clear migration + rollback note where DB changes are involved.
- Add a Supabase migration for every schema change (`supabase/migrations/`); never edit the DB out-of-band.

## 6. Milestone 4 engineering plan (sequenced PRs)

Goal: turn a file dump into a **curated, secure, publishable heritage archive**. Build in this order; each is one PR.

### PR1 — Auth + lock down security `[priority: critical]`
- Add Supabase Auth (email/password + at least one OAuth provider).
- New tables: `profiles`, `organizations`, `memberships` (user↔org with role).
- Add `owner_id` and `org_id` to `captures`; backfill/migrate existing rows.
- **Rewrite all RLS policies**: authenticated + owner/org-scoped for write; remove the open "anyone can delete" policies. Public read allowed only for rows explicitly marked published (see PR4).
- Add auth gating to the frontend (protected routes, sign-in flow) with loading/error states.
- Review edge functions (`verify_jwt = false`): require auth where user-initiated, keep open only where strictly necessary, and add basic abuse protection.
- **Done when:** an unauthenticated client cannot read or mutate non-published data; existing pipeline still works for signed-in users.

### PR2 — Archive-grade metadata + collections
- Extend `captures` with: `description`, `capture_date`, `location_text`, optional `lat`/`lng`, `rights_license`, `attribution`, `tags`, `source` (kiri/upload). Multilingual fields for `title`/`description` (English + Traditional Chinese, e.g. `title_en`, `title_zh_hant`).
- New `collections` table (museum/exhibition grouping) + `capture_id ↔ collection_id` link.
- Update create/edit modals (`web/WebCreateModal.tsx`, `web/WebEditModal.tsx`), `src/types/scan.ts`, and `captureService.ts`.
- **Done when:** a capture can carry full archival metadata in both languages and belong to a collection.

### PR3 — Spatial storytelling `[the centerpiece]`
- New `annotations` table: `capture_id`, `position` (x,y,z), optional `camera_pose`, `title`, `body` (rich text), `media_url` (image/audio), `order_index`, `locale`.
- 3D hotspot rendering: place markers at real scene coordinates in the r3f viewer using drei `<Html>`; clicking a hotspot opens a detail panel.
- **Tour mode:** step the camera between ordered hotspots with narrative text/audio per stop.
- Authoring: replace the 2D doodle annotator with a spatial editor — click on the splat (raycast) or enter coordinates to drop a hotspot; edit/reorder; persist and reload.
- **Done when:** a curator can author hotspots + an ordered tour on a real scene, save them, and a viewer can play the tour.

### PR4 — Exhibit publishing + embedding
- Add `published` (bool) + `slug` to captures/collections; public RLS read for published only.
- New public route `/exhibit/:slug` rendering the splat + tour + metadata, with an EN/繁中 language toggle, responsive.
- Upgrade `/iframe-viewer` to render a published exhibit (story included) and provide share/embed UI (copy link + iframe snippet).
- **Done when:** a museum can publish an exhibit and embed it on an external site via a single iframe snippet.

### PR5 — Archival format upgrade (SPZ/SOG)
- Change the conversion step (Lambda + `ply-to-splat`) to output **SPZ** (Niantic, now in the glTF KHR extension; ~90% smaller; good archival interop) for delivery, and **retain the original PLY** for archival.
- Update the viewer to load the new format (use a loader/engine that supports SPZ; evaluate Spark or PlayCanvas engine vs. staying on r3f with an SPZ loader).
- Optionally also emit SOG for smallest web payloads.
- **Done when:** new captures are stored as PLY (archive) + SPZ (delivery) and render correctly; document the format decision in the PR.

### Optional R&D spike (do NOT merge to main) — generative context
- Branch experiment: use World Labs **Marble / World API** to generate a contextual environment around a captured artifact. Goal is a demoable proof for the HKSTP "innovativeness" section, not a production feature.

## 7. Commands

```sh
bun install            # or: npm i
bun run dev            # start dev server (or: npm run dev)
bun run build          # production build
bun run lint           # eslint
# Supabase (if CLI configured):
supabase migration new <name>
supabase db push
```

## 8. Working agreement for Claude Code

1. Start each work session by confirming which PR you're on; re-read this file's gaps + conventions.
2. Propose a plan (plan mode) and wait for approval before multi-file or schema changes.
3. Implement one PR slice; include error handling, loading states, responsive design, and comments.
4. Provide the migration + a short test/QA checklist; never weaken RLS to make something "work."
5. Commit with a clear message scoped to the PR; summarize what changed and what to verify.
