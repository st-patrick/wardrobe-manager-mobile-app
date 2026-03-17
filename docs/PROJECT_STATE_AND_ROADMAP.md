# Wardrobe Manager Mobile: Project State and Roadmap

## Current State (Implemented)

Date context: February 2026.

The mobile app currently supports:

- Camera capture with immediate save to app storage (no confirmation flow).
- Import from camera roll.
- Local wardrobe gallery with category grouping and collapsible sections.
- Wardrobe item deletion (removes local files and metadata).
- OpenAI-powered clothing classification for unclassified items.
- Parallel analysis workers with automatic pause/resume behavior on API rate limit.
- Offline winter combinator that creates sensible outfit mixes.
- Offline combinator now uses diversity-aware randomization to avoid repeating the same anchor piece across most looks.
- Dedicated Lookbook page with two-column visual cards and top-to-bottom ingredient stacks.
- AI-provided `insulationIndex` (0-100) per classified item.
- Weather-targeted combo generation (Warm/Mild/Cold) using insulation matching.
- Look detail panel with `Try On This Look`.
- Try-on subject image add/select flow (camera roll or new photo capture).
- Try-on render output storage with latest preview + history thumbnails.
- OpenAI used for classification; Nano Banana Pro try-on uses Gemini image model calls.
- API keys and model IDs loaded from `.env` via `src/config/keys.ts`.
- Any image can be tapped to open full-size preview.
- Looks can be liked.
- Dedicated `Try-Ons` page shows all renders sorted by most recent.
- Try-on renders are associated with look metadata and item snapshots.
- Lookbook now shows only renders that belong to the currently selected look.
- Technical/debug metadata is hidden by default and shown only when `DEVELOPER_MODE` is enabled in `src/config/constants.ts`.
- Wardrobe supports multi-select item picking to build a custom outfit manually.
- New `Outfit` screen can preview selected pieces, save outfits, and run try-on directly.
- External inspiration lane is parked in the visible UI while we stabilize wardrobe-first flow.
- Incoming share support remains implemented as a fallback path (no happy-path UI surface).
- Try-on -> open details no longer depends on the currently generated look set.
- Try-on pipeline now has explicit timeout, retry-with-backoff, and visible per-attempt status feedback.
- UI now prioritizes one core loop: Wardrobe (capture/import/select pieces) -> Try-On Studio.
- Advanced views (Lookbook / Try-On history) are de-emphasized and exposed through developer mode navigation.
- Final renders now support explicit `Yay / Nay` feedback.
- Feedback is persisted per render and aggregated into an outfit-intelligence graph (`outfit-graph.json`) based on linked item keys.

## Storage Model (Current)

For each wardrobe item, we now keep two local files and a hash link:

- Original local copy: stored under `document/originals`.
- Normalized JPEG copy: stored under `document/captures`.
- Metadata in `wardrobe-items.json` includes:
  - `sourceUri`
  - `originalLocalUri`
  - `originalSha256`
  - `jpegSha256`

This gives a durable reference between normalized JPEG and original source.

Try-on storage:

- Subject photos: `document/tryon-subjects` (normalized JPEG).
- Try-on renders: `document/tryon-renders`.
- Inspiration images: `document/inspirations` (normalized JPEG).
- Try-on render metadata: `tryon-renders.json` (stores outfit id/name/source, look metrics, and part snapshots).
- Each render part snapshot includes a stable `externalKey` (`orig-sha256`, `jpeg-sha256`, or item id fallback) for recovery.
- Each try-on render now stores `feedback` (`yay`/`nay`) and `feedbackAt`.
- Aggregated graph storage: `outfit-graph.json` (node + edge affinities from rated renders).
- Lookbook preferences: `lookbook-prefs.json` (liked look ids).
- Saved outfits: `saved-outfits.json`.

## Classification Pipeline (Current)

