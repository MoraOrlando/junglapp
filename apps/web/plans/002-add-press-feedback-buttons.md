# 002 — Add press feedback (`active:scale`) to every button-styled CTA

- **Status**: DONE
- **Commit**: 4bb190b
- **Severity**: HIGH
- **Category**: Purpose & frequency / Component principle
- **Estimated scope**: 8 files, one-line className edits each

## Problem

Every button-styled element in `apps/web` (has a background color/border and
padding, reads visually as a button) has zero press feedback. A repo-wide
search confirms it:

```
$ grep -rn "active:" --include="*.tsx" app components
# (no matches)
```

Per Emil Kowalski's component principles: buttons must feel responsive —
`:active` state confirms the interface heard the click before the async
action (navigation, form submit, Firebase call) resolves. This is a HIGH
finding because these are the site's primary conversion actions (App Store
download, business login, form submits) — exactly the elements where
"did my click register?" doubt is most costly.

All of the buttons below already carry Tailwind's bare `transition` utility
class, which by default already includes `transform` in its transitioned
properties (Tailwind's default `transition` utility transitions `color,
background-color, border-color, text-decoration-color, fill, stroke,
opacity, box-shadow, transform, filter, backdrop-filter` — not literal
`all`). That means **no new transition utility is needed** — adding
`active:scale-[0.97]` alone is enough; the existing `transition` class will
animate it over its default 150ms duration, which already sits inside the
100-160ms button-press budget.

## Target

Add `active:scale-[0.97]` to the `className` of each button-styled element
listed in Steps below. Nothing else about the className changes.

Example (`app/page.tsx:18-24`):

```tsx
// current
<Link
  href="https://apps.apple.com/cl/app/junglapp/id6780333739"
  className="bg-primary-500 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-primary-600 transition"
  target="_blank"
>
  Descargar
</Link>

// target
<Link
  href="https://apps.apple.com/cl/app/junglapp/id6780333739"
  className="bg-primary-500 text-white text-sm font-semibold px-5 py-2 rounded-full hover:bg-primary-600 transition active:scale-[0.97]"
  target="_blank"
>
  Descargar
</Link>
```

## Repo conventions to follow

- All styling is Tailwind utility classes directly in `className` — no CSS
  modules, no `@apply`. Keep the fix as a plain class addition, appended at
  the end of the existing class string.
- For template-literal classNames with a ternary (the filter buttons), add
  `active:scale-[0.97]` to the static prefix, not inside the ternary branches
  — it applies regardless of which branch is active.

## Steps

One step per button. Add `active:scale-[0.97]` to the existing `className`
(or template literal) at each location:

1. `app/page.tsx:20` — header "Descargar" link.
2. `app/page.tsx:46` — hero "🍎 Descargar en App Store" link.
3. `app/page.tsx:52` — hero "Acceder como empresa →" link (outlined button).
4. `app/page.tsx:99` — "Acceder a mi cuenta →" link in the business CTA section.
5. `app/owner/page.tsx:61` — "Cerrar sesión" button in the owner header.
6. `app/owner/page.tsx:157` — "🍎 Descargar en App Store" link.
7. `app/soporte/page.tsx:75` — form submit button.
8. `app/acceso/page.tsx:80` — form submit button.
9. `app/dashboard/vets/page.tsx:40` — filter `<button>` inside the
   `.map`; the className is a template literal:
   ```tsx
   className={`px-4 py-2 rounded-xl text-sm font-medium transition ${
     filter === f ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
   }`}
   ```
   becomes
   ```tsx
   className={`px-4 py-2 rounded-xl text-sm font-medium transition active:scale-[0.97] ${
     filter === f ? 'bg-primary-500 text-white' : 'bg-white border border-gray-200 text-gray-600'
   }`}
   ```
10. `app/store/page.tsx:69` — "Cerrar sesión" button in the store header.
11. `app/dashboard/stores/page.tsx:38` — "📊 Importar productos Excel" button.
12. `app/dashboard/stores/page.tsx:50` — filter `<button>`, same
    template-literal pattern as step 9.
13. `app/dashboard/stores/import/page.tsx:160` — "📊 Importar productos Excel" button (import page's own copy).
14. `app/dashboard/stores/import/page.tsx:198` — dark "next step" button.
15. `app/dashboard/stores/import/page.tsx:287` — green confirm button.
16. `app/dashboard/stores/import/page.tsx:305` — outlined green button.
17. `app/dashboard/stores/import/page.tsx:311` — filled green button.

## Boundaries

- Do NOT add `active:scale-[0.97]` to plain text links that have no
  background (e.g. `app/page.tsx:15`, the footer links at `:137,140,143`,
  `app/acceso/page.tsx:92`, the "back" link at
  `app/dashboard/stores/import/page.tsx:144`, or `Sidebar.tsx`'s nav
  `<Link>` items at `Sidebar.tsx:46`) — press feedback is for button-styled
  elements, not inline text links or nav tabs.
- Do NOT touch the progress bar at
  `app/dashboard/stores/import/page.tsx:275` — that's plan 004.
- Do NOT add `transition-transform` or any other new transition utility —
  the existing bare `transition` class already covers `transform`.
- Do NOT change colors, padding, or any non-motion class.
- If a line number has drifted and the button text/class no longer matches
  what's quoted, find it by the quoted text and confirm before editing; if
  it's genuinely gone, skip that step and note it in the plan status instead
  of guessing at a replacement.

## Verification

- **Mechanical**: `cd apps/web && npm run typecheck && npm run lint` —
  expect no new errors.
- **Feel check**: run `npm run dev` in `apps/web` and click through each
  button:
  - Every button visibly compresses slightly (~3%) on mousedown/tap and
    springs back on release — never a hard snap, never a delay before the
    compression starts.
  - Filter buttons (`vets/page.tsx`, `stores/page.tsx`) keep the same press
    feedback whether they're the active or inactive filter.
  - Nothing outside the 17 locations above changed.
- **Done when**: all 17 locations have `active:scale-[0.97]` in their
  className and no other visual property changed.
