# Wardrobe Manager Mobile (Fresh Expo Setup)

## Quick start

```bash
cd "/Users/patrick.reinbold/code/wardrobe-manager/mobile app"
npm install
npx expo start --clear
```

## Share intent status

As of February 23, 2026, stable npm Expo is still SDK 54 in this environment, so `expo@~55.0.0` fails to install.

Current behavior:

- External inspiration UI is intentionally hidden for now to keep the app focused on wardrobe-first flow.
- Native OS “Share into app” compatibility remains wired as a fallback path.

If/when SDK 55+ stable is available in your npm registry, run:

```bash
cd "/Users/patrick.reinbold/code/wardrobe-manager/mobile app"
npx expo install --fix
npx expo run:ios
# or
npx expo run:android
```

## OpenAI setup

Create `.env` in `/Users/patrick.reinbold/code/wardrobe-manager/mobile app` from `.env.example`:

```bash
cp .env.example .env
```

Then set:

- `EXPO_PUBLIC_OPENAI_API_KEY`
- `EXPO_PUBLIC_OPENAI_CLASSIFIER_MODEL` (default `gpt-4.1-mini`)
- `EXPO_PUBLIC_GEMINI_API_KEY`
- `EXPO_PUBLIC_NANO_BANANA_MODEL` (default `gemini-3-pro-image-preview`)
- `EXPO_PUBLIC_NANO_BANANA_ASPECT_RATIO` (default `5:4`)
- `EXPO_PUBLIC_NANO_BANANA_IMAGE_SIZE` (default `1K`)
- `EXPO_PUBLIC_NANO_BANANA_TIMEOUT_MS` (default `90000`)
- `EXPO_PUBLIC_NANO_BANANA_MAX_ATTEMPTS` (default `3`)
- `EXPO_PUBLIC_NANO_BANANA_RETRY_BASE_DELAY_MS` (default `1500`)

## Developer mode

Use `/Users/patrick.reinbold/code/wardrobe-manager/mobile app/src/config/constants.ts`:

- `DEVELOPER_MODE = false` (default): hides most technical metadata in UI.
- `DEVELOPER_MODE = true`: shows technical metadata (scores, insulation deltas, refs, debug notes).

## Notes

- This is a clean Expo TypeScript baseline.
- `expo-asset` is declared directly in dependencies to avoid Metro resolution failures.
- Existing older project files at the workspace root are untouched.
- Main app flow is now loop-first:
  - `Wardrobe Loop` -> `Try-On Studio`
- Bottom navigation is simplified to `Camera`, `Wardrobe`, `Try-On`.
- `Lookbook` and `Try-Ons` are treated as advanced/debug views (developer mode).
- `Lookbook` is the graphical combo page (two-column visual outfit stacks).
- `Wardrobe` now supports item selection to build a custom outfit screen.
- `Outfit` screen supports save + direct try-on render generation.
- External inspiration features are parked for now (no visible happy-path UI).
- Classifier returns an insulation index per item; Lookbook can target `Warm` / `Mild` / `Cold`.
- Look detail includes `Try On This Look` (Nano Banana Pro) with self-photo selection/capture and render history.
- Any image tap opens full-size preview.
- Looks can be liked.
- New `Try-Ons` page lists all renders by most recent and opens linked outfit metadata/items.
- Render metadata includes stable external item keys so outfit parts can be reconstructed independent of current generated look sets.
- Each render now supports `Yay / Nay` feedback, persisted in metadata.
- Feedback automatically builds and stores an outfit-intelligence graph (`outfit-graph.json`) linking item pairs that perform well together.
- Try-on requests now use explicit timeout + retry with backoff and in-app attempt status messages.
- Most technical metadata is hidden in normal mode; toggle developer mode for diagnostics.

## Project docs

- `/Users/patrick.reinbold/code/wardrobe-manager/mobile app/docs/PROJECT_STATE_AND_ROADMAP.md`
