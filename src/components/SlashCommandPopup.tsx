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
  anchorEl: HTMLElement | null;
}

const SlashCommandPopup: React.FC<Props> = ({ commands, highlightIndex, onSelect, onClose, anchorEl }) => {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  if (!commands.length || !anchorEl) return null;

  const rect = anchorEl.getBoundingClientRect();

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-popover border border-border rounded-xl shadow-lg py-1 min-w-[180px]"
      style={{ top: rect.bottom + 4, left: rect.left }}
    >
      {commands.map((cmd, i) => (
        <button
          key={cmd.name}
          className={`w-full text-left px-3 py-2 text-sm transition-colors flex items-center gap-2 ${
            i === highlightIndex ? 'bg-accent text-accent-foreground' : 'text-popover-foreground hover:bg-accent/50'
          }`}
          onMouseDown={(e) => { e.preventDefault(); onSelect(cmd.name); }}
        >
          <span className="font-medium">/{cmd.name}</span>
          <span className="text-muted-foreground text-xs">{cmd.description}</span>
        </button>
      ))}
    </div>
  );
};

export default SlashCommandPopup;
