# Milestone 4 (Months 16–21) — Completion Plan for Claude Code

> Drop this file into the repo as `docs/milestone4-completion-plan.md` (or just paste the
> per-PR prompts below into Claude Code). It follows the conventions and PR-slice format
> already established in `CLAUDE.md` — read that file first in every session.

---

## 1. Milestone requirements (from Docs/Milestones.docx, 16–21 months)

| Track | Requirement |
|---|---|
| Product Development | Develop the user interface for **both mobile and web** platforms |
| Business Development | Release an **alpha** demonstrating core capability to **capture and render 3D assets** — "a functional alpha version of the mobile app with essential capturing features, validated through internal testing. Key functions: basic asset capturing, initial user interface." |
| Corporate Development | Prepare the alpha for launch to **potential clients and investors**; initiate **trial sessions for registration**; archive library configured for internal trials |

## 2. What is already on GitHub `main` (verified 2026-07-24)

- **PR1 — Auth + security lockdown** ✅ Email/password + Google OAuth (`src/pages/Auth.tsx`, `AuthContext.tsx`, `ProtectedRoute.tsx`), owner/org-scoped RLS (`20260614225640_pr1_auth_and_rls.sql`), `verify_jwt = true` on all user-initiated edge functions.
- **PR2 — Archival metadata + collections** ✅ Bilingual fields, rights/licence, location, collections (`20260615000702`).
- **PR3 — Spatial storytelling** ✅ 3D hotspots with GPU id/depth picking + surface snap, ordered camera tour (`20260615221049`).
- **PR4 — Exhibit publishing + embedding** ✅ `published` + `slug`, public `/exhibit/:slug`, upgraded `/iframe-viewer`, embed snippet (`20260616183619`).
- **PR5 — SPZ groundwork only** ⚠️ `ply_url`/`spz_url` columns and `SPZ_RENDERING_ENABLED = false` flag exist; the Lambda does not yet emit SPZ and the viewer does not render it. See `docs/spz-format-decision.md`. *Not milestone-blocking — deferred.*
- **Splat editing** ✅ Crop box + floater removal + Luma-style face-handle gizmo.
- **Web capture → render pipeline** ✅ Upload images/video → KIRI 3DGS → PLY → `.splat` → r3f viewer.

**Conclusion:** the *web* alpha meets the Business Development requirement. The gaps are below.

## 3. Gaps vs the milestone

| # | Gap | Milestone track | Severity |
|---|---|---|---|
| G1 | **Mobile UI is a non-functional mock.** In `src/pages/Index.tsx` the mobile branch renders `CaptureView` (simulated timer/progress, no real upload), `AnnotateView` (unpersisted 2D doodles), and detail/library views typed on the old mock `Scan` type. None of the PR1–PR4 features (auth-aware flows, metadata, collections, hotspots, publishing) reach mobile. | Product Dev | **High — milestone-blocking** |
| G2 | **No client/investor-facing entry point.** `/` routes straight into the protected app; unauthenticated visitors hit a sign-in wall. No public landing page, no "request a trial" registration path for prospective clients/investors. | Corporate Dev | **High — milestone-blocking** |
| G3 | No automated tests / documented internal-test pass ("validated through internal testing"). | Business Dev | Medium — *deferred by decision, keep on backlog* |
| G4 | README is still the default Lovable template. | Corporate Dev | Low — *deferred* |
| G5 | PR5 SPZ delivery unfinished (Lambda + viewer). | Roadmap | Low — *deferred* |

Decision taken (2026-07-24): satisfy G1 via **mobile-web parity** in this repo (responsive web app used from a phone; capture = phone camera / photo-video upload → KIRI, per the CLAUDE.md stance that reconstruction stays outsourced). Native app is out of scope for the alpha. G2 via a **public landing page**. G3–G5 deferred.

---

## 4. PR6 — Mobile parity: real capture, library, and detail on the phone `[milestone-blocking]`

**Goal:** the existing mobile layout (`MobileFrame` + `BottomNav`) becomes a functional alpha client — same data, same pipeline as the web side — so "UI for both mobile and web" and "basic asset capturing on mobile" are demonstrably true.

**Scope / tasks:**

1. **Capture (the core).** Replace the simulated `src/components/capture/CaptureView.tsx` with a real flow reusing the web pipeline:
   - `<input type="file" accept="image/*,video/*" capture="environment" multiple>` so a phone offers the camera directly; allow gallery multi-select for photo sets.
   - Reuse `useKiriUpload` / `useProcessingFlow` from `src/hooks/useCapture.ts` (the exact flow in `web/WebCreateModal.tsx`) — do **not** duplicate the KIRI logic; extract shared pieces into the hook if needed.
   - Keep the mobile look (full-screen, staged progress), but drive the progress UI from real upload/KIRI states instead of `setInterval`. Handle: no file chosen, upload failure, KIRI failure, retry. Warn before leaving mid-processing.
