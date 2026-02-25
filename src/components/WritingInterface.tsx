import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Sun, Moon, Info } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import jsPDF from 'jspdf';
import SlashCommandPopup from './SlashCommandPopup';
import InfoDialog from './InfoDialog';
import TimerWidget from './TimerWidget';
import {
  STRUCK_MARKER, getCleanLine, isLineStruck, getLineType,
  getTimerArgs, SLASH_COMMANDS, INDENT, autoResize, LineType,
} from './writing-helpers';

const playChime = () => {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    [880, 1108.73, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.frequency.value = freq;
      osc.type = 'sine';
      const start = ctx.currentTime + i * 0.15;
      gain.gain.setValueAtTime(0.15, start);
      gain.gain.exponentialRampToValueAtTime(0.001, start + 1.2);
      osc.start(start);
      osc.stop(start + 1.2);
    });
  } catch {}
};

const WritingInterface = () => {
  const [content, setContentState] = useState(() => localStorage.getItem('zen-writing-content') || '');
  const contentRef = useRef(content);
  const setContent = useCallback((val: string) => { contentRef.current = val; setContentState(val); }, []);

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [timerAlert, setTimerAlert] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasLoadedRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);

  // Undo / Redo
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastUndoTime = useRef(0);
  const pushUndo = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastUndoTime.current < 500) return;
    undoStack.current.push(contentRef.current);
    if (undoStack.current.length > 100) undoStack.current.shift();
    redoStack.current = [];
    lastUndoTime.current = now;
  }, []);
  const undo = useCallback(() => {
    if (!undoStack.current.length) return;
    redoStack.current.push(contentRef.current);
    setContent(undoStack.current.pop()!);
  }, [setContent]);
  const redo = useCallback(() => {
    if (!redoStack.current.length) return;
    undoStack.current.push(contentRef.current);
    setContent(redoStack.current.pop()!);
  }, [setContent]);

  // Refs
  const lineRefs = useRef<Map<number, HTMLTextAreaElement>>(new Map());
  const pendingCursorRef = useRef<{ line: number; pos: number } | null>(null);

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ lineIndex: number; filter: string } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  // Timer editing
  const [editingTimerLine, setEditingTimerLine] = useState<number | null>(null);
  const timerControls = useRef<Map<number, { toggle: () => void; restart: () => void; stop: () => void }>>(new Map());

  const isDark = mounted && theme === 'dark';

  // Mount + auto-focus
  useEffect(() => {
    setMounted(true);
    const t = setTimeout(() => {
      const el = lineRefs.current.get(0);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }, 150);
    return () => clearTimeout(t);
  }, []);

  // Save
  useEffect(() => {
    if (!hasLoadedRef.current) { hasLoadedRef.current = true; return; }
    localStorage.setItem('zen-writing-content', content);
  }, [content]);

  // Pending cursor
  useEffect(() => {
    if (!pendingCursorRef.current) return;
    const { line, pos } = pendingCursorRef.current;
    pendingCursorRef.current = null;
    requestAnimationFrame(() => {
      const el = lineRefs.current.get(line);
      if (el) { el.focus(); const p = Math.min(pos, el.value.length); el.setSelectionRange(p, p); }
    });
  });

  const lines = content.split('\n');

  const filteredCommands = slashPopup
    ? SLASH_COMMANDS.filter(c => c.name.startsWith(slashPopup.filter.toLowerCase()))
    : [];

  useEffect(() => {
    if (slashPopup && filteredCommands.length === 0) setSlashPopup(null);
  }, [slashPopup, filteredCommands.length]);

  const findEditable = (from: number, dir: 1 | -1): number => {
    let i = from + dir;
    while (i >= 0 && i < lines.length) {
      const t = getLineType(lines, i);
      if (t === 'text' || t === 'list-item') return i;
      i += dir;
    }
    return from;
  };

  const triggerTyping = () => {
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
  };

  const scrollToLine = (lineIndex: number) => {
    requestAnimationFrame(() => {
      const el = lineRefs.current.get(lineIndex);
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 32;
      const bottomTarget = rect.bottom + lineHeight * 3;
      if (bottomTarget > window.innerHeight) {
        window.scrollBy({ top: bottomTarget - window.innerHeight + 16, behavior: 'smooth' });
      }
    });
  };

  // Click anywhere to focus
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === editorRef.current || target.dataset?.editorBg === 'true') {
      const lastIndex = lines.length - 1;
      const el = lineRefs.current.get(lastIndex);
      if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    }
  };

  // Timer completion
  const handleTimerComplete = useCallback(() => {
    playChime();
    setTimerAlert(true);
  }, []);

  // Slash select
  const handleSlashSelect = useCallback((command: string) => {
    if (!slashPopup) return;
    const { lineIndex } = slashPopup;
    const ls = contentRef.current.split('\n');
    pushUndo(true);
    if (command === 'timer') {
      ls[lineIndex] = 'timer ';
      setContent(ls.join('\n'));
      setEditingTimerLine(lineIndex);
      pendingCursorRef.current = { line: lineIndex, pos: 6 };
    } else {
      ls[lineIndex] = command;
      if (lineIndex >= ls.length - 1) ls.push('');
      setContent(ls.join('\n'));
      pendingCursorRef.current = { line: lineIndex + 1, pos: 0 };
    }
    setSlashPopup(null);
  }, [slashPopup, pushUndo, setContent]);

  // Text change
  const handleTextChange = (index: number, value: string) => {
    pushUndo();
    const ls = contentRef.current.split('\n');
    ls[index] = value;
    setContent(ls.join('\n'));
    triggerTyping();
    scrollToLine(index);
    const trimmed = value.trim();
    if (/^\/\w{0,10}$/.test(trimmed)) {
      const filter = trimmed.slice(1);
      const matches = SLASH_COMMANDS.filter(c => c.name.startsWith(filter.toLowerCase()));
      if (matches.length > 0) { setSlashPopup({ lineIndex: index, filter }); setPopupHighlight(0); return; }
    }
    if (slashPopup?.lineIndex === index) setSlashPopup(null);
  };

  // List item change
  const handleListItemChange = (index: number, inputValue: string) => {
    const ls = contentRef.current.split('\n');
    const wasStruck = isLineStruck(ls[index]);
    if (inputValue.trimEnd().endsWith('/x')) {
      pushUndo(true);
      const clean = inputValue.replace(/\/x\s*$/, '').trimEnd();
      ls[index] = wasStruck ? clean : STRUCK_MARKER + clean;
      setContent(ls.join('\n'));
      pendingCursorRef.current = { line: index, pos: clean.length };
      return;
    }
    pushUndo();
    ls[index] = wasStruck ? STRUCK_MARKER + inputValue : inputValue;
    setContent(ls.join('\n'));
    triggerTyping();
    scrollToLine(index);
  };

  const toggleStrike = (index: number) => {
    pushUndo(true);
    const ls = contentRef.current.split('\n');
    ls[index] = isLineStruck(ls[index]) ? getCleanLine(ls[index]) : STRUCK_MARKER + getCleanLine(ls[index]);
    setContent(ls.join('\n'));
  };

  const deleteLine = (index: number) => {
    pushUndo(true);
    const ls = contentRef.current.split('\n');
    ls.splice(index, 1);
    if (!ls.length) ls.push('');
    setContent(ls.join('\n'));
    pendingCursorRef.current = { line: Math.min(index, ls.length - 1), pos: 0 };
  };

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, lineIndex: number) => {
    const input = e.currentTarget;
    const pos = input.selectionStart ?? 0;
    const end = input.selectionEnd ?? 0;
    const ls = contentRef.current.split('\n');

    // Popup nav
    if (slashPopup && slashPopup.lineIndex === lineIndex) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopupHighlight(h => Math.min(h + 1, filteredCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopupHighlight(h => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[popupHighlight]) handleSlashSelect(filteredCommands[popupHighlight].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashPopup(null); return; }
    }

    // Ctrl+A - select all in current textarea
    if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
      e.preventDefault();
      input.setSelectionRange(0, input.value.length);
      return;
    }

    // Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) { e.preventDefault(); undo(); return; }
    // Ctrl+Shift+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) { e.preventDefault(); redo(); return; }

    // Ctrl+B
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      pushUndo(true);
      const lineType = getLineType(ls, lineIndex);
      const raw = lineType === 'list-item' ? getCleanLine(ls[lineIndex]) : ls[lineIndex];
      let newText: string;
      let newPos: number;
      if (pos !== end) {
        newText = raw.slice(0, pos) + '**' + raw.slice(pos, end) + '**' + raw.slice(end);
        newPos = end + 4;
      } else {
        newText = raw.slice(0, pos) + '****' + raw.slice(pos);
        newPos = pos + 2;
      }
      if (lineType === 'list-item') {
        ls[lineIndex] = isLineStruck(ls[lineIndex]) ? STRUCK_MARKER + newText : newText;
      } else {
        ls[lineIndex] = newText;
      }
      setContent(ls.join('\n'));
      pendingCursorRef.current = { line: lineIndex, pos: newPos };
      return;
    }

    // Tab - indent only
    if (e.key === 'Tab') {
      e.preventDefault();
      pushUndo(true);
      ls[lineIndex] = INDENT + ls[lineIndex];
      setContent(ls.join('\n'));
      pendingCursorRef.current = { line: lineIndex, pos: pos + INDENT.length };
      return;
    }

    // Alt+Arrow move line
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      if (lineIndex > 0) {
        pushUndo(true);
        [ls[lineIndex], ls[lineIndex - 1]] = [ls[lineIndex - 1], ls[lineIndex]];
        setContent(ls.join('\n'));
        pendingCursorRef.current = { line: lineIndex - 1, pos };
      }
      return;
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      if (lineIndex < ls.length - 1) {
        pushUndo(true);
        [ls[lineIndex], ls[lineIndex + 1]] = [ls[lineIndex + 1], ls[lineIndex]];
        setContent(ls.join('\n'));
        pendingCursorRef.current = { line: lineIndex + 1, pos };
      }
      return;
    }

    // Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      if (editingTimerLine === lineIndex) {
        const timerArgs = getTimerArgs(ls[lineIndex]);
        if (['p', 'r', 's'].includes(timerArgs.toLowerCase())) {
          const action = timerArgs.toLowerCase();
          for (let i = lineIndex - 1; i >= 0; i--) {
            if (getLineType(ls, i) === 'timer' && i !== lineIndex) {
              const ctrl = timerControls.current.get(i);
              if (ctrl) { if (action === 'p') ctrl.toggle(); if (action === 'r') ctrl.restart(); if (action === 's') ctrl.stop(); }
              break;
            }
          }
          ls.splice(lineIndex, 1);
          setContent(ls.join('\n'));
          setEditingTimerLine(null);
          pendingCursorRef.current = { line: Math.max(0, lineIndex - 1), pos: 0 };
          return;
        }
        setEditingTimerLine(null);
        if (lineIndex >= ls.length - 1) { ls.push(''); setContent(ls.join('\n')); }
        pendingCursorRef.current = { line: lineIndex + 1, pos: 0 };
        return;
      }
      pushUndo(true);
      const line = ls[lineIndex];
      ls[lineIndex] = line.slice(0, pos);
      ls.splice(lineIndex + 1, 0, line.slice(pos));
      setContent(ls.join('\n'));
      pendingCursorRef.current = { line: lineIndex + 1, pos: 0 };
      scrollToLine(lineIndex + 1);
      return;
    }

    // Backspace at pos 0
    if (e.key === 'Backspace' && pos === 0 && end === 0) {
      // Unindent if line is indented
      if (ls[lineIndex].startsWith(INDENT)) {
        e.preventDefault();
        pushUndo(true);
        ls[lineIndex] = ls[lineIndex].slice(INDENT.length);
        setContent(ls.join('\n'));
        pendingCursorRef.current = { line: lineIndex, pos: 0 };
        return;
      }
      if (lineIndex === 0) return;
      e.preventDefault();
      pushUndo(true);
      const prevType = getLineType(ls, lineIndex - 1);
      if (['list-header', 'divider', 'timer'].includes(prevType)) {
        ls.splice(lineIndex - 1, 1);
        setContent(ls.join('\n'));
        pendingCursorRef.current = { line: lineIndex - 1, pos: 0 };
      } else {
        const prevClean = getLineType(ls, lineIndex - 1) === 'list-item' ? getCleanLine(ls[lineIndex - 1]) : ls[lineIndex - 1];
        const prevLen = prevClean.length;
        const curClean = getLineType(ls, lineIndex) === 'list-item' ? getCleanLine(ls[lineIndex]) : ls[lineIndex];
        if (getLineType(ls, lineIndex - 1) === 'list-item') {
          const wasStruck = isLineStruck(ls[lineIndex - 1]);
          ls[lineIndex - 1] = wasStruck ? STRUCK_MARKER + prevClean + curClean : prevClean + curClean;
        } else {
          ls[lineIndex - 1] += ls[lineIndex];
        }
        ls.splice(lineIndex, 1);
        setContent(ls.join('\n'));
        pendingCursorRef.current = { line: lineIndex - 1, pos: prevLen };
      }
      return;
    }

    // Arrow up at pos 0
    if (e.key === 'ArrowUp' && !e.altKey && pos === 0) {
      e.preventDefault();
      const target = findEditable(lineIndex, -1);
      if (target !== lineIndex) {
        const el = lineRefs.current.get(target);
        if (el) { el.focus(); const p = Math.min(pos, el.value.length); el.setSelectionRange(p, p); }
      }
      return;
    }

    // Arrow down at end
    if (e.key === 'ArrowDown' && !e.altKey && pos === input.value.length) {
      e.preventDefault();
      const target = findEditable(lineIndex, 1);
      if (target !== lineIndex) {
        const el = lineRefs.current.get(target);
        if (el) { el.focus(); const p = Math.min(pos, el.value.length); el.setSelectionRange(p, p); }
      }
      return;
    }

    // Arrow left at 0
    if (e.key === 'ArrowLeft' && pos === 0 && end === 0 && !e.altKey && !e.shiftKey) {
      const target = findEditable(lineIndex, -1);
      if (target !== lineIndex) {
        e.preventDefault();
        const el = lineRefs.current.get(target);
        if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
      }
    }

    // Arrow right at end
    if (e.key === 'ArrowRight' && pos === input.value.length && !e.altKey && !e.shiftKey) {
      const target = findEditable(lineIndex, 1);
      if (target !== lineIndex) {
        e.preventDefault();
        const el = lineRefs.current.get(target);
        if (el) { el.focus(); el.setSelectionRange(0, 0); }
      }
    }

    // Escape timer
    if (e.key === 'Escape' && editingTimerLine === lineIndex) {
      e.preventDefault();
      ls.splice(lineIndex, 1);
      if (!ls.length) ls.push('');
      setContent(ls.join('\n'));
      setEditingTimerLine(null);
      pendingCursorRef.current = { line: Math.max(0, lineIndex - 1), pos: 0 };
    }
  };

  // Exports
  const cleanForExport = (line: string) => {
    if (isLineStruck(line)) return '[x] ' + getCleanLine(line);
    return line;
  };

  const saveAsTxt = () => {
    if (!content.trim()) return;
    const exported = lines.map((line, i) => {
      const type = getLineType(lines, i);
      if (type === 'divider') return '---';
      if (type === 'timer') return `⏱ ${getTimerArgs(line) || 'stopwatch'}`;
      return cleanForExport(line);
    }).join('\n');
    const blob = new Blob([exported], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ezwrite-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveAsPdf = () => {
    if (!content.trim()) return;
    const pdf = new jsPDF();
    const pageH = pdf.internal.pageSize.height;
    const pageW = pdf.internal.pageSize.width;
    const margin = 20;
    const lh = 6;
    const maxW = pageW - 2 * margin;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    let y = margin;

    lines.forEach((line, i) => {
      const type = getLineType(lines, i);
      if (type === 'divider') {
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.setDrawColor(180); pdf.line(margin, y, pageW - margin, y);
        y += lh;
        return;
      }
      if (type === 'timer') {
        const text = `⏱ ${getTimerArgs(line) || 'stopwatch'}`;
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(text, margin, y); y += lh;
        return;
      }
      let text = cleanForExport(line);
      if (type === 'list-header') { text = ''; y += lh * 0.5; return; }
      if (!text.trim()) { y += lh; if (y > pageH - margin) { pdf.addPage(); y = margin; } return; }
      const split = pdf.splitTextToSize(text, maxW);
      split.forEach((l: string) => {
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(l, margin, y); y += lh;
      });
      y += lh * 0.3;
    });

    pdf.save(`ezwrite-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Render line
  const renderLine = (line: string, index: number, type: LineType) => {
    const textStyle: React.CSSProperties = {
      lineHeight: '1.8',
      caretColor: isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 25%)',
      ...(isDark ? { textShadow: '0 0 8px hsl(40 60% 70% / 0.3), 0 0 20px hsl(35 50% 60% / 0.15)' } : {}),
    };

    const refCb = (el: HTMLTextAreaElement | null) => {
      if (el) { lineRefs.current.set(index, el); autoResize(el); }
      else lineRefs.current.delete(index);
    };

    if (type === 'list-header') {
      return (
        <div key={`lh-${index}`} className="relative group" style={{ lineHeight: '1.8' }}>
          <span className="font-playfair text-lg text-muted-foreground/40 font-light tracking-wide select-none">list</span>
          <button onClick={() => deleteLine(index)} className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive text-xs transition-opacity">✕</button>
        </div>
      );
    }

    if (type === 'divider') {
      return (
        <div key={`div-${index}`} className="py-2 relative group">
          <hr className="border-t border-border" />
          <button onClick={() => deleteLine(index)} className="absolute right-0 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 text-muted-foreground/40 hover:text-destructive text-xs transition-opacity">✕</button>
        </div>
      );
    }

    if (type === 'timer') {
      if (editingTimerLine === index) {
        return (
          <div key={`te-${index}`} style={{ lineHeight: '1.8' }}>
            <textarea
              ref={refCb}
              value={line}
              rows={1}
              onChange={(e) => { const ls = contentRef.current.split('\n'); ls[index] = e.target.value; setContent(ls.join('\n')); autoResize(e.target); }}
              onKeyDown={(e) => handleKeyDown(e, index)}
              className="w-full font-playfair text-base sm:text-lg font-light tracking-wide bg-transparent border-none outline-none resize-none overflow-hidden text-foreground"
              style={textStyle}
            />
          </div>
        );
      }
      return (
        <div key={`tw-${index}`} className="relative group">
          <TimerWidget
            config={getTimerArgs(line)}
            onRegister={(ctrls) => timerControls.current.set(index, ctrls)}
            onRemove={() => deleteLine(index)}
            onComplete={handleTimerComplete}
          />
        </div>
      );
    }

    if (type === 'list-item') {
      const struck = isLineStruck(line);
      const display = getCleanLine(line);
      return (
        <div key={`li-${index}`} className="flex items-start gap-3" style={{ lineHeight: '1.8' }}>
          <button
            onClick={() => toggleStrike(index)}
            className={`mt-2 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
              struck ? 'bg-accent-foreground/80 border-accent-foreground/80' : 'border-muted-foreground/40 hover:border-accent-foreground/60'
            }`}
          >
            {struck && (
              <svg width="10" height="10" viewBox="0 0 10 10" className="text-background">
                <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            )}
          </button>
          <textarea
            ref={refCb}
            value={display}
            rows={1}
            onChange={(e) => { handleListItemChange(index, e.target.value); autoResize(e.target); }}
            onKeyDown={(e) => handleKeyDown(e, index)}
            className={`flex-1 font-playfair text-base sm:text-lg font-light tracking-wide bg-transparent border-none outline-none resize-none overflow-hidden ${
              struck ? 'line-through text-muted-foreground/40' : 'text-foreground'
            }`}
            style={{
              lineHeight: '1.8',
              caretColor: isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 25%)',
              ...(struck ? {} : isDark ? { textShadow: '0 0 8px hsl(40 60% 70% / 0.3), 0 0 20px hsl(35 50% 60% / 0.15)' } : {}),
            }}
          />
        </div>
      );
    }

    // Text
    return (
      <div key={`txt-${index}`} style={{ lineHeight: '1.8' }}>
        <textarea
          ref={refCb}
          value={line}
          rows={1}
          onChange={(e) => { handleTextChange(index, e.target.value); autoResize(e.target); }}
          onKeyDown={(e) => handleKeyDown(e, index)}
          className="w-full font-playfair text-base sm:text-lg font-light tracking-wide bg-transparent border-none outline-none resize-none overflow-hidden text-foreground"
          style={textStyle}
        />
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Timer alert glow overlay */}
      {timerAlert && (
        <div
          className="fixed inset-0 z-[100] cursor-pointer"
          onClick={() => setTimerAlert(false)}
          style={{ animation: 'timer-glow 3s ease-in-out infinite' }}
        />
      )}

      {/* Header */}
      <div className="flex justify-between items-center p-4 sm:p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-background">
        <span
          className="font-playfair text-xl sm:text-2xl text-foreground tracking-wide"
          style={isDark ? { textShadow: '0 0 20px hsl(40 60% 70% / 0.3), 0 0 40px hsl(35 50% 60% / 0.15)' } : {}}
        >
          ez.
        </span>
        <div className="flex items-center gap-1">
          {mounted && (
            <Button variant="ghost" size="icon" onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="text-muted-foreground hover:text-accent-foreground">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!content.trim()} className="text-muted-foreground hover:text-accent-foreground">
                <Download size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover rounded-xl">
              <DropdownMenuItem onClick={saveAsTxt} className="cursor-pointer">Download as TXT</DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsPdf} className="cursor-pointer">Download as PDF</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
          <Button variant="ghost" size="icon" onClick={() => setInfoOpen(true)} className="text-muted-foreground hover:text-accent-foreground">
            <Info size={18} />
          </Button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={editorRef}
        data-editor-bg="true"
        className="flex-1 px-4 sm:px-8 bg-background flex flex-col cursor-text"
        onClick={handleEditorClick}
      >
        <div className="w-full max-w-none mx-auto flex flex-col h-full" data-editor-bg="true">
          <div className="relative pt-4 sm:pt-6 flex-1 pb-[200px]" data-editor-bg="true">
            {/* Glowing cursor when empty */}
            {!content && (
              <div
                className="absolute top-4 sm:top-6 left-0 pointer-events-none"
                style={{
                  width: '2px', height: '24px',
                  background: isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 30%)',
                  boxShadow: isDark
                    ? '0 0 6px hsl(40 60% 70% / 0.6), 0 0 12px hsl(40 60% 70% / 0.3)'
                    : '0 0 3px hsl(0 0% 30% / 0.3)',
                  animation: 'blink 1s ease-in-out infinite',
                }}
              />
            )}

            {lines.map((line, index) => renderLine(line, index, getLineType(lines, index)))}

            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-accent-foreground rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-70 transition-opacity duration-300">
        <span
          className="font-playfair text-xs sm:text-sm text-foreground tracking-wide pointer-events-auto"
          style={isDark ? { textShadow: '0 0 20px hsl(40 60% 70% / 0.3), 0 0 40px hsl(35 50% 60% / 0.15)' } : {}}
        >
          built by evan :)
        </span>
      </div>

      {/* Slash popup */}
      {slashPopup && filteredCommands.length > 0 && (
        <SlashCommandPopup
          commands={filteredCommands}
          highlightIndex={popupHighlight}
          onSelect={(name) => handleSlashSelect(name)}
          onClose={() => setSlashPopup(null)}
          anchorEl={lineRefs.current.get(slashPopup.lineIndex) || null}
        />
      )}

      {/* Info dialog */}
      <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
};

export default WritingInterface;
