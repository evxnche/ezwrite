import React, { useEffect, useRef } from 'react';

interface Command {
  name: string;
  description: string;
}

interface Props {
  commands: Command[];
  highlightIndex: number;
  onSelect: (name: string) => void;
  onClose: () => void;
  rect: DOMRect;
  kbHeight?: number;
  isTouchDevice?: boolean;
}

const COMMAND_COLORS: Record<string, string> = {
  list:  'text-accent-foreground',
  line:  'text-accent-foreground',
  timer: 'text-accent-foreground',
  help:  'text-accent-foreground',
};

const SlashCommandPopup: React.FC<Props> = ({ commands, highlightIndex, onSelect, onClose, rect, kbHeight = 0, isTouchDevice = false }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!commands.length) return null;

  return (
    <div
      ref={ref}
      className={`fixed z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden ${isTouchDevice ? 'min-w-[200px]' : 'min-w-[220px]'}`}
      style={
        isTouchDevice && kbHeight > 0
          ? { bottom: kbHeight + 8, left: Math.max(16, Math.min(rect.left, (typeof window !== 'undefined' ? window.innerWidth : 400) - 216)) }
          : { top: rect.bottom + 6, left: rect.left }
      }
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`w-full text-left transition-colors flex items-center gap-2 ${
            isTouchDevice ? 'px-2.5 py-1.5' : 'px-3 py-2.5 gap-3'
          } ${
            i === highlightIndex ? 'bg-muted/40' : 'hover:bg-muted/20'
          }`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.name); }}
        >
          <span className={`flex items-center justify-center rounded-[6px] border border-border font-mono text-muted-foreground bg-background flex-shrink-0 ${isTouchDevice ? 'w-4 h-4 text-[10px]' : 'w-5 h-5 text-xs'}`}>
            {i + 1}
          </span>
          <span className={`font-mono font-medium flex-shrink-0 ${isTouchDevice ? 'text-xs w-8' : 'text-sm w-10'} ${COMMAND_COLORS[cmd.name] ?? 'text-foreground'}`}>
            {cmd.name}
          </span>
          <span className={`font-mono text-muted-foreground leading-snug ${isTouchDevice ? 'text-[10px]' : 'text-xs'}`}>{cmd.description}</span>
        </button>
      ))}
    </div>
  );
};

export default SlashCommandPopup;
