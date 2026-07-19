# 003 — Respect `prefers-reduced-motion` in the auto-rotating iPhone mockup

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: MEDIUM
- **Category**: Accessibility
- **Estimated scope**: 1 file, ~15 lines

## Problem

The iPhone mockup on the landing page auto-advances through 4 screens every
3 seconds, forever, using a `translateX` slide + fade — for as long as the
tab stays open. This is continuous, looping, non-essential motion, and
nothing in the repo checks the user's motion preference:

```
$ grep -rn "prefers-reduced-motion\|useReducedMotion" --include="*.tsx" --include="*.css" app components
# (no matches)
```

```tsx
// components/IPhoneMockup.tsx:151-162 — current
useEffect(() => {
  const interval = setInterval(() => {
    setDirection('out');
    setAnimating(true);
    setTimeout(() => {
      setCurrent((prev) => (prev + 1) % screens.length);
      setDirection('in');
      setTimeout(() => setAnimating(false), 350);
    }, 350);
  }, 3000);
  return () => clearInterval(interval);
}, []);
```

Per the audit rule: reduced motion means fewer/gentler animations, not
zero — the screens should still cycle (it's the whole point of the
component, showing off app screens to a first-time visitor), but the
sliding/fading motion should be dropped in favor of an instant cut when the
user has requested reduced motion.

## Target

Read the media query once on mount, and when it's active, skip the
slide/fade transition — swap `current` directly with no intermediate
`animating` state.

```tsx
// target
const [current, setCurrent] = useState(0);
const [animating, setAnimating] = useState(false);
const [direction, setDirection] = useState<'in' | 'out'>('in');
const [reducedMotion, setReducedMotion] = useState(false);

useEffect(() => {
  const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
  setReducedMotion(mq.matches);
  const onChange = () => setReducedMotion(mq.matches);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}, []);

useEffect(() => {
  if (reducedMotion) {
    const interval = setInterval(() => {
      setCurrent((prev) => (prev + 1) % screens.length);
    }, 3000);
    return () => clearInterval(interval);
  }
  const interval = setInterval(() => {
    setDirection('out');
    setAnimating(true);
    setTimeout(() => {
      setCurrent((prev) => (prev + 1) % screens.length);
      setDirection('in');
      setTimeout(() => setAnimating(false), 350);
    }, 350);
  }, 3000);
  return () => clearInterval(interval);
}, [reducedMotion]);
```

The `slideStyle` object (`components/IPhoneMockup.tsx:164-175`) should skip
the transform/opacity entirely when `reducedMotion` is true:

```tsx
// target
const slideStyle: React.CSSProperties = reducedMotion
  ? { position: 'absolute', inset: 0, overflow: 'hidden' }
  : {
      position: 'absolute',
      inset: 0,
      transition: 'transform 350ms cubic-bezier(0.4,0,0.2,1), opacity 350ms ease',
      transform: animating && direction === 'out'
        ? 'translateX(-100%)'
        : animating && direction === 'in'
        ? 'translateX(100%)'
        : 'translateX(0)',
      opacity: animating ? 0 : 1,
      overflow: 'hidden',
    };
```

## Repo conventions to follow

This is a client component (`'use client'` at the top, `components/IPhoneMockup.tsx:1`)
so `window.matchMedia` is safe to use inside `useEffect`. There is no
existing reduced-motion helper/hook anywhere in `apps/web` to imitate — this
is the first one, so keep it local to this component rather than extracting
a shared hook (only one consumer exists).

## Steps

1. In `components/IPhoneMockup.tsx`, add a `reducedMotion` state variable
   and the `matchMedia` effect shown in Target, right after the existing
   `useState` declarations (~line 149).
2. Replace the single rotation `useEffect` (lines 151-162) with the
   two-branch version shown in Target, keyed on `reducedMotion`.
3. Replace the `slideStyle` object (lines 164-175) with the conditional
   version shown in Target.

## Boundaries

- Do NOT change the 3-second cycle interval — reduced motion still cycles
  screens, it just cuts instead of sliding.
- Do NOT touch the dot indicators (that's plan 001) except that they'll
  keep working unchanged since `current` still updates the same way.
- Do NOT add a new npm dependency — use the native `matchMedia` API.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck` — expect no new errors.
- **Feel check**: run `npm run dev`, open the landing page in Chrome:
  - DevTools → Rendering panel → "Emulate CSS media feature
    prefers-reduced-motion" → set to "reduce". Reload. Confirm screens still
    change every ~3s but cut instantly with no slide/fade.
  - Set the emulation back to "no preference". Reload. Confirm the original
    slide+fade behavior is unchanged.
- **Done when**: with reduced motion active, the mockup still shows all 4
  screens in rotation but with zero transform/opacity animation; with it
  inactive, behavior is pixel-for-pixel identical to before this plan.
