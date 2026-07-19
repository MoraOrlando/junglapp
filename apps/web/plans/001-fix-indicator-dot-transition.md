# 001 — Fix screen-indicator dot transition (layout property + literal `all`)

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: HIGH
- **Category**: Performance / Physicality
- **Estimated scope**: 1 file, ~10 lines

## Problem

The screen-indicator dots under the iPhone mockup animate their `width` (a
layout property) and use the literal CSS `all` keyword, which animates every
animatable property instead of the two that actually change.

```tsx
// components/IPhoneMockup.tsx:217-231 — current
<div style={{ position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 4 }}>
  {screens.map((_, i) => (
    <button
      key={i}
      onClick={() => setCurrent(i)}
      style={{
        width: i === current ? 18 : 6, height: 6,
        borderRadius: 3,
        background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
        border: 'none', cursor: 'pointer', padding: 0,
        transition: 'all 300ms ease',
      }}
    />
  ))}
</div>
```

`width` triggers layout + paint + composite on every keystroke of the
interval timer (every 3s, indefinitely, for as long as the landing page is
open). `transition: all` additionally animates properties that never change
(border, cursor, padding), which is wasted work and an unclear contract for
future edits.

## Target

Keep the box at a fixed `6px` width and represent the "active, wider pill"
state with a `scaleX` transform anchored to the left edge — visually
identical (a 6px circle becomes an 18px pill = `scaleX(3)`), but composited
on the GPU with `transform` + `background-color` only.

```tsx
// target
<div style={{ position: 'absolute', bottom: -24, left: '50%', transform: 'translateX(-50%)', display: 'flex', gap: 6, zIndex: 4 }}>
  {screens.map((_, i) => (
    <button
      key={i}
      onClick={() => setCurrent(i)}
      style={{
        width: 6, height: 6,
        borderRadius: 3,
        background: i === current ? '#fff' : 'rgba(255,255,255,0.4)',
        border: 'none', cursor: 'pointer', padding: 0,
        transformOrigin: 'left center',
        transform: i === current ? 'scaleX(3)' : 'scaleX(1)',
        transition: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1), background-color 200ms ease',
      }}
    />
  ))}
</div>
```

Values used (from the audit's rule catalog, do not approximate):
- Strong ease-out curve for the transform: `cubic-bezier(0.23, 1, 0.32, 1)`.
- Bare `ease` for the color change (hover/color-change rule).
- Duration dropped from 300ms to 200ms — this is a "tens of times/day if you
  count the auto-rotate" element, so it belongs in the 150-250ms dropdown/
  select budget, not the 200-500ms modal budget.

## Repo conventions to follow

This file uses inline `style` objects throughout (no CSS modules, no
Tailwind classes on this component) — keep the fix in the same inline-style
form, don't introduce a CSS file or styled-components for this one change.
The slide transition two blocks up (`components/IPhoneMockup.tsx:167`)
already demonstrates the pattern of listing explicit properties
(`transform 350ms cubic-bezier(0.4,0,0.2,1), opacity 350ms ease`) instead of
`all` — mirror that structure.

## Steps

1. In `components/IPhoneMockup.tsx`, inside the `.map` at line ~219-229,
   change the `style` object on the `<button>`:
   - Replace `width: i === current ? 18 : 6` with a fixed `width: 6`.
   - Add `transformOrigin: 'left center'`.
   - Add `transform: i === current ? 'scaleX(3)' : 'scaleX(1)'`.
   - Replace `transition: 'all 300ms ease'` with
     `transition: 'transform 200ms cubic-bezier(0.23, 1, 0.32, 1), background-color 200ms ease'`.

## Boundaries

- Do NOT touch the slide/screen-swap logic (lines 146-208) — only the dot
  indicators at the bottom.
- Do NOT change the dot spacing, size, or color values — only how the
  "active" width is achieved.
- Do NOT add new dependencies.
- If the JSX around this block has drifted from what's quoted above (e.g.
  different prop names), STOP and report instead of guessing.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck` — expect no new errors.
- **Feel check**: run `npm run dev` in `apps/web`, open the landing page,
  watch the dots under the iPhone mockup for one full auto-rotate cycle
  (screens.length × ~3.7s):
  - The active dot should still visually read as a wider white pill, same
    apparent size as before (18px-equivalent).
  - In Chrome DevTools → Elements → Layout, hover the dot row while it
    transitions — no layout/reflow highlight should appear (only
    composite).
  - Slow motion: DevTools → Animations panel, set playback to 10%, confirm
    the pill grows smoothly from the left edge, not from center.
- **Done when**: dots use `transform: scaleX()` with a fixed `width`, no
  `width` or `all` remain in that style block, and the visual result is
  indistinguishable from before at 100% speed.
