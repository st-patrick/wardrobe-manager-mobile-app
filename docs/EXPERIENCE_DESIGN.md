# Experience Design: Wardrobe Manager

*How the app should feel, and why.*

---

## Design Philosophy

Most wardrobe apps feel like inventory management software. Spreadsheets with photos. That's a fundamental mistake. People don't think about their clothes as data — they think about them as possibilities. "What could I wear today?" not "What are the properties of garment #47?"

This app should feel like opening your closet — except your closet is perfectly organized, everything is visible at once, and someone smart is standing next to you making suggestions.

Three principles guide every design decision:

**1. Visual first, always.** Clothes are visual objects. Every screen should lead with images, not labels. Text is supporting information — it answers questions the photo raises, but the photo is always the primary object. A wall of thumbnails tells you more about your wardrobe in one glance than any list view ever could.

**2. Progressive complexity.** New users see photos, tap things, and get results. Power users discover layers of intelligence underneath — classification details, insulation scoring, feedback-driven learning. The surface is simple. The depth is there when you want it.

**3. Never feel like homework.** Every interaction with the app should produce a visible, satisfying result. Take a photo — it appears in your gallery instantly. Select pieces — see the outfit materialize. Tap "try on" — watch yourself wearing it. No forms to fill out, no mandatory steps, no waiting rooms.

---

## The Core Loop

The entire app experience revolves around one loop:

```
Capture → Browse → Combine → Visualize → Decide
```

**Capture** is the entry point. Camera shutter, photo import, however the image gets in. This must be as fast as possible — the friction between "I want to add this" and "it's in my wardrobe" should be under two seconds.

**Browse** is the wardrobe itself. A visual, zoomable, tactile experience. You should be able to see your entire wardrobe at a glance, or zoom in to examine a single item's details. Think of it like the iOS Photos app applied to clothes.

**Combine** is where intelligence enters. Either you pick pieces yourself ("I want to wear these jeans with this jacket") or the app suggests combinations based on weather, color harmony, and what's worked before. This should feel like having a stylish friend flip through your closet and pull things out.

**Visualize** is the magic moment. A virtual try-on render that shows you wearing the outfit. This is the moment where abstract "these items go together" becomes concrete "I look great in this."

**Decide** closes the loop. You like the outfit — save it for tomorrow morning. You don't — the app learns from your reaction. Over time, the suggestions get better because the app understands not just your clothes, but your taste.

---

## Screen-by-Screen Experience Goals

### Camera (Capture)

**Goal:** Make adding items feel effortless and immediate.

The camera should feel like a dedicated barcode scanner at a store — point, tap, done. No review screen asking "keep this photo?" No crop tool. No filters. The item lands in your wardrobe the instant you tap the shutter. You see it appear in the gallery strip below. Satisfaction is immediate.

The gallery strip at the bottom serves a dual purpose: it confirms your recent additions (visual receipt), and it provides a quick glance at what's already scanned (reducing duplicate effort).

**What to avoid:** Any flow that makes the user feel like they're "processing" something. No progress bars after capture, no "analyzing..." overlays. Save silently, classify in the background, and let the wardrobe screen reveal the intelligence when they're ready to see it.

### Wardrobe (Browse)

**Goal:** Make the wardrobe feel like a physical closet you can see all of at once.

This is the most-visited screen. It needs to be fast, visual, and tactile.

The primary interaction model is a **zoomable photo grid** — like iOS Photos. Pinch out to see more items at once (tiny thumbnails, maximum overview). Pinch in to see fewer, larger images (better detail, easier tapping). This gives users control over density without needing category filters or search — your eyes are the filter.

Items are organized by category (tops, pants, shoes, etc.) but the category headers are minimal — thin dividers, not heavy section blocks. The photos do the organizing visually. When you zoom out, categories flow together into one continuous stream of your wardrobe.

Tapping an item opens its detail view — full-size photo, classification details, selection controls. The detail view is where complexity lives. The grid stays clean.

**What to avoid:** Cards with text on them. The wardrobe grid should be a wall of photos. Labels, colors, insulation values — that's all detail-view territory. In the grid, the image speaks for itself.

### Try-On Studio (Visualize)

**Goal:** Make the render feel like looking in a mirror.

The try-on flow should feel magical but not mysterious. The user selects an outfit, picks a reference photo of themselves, and taps "create." While the AI works, they should see clear progress — which attempt is running, how long it's been, whether it's retrying.

The result should fill the screen. This is the hero moment of the app — seeing yourself in the outfit. Don't shrink it into a card or surround it with controls. Full-bleed image, then scroll down for feedback buttons and outfit details.

**What to avoid:** Making the user wait without feedback. A spinning indicator for 30+ seconds is anxiety-inducing. Show attempt progress, elapsed time, and reassuring status messages. "Rendering your look..." → "Refining details..." → "Almost there..."

