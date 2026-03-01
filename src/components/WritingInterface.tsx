import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, Download } from 'lucide-react';
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
  STRUCK_MARKER, LIST_EXIT, getCleanLine, isLineStruck, getLineType,
  getTimerArgs, SLASH_COMMANDS, INDENT,
  contentToHTML, extractContent, setCursorPosition,
  escapeHTML,
} from './writing-helpers';

const TOTAL_PAGES = 5;

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
  // --- Pages ---
  const pagesRef = useRef<string[]>(null as any);
  if (!pagesRef.current) {
    const saved = localStorage.getItem('zen-writing-pages');
    if (saved) {
      try { pagesRef.current = JSON.parse(saved); } catch { pagesRef.current = Array(TOTAL_PAGES).fill(''); }
    } else {
      const old = localStorage.getItem('zen-writing-content') || '';
      const welcome = old || `hi.\n\ni am evan.\n\nthinking is cool.\nwriting is thinking.\n\ni write. you write. we write.\nwriting today is a slog.\na battle of point sizes, font styles, and colours.\n\nhence, ezwrite.\ni like pen and paper. this is close.\n\nthere isn't much to it.\n/line splits things up.\n/list keeps you on track with checklists.\n/timer pulls up a timer + some more func.\nor just type in "/help" and you'll find all the help you need.\nbtw your data stays on your device.\n\nit's yours now. go write.\n\nto report bugs or just say hi, evanbuildsstuff@gmail.com\n\n-evan`;
      pagesRef.current = [welcome, ...Array(TOTAL_PAGES - 1).fill('')];
    }
    while (pagesRef.current.length < TOTAL_PAGES) pagesRef.current.push('');
  }

  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const contentRef = useRef(pagesRef.current[0]);

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [timerAlert, setTimerAlert] = useState(false);
  const [pageTransition, setPageTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editingTimerLineRef = useRef<number | null>(null);

  // Keep page ref in sync
  useEffect(() => { currentPageRef.current = currentPage; }, [currentPage]);

  // Track timers for portal rendering
  const [timerSlots, setTimerSlots] = useState<Array<{ stableId: string; config: string }>>([]);
  // Persistent portal containers keyed by stableId — survive innerHTML resets
  const timerContainers = useRef<Map<string, HTMLElement>>(new Map());
  const timerStableIds = useRef<Map<string, string>>(new Map());
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

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ rect: DOMRect; filter: string; lineIndex: number } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const isDark = mounted && theme === 'dark';

  // --- Save helper ---
  const saveContent = useCallback((content: string) => {
    contentRef.current = content;
    pagesRef.current[currentPageRef.current] = content;
    localStorage.setItem('zen-writing-pages', JSON.stringify(pagesRef.current));
  }, []);

  // --- Structural re-render ---
  const structuralUpdate = useCallback((content: string, cursorLine?: number, cursorOffset?: number) => {
    saveContent(content);
    if (!editorRef.current) return;

    editorRef.current.innerHTML = contentToHTML(content, {
      editingTimerLine: editingTimerLineRef.current ?? undefined,
    });

    // Find timer slots and re-attach persistent containers
    const lines = content.split('\n');
    const timers: Array<{ stableId: string; config: string }> = [];
    const activeIds = new Set<string>();
    lines.forEach((line, i) => {
      if (getLineType(lines, i) === 'timer' && editingTimerLineRef.current !== i) {
        const config = getTimerArgs(line);
        const idKey = config || '__stopwatch__';
        if (!timerStableIds.current.has(idKey)) {
          timerStableIds.current.set(idKey, `t-${Date.now()}-${Math.random()}`);
        }
        const stableId = timerStableIds.current.get(idKey)!;
        activeIds.add(stableId);
        // Get or create persistent container div
        if (!timerContainers.current.has(stableId)) {
          timerContainers.current.set(stableId, document.createElement('div'));
        }
        // Re-attach container into the fresh slot (innerHTML reset detached it)
        const slot = editorRef.current!.querySelector(`[data-timer-slot="${i}"]`) as HTMLElement;
        if (slot) slot.appendChild(timerContainers.current.get(stableId)!);
        timers.push({ stableId, config });
      }
    });
    // Clean up containers for removed timers
    timerStableIds.current.forEach((stableId, key) => {
      if (!activeIds.has(stableId)) {
        timerContainers.current.delete(stableId);
        timerStableIds.current.delete(key);
      }
    });
    setTimerSlots(timers);

    // Restore cursor
    if (cursorLine !== undefined) {
      requestAnimationFrame(() => {
        if (editorRef.current) {
          editorRef.current.focus({ preventScroll: true });
          setCursorPosition(editorRef.current, cursorLine, cursorOffset ?? 0);
        }
      });
    }
  }, [saveContent]);

  // --- Mount ---
  useEffect(() => {
    setMounted(true);
    if (editorRef.current) {
      structuralUpdate(contentRef.current, 0, 0);
      setTimeout(() => {
        editorRef.current?.focus();
        const lines = contentRef.current.split('\n');
        const lastLine = lines.length - 1;
        const lastLen = lines[lastLine]?.length || 0;
        if (editorRef.current) setCursorPosition(editorRef.current, lastLine, lastLen);
      }, 100);
    }
  }, []);

  // --- Page switching ---
  const switchToPage = useCallback((newPage: number) => {
    if (newPage < 0 || newPage >= TOTAL_PAGES || newPage === currentPageRef.current) return;
    // Save current page
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      localStorage.setItem('zen-writing-pages', JSON.stringify(pagesRef.current));
    }
    // Clear timer editing
    editingTimerLineRef.current = null;
    // Clear undo/redo for new page
    undoStack.current = [];
    redoStack.current = [];
    // Transition animation
    setPageTransition(newPage > currentPageRef.current ? 'slide-left' : 'slide-right');
    contentRef.current = pagesRef.current[newPage];
    setCurrentPage(newPage);
  }, []);

  // Load page content when currentPage changes (not on mount)
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    structuralUpdate(pagesRef.current[currentPage], 0, 0);
    setTimeout(() => {
      editorRef.current?.focus();
      setPageTransition('none');
    }, 250);
  }, [currentPage, structuralUpdate]);

  // --- Touch swipe ---
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0) switchToPage(currentPageRef.current + 1);
      else switchToPage(currentPageRef.current - 1);
    }
  };

  // --- Trackpad two-finger horizontal swipe ---
  const wheelAccum = useRef(0);
  const wheelTimeout = useRef<NodeJS.Timeout>();
  const wheelCooldown = useRef(false);
  const handleWheel = (e: React.WheelEvent) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY) * 2) return;
    if (Math.abs(e.deltaX) < 5) return;
    if (wheelCooldown.current) return;
    wheelAccum.current += e.deltaX;
    if (wheelTimeout.current) clearTimeout(wheelTimeout.current);
    wheelTimeout.current = setTimeout(() => { wheelAccum.current = 0; }, 200);
    if (wheelAccum.current > 100) {
      switchToPage(currentPageRef.current + 1);
      wheelAccum.current = 0;
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 600);
    } else if (wheelAccum.current < -100) {
      switchToPage(currentPageRef.current - 1);
      wheelAccum.current = 0;
      wheelCooldown.current = true;
      setTimeout(() => { wheelCooldown.current = false; }, 600);
    }
  };

  const triggerTyping = () => {
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
  };

  const scrollToLine = (lineIndex: number) => {
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      const lineNode = editorRef.current.childNodes[lineIndex] as HTMLElement;
      if (!lineNode) return;
      const rect = lineNode.getBoundingClientRect();
      const lineHeight = 32;
      const bottomTarget = rect.bottom + lineHeight * 3;
      if (bottomTarget > window.innerHeight) {
        window.scrollBy({ top: bottomTarget - window.innerHeight + 16, behavior: 'smooth' });
      }
    });
  };

  // Click anywhere to focus editor
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target === containerRef.current || target.dataset?.editorBg === 'true') {
      editorRef.current?.focus();
      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      setCursorPosition(editorRef.current!, lastLine, lines[lastLine]?.length || 0);
    }
  };

  // Handle clicks inside editor (checkboxes, delete buttons)
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    if (!action) return;

    const lineIndex = parseInt(target.dataset.line || '0');
    if (action === 'toggle') {
      e.preventDefault();
      const lines = contentRef.current.split('\n');
      lines[lineIndex] = isLineStruck(lines[lineIndex])
        ? getCleanLine(lines[lineIndex])
        : STRUCK_MARKER + getCleanLine(lines[lineIndex]);
      pushUndo(true);
      structuralUpdate(lines.join('\n'));
    }
    if (action === 'delete') {
      e.preventDefault();
      pushUndo(true);
      const lines = contentRef.current.split('\n');
      lines.splice(lineIndex, 1);
      if (!lines.length) lines.push('');
      structuralUpdate(lines.join('\n'), Math.min(lineIndex, lines.length - 1), 0);
    }
  };

  // Timer completion
  const handleTimerComplete = useCallback(() => {
    playChime();
    setTimerAlert(true);
  }, []);

  // --- Get cursor info directly from DOM ---
  const getCursorInfo = () => {
    if (!editorRef.current) return null;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;

    let lineDiv: Node | null = sel.anchorNode;
    let cursorAtContainerLevel = false;
    // If cursor is directly on the editor container, pick the child at anchorOffset
    if (lineDiv === editorRef.current) {
      cursorAtContainerLevel = true;
      lineDiv = editorRef.current.childNodes[sel.anchorOffset] as Node
        ?? editorRef.current.lastChild;
    } else {
      while (lineDiv && lineDiv.parentNode !== editorRef.current) {
        lineDiv = lineDiv.parentNode;
      }
    }
    if (!lineDiv) return null;

    const lineIndex = Array.from(editorRef.current.childNodes).indexOf(lineDiv as ChildNode);
    if (lineIndex < 0) return null;

    const el = lineDiv as HTMLElement;

    // When anchorNode is the editor container itself, offset within the line is 0
    if (cursorAtContainerLevel) {
      return { lineIndex, offset: 0, lineDiv: el };
    }

    let textContainer: Node = lineDiv;
    if (el.dataset?.type === 'list-item') {
      const textSpan = el.querySelector('.ce-li-text');
      if (textSpan) textContainer = textSpan;
    }

    const range = document.createRange();
    range.selectNodeContents(textContainer);
    range.setEnd(sel.anchorNode!, sel.anchorOffset);
    const offset = range.toString().length;

    return { lineIndex, offset, lineDiv: el };
  };

  // Handle input (text-only changes from user typing)
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    const newContent = extractContent(editorRef.current);
    saveContent(newContent);
    triggerTyping();

    // Check for slash commands
    const info = getCursorInfo();
    if (info) {
      const lines = newContent.split('\n');
      const lineText = lines[info.lineIndex] || '';
      const trimmed = lineText.trim();
      if (/^\/\w{0,10}$/.test(trimmed)) {
        const filter = trimmed.slice(1);
        const matches = SLASH_COMMANDS.filter(c => c.name.startsWith(filter.toLowerCase()));
        if (matches.length > 0) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            setSlashPopup({ rect, filter, lineIndex: info.lineIndex });
            setPopupHighlight(0);
          }
          return;
        }
      }
      // Check for /x at end of list item line
      const lineType = getLineType(lines, info.lineIndex);
      if (lineType === 'list-item' && trimmed.endsWith('/x')) {
        pushUndo(true);
        const clean = getCleanLine(lines[info.lineIndex]);
        const withoutX = clean.replace(/\/x\s*$/, '').trimEnd();
        const wasStruck = isLineStruck(lines[info.lineIndex]);
        lines[info.lineIndex] = wasStruck ? withoutX : STRUCK_MARKER + withoutX;
        structuralUpdate(lines.join('\n'), info.lineIndex, withoutX.length);
        return;
      }

      scrollToLine(info.lineIndex);
    }

    if (slashPopup) setSlashPopup(null);
  }, [slashPopup, pushUndo, structuralUpdate, saveContent]);

  // Slash command select
  const handleSlashSelect = useCallback((command: string) => {
    if (!slashPopup) return;
    const { lineIndex } = slashPopup;
    const lines = contentRef.current.split('\n');
    pushUndo(true);
    if (command === 'help') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0);
      setInfoOpen(true);
    } else if (command === 'timer') {
      lines[lineIndex] = 'timer ';
      editingTimerLineRef.current = lineIndex;
      structuralUpdate(lines.join('\n'), lineIndex, 6);
    } else {
      lines[lineIndex] = command;
      if (lineIndex >= lines.length - 1) lines.push('');
      structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
    }
    setSlashPopup(null);
  }, [slashPopup, pushUndo, structuralUpdate]);

  const filteredCommands = slashPopup
    ? SLASH_COMMANDS.filter(c => c.name.startsWith(slashPopup.filter.toLowerCase()))
    : [];

  useEffect(() => {
    if (slashPopup && filteredCommands.length === 0) setSlashPopup(null);
  }, [slashPopup, filteredCommands.length]);

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    const info = getCursorInfo();

    // Popup nav
    if (slashPopup) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopupHighlight(h => Math.min(h + 1, filteredCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopupHighlight(h => Math.max(h - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[popupHighlight]) handleSlashSelect(filteredCommands[popupHighlight].name); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashPopup(null); return; }
      const num = parseInt(e.key);
      if (!isNaN(num) && num >= 1 && num <= filteredCommands.length) {
        e.preventDefault();
        handleSlashSelect(filteredCommands[num - 1].name);
        return;
      }
    }

    // Always prevent Enter/Tab from reaching the browser's contentEditable handler,
    // even if cursor info is unavailable — native handling corrupts the DOM structure.
    if (!info) {
      if (e.key === 'Enter') {
        e.preventDefault();
        pushUndo(true);
        const lines = contentRef.current.split('\n');
        lines.push('');
        structuralUpdate(lines.join('\n'), lines.length - 1, 0);
      }
      if (e.key === 'Tab') e.preventDefault();
      return;
    }
    const { lineIndex, offset } = info;
    const lines = contentRef.current.split('\n');

    // Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
      e.preventDefault();
      if (undoStack.current.length) {
        redoStack.current.push(contentRef.current);
        structuralUpdate(undoStack.current.pop()!, lineIndex, offset);
      }
      return;
    }
    // Ctrl+Shift+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && ((e.key === 'z' && e.shiftKey) || e.key === 'y')) {
      e.preventDefault();
      if (redoStack.current.length) {
        undoStack.current.push(contentRef.current);
        structuralUpdate(redoStack.current.pop()!, lineIndex, offset);
      }
      return;
    }

    // Tab - 8 space indent
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      pushUndo(true);
      document.execCommand('insertText', false, INDENT);
      requestAnimationFrame(() => {
        if (editorRef.current) {
          saveContent(extractContent(editorRef.current));
        }
      });
      return;
    }

    // Backspace at start - unindent if indented
    if (e.key === 'Backspace' && offset === 0) {
      const lineText = lines[lineIndex] || '';
      const lineType = getLineType(lines, lineIndex);
      const cleanLine = lineType === 'list-item' ? getCleanLine(lineText) : lineText;
      if (cleanLine.startsWith(INDENT)) {
        e.preventDefault();
        pushUndo(true);
        if (lineType === 'list-item') {
          const struck = isLineStruck(lineText);
          const newClean = cleanLine.slice(INDENT.length);
          lines[lineIndex] = struck ? STRUCK_MARKER + newClean : newClean;
        } else {
          lines[lineIndex] = lineText.slice(INDENT.length);
        }
        structuralUpdate(lines.join('\n'), lineIndex, 0);
        return;
      }
    }

    // Alt+Arrow move line
    if (e.altKey && e.key === 'ArrowUp') {
      e.preventDefault();
      if (lineIndex > 0) {
        pushUndo(true);
        const freshContent = extractContent(editorRef.current!);
        const freshLines = freshContent.split('\n');
        [freshLines[lineIndex], freshLines[lineIndex - 1]] = [freshLines[lineIndex - 1], freshLines[lineIndex]];
        structuralUpdate(freshLines.join('\n'), lineIndex - 1, offset);
      }
      return;
    }
    if (e.altKey && e.key === 'ArrowDown') {
      e.preventDefault();
      if (lineIndex < lines.length - 1) {
        pushUndo(true);
        const freshContent = extractContent(editorRef.current!);
        const freshLines = freshContent.split('\n');
        [freshLines[lineIndex], freshLines[lineIndex + 1]] = [freshLines[lineIndex + 1], freshLines[lineIndex]];
        structuralUpdate(freshLines.join('\n'), lineIndex + 1, offset);
      }
      return;
    }

    // Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      pushUndo(true);

      const freshContent = extractContent(editorRef.current!);
      const freshLines = freshContent.split('\n');

      // Recompute cursor info from fresh content
      const li = Math.min(lineIndex, freshLines.length - 1);
      const currentLine = freshLines[li] || '';

      // Timer editing mode
      if (editingTimerLineRef.current === li) {
        // Finalize timer
        editingTimerLineRef.current = null;
        if (li >= freshLines.length - 1) freshLines.push('');
        structuralUpdate(freshLines.join('\n'), li + 1, 0);
        scrollToLine(li + 1);
        return;
      }

      // Check for /x at end of list item before splitting
      const lineType = getLineType(freshLines, li);
      const cleanLine = getCleanLine(currentLine);
      if (lineType === 'list-item' && cleanLine.trimEnd().endsWith('/x')) {
        const withoutX = cleanLine.replace(/\/x\s*$/, '').trimEnd();
        const wasStruck = isLineStruck(currentLine);
        freshLines[li] = wasStruck ? withoutX : STRUCK_MARKER + withoutX;
        structuralUpdate(freshLines.join('\n'), li, withoutX.length);
        return;
      }

      // Normal enter - split line at offset
      const clampedOffset = Math.min(offset, currentLine.length);
      // For list items, offset is within clean text
      if (lineType === 'list-item') {
        const clean = getCleanLine(currentLine);
        // Enter on empty list item → exit list using invisible marker
        if (!clean.trim()) {
          freshLines.splice(li, 1, LIST_EXIT);
          structuralUpdate(freshLines.join('\n'), li, 0);
          scrollToLine(li);
          return;
        }
        const struck = isLineStruck(currentLine);
        const off = Math.min(offset, clean.length);
        freshLines[li] = struck ? STRUCK_MARKER + clean.slice(0, off) : clean.slice(0, off);
        freshLines.splice(li + 1, 0, clean.slice(off));
      } else if (currentLine.startsWith(LIST_EXIT)) {
        // Keep marker pinned to this line; split only the visible text after it
        const visible = currentLine.slice(LIST_EXIT.length);
        const visOff = Math.max(0, clampedOffset - LIST_EXIT.length);
        freshLines[li] = LIST_EXIT + visible.slice(0, visOff);
        freshLines.splice(li + 1, 0, visible.slice(visOff));
      } else {
        freshLines[li] = currentLine.slice(0, clampedOffset);
        freshLines.splice(li + 1, 0, currentLine.slice(clampedOffset));
      }
      structuralUpdate(freshLines.join('\n'), li + 1, 0);
      scrollToLine(li + 1);
      return;
    }

    // Escape timer editing
    if (e.key === 'Escape' && editingTimerLineRef.current === lineIndex) {
      e.preventDefault();
      const freshLines = extractContent(editorRef.current!).split('\n');
      freshLines.splice(lineIndex, 1);
      if (!freshLines.length) freshLines.push('');
      editingTimerLineRef.current = null;
      structuralUpdate(freshLines.join('\n'), Math.max(0, lineIndex - 1), 0);
    }
  };

  // Before input: push undo for content changes
  const handleBeforeInput = useCallback(() => {
    pushUndo();
  }, [pushUndo]);

  // Exports
  const cleanForExport = (line: string) => {
    if (isLineStruck(line)) return '[x] ' + getCleanLine(line);
    return line;
  };

  const saveAsMd = () => {
    const content = contentRef.current;
    if (!content.trim()) return;
    const lines = content.split('\n');
    const exported = lines.map((line, i) => {
      const type = getLineType(lines, i);
      if (type === 'divider') return '---';
      if (type === 'timer' || type === 'list-header') return '';
      if (type === 'list-item') {
        const struck = isLineStruck(line);
        const clean = getCleanLine(line);
        return struck ? `- [x] ${clean}` : `- [ ] ${clean}`;
      }
      return line.startsWith(LIST_EXIT) ? line.slice(LIST_EXIT.length) : line;
    }).filter((line, i, arr) => !(line === '' && arr[i - 1] === ''))
      .join('\n').trim();
    const blob = new Blob([exported], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `ezwrite-${new Date().toISOString().split('T')[0]}.md`;
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const saveAsPdf = () => {
    const content = contentRef.current;
    if (!content.trim()) return;
    const lines = content.split('\n');
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
      if (type === 'heading1') {
        pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
        const text = line.replace(/^#\s*/, '');
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(text, margin, y); y += lh * 1.8;
        pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
        return;
      }
      if (type === 'heading2') {
        pdf.setFontSize(15); pdf.setFont('helvetica', 'bold');
        const text = line.replace(/^##\s*/, '');
        if (y > pageH - margin) { pdf.addPage(); y = margin; }
        pdf.text(text, margin, y); y += lh * 1.5;
        pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
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

  // Editor styles
  const editorStyle: React.CSSProperties = {
    lineHeight: '1.8',
    caretColor: isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 25%)',
    outline: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    ...(isDark ? { textShadow: '0 0 10px hsl(40 60% 70% / 0.35), 0 0 25px hsl(35 50% 60% / 0.18)' } : {}),
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
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
        <div className="flex items-center gap-3">
          {mounted && (
            <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} className="text-muted-foreground hover:text-foreground transition-colors">
              {theme === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
            </button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={!contentRef.current.trim()} className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                <Download size={16} />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover rounded-xl">
              <DropdownMenuItem onClick={saveAsPdf} className="cursor-pointer">Download as PDF</DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsMd} className="cursor-pointer">Download as Markdown</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={containerRef}
        data-editor-bg="true"
        className="flex-1 px-4 sm:px-8 bg-background flex flex-col cursor-text"
        onClick={handleContainerClick}
      >
        <div className="w-full max-w-none mx-auto flex flex-col h-full" data-editor-bg="true">
          <div
            className={`relative pt-4 sm:pt-6 flex-1 pb-[200px] ${
              pageTransition === 'slide-left' ? 'animate-slide-left' :
              pageTransition === 'slide-right' ? 'animate-slide-right' : ''
            }`}
            data-editor-bg="true"
          >
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              onKeyDown={handleKeyDown}
              onBeforeInput={handleBeforeInput}
              onClick={handleEditorClick}
              className="font-playfair text-base sm:text-lg font-light tracking-wide text-foreground ce-editor"
              style={editorStyle}
              spellCheck={false}
            />

            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-accent-foreground rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="fixed bottom-3 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-70 transition-opacity duration-300">
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
          rect={slashPopup.rect}
        />
      )}

      {/* Timer portals */}
      {timerSlots.map(({ stableId, config }) => {
        const container = timerContainers.current.get(stableId);
        if (!container) return null;
        return createPortal(
          <TimerWidget
            key={stableId}
            config={config}
            onRemove={() => {
              pushUndo(true);
              const ls = contentRef.current.split('\n');
              const lineIndex = ls.findIndex((l, i) => getLineType(ls, i) === 'timer' && (getTimerArgs(l) || '__stopwatch__') === (config || '__stopwatch__'));
              if (lineIndex >= 0) {
                ls.splice(lineIndex, 1);
                if (!ls.length) ls.push('');
                structuralUpdate(ls.join('\n'), Math.min(lineIndex, ls.length - 1), 0);
              }
            }}
            onComplete={handleTimerComplete}
          />,
          container
        );
      })}

      {/* Info dialog */}
      <InfoDialog open={infoOpen} onOpenChange={setInfoOpen} />
    </div>
  );
};

export default WritingInterface;
