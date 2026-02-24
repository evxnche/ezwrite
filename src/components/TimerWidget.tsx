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

const TimerWidget: React.FC<TimerWidgetProps> = ({ config, onRegister, onRemove }) => {
  const parsed = useMemo(() => parseConfig(config), [config]);
  const [seconds, setSeconds] = useState(parsed.initial);
  const [running, setRunning] = useState(true);
  const [phase, setPhase] = useState<PomoPhase>('work');
  const phaseRef = useRef<PomoPhase>('work');
  const [done, setDone] = useState(false);

  useEffect(() => {
    onRegister?.({
      toggle: () => setRunning(r => !r),
      restart: () => { setSeconds(parsed.initial); phaseRef.current = 'work'; setPhase('work'); setDone(false); setRunning(true); },
      stop: () => { setRunning(false); setSeconds(parsed.mode === 'stopwatch' ? 0 : parsed.initial); setDone(false); },
    });
  }, [onRegister, parsed]);

  useEffect(() => {
    if (!running || done) return;
    const id = setInterval(() => {
      setSeconds(prev => {
        if (parsed.mode === 'stopwatch') return prev + 1;
        const next = prev - 1;
        if (next <= 0) {
          if (parsed.mode === 'pomodoro') {
            const np: PomoPhase = phaseRef.current === 'work' ? 'break' : 'work';
            phaseRef.current = np;
            setPhase(np);
            return np === 'work' ? (parsed as any).work : (parsed as any).break;
          }
          setDone(true);
          setRunning(false);
          return 0;
        }
        return next;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [running, done, parsed]);

  const toggle = () => { if (done) { setSeconds(parsed.initial); setDone(false); setRunning(true); } else setRunning(r => !r); };
  const restart = () => { setSeconds(parsed.mode === 'stopwatch' ? 0 : parsed.initial); phaseRef.current = 'work'; setPhase('work'); setDone(false); setRunning(true); };

  const label = parsed.mode === 'pomodoro' ? (phase === 'work' ? 'WORK' : 'BREAK') :
                parsed.mode === 'countdown' ? 'COUNTDOWN' : 'STOPWATCH';

  return (
    <div className="flex items-center gap-3 py-1.5 select-none">
      <Timer size={14} className="text-primary flex-shrink-0" />
      <span className="text-muted-foreground text-xs uppercase tracking-wider font-mono">{label}</span>
      <span className={`font-mono font-medium tabular-nums ${done ? 'text-primary animate-pulse' : 'text-foreground'}`}>
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
