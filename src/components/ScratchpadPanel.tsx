import React, { useEffect, useRef, useState } from 'react';
import { GripVertical, X, NotebookPen } from 'lucide-react';
import type { NotesTransferMode } from './preferences';
import { getCaretCoordinates } from './caret-pos';
import SlashCommandPopup from './SlashCommandPopup';

interface Props {
  open: boolean;
  value: string;
  width: number;
  useSerif: boolean;
  notesTransferMode: NotesTransferMode;
  onChange: (value: string) => void;
  onMoveToEditor: (text: string) => void;
  onClose: () => void;
  onResize: (width: number) => void;
  slashCommands: { name: string; description: string }[];
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 720;

const ScratchpadPanel: React.FC<Props> = ({ open, value, width, useSerif, notesTransferMode, onChange, onMoveToEditor, onClose, onResize, slashCommands }) => {
  const isResizingRef = useRef(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [selectionText, setSelectionText] = useState('');
  const [selectionRect, setSelectionRect] = useState<{ top: number, left: number, width: number } | null>(null);

  const [slashPopup, setSlashPopup] = useState<{ startOffset: number, filter: string, rect: DOMRect } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const filteredCommands = slashPopup
    ? slashCommands.filter(c => c.name.startsWith(slashPopup.filter.toLowerCase()))
    : [];

  useEffect(() => {
    if (slashPopup && filteredCommands.length === 0) setSlashPopup(null);
  }, [slashPopup, filteredCommands.length]);

  const applySlashCommand = (command: string) => {
    if (!slashPopup || !textareaRef.current) return;
    const { startOffset } = slashPopup;
    let insertText = '';
    let newCursorOffset = 0;
    
    if (command === 'list') { insertText = '- [ ] '; newCursorOffset = 6; }
    else if (command === 'line') { insertText = '---\n'; newCursorOffset = 4; }
    else if (command === 'timer') { insertText = 'timer::15:00\n'; newCursorOffset = 13; }
    
    const before = value.substring(0, startOffset);
    const after = value.substring(textareaRef.current.selectionStart);
    
    onChange(before + insertText + after);
    setSlashPopup(null);
    
    requestAnimationFrame(() => {
      if (textareaRef.current) {
        textareaRef.current.selectionStart = textareaRef.current.selectionEnd = startOffset + newCursorOffset;
      }
    });
  };

  const handleTextChange = (newValue: string) => {
    onChange(newValue);
    
    if (textareaRef.current) {
      const cursor = textareaRef.current.selectionStart;
      const textBeforeCursor = newValue.substring(0, cursor);
      const currentLine = textBeforeCursor.split('\n').pop() || '';
      
      if (currentLine.startsWith('/') && !currentLine.includes(' ')) {
        const startOffset = cursor - currentLine.length;
        const rect = getCaretCoordinates(textareaRef.current, cursor);
        const textareaRect = textareaRef.current.getBoundingClientRect();
        
        const top = textareaRect.top + rect.top - textareaRef.current.scrollTop;
        const left = textareaRect.left + rect.left - textareaRef.current.scrollLeft;
        
        setSlashPopup({
          startOffset,
          filter: currentLine.slice(1),
          rect: new DOMRect(left, top, 0, rect.height)
        });
      } else {
        setSlashPopup(null);
      }
    }
  };

  const updateSelection = () => {
    if (!textareaRef.current) return;
    const start = textareaRef.current.selectionStart;
    const end = textareaRef.current.selectionEnd;
    
    if (start !== end && value) {
      setSelectionText(value.substring(start, end));
      
      const startPos = getCaretCoordinates(textareaRef.current, start);
      const endPos = getCaretCoordinates(textareaRef.current, end);
      const rect = textareaRef.current.getBoundingClientRect();
      
      // Calculate coordinates relative to the viewport
      const top = rect.top + startPos.top - textareaRef.current.scrollTop;
      
      let left = rect.left + startPos.left - textareaRef.current.scrollLeft;
      let width = endPos.left - startPos.left;
      
      // If selection spans multiple lines, just center it on the start line approx
      if (startPos.top !== endPos.top) {
        width = 100; // arbitrary width for multi-line
      }
      
      setSelectionRect({ top, left, width });
    } else {
      setSelectionText('');
      setSelectionRect(null);
    }
  };

  const handleMoveToEditor = () => {
    if (!textareaRef.current || !selectionText) return;
    onMoveToEditor(selectionText);
    
    if (notesTransferMode === 'move') {
      const start = textareaRef.current.selectionStart;
      const end = textareaRef.current.selectionEnd;
      const newValue = value.substring(0, start) + value.substring(end);
      onChange(newValue);
      
      requestAnimationFrame(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start;
          updateSelection();
        }
      });
    }
    setSelectionText('');
    setSelectionRect(null);
  };

  useEffect(() => {
    const handleSelectionChange = () => {
      if (!textareaRef.current) return;
      if (document.activeElement === textareaRef.current) {
        updateSelection();
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [value]);

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
    if (slashPopup && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopupHighlight(h => Math.min(h + 1, filteredCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopupHighlight(h => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[popupHighlight]) applySlashCommand(filteredCommands[popupHighlight].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashPopup(null); return; }
      
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= filteredCommands.length) {
        e.preventDefault();
        applySlashCommand(filteredCommands[num - 1].name);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      handleMoveToEditor();
      return;
    }

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
      
      const listMatch = fullLine.match(/^(\s*)([-*>]|\d+[./])\s/);
      
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
      const listMatch = currentLine.match(/^(\s*)([-*>]|\d+[./])\s/);
      
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
        onChange={(e) => handleTextChange(e.target.value)}
        onKeyDown={handleKeyDown}
        onSelect={updateSelection}
        placeholder="rough notes, fragments, scraps..."
        className={`flex-1 w-full resize-none bg-transparent px-4 py-4 outline-none border-0 text-sm sm:text-[15px] font-light tracking-wide leading-relaxed text-foreground placeholder:text-muted-foreground/40 ${
          useSerif ? 'font-playfair' : 'font-mono'
        }`}
        spellCheck={false}
      />

      {selectionText && selectionRect && (
        <button
          className="fixed z-50 flex items-center justify-center bg-background border border-border shadow-lg rounded-full p-2 text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            top: selectionRect.top - 48,
            left: selectionRect.left + (selectionRect.width / 2) - 18,
          }}
          onPointerDown={(e) => {
            e.preventDefault(); // Prevent textarea from losing focus
            e.stopPropagation();
            handleMoveToEditor();
          }}
          aria-label="Move selection to editor (Cmd+Shift+M)"
          title="Move to editor (Cmd+Shift+M)"
        >
          <NotebookPen size={16} />
        </button>
      )}

      {slashPopup && filteredCommands.length > 0 && (
        <SlashCommandPopup
          commands={filteredCommands}
          highlightIndex={popupHighlight}
          onSelect={applySlashCommand}
          onClose={() => setSlashPopup(null)}
          rect={slashPopup.rect}
        />
      )}
    </div>
  );
};

export default ScratchpadPanel;
