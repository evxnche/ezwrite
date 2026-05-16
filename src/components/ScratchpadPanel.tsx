import React, { useEffect, useRef } from 'react';
import { GripVertical, X } from 'lucide-react';

interface Props {
  open: boolean;
  value: string;
  width: number;
  useSerif: boolean;
  onChange: (value: string) => void;
  onClose: () => void;
  onResize: (width: number) => void;
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 720;

const ScratchpadPanel: React.FC<Props> = ({ open, value, width, useSerif, onChange, onClose, onResize }) => {
  const isResizingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      textareaRef.current?.focus();
    });
  }, [open]);

  useEffect(() => {
    const handleMove = (e: MouseEvent) => {
      if (!isResizingRef.current) return;
      const next = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, window.innerWidth - e.clientX));
      onResize(next);
    };
    const handleUp = () => {
      isResizingRef.current = false;
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    window.addEventListener('mousemove', handleMove);
    window.addEventListener('mouseup', handleUp);
    return () => {
      window.removeEventListener('mousemove', handleMove);
      window.removeEventListener('mouseup', handleUp);
    };
  }, [onResize]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Backspace') {
      const start = e.currentTarget.selectionStart;
      if (start === e.currentTarget.selectionEnd && start >= 8) {
        const textBeforeCursor = value.substring(0, start);
        if (textBeforeCursor.endsWith('        ')) {
          e.preventDefault();
          const newValue = value.substring(0, start - 8) + value.substring(start);
          onChange(newValue);
          requestAnimationFrame(() => {
            if (textareaRef.current) {
              textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - 8;
            }
          });
          return;
        }
      }
    }

    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const textBeforeCursor = value.substring(0, start);
      const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const currentLineToCursor = value.substring(currentLineStart, start);
      
      if (currentLineToCursor.startsWith('        ')) {
        const newValue = value.substring(0, currentLineStart) + value.substring(currentLineStart + 8);
        onChange(newValue);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            const newPos = Math.max(currentLineStart, start - 8);
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = newPos;
          }
        });
      }
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      const start = e.currentTarget.selectionStart;
      const end = e.currentTarget.selectionEnd;
      
      const textBeforeCursor = value.substring(0, start);
      const currentLineStart = textBeforeCursor.lastIndexOf('\n') + 1;
      const currentLineToCursor = value.substring(currentLineStart, start);
      const fullLine = value.substring(currentLineStart).split('\n')[0];
      
      const listMatch = fullLine.match(/^(\s*)([-*>]|\d+[\.\/])\s/);
      
      if (listMatch && currentLineToCursor.length <= listMatch[0].length) {
        const newValue = value.substring(0, currentLineStart) + '        ' + value.substring(currentLineStart);
        onChange(newValue);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 8;
          }
        });
        return;
      }

      const newValue = value.substring(0, start) + '        ' + value.substring(end);
      onChange(newValue);
      
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 8;
        }
      });
      return;
    }

    if (e.key === 'Enter') {
      const start = e.currentTarget.selectionStart;
      const textBeforeCursor = value.substring(0, start);
      const currentLine = textBeforeCursor.split('\n').pop() || '';
      
      const indentMatch = currentLine.match(/^\s*/);
      const indent = indentMatch ? indentMatch[0] : '';
      const listMatch = currentLine.match(/^(\s*)([-*>]|\d+[\.\/])\s/);
      
      if (listMatch) {
        e.preventDefault();
        const fullPrefix = listMatch[0];
        const matchIndent = listMatch[1];
        const bullet = listMatch[2];
        
        if (currentLine === fullPrefix) {
          if (matchIndent.length >= 8) {
            const newIndent = matchIndent.slice(0, matchIndent.length - 8);
            const newValue = value.substring(0, start - fullPrefix.length) + newIndent + bullet + ' ' + value.substring(e.currentTarget.selectionEnd);
            onChange(newValue);
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - fullPrefix.length + newIndent.length + bullet.length + 1;
              }
            });
          } else {
            const newValue = value.substring(0, start - fullPrefix.length) + matchIndent + value.substring(e.currentTarget.selectionEnd);
            onChange(newValue);
            requestAnimationFrame(() => {
              if (textareaRef.current) {
                textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start - fullPrefix.length + matchIndent.length;
              }
            });
          }
          return;
        }
        
        let nextPrefix = fullPrefix;
        const numMatch = bullet.match(/\d+/);
        if (numMatch) {
          const nextNum = parseInt(numMatch[0], 10) + 1;
          nextPrefix = `${matchIndent}${bullet.replace(/\d+/, nextNum.toString())} `;
        }
        
        const newValue = value.substring(0, start) + '\n' + nextPrefix + value.substring(e.currentTarget.selectionEnd);
        onChange(newValue);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1 + nextPrefix.length;
          }
        });
        return;
      } else if (indent) {
        e.preventDefault();
        const newValue = value.substring(0, start) + '\n' + indent + value.substring(e.currentTarget.selectionEnd);
        onChange(newValue);
        requestAnimationFrame(() => {
          if (textareaRef.current) {
            textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 1 + indent.length;
          }
        });
        return;
      }
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed top-0 right-0 bottom-0 z-50 bg-popover border-l border-border shadow-2xl flex flex-col"
      style={{ width }}
      onKeyDown={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      onTouchStart={(e) => e.stopPropagation()}
      onWheel={(e) => e.stopPropagation()}
    >
      <button
        className="absolute left-0 top-0 bottom-0 w-4 -translate-x-1/2 cursor-col-resize group"
        aria-label="Resize scratchpad"
        onMouseDown={() => {
          isResizingRef.current = true;
          document.body.style.cursor = 'col-resize';
          document.body.style.userSelect = 'none';
        }}
      >
        <span className="absolute left-1/2 top-0 bottom-0 w-px -translate-x-1/2 bg-border/70 group-hover:bg-foreground/35 transition-colors" />
        <span className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full border border-border/70 bg-popover px-[1px] py-1 text-muted-foreground/55 group-hover:text-foreground/70 group-hover:border-foreground/20 transition-colors">
          <GripVertical size={12} />
        </span>
      </button>

      <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
        <div className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest">scratchpad</div>
        <button
          onClick={onClose}
          className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
          aria-label="Close scratchpad"
        >
          <X size={13} />
        </button>
      </div>

      <textarea
        ref={textareaRef}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="rough notes, fragments, scraps..."
        className={`flex-1 w-full resize-none bg-transparent px-4 py-4 outline-none border-0 text-sm sm:text-[15px] font-light tracking-wide leading-relaxed text-foreground placeholder:text-muted-foreground/40 ${
          useSerif ? 'font-playfair' : 'font-mono'
        }`}
        spellCheck={false}
      />
    </div>
  );
};

export default ScratchpadPanel;
