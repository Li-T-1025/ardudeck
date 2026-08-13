/**
 * Motion helpers for the pre-flight weather briefing. Kept tiny and dependency
 * free (the app ships no animation library): a reduced-motion probe and a
 * requestAnimationFrame count-up that both fall back to the final value
 * instantly when the user asks for reduced motion.
 */
import { useEffect, useRef, useState } from 'react';

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  );
}

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(prefersReducedMotion);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    const onChange = () => setReduced(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);
  return reduced;
}

/**
 * Eased count from the previously shown value to `target`. Starts at 0 on first
 * mount (so key numbers count up on load) and continues smoothly from wherever
 * the display currently sits when the value changes on refresh. Reduced-motion
 * users get `target` with no animation.
 */
export function useCountUp(target: number, durationMs = 700): number {
  const reduced = useReducedMotion();
  const [value, setValue] = useState(() => (prefersReducedMotion() ? target : 0));
  const valueRef = useRef(value);
  valueRef.current = value;
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (reduced) {
      setValue(target);
      return;
    }
    const from = valueRef.current;
    if (Math.abs(from - target) < 1e-6) return;

    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(from + (target - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    };
  }, [target, durationMs, reduced]);

  return value;
}
