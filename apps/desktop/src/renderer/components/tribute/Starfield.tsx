import { useMemo } from 'react';

/* Deterministic from the index, so the field does not reshuffle on every render. */
function dots(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    x: (i * 37.3) % 100,
    y: (i * 61.7) % 100,
    size: i % 9 === 0 ? 3 : i % 3 === 0 ? 2 : 1,
    period: 2 + (i % 5),
  }));
}

export function Starfield({ count = 90, driftSeconds = 40 }: { count?: number; driftSeconds?: number }) {
  const stars = useMemo(() => dots(count), [count]);

  return (
    <div
      aria-hidden="true"
      className="bridge-starfield pointer-events-none absolute"
      style={{ inset: '0 -60px 0 0', animation: `bridge-drift ${driftSeconds}s linear infinite alternate` }}
    >
      {stars.map((s, i) => (
        <div
          key={i}
          className="absolute rounded-full bg-white"
          style={{
            left: `${s.x}%`,
            top: `${s.y}%`,
            width: s.size,
            height: s.size,
            animation: `bridge-twinkle ${s.period}s ease-in-out infinite`,
          }}
        />
      ))}
    </div>
  );
}
