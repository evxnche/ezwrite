import React, { useMemo } from 'react';

interface Props {
  playing?: boolean;
}

// Render enough bars to span the side tab; overflow is clipped by the parent.
const BAR_COUNT = 100;
const DOT = 2;        // px — diameter of each little circle
const GAP = 1;        // px — horizontal spacing between columns
const PITCH = 3;      // px — vertical period (dot + gap)
const MAX_ROWS = 13;  // tallest a bar can grow (~70% of the 56px row)
const STEPS = 6;      // distinct heights each bar cycles through

const randInt = (min: number, max: number) => min + Math.floor(Math.random() * (max - min + 1));

const WaveLoader: React.FC<Props> = ({ playing = true }) => {
  // Randomize each bar once so the wave reads as organic, not a synced, predictable pulse.
  const bars = useMemo(
    () =>
      Array.from({ length: BAR_COUNT }).map(() => {
        const peakRows = randInt(2, MAX_ROWS);
        // Discrete row heights the bar snaps between — dots pop in/out, never slide.
        const heights = Array.from({ length: STEPS }).map(() => randInt(1, peakRows) * PITCH);
        return {
          heights,
          dur: 0.7 + Math.random() * 0.9, // s
          delay: -Math.random() * 1.6, // s (negative = desynced start)
        };
      }),
    [],
  );

  // Walk through --h0..--h(STEPS-1) then loop back to --h0.
  const keyframe = Array.from({ length: STEPS + 1 })
    .map((_, k) => `${((k / STEPS) * 100).toFixed(2)}% { height: var(--h${k % STEPS}); }`)
    .join(' ');

  return (
    <div
      className="eq-wave flex items-end justify-center w-full overflow-hidden text-accent-foreground"
      style={{ gap: `${GAP}px`, height: `${MAX_ROWS * PITCH}px` }}
    >
      <style>{`
        @keyframes eqSeq { ${keyframe} }
        @media (prefers-reduced-motion: reduce) { .eq-wave > span { animation: none !important; } }
      `}</style>
      {bars.map((bar, i) => {
        const vars = bar.heights.reduce<Record<string, string>>((acc, h, k) => {
          acc[`--h${k}`] = `${h}px`;
          return acc;
        }, {});
        return (
          <span
            key={i}
            style={{
              ...vars,
              width: `${DOT}px`,
              height: `${PITCH}px`,
              flex: 'none',
              background: 'radial-gradient(circle 1px at 50% 50%, currentColor 99%, transparent 100%)',
              backgroundSize: `${DOT}px ${PITCH}px`,
              backgroundPosition: 'center bottom',
              backgroundRepeat: 'repeat-y',
              animation: playing ? `eqSeq ${bar.dur}s steps(1, jump-end) ${bar.delay}s infinite` : 'none',
            } as React.CSSProperties}
          />
        );
      })}
    </div>
  );
};

export default WaveLoader;
