# Status Quo — March 2026

## What Exists

A working Expo/React Native mobile app (iOS) for wardrobe management and virtual try-on. Single-file main component (`App.tsx`, ~5,100 lines) with supporting modules for classification, outfit generation, and rendering.

### Core Features (Fully Implemented)

- **Camera capture** with instant save — no confirmation flow, shutter tap → wardrobe entry.
- **Photo import** from camera roll with multi-select.
- **AI classification** via OpenAI (gpt-4.1-mini) — extracts category, colors, material, fit, collar, pockets, insulation index, and more. Runs in parallel (3 workers) with automatic rate-limit pause/resume.
- **Visual wardrobe grid** — photos-only browsable grid with pinch-to-zoom (2-6 columns). Tap opens detail modal. Long-press selects for outfit. Organized by AI-detected categories.
- **Outfit builder** — select pieces from wardrobe (top + pants + shoes core), floating bar shows role coverage, preview outfit, jump to try-on.
- **Offline combinator** — generates weather-targeted outfit suggestions using insulation scoring and color harmony. Three profiles: warm/mild/cold.
- **Lookbook** — two-column visual cards, scored looks, like/unlike. Developer mode only.
- **Virtual try-on** via Gemini image model (Nano Banana Pro) — select subject photo, render outfit on person. Timeout + retry with backoff. Per-attempt status feedback.
- **Outfit intelligence graph** — aggregated yay/nay feedback per render, tracking item pair affinities and individual success rates.
- **Full storage model** — originals + normalized JPEG, SHA-256 hashes, render history, saved outfits, lookbook prefs. All local, no cloud.

### Navigation

Five tabs: Camera, **Wardrobe** (default), Try-On Studio, Lookbook (dev), History (dev).

### What Changed This Session

1. **Wardrobe screen redesigned** from card-based list to iOS Photos-style visual grid. Old implementation backed up to `src/wardrobeClassicView.tsx`.
2. **Detail modal** added — tapping a photo shows full-size image with classification details, color chips, material/fit/tags, select/delete actions.
3. **Floating outfit bar** — appears when items are selected, shows role checklist and action buttons.
4. **Pinch-to-zoom** — changes grid density via two-finger gesture or +/- buttons.
5. **Documentation written:**
   - `docs/THE_WARDROBE_SCANNING_GUIDE.md` — user-facing guide for the wardrobe scanning experience. Covers the five-minute rule, batch scanning strategies, photo tips, the cold start problem, and habit-building patterns.
   - `docs/EXPERIENCE_DESIGN.md` — UX philosophy and screen-by-screen design goals. Core loop, scanning journey milestones, emotional design principles.

## File Structure

```
App.tsx                          Main component (all screens, state, styles)
src/
  openai.ts                      Classification via OpenAI
  combinator.ts                  Offline outfit generation
  nanoBanana.ts                  Virtual try-on via Gemini
  types.ts                       WardrobeItem, GarmentClassification
  config/
    keys.ts                      API key loading from .env
    constants.ts                 DEVELOPER_MODE flag
  wardrobeClassicView.tsx        Backup of pre-redesign wardrobe rendering
docs/
  PROJECT_STATE_AND_ROADMAP.md   Technical project state + 4-phase roadmap
  EXPERIENCE_DESIGN.md           UX philosophy and design goals
  THE_WARDROBE_SCANNING_GUIDE.md User-facing scanning guide
```

## What's Next (From Roadmap)

1. **Phase 1: Better Offline Styling** — compatibility constraints, weather inputs, exclude/favorite items, saved presets, settings UI.
2. **Phase 2: AI-Assisted Quality** — second-stage AI ranking, style rationale, user preference memory.
3. **Phase 3: Virtual Try-On Quality** — fit consistency, render controls, variant generation.
4. **Phase 4: On-Person Rendering** — body reference profiles, side-by-side comparison.

## Known Gaps

- No initial commit yet — all files are untracked.
- All UI lives in one 5,100-line file. Will need extraction as it grows.
- No test coverage.
- API keys are client-side (needs token proxy for production).
- No onboarding flow in the app itself — the scanning guide is documentation only, not in-app UI.
