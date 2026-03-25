import React, { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Sun, Moon, Download, Palette } from 'lucide-react';
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
  contentToMarkdown,
} from './writing-helpers';
import {
  isFileSystemSupported, getSavedHandle, pickSaveDirectory,
  writePageFiles, clearHandle, getDirName, writeToOPFS,
} from '@/lib/storage';

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

const DEFAULT_PAGE_CONTENT = 'start writing.';

const getDefaultPage = (index: number): string => {
  if (index === 0) return DEFAULT_PAGE_CONTENT;
  return DEFAULT_PAGE_CONTENT;
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
      const welcome = old || `hi.\n\ni am evan.\n\nthinking is cool.\nwriting is thinking.\n\nwe all write.\nwriting today is a slog.\na battle of point sizes, font styles, and colours.\n\nhence, ezwrite.\ni like pen and paper. this is close.\n\nthere isn't much to it.\n/line splits things up.\n/list keeps you on track with checklists.\n/timer pulls up a timer + some more func.\nor just type in "/help" and you'll find all the help you need.\nbtw your data stays on your device.\n\nit's yours now. go write.\n\nto report bugs or just say hi, evanbuildsstuff@gmail.com\n\n-evan`;
      pagesRef.current = [welcome, ...Array(TOTAL_PAGES - 1).fill('start writing.')];
    }
    while (pagesRef.current.length < TOTAL_PAGES) pagesRef.current.push('');
  }

  const getPageContent = (index: number): string =>
    pagesRef.current[index] || getDefaultPage(index);

  const [currentPage, setCurrentPage] = useState(0);
  const currentPageRef = useRef(0);
  const contentRef = useRef(getPageContent(0));

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [timerAlert, setTimerAlert] = useState(false);
  const [pageTransition, setPageTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editingTimerLineRef = useRef<number | null>(null);

  // Page dots — show briefly on page switch
  const [showDots, setShowDots] = useState(false);
  const dotsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Color theme toggle — cycles: '' → 'blue' → 'green' → 'red' → ''
  const COLOR_THEMES = ['', 'blue', 'green', 'red'] as const;
  const [colorTheme, setColorTheme] = useState<string>(() =>
    localStorage.getItem('ezwrite-color-theme') || ''
  );
  useEffect(() => {
    if (colorTheme) {
      document.documentElement.setAttribute('data-color-theme', colorTheme);
    } else {
      document.documentElement.removeAttribute('data-color-theme');
    }
  }, [colorTheme]);
  const handleToggleColorTheme = () => {
    setColorTheme(v => {
      const next = COLOR_THEMES[(COLOR_THEMES.indexOf(v as typeof COLOR_THEMES[number]) + 1) % COLOR_THEMES.length];
      localStorage.setItem('ezwrite-color-theme', next);
      return next;
    });
  };

  // Spellcheck toggle (persisted)
  const [spellCheckEnabled, setSpellCheckEnabled] = useState(() =>
    localStorage.getItem('ezwrite-spellcheck') === 'true'
  );
  const handleToggleSpellCheck = () => {
    setSpellCheckEnabled(v => {
      const next = !v;
      localStorage.setItem('ezwrite-spellcheck', String(next));
      return next;
    });
  };

  // Font toggle (persisted)
  const [useSerif, setUseSerif] = useState(() =>
    localStorage.getItem('ezwrite-font') !== 'mono'
  );
  const handleToggleFont = () => {
    setUseSerif(v => {
      const next = !v;
      localStorage.setItem('ezwrite-font', next ? 'serif' : 'mono');
      return next;
    });
  };

  // PWA install prompt
  const [installPrompt, setInstallPrompt] = useState<any>(null);
  useEffect(() => {
    const handler = (e: Event) => { e.preventDefault(); setInstallPrompt(e); };
    window.addEventListener('beforeinstallprompt', handler);
    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);
  const handleInstall = installPrompt ? async () => {
    installPrompt.prompt();
    await installPrompt.userChoice;
    setInstallPrompt(null);
  } : undefined;

  // File System Access API — desktop save folder
  const [dirHandle, setDirHandle] = useState<FileSystemDirectoryHandle | null>(null);
  const dirHandleRef = useRef<FileSystemDirectoryHandle | null>(null);
  useEffect(() => {
    if (!isFileSystemSupported()) return;
    getSavedHandle().then(h => {
      if (h) { setDirHandle(h); dirHandleRef.current = h; }
    });
  }, []);

  const handlePickFolder = async () => {
    const h = await pickSaveDirectory();
    if (h) {
      setDirHandle(h);
      dirHandleRef.current = h;
      // Write all pages immediately after picking
      const markdowns = pagesRef.current.map(p => contentToMarkdown(p));
      writePageFiles(h, markdowns);
    }
  };

  const handleClearFolder = async () => {
    await clearHandle();
    setDirHandle(null);
    dirHandleRef.current = null;
  };

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
    redoStack.current = [];
    lastUndoTime.current = now;
  }, []);

  // Image resize
  const resizingRef = useRef<{ lineIndex: number; startX: number; startWidth: number; imgEl: HTMLImageElement; lineEl: HTMLElement } | null>(null);

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ rect: DOMRect; filter: string; lineIndex: number } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const isDark = mounted && theme === 'dark';

  // --- Save helper ---
  const saveContent = useCallback((content: string) => {
    contentRef.current = content;
    pagesRef.current[currentPageRef.current] = content;
    const serialized = JSON.stringify(pagesRef.current);
    localStorage.setItem('zen-writing-pages', serialized);
    // Write per-page .md files to chosen folder (desktop File System API)
    if (dirHandleRef.current) {
      const markdowns = pagesRef.current.map(p => contentToMarkdown(p));
      writePageFiles(dirHandleRef.current, markdowns);
    }
    // Also auto-write to OPFS (origin private file system — no permission needed)
    writeToOPFS(pagesRef.current);
  }, []);

  // Image resize mouse handlers (declared after saveContent/pushUndo to avoid TDZ)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { startX, startWidth, imgEl, lineEl } = resizingRef.current;
      const newWidth = Math.max(50, startWidth + (e.clientX - startX));
      imgEl.style.width = newWidth + 'px';
      imgEl.style.maxWidth = '100%';
      lineEl.dataset.width = String(Math.round(newWidth));
    };
    const handleMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      if (editorRef.current) { pushUndo(true); saveContent(extractContent(editorRef.current)); }
    };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    return () => { document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', handleMouseUp); };
  }, [pushUndo, saveContent]);

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

    // Restore cursor synchronously when editor is focused (prevents race with next keydown)
    if (cursorLine !== undefined) {
      if (document.activeElement === editorRef.current) {
        setCursorPosition(editorRef.current, cursorLine, cursorOffset ?? 0);
      }
      // RAF for focus + re-place cursor (handles mount, page switch, non-focused cases)
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
    // Show dots briefly
    setShowDots(true);
    clearTimeout(dotsTimeoutRef.current);
    dotsTimeoutRef.current = setTimeout(() => setShowDots(false), 500);
    // Transition animation
    setPageTransition(newPage > currentPageRef.current ? 'slide-left' : 'slide-right');
    contentRef.current = getPageContent(newPage);
    setCurrentPage(newPage);
  }, []);

  // Load page content when currentPage changes (not on mount)
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    structuralUpdate(getPageContent(currentPage), 0, 0);
    setTimeout(() => {
      editorRef.current?.focus();
      setPageTransition('none');
    }, 250);
  }, [currentPage, structuralUpdate]);

  // --- Touch swipe ---
  const touchStartX = useRef(0);
  const touchStartY = useRef(0);
  const touchHasSelection = useRef(false);
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
    touchStartY.current = e.touches[0].clientY;
    touchHasSelection.current = false;
  };
  const handleTouchMove = () => {
    if (window.getSelection()?.toString()) {
      touchHasSelection.current = true;
    }
  };
  const handleTouchEnd = (e: React.TouchEvent) => {
    const hadSelection = touchHasSelection.current;
    touchHasSelection.current = false;
    // Don't trigger page switch if user was selecting text
    if (hadSelection || window.getSelection()?.toString()) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    if (Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 60) {
      if (dx < 0) switchToPage(currentPageRef.current + 1);
      else switchToPage(currentPageRef.current - 1);
    }
  };

  // --- Trackpad two-finger horizontal swipe ---
  const wheelAccum = useRef(0);
  const wheelTimeout = useRef<ReturnType<typeof setTimeout>>();
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
      lineNode.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    });
  };

  // Click anywhere to focus editor
  const handleContainerClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (editorRef.current?.contains(target)) return;
    if (target === containerRef.current || target.dataset?.editorBg === 'true') {
      editorRef.current?.focus();
      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      setCursorPosition(editorRef.current!, lastLine, lines[lastLine]?.length || 0);
    }
  };

  // Handle mousedown for image resize handles
  const handleEditorMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action !== 'resize') return;
    e.preventDefault();
    const lineIndex = parseInt(target.dataset.line || '0');
    const lineEl = editorRef.current?.childNodes[lineIndex] as HTMLElement | undefined;
    const imgEl = lineEl?.querySelector('img') as HTMLImageElement | null;
    if (!imgEl || !lineEl) return;
    resizingRef.current = { lineIndex, startX: e.clientX, startWidth: imgEl.offsetWidth, imgEl, lineEl };
  };

  // Handle clicks inside editor (checkboxes, delete buttons)
  const handleEditorClick = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    const action = target.dataset.action;
    if (!action || action === 'resize') return;

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
    const range = sel.getRangeAt(0);

    const children = Array.from(editorRef.current.childNodes) as HTMLElement[];
    let foundIdx = -1;
    let foundEl: HTMLElement | null = null;

    if (range.startContainer === editorRef.current) {
      // Cursor at container level: startOffset N means cursor is AFTER child N-1
      foundIdx = Math.max(0, Math.min(range.startOffset > 0 ? range.startOffset - 1 : 0, children.length - 1));
      foundEl = children[foundIdx] || null;
    } else {
      for (let i = 0; i < children.length; i++) {
        if (children[i].contains(range.startContainer)) {
          foundIdx = i;
          foundEl = children[i];
          break;
        }
      }
    }

    if (foundIdx < 0 || !foundEl) return null;

    // For list-items, measure offset within the text span
    let textContainer: Node = foundEl;
    if (foundEl.dataset?.type === 'list-item') {
      const textSpan = foundEl.querySelector('.ce-li-text');
      if (textSpan) textContainer = textSpan;
    }

    let offset = 0;
    try {
      const lineRange = document.createRange();
      lineRange.selectNodeContents(textContainer);
      lineRange.setEnd(range.startContainer, range.startOffset);
      offset = lineRange.toString().length;
    } catch {
      // If cursor is at container level after this child, offset = full length
      if (range.startContainer === editorRef.current) {
        offset = range.startOffset > foundIdx ? (foundEl.textContent?.length ?? 0) : 0;
      }
    }

    // Adjust for indent prefix stripped from display (applies to text and list-item with data-indent)
    if (foundEl.dataset?.indent) {
      offset += parseInt(foundEl.dataset.indent) * INDENT.length;
    }

    return { lineIndex: foundIdx, offset, lineDiv: foundEl };
  };

  // Handle input (text-only changes from user typing)
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    let newContent = extractContent(editorRef.current);

    // Bug 12: strip lone leading spaces (mobile keyboard artifact) — preserve INDENT (8 spaces)
    const stripped = newContent.split('\n').map(line =>
      line.startsWith(' ') && !line.startsWith(INDENT) ? line.trimStart() : line
    ).join('\n');
    if (stripped !== newContent) {
      newContent = stripped;
    }

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
            if (!slashPopup) setPopupHighlight(0); // only reset highlight when popup first opens
            setSlashPopup({ rect, filter, lineIndex: info.lineIndex });
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

      // Bug 18: immediate header activation — re-render if line type changed without Enter
      const lineEl = editorRef.current?.childNodes[info.lineIndex] as HTMLElement | undefined;
      const domType = lineEl?.dataset?.type;
      const computedType = getLineType(lines, info.lineIndex);
      if (domType && domType !== computedType) {
        structuralUpdate(newContent, info.lineIndex, info.offset);
        return;
      }

      // Re-render indented lines so padding-left applies live while typing
      const currentLineText = lines[info.lineIndex] || '';
      const currentIndentLevel = (() => {
        let l = currentLineText; let n = 0;
        while (l.startsWith(INDENT)) { n++; l = l.slice(INDENT.length); }
        return n;
      })();
      const domIndent = lineEl ? parseInt(lineEl.dataset.indent || '0') || 0 : 0;
      if (currentIndentLevel !== domIndent) {
        structuralUpdate(newContent, info.lineIndex, info.offset);
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
    // Bug 7: use fresh DOM content instead of potentially stale contentRef
    const lines = editorRef.current ? extractContent(editorRef.current).split('\n') : contentRef.current.split('\n');
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
      // For /list: collapse consecutive empty lines below to prevent multiple empty checkboxes
      if (command === 'list') {
        let next = lineIndex + 1;
        while (next + 1 < lines.length && lines[next] === '' && lines[next + 1] === '') {
          lines.splice(next, 1);
        }
      }
      if (lineIndex >= lines.length - 1) lines.splice(lineIndex + 1, 0, '');
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

    // Backspace at start - unindent, exit list, or remove list header
    if (e.key === 'Backspace' && offset === 0) {
      const lineText = lines[lineIndex] || '';
      const lineType = getLineType(lines, lineIndex);
      const cleanLine = lineType === 'list-item' ? getCleanLine(lineText) : lineText;

      // Bug 8a: Backspace on empty list-item exits the list
      if (lineType === 'list-item' && !cleanLine.trim()) {
        e.preventDefault();
        pushUndo(true);
        lines.splice(lineIndex, 1, LIST_EXIT);
        structuralUpdate(lines.join('\n'), lineIndex, 0);
        return;
      }

      // Bug 8b: Backspace at start of line immediately after list header removes the header
      if (lineIndex > 0 && getLineType(lines, lineIndex - 1) === 'list-header') {
        e.preventDefault();
        pushUndo(true);
        lines.splice(lineIndex - 1, 1);
        structuralUpdate(lines.join('\n'), lineIndex - 1, 0);
        return;
      }

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

    // Auto-close brackets: (), [], {}
    const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    if (BRACKET_PAIRS[e.key]) {
      e.preventDefault();
      document.execCommand('insertText', false, e.key + BRACKET_PAIRS[e.key]);
      const sel = window.getSelection();
      if (sel?.rangeCount) {
        const r = sel.getRangeAt(0);
        r.setStart(r.startContainer, r.startOffset - 1);
        r.collapse(true);
        sel.removeAllRanges();
        sel.addRange(r);
      }
      saveContent(extractContent(editorRef.current!));
      return;
    }

    // Item 19: auto-close double quotes, position cursor between them
    if (e.key === '"') {
      e.preventDefault();
      document.execCommand('insertText', false, '""');
      const sel = window.getSelection();
      if (sel && sel.rangeCount) {
        const range = sel.getRangeAt(0);
        range.setStart(range.startContainer, Math.max(0, range.startOffset - 1));
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
      }
      saveContent(extractContent(editorRef.current!));
      return;
    }

    // Enter
    if (e.key === 'Enter') {
      e.preventDefault();
      pushUndo(true);

      const freshContent = extractContent(editorRef.current!);
      const freshLines = freshContent.split('\n');
      const freshOffset = offset;
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

      // Item 17: auto-continue bullet/numbered lists (plain-text style, not /list checkboxes)
      if (lineType !== 'list-item') {
        const bulletMatch = currentLine.match(/^(\s*- )(.*)/);
        const numberedMatch = currentLine.match(/^(\s*)(\d+)\. (.*)/);
        if (bulletMatch) {
          const prefix = bulletMatch[1];
          const text = bulletMatch[2];
          if (!text.trim()) {
            // Empty bullet line → end the list, remove prefix
            freshLines[li] = '';
            structuralUpdate(freshLines.join('\n'), li, 0);
            scrollToLine(li);
            return;
          }
          const splitAt = Math.max(0, Math.min(freshOffset, currentLine.length) - prefix.length);
          freshLines[li] = prefix + text.slice(0, splitAt);
          freshLines.splice(li + 1, 0, prefix + text.slice(splitAt));
          structuralUpdate(freshLines.join('\n'), li + 1, prefix.length);
          scrollToLine(li + 1);
          return;
        }
        if (numberedMatch) {
          const indent = numberedMatch[1];
          const num = parseInt(numberedMatch[2]);
          const text = numberedMatch[3];
          const fullPrefix = `${indent}${num}. `;
          if (!text.trim()) {
            // Empty numbered line → end the list, remove prefix
            freshLines[li] = '';
            structuralUpdate(freshLines.join('\n'), li, 0);
            scrollToLine(li);
            return;
          }
          const splitAt = Math.max(0, Math.min(freshOffset, currentLine.length) - fullPrefix.length);
          const nextPrefix = `${indent}${num + 1}. `;
          freshLines[li] = fullPrefix + text.slice(0, splitAt);
          freshLines.splice(li + 1, 0, nextPrefix + text.slice(splitAt));
          structuralUpdate(freshLines.join('\n'), li + 1, nextPrefix.length);
          scrollToLine(li + 1);
          return;
        }
      }

      // Normal enter - split line at offset
      const clampedOffset = Math.min(freshOffset, currentLine.length);
      // For list items, offset is within clean text (with indent adjustment from getCursorInfo)
      if (lineType === 'list-item') {
        const clean = getCleanLine(currentLine); // includes INDENT prefix if any
        // Compute indent prefix from clean
        let listIndentLevel = 0;
        let cleanNoIndent = clean;
        while (cleanNoIndent.startsWith(INDENT)) { listIndentLevel++; cleanNoIndent = cleanNoIndent.slice(INDENT.length); }
        const listIndentPrefix = INDENT.repeat(listIndentLevel);
        // Enter on empty list item → exit list using invisible marker
        if (!cleanNoIndent.trim()) {
          freshLines.splice(li, 1, LIST_EXIT);
          structuralUpdate(freshLines.join('\n'), li, 0);
          scrollToLine(li);
          return;
        }
        const struck = isLineStruck(currentLine);
        const off = Math.min(freshOffset, clean.length);
        freshLines[li] = struck ? STRUCK_MARKER + clean.slice(0, off) : clean.slice(0, off);
        // New line carries indent prefix + text after cursor
        freshLines.splice(li + 1, 0, listIndentPrefix + clean.slice(off));
      } else if (currentLine.startsWith(LIST_EXIT)) {
        // Keep marker pinned to this line; split only the visible text after it
        const visible = currentLine.slice(LIST_EXIT.length);
        const visOff = Math.max(0, clampedOffset - LIST_EXIT.length);
        freshLines[li] = LIST_EXIT + visible.slice(0, visOff);
        freshLines.splice(li + 1, 0, visible.slice(visOff));
      } else {
        // Carry INDENT prefix to new line if cursor is at/past the prefix
        let indentPrefix = '';
        let tmpLine = currentLine;
        while (tmpLine.startsWith(INDENT)) { indentPrefix += INDENT; tmpLine = tmpLine.slice(INDENT.length); }
        freshLines[li] = currentLine.slice(0, clampedOffset);
        const afterCursor = currentLine.slice(clampedOffset);
        const newLine = (indentPrefix && clampedOffset >= indentPrefix.length)
          ? indentPrefix + afterCursor.trimStart()
          : afterCursor;
        freshLines.splice(li + 1, 0, newLine);
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

  // Intercept paste — strip HTML formatting, normalize line breaks, insert as plain text
  const handlePaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();

    // Check for image paste first
    const items = Array.from(e.clipboardData.items);
    const imageItem = items.find(item => item.type.startsWith('image/'));
    if (imageItem) {
      const file = imageItem.getAsFile();
      if (file) {
        const reader = new FileReader();
        reader.onload = (ev) => {
          const base64 = ev.target?.result as string;
          if (!base64) return;
          const info = getCursorInfo();
          const lines = contentRef.current.split('\n');
          const lineIndex = info?.lineIndex ?? lines.length - 1;
          // Insert img:: line after current line
          lines.splice(lineIndex + 1, 0, `img::${base64}`);
          pushUndo(true);
          structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
        };
        reader.readAsDataURL(file);
        return;
      }
    }

    const raw = e.clipboardData.getData('text/plain');
    if (!raw) return;
    pushUndo(true);

    // Collapse single newlines (line wraps from narrow window) to spaces;
    // preserve double newlines (paragraph breaks)
    const normalized = raw
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\u0000')    // protect paragraph breaks
      .replace(/\n/g, ' ')              // collapse single newlines to space
      .replace(/\u0000/g, '\n\n')       // restore paragraph breaks
      .replace(/ {2,}/g, ' ');          // clean up double spaces

    document.execCommand('insertText', false, normalized);
  }, [pushUndo, structuralUpdate]);

  // Item 13: cut handler for mobile — manually copy + delete selection
  const handleCut = useCallback(async (e: React.ClipboardEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const text = sel.toString();
    try {
      await navigator.clipboard.writeText(text);
      e.preventDefault();
      document.execCommand('delete');
      if (editorRef.current) saveContent(extractContent(editorRef.current));
    } catch {
      // let browser handle it natively
    }
  }, [saveContent]);

  // Item 11: download or share (Web Share API for mobile, anchor fallback for desktop)
  const downloadOrShare = async (blob: Blob, filename: string) => {
    const file = new File([blob], filename, { type: blob.type });
    if (navigator.share && navigator.canShare?.({ files: [file] })) {
      try {
        await navigator.share({ files: [file], title: filename });
        return;
      } catch {
        // fall through to anchor download
      }
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Exports
  const cleanForExport = (line: string) => {
    if (isLineStruck(line)) return '[x] ' + getCleanLine(line);
    return line;
  };

  const saveAsMd = () => {
    const content = contentRef.current;
    if (!content.trim()) return;
    const exported = contentToMarkdown(content);
    const blob = new Blob([exported], { type: 'text/markdown' });
    downloadOrShare(blob, `ezwrite-${new Date().toISOString().split('T')[0]}.md`);
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

    const filename = `ezwrite-${new Date().toISOString().split('T')[0]}.pdf`;
    const pdfBlob = pdf.output('blob');
    downloadOrShare(pdfBlob, filename);
  };

  // Glow helpers — matches text hue for color themes, original warm glow otherwise
  const glowHsl = colorTheme
    ? (isDark ? '53 38% 87%' : colorTheme === 'blue' ? '218 33% 46%' : colorTheme === 'green' ? '139 34% 24%' : '0 43% 34%')
    : null;
  const titleGlow: React.CSSProperties = glowHsl
    ? { textShadow: `0 0 20px hsl(${glowHsl} / 0.28), 0 0 40px hsl(${glowHsl} / 0.13)` }
    : isDark ? { textShadow: '0 0 20px hsl(40 60% 70% / 0.2), 0 0 40px hsl(35 50% 60% / 0.10)' } : {};

  // Editor styles
  const editorStyle: React.CSSProperties = {
    lineHeight: '1.8',
    caretColor: glowHsl ? `hsl(${glowHsl})` : (isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 25%)'),
    outline: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    ...(glowHsl
      ? { textShadow: `0 0 10px hsl(${glowHsl} / 0.18), 0 0 25px hsl(${glowHsl} / 0.10)` }
      : isDark ? { textShadow: '0 0 10px hsl(40 60% 70% / 0.22), 0 0 25px hsl(35 50% 60% / 0.12)' } : {}),
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
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
          style={titleGlow}
        >
          ez.
        </span>
        <div className="flex items-center gap-3">
          {mounted && (
            <button onClick={handleToggleColorTheme} title="change colour theme" className={`transition-colors ${colorTheme ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}>
              <Palette size={16} />
            </button>
          )}
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
              onPaste={handlePaste}
              onCut={handleCut}
              onClick={handleEditorClick}
              onMouseDown={handleEditorMouseDown}
              className={`${useSerif ? 'font-playfair' : 'font-mono'} text-base sm:text-lg font-light tracking-wide text-foreground ce-editor`}
              style={editorStyle}
              spellCheck={spellCheckEnabled}
            />

            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-accent-foreground rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Page indicator dots */}
      <div
        className={`fixed bottom-10 left-0 right-0 flex justify-center items-center gap-2 pointer-events-none transition-opacity duration-500 ${showDots ? 'opacity-60' : 'opacity-0'}`}
      >
        {Array.from({ length: TOTAL_PAGES }).map((_, i) => (
          <button
            key={i}
            onClick={() => switchToPage(i)}
            className="pointer-events-auto transition-all duration-200 rounded-full bg-foreground"
            style={{
              width: currentPage === i ? '6px' : '4px',
              height: currentPage === i ? '6px' : '4px',
              opacity: currentPage === i ? 1 : 0.4,
            }}
            aria-label={`Go to page ${i + 1}`}
          />
        ))}
      </div>

      {/* Footer */}
      <div className="fixed bottom-3 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-70 transition-opacity duration-300">
        <span
          className="font-playfair text-xs sm:text-sm text-foreground tracking-wide pointer-events-auto"
          style={titleGlow}
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
      <InfoDialog
        open={infoOpen}
        onOpenChange={setInfoOpen}
        dirName={getDirName(dirHandle)}
        onPickFolder={handlePickFolder}
        onClearFolder={handleClearFolder}
        onInstall={handleInstall}
        spellCheckEnabled={spellCheckEnabled}
        onToggleSpellCheck={handleToggleSpellCheck}
        useSerif={useSerif}
        onToggleFont={handleToggleFont}
        colorTheme={colorTheme}
        onToggleColorTheme={handleToggleColorTheme}
      />
    </div>
  );
};

export default WritingInterface;
