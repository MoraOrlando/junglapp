# 004 — Drive the import progress bar with `transform: scaleX()` instead of `width`

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: MEDIUM
- **Category**: Performance
- **Estimated scope**: 1 file, ~6 lines

## Problem

The Excel-import progress bar animates `width` on every progress update, via
Tailwind's `transition-all` (which, combined with an inline `width` style
that changes on every tick of the import loop, forces layout + paint on each
update):

```tsx
// app/dashboard/stores/import/page.tsx:272-276 — current
<div className="w-full bg-amber-50 rounded-full h-2">
  <div
    className="bg-amber-500 h-2 rounded-full transition-all"
    style={{ width: `${progress}%` }}
  />
</div>
```

This is MEDIUM, not HIGH, because it only runs during a CSV/Excel import
(occasional, bounded action, not something hit tens of times a day) — but
it's a low-effort fix with the same layout-thrashing pattern as plan 001, so
it's worth doing in the same pass.

## Target

Keep the fill `div` at a fixed `width: 100%` inside the track, and drive the
visible progress with `transform: scaleX(progress / 100)` anchored to the
left edge:

```tsx
// target
<div className="w-full bg-amber-50 rounded-full h-2 overflow-hidden">
  <div
    className="bg-amber-500 h-2 rounded-full"
    style={{
      width: '100%',
      transformOrigin: 'left center',
      transform: `scaleX(${progress / 100})`,
      transition: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1)',
    }}
  />
</div>
```

Values used (from AUDIT.md, do not approximate): strong ease-out curve
`cubic-bezier(0.23, 1, 0.32, 1)`, 200ms — inside the general UI budget since
each individual update is a discrete step, not continuous motion.

## Repo conventions to follow

Same inline-style-plus-Tailwind-class pattern already used two lines above
for `width`; keep the split (layout-adjacent Tailwind classes, motion values
inline) consistent with how this file already mixes the two.

## Steps

1. In `app/dashboard/stores/import/page.tsx`, add `overflow-hidden` to the
   track `<div>`'s className (line 272) — needed because the fill is now
   always logically 100% wide and relies on `scaleX` + track overflow to
   clip it, whereas before the `width` percentage did the clipping itself.
2. On the fill `<div>` (lines 274-276):
   - Change `className` from `"bg-amber-500 h-2 rounded-full transition-all"`
     to `"bg-amber-500 h-2 rounded-full"` (drop `transition-all`; the
     transition moves to the inline style so it can target `transform`
     specifically).
   - Replace `style={{ width: `${progress}%` }}` with the `style` object
     shown in Target (fixed `width: '100%'`, `transformOrigin`, `transform:
     scaleX(...)`, explicit `transition`).

## Boundaries

- Do NOT touch the percentage-calculation logic (`progress`, `validCount`,
  the text above the bar) — only how the fill renders.
- Do NOT touch any other button or element on this page — that's covered by
  plan 002 for the buttons on this same file.
- Do NOT add a new dependency.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck` — expect no new errors.
- **Feel check**: run `npm run dev`, go through the store-import flow with a
  real (or test) Excel file, and watch the progress bar while importing:
  - The fill should still visually grow from 0% to 100% left-to-right,
    indistinguishable in appearance from the `width`-based version.
  - In DevTools → Performance, record while an import runs — no
    "Layout"/"Recalculate Style" entries should be attributed to the
    progress-bar element (only "Composite Layers").
- **Done when**: the fill div has a fixed `width: 100%` and only `transform`
  changes as `progress` updates, and the visible bar still reaches exactly
  the right edge of the track at 100%.
