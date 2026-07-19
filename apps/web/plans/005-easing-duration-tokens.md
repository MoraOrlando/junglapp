# 005 — Define shared easing tokens in the Tailwind config

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: LOW
- **Category**: Cohesion & tokens
- **Estimated scope**: 1 file (config) + 2 files that adopt it (001, 004's targets)

## Problem

`apps/web` has no shared motion tokens. Every hover/transition in the app
relies on Tailwind's bare `transition` utility (default 150ms,
`cubic-bezier(0.4, 0, 0.2, 1)`), and plans 001 and 004 (written alongside
this one) introduce a hand-typed strong ease-out curve
(`cubic-bezier(0.23, 1, 0.32, 1)`) inline, with no token to reuse if a third
component needs the same curve later.

```js
// apps/web/tailwind.config.js:1-27 — current
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: { /* ... */ },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
```

This is LOW severity — nothing currently feels broken — but it's cheap
insurance: the moment a third component needs a deliberate ease-out (a
modal, a drawer), someone will either retype the curve a third time or
reach for a different one, and the app's motion will start drifting.

## Target

Add a `transitionTimingFunction` extension with the two curves from
AUDIT.md (§2), named so their purpose is obvious at the call site:

```js
// target
/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './app/**/*.{js,ts,jsx,tsx}',
    './components/**/*.{js,ts,jsx,tsx}',
  ],
  theme: {
    extend: {
      colors: { /* unchanged */ },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      transitionTimingFunction: {
        'out-strong': 'cubic-bezier(0.23, 1, 0.32, 1)',
        'in-out-strong': 'cubic-bezier(0.77, 0, 0.175, 1)',
      },
    },
  },
  plugins: [],
};
```

This makes `ease-[cubic-bezier(0.23,1,0.32,1)]` available as the named
utility `ease-out-strong` (and `ease-in-out-strong` for on-screen movement)
anywhere in the app, for both Tailwind classes and as a documented reference
for the inline-style cases (`IPhoneMockup.tsx`, the progress bar) which
can't consume a Tailwind utility class directly since they're plain
`style` objects.

## Repo conventions to follow

`tailwind.config.js` already uses `theme.extend` (never overwrites
Tailwind's defaults) for `colors` and `fontFamily` — follow the same
`extend` pattern for `transitionTimingFunction`, don't replace Tailwind's
built-in easings.

## Steps

1. In `apps/web/tailwind.config.js`, inside `theme.extend`, add the
   `transitionTimingFunction` block shown in Target, after `fontFamily`.
2. In `components/IPhoneMockup.tsx`, in the dot-indicator style from plan
   001, keep the inline `cubic-bezier(0.23, 1, 0.32, 1)` value as-is (inline
   styles can't reference Tailwind theme tokens) — but this plan's step 3
   below is the reason both must literally match.
3. Add a one-line comment above the `transitionTimingFunction` block:
   `// keep in sync with the inline cubic-bezier(0.23, 1, 0.32, 1) values in IPhoneMockup.tsx and dashboard/stores/import/page.tsx`
   so the next person editing either place knows they're linked.

## Boundaries

- Do NOT retrofit existing bare `transition` usages (the hover states across
  the site) to use the new named easing — those are correct as bare `ease`
  per AUDIT.md's hover/color-change rule; this token is for deliberate
  enter/exit motion, not hovers.
- Do NOT remove or rename any existing Tailwind config key.
- Do NOT add a duration scale in this plan — only the two easing curves;
  durations stay inline per-component since they vary by element (see the
  table in AUDIT.md §2).

## Verification

- **Mechanical**: `cd apps/web && npm run build` — expect the Tailwind
  config to compile without errors and `ease-out-strong` / `ease-in-out-strong`
  to be available as utility classes (spot-check by adding
  `className="ease-out-strong"` to a throwaway element and confirming the
  generated CSS in `.next` contains `transition-timing-function:
  cubic-bezier(0.23, 1, 0.32, 1)`, then remove the throwaway element).
- **Done when**: `tailwind.config.js` exposes both named curves, and the
  comment linking them to the inline values in plans 001/004 is in place.
