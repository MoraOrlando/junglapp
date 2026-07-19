# 007 — Add a subtle tap pulse to the mockup's "Confirmar cita" button

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: Missed opportunity (additive)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file, ~10 lines

## Problem

The `booking` screen inside the auto-rotating iPhone mockup shows a static
"Confirmar cita" button that never animates, even though the mockup's whole
purpose is to demonstrate the app's interactions to a first-time visitor:

```tsx
// components/IPhoneMockup.tsx:105-107 — current
<div style={{ background: '#16A34A', borderRadius: 14, padding: '12px', textAlign: 'center' }}>
  <p style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Confirmar cita</p>
</div>
```

Since the `booking` screen is only on-screen for ~2.65s per rotation cycle
(3000ms interval minus the 350ms transition), a one-shot pulse when this
screen becomes active would sell the "this is a real, tappable button"
story without requiring real interactivity (the mockup is decorative, not
functional — clicking it does nothing today and this plan doesn't change
that).

## Target

Trigger a single scale pulse on the button each time the `booking` screen
becomes the active screen, using a CSS animation gated by a `key` remount
(simplest way to restart a CSS animation on a React re-render without manual
class toggling):

```tsx
// target — inside the `booking` screen's content, replacing lines 105-107
<div
  key={current === 2 ? 'pulse' : 'idle'}
  style={{
    background: '#16A34A',
    borderRadius: 14,
    padding: '12px',
    textAlign: 'center',
    animation: current === 2 ? 'confirmPulse 600ms cubic-bezier(0.23, 1, 0.32, 1) 400ms' : 'none',
  }}
>
  <p style={{ color: '#fff', fontWeight: 700, fontSize: 13 }}>Confirmar cita</p>
</div>
```

Add the keyframes once, next to the component (Next.js supports a scoped
`<style jsx>` tag in client components, or a plain global `@keyframes` block
if `styled-jsx` isn't set up — check which applies, see Steps):

```css
@keyframes confirmPulse {
  0% { transform: scale(1); }
  40% { transform: scale(0.96); }
  100% { transform: scale(1); }
}
```

The `400ms` delay lets the screen's own slide-in transition (350ms, from the
existing `slideStyle`) finish before the button pulses, so the two motions
don't overlap and compete for attention. Duration (600ms total including
delay) stays under the "occasional" ceiling since this is a rare,
first-impression element per AUDIT.md's frequency table, not a UI control
hit repeatedly.

## Repo conventions to follow

`screens[2]` (index 2, the `key: 'booking'` entry, `components/IPhoneMockup.tsx:80-111`)
is where this lives. The `current` state variable (`components/IPhoneMockup.tsx:147`)
already tracks which screen index is active — reuse it directly, don't add a
new state variable.

Next.js in this repo does not currently use `styled-jsx` scoped styles
anywhere (`grep -rn "style jsx" apps/web` returns nothing) — check for a
global stylesheet first (`apps/web/app/globals.css` or similar) and add the
`@keyframes` there to match how the rest of the app handles global CSS,
rather than introducing `styled-jsx` for a single keyframe.

## Steps

1. Locate the app's global CSS file (likely `apps/web/app/globals.css` —
   confirm the exact path before editing) and add the `confirmPulse`
   `@keyframes` block shown in Target.
2. In `components/IPhoneMockup.tsx`, inside the `booking` screen's content
   (the array entry at `key: 'booking'`, currently lines 105-107), replace
   the static `<div>` with the version shown in Target: add the `key`,
   `animation` fields tied to `current === 2`.
3. Confirm `current === 2` is really the `booking` screen's index by
   checking the `screens` array order at the top of the file (`home`,
   `near`, `booking`, `chat` — booking is index 2 as of this commit); if the
   array has been reordered since, use the correct index instead of `2`.

## Boundaries

- Do NOT make the button actually clickable/functional — it stays
  decorative, matching the rest of the mockup.
- Do NOT change the pulse to loop — it must fire once per screen-activation,
  not continuously, per the "don't animate what's seen constantly" rule
  (this screen recurs every ~15s in the auto-rotate loop, which is rare
  enough to allow the delight, but a *looping* pulse the whole 2.65s the
  screen is visible would cross into annoying).
- Do NOT touch the other three screens (`home`, `near`, `chat`).
- Do NOT add a new dependency for the keyframe animation — plain CSS
  `@keyframes` only.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck && npm run build` —
  expect no new errors, and confirm the `@keyframes confirmPulse` rule shows
  up in the built CSS output.
- **Feel check**: run `npm run dev`, load the landing page, and watch a full
  auto-rotate cycle:
  - When the `booking` screen becomes active, ~400ms after it slides in,
    the green "Confirmar cita" button should visibly compress to ~96% and
    spring back once — not loop, not jitter.
  - The pulse should not visually collide with the screen's own slide-in
    (it starts only after the slide's 350ms finishes).
  - Toggle `prefers-reduced-motion` to "reduce" in DevTools → Rendering:
    per plan 003, the whole mockup should already skip its slide transition
    in that mode — confirm this pulse also doesn't fire when reduced motion
    is active (gate it the same way, `animation: 'none'` when reduced
    motion is on).
- **Done when**: the pulse fires exactly once per booking-screen activation,
  never loops, and is suppressed under reduced motion.