- All images are converted to JPEG before OpenAI request.
- Classification returns structured fields (category, colors, materials, fit, collar, pockets, shoe properties, confidence, tags, notes).
- Classification also returns `insulationIndex` (0 light / breathable -> 100 highly insulating).
- Errors are stored per-item, and processing can resume on pending items later.

## Offline Combinator (Current)

The offline combinator creates winter outfit suggestions with deterministic rules.

Required core pieces:

- shoes
- pants
- top

Preferred winter additions:

- sweater
- jacket
- belt (optional, selected when available)

Selection approach:

- Uses classified labels/tags/features to bucket items by role.
- Builds candidate sets and scores them with rule-based heuristics.
- Scores each outfit against a target insulation level to fit weather intent.
- Keeps top-ranked combinations and shows them in Lookbook.

## Product Note (Color Calibration)

Open TODO already captured in UI and should remain:

- Require a white paper card in every photo for better color correction consistency.

## Requirements Snapshot (Agreed)

- Core UX should stay visual-first; technical metadata stays hidden in normal mode.
- Developer diagnostics are controlled by one boolean: `src/config/constants.ts` -> `DEVELOPER_MODE`.
- Lookbook and Try-Ons remain linked:
  - look detail shows renders for that look only
  - try-on history can always open recoverable outfit details from stored part keys, even without current generated look set
- Outfit generation must keep required roles valid (`shoes`, `pants`, `top`) and optional winter layers (`sweater`/`jacket`) and `belt`.
- Manual outfit workflow:
  - user can select wardrobe items -> confirm -> open Outfit screen
  - user can save outfit and run try-on from that same screen
- Inspiration workflow is intentionally de-prioritized for now:
  - no visible UI path
  - incoming share compatibility remains as fallback only
  - core focus is wardrobe inventory and wardrobe-based combinations
- Render feedback loop:
  - user can mark each final render `Yay` or `Nay`
  - ratings are linked to item keys and stored for graph-based pairing intelligence

## Roadmap (Planned)

### Phase 1: Better Offline Styling

- Add explicit compatibility constraints (e.g., formal shoes with formal tops).
- Add weather profile inputs (temperature/rain/wind).
- Add “exclude item” and “favorite item” constraints for combo generation.
- Add saved outfit presets.
- Add in-app Settings toggle for developer mode (replace constant-only switch).
- Add one-look-at-a-time swipe flow (left/right) as an alternative to batch look generation.

### Phase 2: AI-Assisted Outfit Quality

- Add second-stage AI ranking of offline candidates.
- Ask model for style rationale and confidence per outfit.
- Add user preference memory (fit preference, palette preference, occasion preference).
- Learn from explicit feedback (like/dislike outfit).

### Phase 3: Virtual Try-On (Next)

- Improve try-on quality (fit consistency, hand/edge artifacts, garment texture fidelity).
- Add render controls (pose lock, background lock, realism level).
- Add variant generation per look (multiple seeds).

### Phase 4: On-Person Rendering Quality and Scale

- Render selected outfits on-person (target pipeline: Nano Banana Pro as discussed).
- Inputs:
  - selected outfit items
  - user body reference profile
  - desired context/background
- Outputs:
  - fast preview render
  - high-quality final render
- Add “compare multiple outfit renders side-by-side”.

## Technical Debt / Cleanup Backlog

- Add migration logic for legacy metadata records.
- Add test coverage for role bucketing and outfit scoring rules.
- Add local performance instrumentation for batch classification.
- Consider backend token proxy for try-on/classification calls (avoid client-side key exposure in production).
- Add structured try-on telemetry (attempt count, latency, failure reason histogram).

## Notes for Future Implementation Sessions

When resuming development, prioritize this order:

1. Stabilize offline combinator quality and controls.
2. Improve virtual try-on output quality and controls.
3. Add AI-assisted ranking and user preference loop.
4. Add render orchestration and result management for on-person outputs.