2. **Library.** `LibraryView` already reads `CaptureService` — verify processing/failed states render, add pull-style refresh or a refresh affordance, and make search work against real titles.
3. **Detail.** Rework `ScanDetailView` to use the real `Capture` type (not the mock `Scan`): render the splat via the existing viewer route, show PR2 metadata (bilingual title/description, date, location, rights), and link out to Edit on desktop for heavy tools. Read-only hotspot/tour playback on mobile is a stretch goal — include only if trivial via the existing `ExhibitView`.
4. **Annotate.** Remove the dead-end 2D doodle from the mobile flow (delete the route to `AnnotateView` or replace it with a "view story" playback). Do not ship a fake feature in the alpha.
5. **Profile/Settings.** Wire `ProfileView` to the real session (name/email from `AuthContext`, sign-out). Trim `SettingsView` to options that actually work.
6. **Auth on mobile.** Verify `/auth` renders well at phone widths (it should — confirm and fix paddings/tap targets).
7. **Types.** Retire `src/types/scan.ts` mock type from mobile components; use `Capture` from `captureService.ts` everywhere.

**Not in scope:** native wrapper, offline mode, on-device reconstruction (never — see CLAUDE.md), mobile authoring of hotspots/crop (desktop-only tools).

**Done when:** on a real phone browser, a signed-in user can capture a subject with the camera, see it process end-to-end (KIRI → splat), find it in the library, open it, view the 3D asset with its metadata — and every screen reached from the bottom nav shows real data or doesn't exist.

**Claude Code prompt:**

```
Read CLAUDE.md and docs/milestone4-completion-plan.md. Implement PR6 (mobile parity)
exactly as scoped: plan first in plan mode, one PR, no schema changes expected.
Start by mapping the mobile component tree from src/pages/Index.tsx and listing which
components are mock vs wired, then propose the refactor before coding.
```

## 5. PR7 — Public landing page + trial registration `[milestone-blocking]`

**Goal:** an unauthenticated visitor (client, investor, HKSTP reviewer) landing on the site understands what CultraVista is, sees it working, and can register for the alpha trial.

**Scope / tasks:**

1. **Route restructure.** `/` becomes a public landing page; the authenticated app moves to `/app` (keep `/` → `/app` redirect for signed-in users so existing users aren't confused). `/auth` redirects into `/app` after sign-in. Update `ProtectedRoute` accordingly.
2. **Landing content** (single page, dark theme, same shadcn/Tailwind system):
   - Hero: what CultraVista is (cultural-heritage 3D capture, curation, publishing via Gaussian Splatting) + primary CTA **"Request alpha trial"** and secondary **"Sign in"**.
   - **Live demo section:** embed 1–2 *published* exhibits via the existing `/iframe-viewer` embed (this is the investor money-shot — the product demos itself). Choose captures marked published; if none, seed one.
   - How it works (capture → curate → publish, 3 steps), and a short "for museums & cultural institutions" section.
   - Footer: Space and Place Limited, contact email.
3. **Trial registration.** CTA leads to the existing sign-up (`/auth?mode=signup`) — the alpha trial *is* an account. Add an optional `trial_requests` capture of org name/role at signup **only if** it needs no schema change; otherwise a `mailto:` contact link suffices for the alpha. Do not build an approval workflow.
4. **Bilingual:** EN / 繁中 toggle reusing the locale pattern from `ExhibitView`.
5. **Responsive + SEO basics:** works at phone widths; set real `<title>`, meta description, and OG tags in `index.html` (replace Lovable defaults).

**Not in scope:** CMS, blog, analytics, payment, approval queues.

**Done when:** logged-out visit to `/` shows the landing page with a working embedded 3D exhibit and a signup CTA that lands in the alpha app; logged-in users still reach the app directly; Lovable branding is gone from `index.html`.

**Claude Code prompt:**

```
Read CLAUDE.md and docs/milestone4-completion-plan.md. Implement PR7 (public landing
page + trial registration) exactly as scoped. Plan first: show the new route table and
the landing page section layout for approval before writing components. No RLS changes —
the demo embed must only use already-published exhibits through the existing public path.
```

## 6. Deferred backlog (post-milestone, tracked here so it isn't lost)

- **G3 QA:** vitest smoke tests for `captureService`/`annotationService` + a written internal-test checklist (supports the "validated through internal testing" wording — recommend doing this before showing investors).
- **G4 README:** replace the Lovable template with a real project README.
- **G5 SPZ:** update the Lambda to emit `files.ply`/`files.spz`, integrate `@spz-loader/core` in `GaussianSplatViewer`, flip `SPZ_RENDERING_ENABLED`.

## 7. Before you start Claude Code

Your local checkout at `C:\Users\cybernetchi\Projects\2025\05_CultraVista\CultraVista\cultravista_web` is **behind GitHub** (local `27bd98…"Splat editing"` vs remote `d666f1a` which adds the crop-box gizmo merge) and has local modifications. Reconcile first:

```sh
git stash          # or commit local changes if intentional
git pull origin main
git stash pop      # resolve if needed
```

Then run PR6 and PR7 as separate Claude Code sessions, one PR per session, per the working agreement in CLAUDE.md §8.
