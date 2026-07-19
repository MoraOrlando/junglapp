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
  const [reducedMotion, setReducedMotion] = useState(false);

  useEffect(() => {
    setReducedMotion(window.matchMedia('(prefers-reduced-motion: reduce)').matches);

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
          style={
            reducedMotion
              ? undefined
              : {
                  opacity: visible ? 1 : 0,
                  transform: visible ? 'translateY(0)' : 'translateY(12px)',
                  transition: `opacity 400ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 50}ms, transform 400ms cubic-bezier(0.23, 1, 0.32, 1) ${i * 50}ms`,
                }
          }
        >
          {child}
        </div>
      ))}
    </div>
  );
}