### Lookbook (Discover)

**Goal:** Surface combinations you wouldn't have thought of.

The lookbook is the app's styling intelligence made visible. It should feel like flipping through a curated magazine of outfits — all made from *your* clothes. Each look is a card showing the key pieces arranged visually, with a score and weather match visible but secondary.

Browsing should be swipeable and quick. Left/right through looks, tap to expand, "try on this look" to jump to the studio. The feeling is casual discovery: "Oh, I never thought of pairing those."

**What to avoid:** Making it feel algorithmic. The words "score" and "ranking" should be visible only in developer mode. In normal mode, looks are presented as curated suggestions — some tagged for warm days, some for cold, some marked as favorites.

---

## The Scanning Journey (UX Milestones)

The scanning experience is the biggest UX challenge in the app. It's front-loaded effort before the payoff arrives. Here's how we make the journey feel rewarding at every stage:

### Phase 1: First Five Minutes (0-10 items)

**User feeling:** Curious but skeptical. "Is this going to be worth the effort?"

**Design response:** Instant gratification. Every photo they take appears immediately in a beautiful grid. The wardrobe screen looks good even with five items — no "empty state" that makes it feel barren. Show a warm, encouraging count: "5 pieces scanned." Not "95 remaining" — never frame it as incomplete.

As items get classified (usually within seconds), subtle visual polish appears: items sort into categories, and tapping reveals rich details the AI extracted. This is the first "wow" moment — "it knows this is a cotton button-down with a spread collar?"

### Phase 2: First Week (10-30 items)

**User feeling:** Building momentum. "This is actually kinda fun."

**Design response:** The wardrobe starts looking like a wardrobe. Categories form. The grid has visual rhythm. At ~15 items, surface the outfit builder for the first time with a gentle nudge: "You have enough pieces to build an outfit. Try selecting a top, pants, and shoes."

This is the critical retention window. The user needs to see the bridge between "I'm photographing clothes" and "this helps me get dressed." The outfit builder provides that bridge — even with limited items, combining three pieces into an outfit feels satisfying.

### Phase 3: Critical Mass (30-50 items)

**User feeling:** Invested. "I can see my whole wardrobe."

**Design response:** Unlock the combinator. Show the first batch of AI-suggested outfits. This is the second "wow" moment — combinations they never would have thought of, scored and weather-matched, built from *their* clothes. Surface a message: "Based on your 42 pieces, here are looks for this week."

The virtual try-on becomes the draw. "Want to see yourself wearing this?" That's the hook that turns a cataloguing tool into a daily-use app.

### Phase 4: Complete Wardrobe (75+ items)

**User feeling:** Confident and curious. "What else can this do?"

**Design response:** Full intelligence mode. The outfit graph has enough feedback data to personalize suggestions. Surface insights: "You consistently prefer your navy pieces with brown shoes — here are three looks that lean into that." Show seasonal readiness: "Your winter wardrobe has strong coverage. Spring might need a couple of light layers."

This is where the app becomes indispensable — not because it stores photos, but because it understands style preferences better than the user's own memory.

---

## Emotional Design Details

### Color and Tone
The app's dark theme isn't just aesthetic — it makes clothing photos pop. Every image is brighter, more vivid, more present against a dark background. The UI recedes, the wardrobe advances. Accent colors (cyan, emerald) are used sparingly for interactive elements only.

### Motion and Feedback
Every action should have a visual response within 100ms. Tap a photo — it subtly scales. Select an item — the border glows. Save an outfit — a brief confirmation, then it's done. No modals asking "are you sure?" for reversible actions.

### Empty States
Empty states are invitations, not dead ends. An empty wardrobe says "Take your first photo — it'll appear right here." An empty lookbook says "Add a few more pieces and we'll start suggesting outfits." Always pointing forward, never making the user feel behind.

### Progress Without Pressure
The app never shows a percentage complete. There's no "wardrobe completeness" score. Instead, progress is felt through the richness of the experience — more items means more outfit options, better suggestions, and richer try-on possibilities. The reward is the experience getting better, not a progress bar filling up.

---

## What We're Solving For

At the end of the day, this app solves a specific problem: the gap between owning clothes and knowing what to wear. Most people own plenty of clothes but use the same 20% over and over. Not because the other 80% is bad — because they can't see everything at once, can't remember what goes with what, and don't have time to experiment.

This app closes that gap. It makes your entire wardrobe visible, suggests combinations you'd miss, and shows you what they look like on you — all from your phone, in the time it takes to brush your teeth.

The experience should feel that effortless. Everything we design works backward from that goal.

---

*Build for the person standing in front of their closet at 7am, half-awake, wishing someone would just tell them what to wear.*
