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
}

const COMMAND_COLORS: Record<string, string> = {
  list:  'text-accent-foreground',
  line:  'text-accent-foreground',
  timer: 'text-accent-foreground',
  help:  'text-accent-foreground',
};

const SlashCommandPopup: React.FC<Props> = ({ commands, highlightIndex, onSelect, onClose, rect }) => {
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
      className="fixed z-50 bg-popover border border-border rounded-xl shadow-lg overflow-hidden min-w-[220px]"
      style={{ top: rect.bottom + 6, left: rect.left }}
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`w-full text-left px-3 py-2.5 transition-colors flex items-center gap-3 ${
            i === highlightIndex ? 'bg-muted/40' : 'hover:bg-muted/20'
          }`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.name); }}
        >
          <span className="flex items-center justify-center w-5 h-5 rounded-[6px] border border-border text-xs font-mono text-muted-foreground bg-background flex-shrink-0">
            {i + 1}
          </span>
          <span className={`font-mono text-sm font-medium w-10 flex-shrink-0 ${COMMAND_COLORS[cmd.name] ?? 'text-foreground'}`}>
            {cmd.name}
          </span>
          <span className="font-mono text-muted-foreground text-xs leading-snug">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
};

export default SlashCommandPopup;
