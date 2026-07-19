# 006 — Stagger-reveal the Features grid and Steps grid on scroll

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: Missed opportunity (additive)
- **Category**: Missed opportunities
- **Estimated scope**: 1 file, 1 new small client component + 2 usages

## Problem

The landing page's "Features" grid (4 cards) and "¿Cómo funciona?" steps (3
items) render fully static — all cards visible at once with no relationship
to when the visitor actually scrolls to them:

```tsx
// app/page.tsx:71-86 — current (Features)
<div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
  {[
    { icon: '🩺', title: 'Veterinarios', desc: '...' },
    { icon: '🛒', title: 'Tiendas', desc: '...' },
    { icon: '🦮', title: 'Paseadores', desc: '...' },
    { icon: '🐾', title: 'Comunidad', desc: '...' },
  ].map((f) => (
    <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition">
      {/* ... */}
    </div>
  ))}
</div>
```

```tsx
// app/page.tsx:112-126 — current (Steps)
<div className="grid md:grid-cols-3 gap-8">
  {[
    { step: '01', title: 'Descarga la app', desc: '...' },
    { step: '02', title: 'Crea tu perfil', desc: '...' },
    { step: '03', title: 'Conéctate', desc: '...' },
  ].map((s) => (
    <div key={s.step} className="flex gap-4 items-start">
      {/* ... */}
    </div>
  ))}
</div>
```

This is a first-time, once-per-visitor moment (a marketing page scroll, not
a UI hit tens of times a day), which is exactly the frequency tier where
AUDIT.md says added delight is appropriate. A 30-80ms stagger as each grid
enters the viewport would reinforce the page's narrative flow without
costing anything on repeat views (visitors don't re-scroll past sections
they've already seen in the same session in a way that would feel
repetitive).

## Target

A small reusable client component, `StaggerReveal`, wrapping each grid's
children, using `IntersectionObserver` with `{ once: true }` semantics (no
external library — no motion/framer-motion is installed in this app) and a
50ms stagger between children, entrance values per AUDIT.md's physicality
rule (never `scale(0)`/pure translate-from-nothing — use opacity + a small
`translateY`, no scale needed here since these aren't popovers).

```tsx
// components/StaggerReveal.tsx — new file
'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';

export default function StaggerReveal({
  children,
  className,
}: {
  children: ReactNode[];
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: '-80px' }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children.map((child, i) => (
        <div
          key={i}
          style={{
            opacity: visible ? 1 : 0,
            transform: visible ? 'translateY(0)' : 'translateY(12px)',
            transition: `opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 50}ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 50}ms`,
          }}
        >
          {child}
        </div>
      ))}
    </div>
  );
}
```

Usage in `app/page.tsx` — replace the two `.map()` grids' outer `<div
className="grid ...">` with `<StaggerReveal className="grid ...">`,
unchanged children:

```tsx
// target (Features)
<StaggerReveal className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
  {[
    { icon: '🩺', title: 'Veterinarios', desc: '...' },
    { icon: '🛒', title: 'Tiendas', desc: '...' },
    { icon: '🦮', title: 'Paseadores', desc: '...' },
    { icon: '🐾', title: 'Comunidad', desc: '...' },
  ].map((f) => (
    <div key={f.title} className="bg-white rounded-2xl p-6 shadow-sm hover:shadow-md transition">
      {/* unchanged */}
    </div>
  ))}
</StaggerReveal>
```

```tsx
// target (Steps)
<StaggerReveal className="grid md:grid-cols-3 gap-8">
  {[
    { step: '01', title: 'Descarga la app', desc: '...' },
    { step: '02', title: 'Crea tu perfil', desc: '...' },
    { step: '03', title: 'Conéctate', desc: '...' },
  ].map((s) => (
    <div key={s.step} className="flex gap-4 items-start">
      {/* unchanged */}
    </div>
  ))}
</StaggerReveal>
```

## Repo conventions to follow

`components/IPhoneMockup.tsx` is the one existing example of a `'use client'`
component with inline-style-driven transitions in this codebase — mirror
its style (inline `style` objects for the motion values, not new Tailwind
utilities) since `StaggerReveal` needs per-child computed delays that
Tailwind's static utility classes can't express. `app/page.tsx` itself stays
a server component; only the new `StaggerReveal` file needs `'use client'`.

## Steps

1. Create `apps/web/components/StaggerReveal.tsx` with the exact content
   shown in Target.
2. In `app/page.tsx`, add the import: `import StaggerReveal from
   '../components/StaggerReveal';` near the top with the other imports.
3. Replace the Features grid's wrapping `<div className="grid
   md:grid-cols-2 lg:grid-cols-4 gap-6">...</div>` (lines 71-86) with
   `<StaggerReveal className="grid md:grid-cols-2 lg:grid-cols-4
   gap-6">...</StaggerReveal>`, keeping the `.map()` and card markup inside
   unchanged.
4. Replace the Steps grid's wrapping `<div className="grid md:grid-cols-3
   gap-8">...</div>` (lines 112-126) with `<StaggerReveal className="grid
   md:grid-cols-3 gap-8">...</StaggerReveal>`, same treatment.

## Boundaries

- Do NOT apply `StaggerReveal` to the Hero section or the Business CTA
  section — those are above the fold or singular blocks, not multi-item
  grids, and don't fit this pattern.
- Do NOT install framer-motion or any animation library — this must work
  with native `IntersectionObserver` only, matching the rest of the app's
  zero-dependency approach to motion.
- Do NOT add `prefers-reduced-motion` handling in this specific plan if it
  adds scope creep beyond a one-line guard — but DO add the guard, since
  it's one line: skip the transform/opacity animation (render children
  immediately visible) when `window.matchMedia('(prefers-reduced-motion:
  reduce)').matches` is true, checked once in the same effect.
- Do NOT change the card/step markup or content — only the wrapping
  container.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck && npm run build` —
  expect no new errors.
- **Feel check**: run `npm run dev`, load the landing page, scroll down to
  the Features section:
  - Cards should fade/slide in from `translateY(12px)` to `translateY(0)`
    with a visible ~50ms stagger between each — not all four appearing
    simultaneously.
  - Scrolling back up and down again should NOT re-trigger the animation
    (the `{ once: true }`-equivalent `observer.disconnect()` after first
    trigger).
  - Repeat the check for the Steps section.
  - Toggle `prefers-reduced-motion` to "reduce" in DevTools → Rendering,
    reload, scroll down: cards should appear immediately with no
    fade/slide.
- **Done when**: both grids reveal with a stagger on first scroll into
  view, never re-trigger, and respect reduced motion.
