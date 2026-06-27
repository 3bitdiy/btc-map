# Phase 4 — Mobile redesign plan

Goal: replace the two floating circular FABs (sliders + home) with one
**bottom sheet** for browse/details + a clear **Filters** button, using a
drag handle instead of the tiny minimize triangle.

## Current problems
- Two similar circles (sliders + home) → confusing.
- Filter panel opens "under" the home FAB → reads as one panel.
- Tiny triangle for minimize → unintuitive.

## Screens

```
SCREEN 1 — Map, nothing selected (peek)
┌──────────────────────────────┐
│ ▟ Beyond the Cities          │  slim top bar (logo+name, tap → /)
│                 ┌───────────┐ │
│                 │ ⚐ Filters③│ │  pill, ③ = active filter count
│      🏠                      │
│   🏠      🏠     🏠          │
│        🏠   ②                │  (map full-screen)
│   🏠           🏠            │
│ ┌──────────────────────────┐ │
│ │            ▁▁▁           │ │  DRAG HANDLE (grabber)
│ │  99 colonies          ⌃  │ │  peek bar (tap/drag up)
│ └──────────────────────────┘ │
└──────────────────────────────┘

SCREEN 2 — Sheet up: BROWSE (list)
│ │            ▁▁▁           │ │  drag down = back to peek
│ │  99 colonies             │ │
│ │  SERBIA (59)          ▾  │ │  colony list grouped by country
│ │    • Ars Timacum         │ │
│ │  BOSNIA & HERZEG. (13) ▸ │ │
│ │  NORTH MACEDONIA (27)  ▸ │ │

SCREEN 3 — Sheet: DETAIL (colony selected)
│ │ ‹ Back            ✕      │ │  back to list / close
│ │ [ photo ]                │ │
│ │ ARS TIMACUM              │ │
│ │ SVRLJIG · Painting       │ │
│ │ Organizers / Contact …   │ │

SCREEN 4 — FILTERS overlay (from the Filters button)
│  Filters                  ✕  │  full slide-up overlay
│  COUNTRY  ☑ SRB ☑ BiH ☑ NMK │
│  ART FIELD               ▾   │
│  SCOPE                   ▾   │
│  [ Reset ]   [ Show 99 ▸ ]   │  Apply
```

## Snap points & gestures (bottom sheet)
- **Peek** (~80px): handle + "N colonies" / selected colony name.
- **Half** (~50%): list or details, map visible above.
- **Full** (~90%): full content.
- Drag handle up/down to change snap; swipe-down from full → peek; tap peek → half.
- Tap a marker → sheet to **half** with that colony's details.

## Icons (clearer than now)
- **Filters** = funnel `⚐` + "Filters" label + count badge (not a bare circle).
- **Sheet** = drag-handle bar `▁▁▁` (universal "drag"), not a triangle.
- **Detail** = `‹` back, `✕` close. No more two competing circles.

## Key mobile decision (differs from desktop)
On mobile, **split filter from browse**:
- **Filters overlay** = Country + Art field + Scope (refine) + "Show N" apply.
- **Bottom sheet** = colony list (browse) ⟷ details.

(Desktop keeps the merged country accordion; mobile is cleaner when split.)

## Build order (incremental, commit each step)
1. Slim top bar + "Filters" pill (replace `#filter-toggle`).
2. Bottom-sheet shell + 3 snap points + drag handle (CSS + small JS for gestures).
3. Browse mode (list) in the sheet.
4. Detail mode in the sheet + tap-marker → half.
5. Filters overlay (Country/Art/Scope + Apply).
6. Remove old FABs; check tablet.

## Notes / open questions
- Reuse desktop intro/empty-state copy for the sheet's empty state.
- Keep zoom controls? On phones they're currently hidden (pinch-zoom). Decide
  if a reset-to-region control is worth a small button.
- Tablet (768–1199) currently uses the desktop overlay panels; decide whether
  it adopts the mobile sheet or keeps desktop layout.
