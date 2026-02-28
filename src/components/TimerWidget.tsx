import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Play, Pause, RotateCcw, Square, Timer } from 'lucide-react';

interface TimerControls {
  toggle: () => void;
  restart: () => void;
  stop: () => void;
}

interface TimerWidgetProps {
  config: string;
  onRegister?: (controls: TimerControls) => void;
  onRemove?: () => void;
  onComplete?: () => void;
}

type PomoPhase = 'work' | 'break';

function parseConfig(config: string) {
  const t = config.trim().toLowerCase();
  if (!t) return { mode: 'stopwatch' as const, initial: 0 };
  if (t === 'pomo') return { mode: 'pomodoro' as const, initial: 25 * 60, work: 25 * 60, break: 5 * 60 };
  
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
  
  return { mode: 'stopwatch' as const, initial: 0 };
}

function formatTime(s: number): string {
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

const TimerWidget: React.FC<TimerWidgetProps> = ({ config, onRegister, onRemove, onComplete }) => {
  const parsed = useMemo(() => parseConfig(config), [config]);
  const [seconds, setSeconds] = useState(parsed.initial);
  const [running, setRunning] = useState(true);
  const [phase, setPhase] = useState<PomoPhase>('work');
  const phaseRef = useRef<PomoPhase>('work');
  const [done, setDone] = useState(false);
  // Wall-clock anchor: when running, the timestamp at which the current phase started
  const epochRef = useRef<number>(Date.now());
  const baseSecondsRef = useRef<number>(parsed.initial);

  useEffect(() => {
    onRegister?.({
      toggle: () => setRunning(r => !r),
      restart: () => {
        phaseRef.current = 'work';
        setPhase('work');
        setDone(false);
        baseSecondsRef.current = parsed.initial;
        epochRef.current = Date.now();
        setSeconds(parsed.initial);
        setRunning(true);
      },
      stop: () => {
        setRunning(false);
        const s = parsed.mode === 'stopwatch' ? 0 : parsed.initial;
        baseSecondsRef.current = s;
        setSeconds(s);
        setDone(false);
      },
    });
  }, [onRegister, parsed]);

  // Re-anchor epoch whenever running starts
  useEffect(() => {
    if (running && !done) {
      epochRef.current = Date.now();
    }
  }, [running, done]);

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
        if (parsed.mode === 'pomodoro') {
          const np: PomoPhase = phaseRef.current === 'work' ? 'break' : 'work';
          phaseRef.current = np;
          setPhase(np);
          const nextSecs = np === 'work' ? (parsed as any).work : (parsed as any).break;
          baseSecondsRef.current = nextSecs;
          epochRef.current = Date.now();
          setSeconds(nextSecs);
          onComplete?.();
          return;
        }
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
