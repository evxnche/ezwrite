import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Square, Timer } from 'lucide-react';
import { loadTimerState, saveTimerState, restoreDisplaySeconds } from './timer-storage';

interface TimerWidgetProps {
  config: string;
  /**
   * Stable key for persisting runtime state across unmounts (page switches,
   * reloads). When omitted, the timer is purely ephemeral.
   */
  persistKey?: string;
  onRemove?: () => void;
  onComplete?: () => void;
}

type PomoPhase = 'work' | 'break';
type ParsedTimerConfig =
  | { mode: 'pomodoro'; initial: number; work: number; break: number }
  | { mode: 'countdown'; initial: number }
  | { mode: 'stopwatch'; initial: number };

function parseConfig(config: string): ParsedTimerConfig {
  const t = config.trim().toLowerCase();
  const cp = t.match(/^(\d+)\s+(\d+)$/);
  if (cp) return { mode: 'pomodoro' as const, initial: +cp[1] * 60, work: +cp[1] * 60, break: +cp[2] * 60 };
  
  const tm = t.match(/^(\d{1,2}):(\d{2})$/);
  if (tm) {
    const target = new Date();
    target.setHours(+tm[1], +tm[2], 0, 0);
    if (target <= new Date()) target.setDate(target.getDate() + 1);
    return { mode: 'countdown' as const, initial: Math.max(0, Math.floor((target.getTime() - Date.now()) / 1000)) };
  }
  
  const nm = t.match(/^(\d+)$/);
  if (nm) return { mode: 'countdown' as const, initial: +nm[1] * 60 };
  
  // fallback: stopwatch
  return { mode: 'stopwatch' as const, initial: 0 };
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const TimerWidget: React.FC<TimerWidgetProps> = ({ config, persistKey, onRemove, onComplete }) => {
  const parsed = useMemo(() => parseConfig(config), [config]);
  // Restore any persisted runtime state for this timer once, on mount. The key
  // embeds the config, so editing the timer line yields a fresh key (fresh timer).
  const saved = useMemo(() => loadTimerState(persistKey), [persistKey]);

  const [seconds, setSeconds] = useState(() =>
    saved ? restoreDisplaySeconds(saved, parsed.mode) : parsed.initial,
  );
  const [running, setRunning] = useState(saved ? saved.running : true);
  const [phase, setPhase] = useState<PomoPhase>(saved ? saved.phase : 'work');
  const phaseRef = useRef<PomoPhase>(saved ? saved.phase : 'work');
  const [done, setDone] = useState(saved ? saved.done : false);
  // Wall-clock anchor: when running, the timestamp at which the current phase started
  const epochRef = useRef<number>(saved ? saved.epoch : Date.now());
  const baseSecondsRef = useRef<number>(saved ? saved.baseSeconds : parsed.initial);

  // Persist runtime state so the timer survives unmounts (page switches, reloads).
  // baseSecondsRef/epochRef are always mutated before the setState calls that flip
  // these deps, so the values read here are current. Runs on mount too (initial save).
  useEffect(() => {
    saveTimerState(persistKey, {
      baseSeconds: baseSecondsRef.current,
      epoch: epochRef.current,
      running,
      phase: phaseRef.current,
      done,
    });
  }, [persistKey, running, phase, done]);

  useEffect(() => {
    if (!running || done) return;

    const tick = () => {
      const elapsed = Math.floor((Date.now() - epochRef.current) / 1000);
      if (parsed.mode === 'stopwatch') {
        setSeconds(baseSecondsRef.current + elapsed);
        return;
      }
      const remaining = baseSecondsRef.current - elapsed;
      if (remaining <= 0) {
        // Pomodoro runs a single round: work → break → stop. After the work
        // phase, switch to the break; after the break, fall through to "done".
        if (parsed.mode === 'pomodoro' && phaseRef.current === 'work') {
          phaseRef.current = 'break';
          setPhase('break');
          baseSecondsRef.current = parsed.break;
          epochRef.current = Date.now();
          setSeconds(parsed.break);
          onComplete?.();
          return;
        }
        // Countdown finished, or pomodoro break finished → stop.
        setDone(true);
        setRunning(false);
        setSeconds(0);
        onComplete?.();
        return;
      }
      setSeconds(remaining);
    };

    tick();
    const id = setInterval(tick, 500);

    // Re-sync when tab becomes visible again
    const onVisible = () => { if (!document.hidden) tick(); };
    document.addEventListener('visibilitychange', onVisible);

    return () => {
      clearInterval(id);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [running, done, parsed, onComplete]);

  const toggle = () => {
    if (done) {
      // Restart from the top (pomodoro returns to its work phase).
      phaseRef.current = 'work';
      setPhase('work');
      baseSecondsRef.current = parsed.initial;
      epochRef.current = Date.now();
      setSeconds(parsed.initial);
      setDone(false);
      setRunning(true);
    } else {
      if (running) {
        // Pausing: save how many seconds remain as new base
        const elapsed = Math.floor((Date.now() - epochRef.current) / 1000);
        if (parsed.mode === 'stopwatch') {
          baseSecondsRef.current = baseSecondsRef.current + elapsed;
        } else {
          baseSecondsRef.current = Math.max(0, baseSecondsRef.current - elapsed);
        }
      } else {
        // Resuming: re-anchor to now (base already holds the remaining seconds).
        epochRef.current = Date.now();
      }
      setRunning(r => !r);
    }
  };

  const restart = () => {
    phaseRef.current = 'work';
    setPhase('work');
    setDone(false);
    baseSecondsRef.current = parsed.mode === 'stopwatch' ? 0 : parsed.initial;
    epochRef.current = Date.now();
    setSeconds(parsed.mode === 'stopwatch' ? 0 : parsed.initial);
    setRunning(true);
  };

  const label = parsed.mode === 'pomodoro' ? (phase === 'work' ? 'WORK' : 'BREAK') :
                parsed.mode === 'countdown' ? 'COUNTDOWN' : 'STOPWATCH';

  return (
    <div className="flex items-center gap-3 py-1.5 select-none">
      <Timer size={14} className="text-accent-foreground flex-shrink-0" />
      <span className="text-muted-foreground text-xs uppercase tracking-wider font-mono">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${done ? 'text-accent-foreground animate-pulse' : 'text-foreground'}`}>
        {done ? '00:00 ✓' : formatTime(seconds)}
      </span>
      <div className="flex items-center gap-0.5">
        <button onClick={toggle} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          {running ? <Pause size={12} /> : <Play size={12} />}
        </button>
        <button onClick={restart} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
          <RotateCcw size={12} />
        </button>
        {onRemove && (
          <button onClick={onRemove} className="p-1 text-muted-foreground hover:text-destructive transition-colors">
            <Square size={12} />
          </button>
        )}
      </div>
    </div>
  );
};

export default TimerWidget;
