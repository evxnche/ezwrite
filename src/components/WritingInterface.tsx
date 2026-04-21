import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { Download, Settings } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import SlashCommandPopup from './SlashCommandPopup';
import TimerWidget from './TimerWidget';
import {
  getNextColorTheme,
  pickColorTheme,
  type ColorTheme,
} from './preferences';
import { buildTimerSlots } from './timer-identity';
import {
  getFloatingSlashButtonCursor,
  getPageEndCursor,
  getShareCardLines,
  getShareCardPalette,
  normalizePastedPlainText,
  htmlToPlainLines,
  normalizeEditorContent,
  shouldAutoFocusAfterPageSwitch,
  splitExitedListLine,
} from './editor-behavior';
import {
  STRUCK_MARKER, LIST_EXIT, getCleanLine, isLineStruck, getLineType,
  getTimerArgs, SLASH_COMMANDS, INDENT,
  getDropInsertionIndex, getDropTargetLineIndex,
  contentToHTML, extractContent, setCursorPosition,
  contentToMarkdown, markdownToContent,
} from './writing-helpers';
import {
  isFileSystemSupported, getSavedHandle, pickSaveDirectory,
  writePageFiles, clearHandle, getDirName, writeToOPFS,
} from '@/lib/storage';

const TOTAL_PAGES = 5;
const InfoDialog = lazy(() => import('./InfoDialog'));
const SettingsDialog = lazy(() => import('./SettingsDialog'));

interface WindowWithAudioContext extends Window {
  webkitAudioContext?: typeof AudioContext;
}

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

const playChime = () => {
  try {
    const AudioContextCtor = window.AudioContext || (window as WindowWithAudioContext).webkitAudioContext;
    if (!AudioContextCtor) return;
    const ctx = new AudioContextCtor();
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
  } catch {
    // Ignore audio failures and keep timer completion usable.
  }
};

const DEFAULT_PAGE_CONTENT = 'start writing.';

const getDefaultPage = (index: number): string => {
  if (index === 0) return DEFAULT_PAGE_CONTENT;
  return '';
};

const getShareCardFont = (fontSize: number, useSerif: boolean) =>
  `300 ${fontSize}px ${useSerif ? '"Libre Caslon Text", Georgia, serif' : '"Roboto Mono", monospace'}`;

function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + width - radius, y);
  ctx.quadraticCurveTo(x + width, y, x + width, y + radius);
  ctx.lineTo(x + width, y + height - radius);
  ctx.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  ctx.lineTo(x + radius, y + height);
  ctx.quadraticCurveTo(x, y + height, x, y + height - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function wrapShareCardLines(
  ctx: CanvasRenderingContext2D,
  lines: string[],
  maxWidth: number,
  fontSize: number,
  useSerif: boolean,
): string[] {
  ctx.font = getShareCardFont(fontSize, useSerif);
  const wrapped: string[] = [];

  lines.forEach((line) => {
    if (!line) {
      wrapped.push('');
      return;
    }

    const words = line.split(/\s+/);
    let current = '';
    words.forEach((word) => {
      const next = current ? `${current} ${word}` : word;
      if (ctx.measureText(next).width <= maxWidth || !current) {
        current = next;
        return;
      }
      wrapped.push(current);
      current = word;
    });
    if (current) wrapped.push(current);
  });

  return wrapped;
}

const WritingInterface = () => {
  // --- Pages ---
  const pagesRef = useRef<string[] | null>(null);
  if (!pagesRef.current) {
    const saved = localStorage.getItem('zen-writing-pages');
    if (saved) {
      try { pagesRef.current = JSON.parse(saved); } catch { pagesRef.current = Array(TOTAL_PAGES).fill(''); }
    } else {
      const old = localStorage.getItem('zen-writing-content') || '';
      const welcome = old || `hi.\n\ni am evan.\n\nthinking is cool.\nwriting is thinking.\n\ni write. you write. we all write.\nwriting today is a slog.\na battle of point sizes, typefaces, and colours.\n\nhence, ezwrite.\ni like pen and paper. this is close.\n\nthere isn't much to it.\n/line splits things up.\n/list keeps you on track with checklists.\n/timer pulls up a timer + some more func.\nor just type in "/help" and you'll find all the help you need.\nbtw your data stays on your device.\n\nit's yours now. go write.\n\nto report bugs or just say hi, evanbuildsstuff@gmail.com\n\njust do things. ez.\n\n-evan`;
      pagesRef.current = [welcome, ...Array(TOTAL_PAGES - 1).fill('')];
    }
    while (pagesRef.current.length < TOTAL_PAGES) pagesRef.current.push('');
  }

  const getPageContent = (index: number): string =>
    pagesRef.current[index] ?? getDefaultPage(index);

  const [currentPage, setCurrentPage] = useState(() => {
    const saved = localStorage.getItem('ezwrite-last-page');
    if (saved) { const n = parseInt(saved, 10); if (n >= 0 && n < TOTAL_PAGES) return n; }
    return 0;
  });
  const currentPageRef = useRef(0);
  const contentRef = useRef(getPageContent(0));

  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const [infoOpen, setInfoOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [isExportingPdf, setIsExportingPdf] = useState(false);
  const [isExportingShareCard, setIsExportingShareCard] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const savedFlashTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [timerAlert, setTimerAlert] = useState(false);
  const [pageTransition, setPageTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editingTimerLineRef = useRef<number | null>(null);

  // Page dots — show briefly on page switch
  const [showDots, setShowDots] = useState(false);
  const dotsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Touch device + keyboard height (for floating / button)
  const isTouchDevice = useState(() =>
    typeof window !== 'undefined' && window.matchMedia('(pointer: coarse)').matches
  )[0];
  const [kbHeight, setKbHeight] = useState(0);
  const kbHeightRef = useRef(0);
  useEffect(() => {
    if (!isTouchDevice) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      kbHeightRef.current = h;
      setKbHeight(h);
    };
    vv.addEventListener('resize', update);
    return () => vv.removeEventListener('resize', update);
  }, [isTouchDevice]);

  // Color theme toggle — cycles: '' → 'blue' → 'green' → 'red' → ''
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() =>
    pickColorTheme(localStorage.getItem('ezwrite-color-theme') || '')
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
      const next = getNextColorTheme(v);
      localStorage.setItem('ezwrite-color-theme', next);
      return next;
    });
  };
  const handleSelectColorTheme = (theme: ColorTheme) => {
    const next = pickColorTheme(theme);
    setColorTheme(next);
    localStorage.setItem('ezwrite-color-theme', next);
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

  // Dot grid background toggle (persisted)
  const [showDotGrid, setShowDotGrid] = useState(() =>
    localStorage.getItem('ezwrite-dot-grid') !== 'false'
  );
  useEffect(() => {
    if (showDotGrid) {
      document.body.classList.remove('dot-grid-hidden');
      localStorage.setItem('ezwrite-dot-grid', 'true');
    } else {
      document.body.classList.add('dot-grid-hidden');
      localStorage.setItem('ezwrite-dot-grid', 'false');
    }
  }, [showDotGrid]);

  // Show stats (word/char count) toggle (persisted)
  const [showStats, setShowStats] = useState(() =>
    localStorage.getItem('ezwrite-show-stats') === 'true'
  );


  const handleToggleStats = () => {
    setShowStats(v => {
      const next = !v;
      localStorage.setItem('ezwrite-show-stats', String(next));
      return next;
    });
  };

  // Timer alert mode (persisted)
  const [timerAlertMode, setTimerAlertMode] = useState<'visual' | 'audio' | 'both' | 'silent'>(() =>
    (localStorage.getItem('ezwrite-timer-alert-mode') as 'visual' | 'audio' | 'both' | 'silent') || 'both'
  );
  const handleToggleTimerAlertMode = () => {
    setTimerAlertMode(v => {
      const modes: Array<'visual' | 'audio' | 'both' | 'silent'> = ['both', 'visual', 'audio', 'silent'];
      const next = modes[(modes.indexOf(v) + 1) % modes.length];
      localStorage.setItem('ezwrite-timer-alert-mode', next);
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
  const [installPrompt, setInstallPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallPrompt(e as BeforeInstallPromptEvent);
    };
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
  // Tracks the cursor position set by structuralUpdate while the RAF hasn't fired yet.
  // handleKeyDown uses this instead of live getCursorInfo() during that window.
  const pendingCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  // Continuously tracked cursor from selectionchange — fallback when pendingCursor is null
  // and getCursorInfo() might return stale state (e.g. cursor at container level after innerHTML reset).
  const trackedCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  // True while structuralUpdate is resetting innerHTML — suppresses selectionchange tracking.
  const isResettingDOM = useRef(false);
  // Undo / Redo
  const undoStack = useRef<string[]>([]);
  const redoStack = useRef<string[]>([]);
  const lastUndoTime = useRef(0);
  const deferredPersistTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const deferredPagesRef = useRef<string[]>([]);
  const pushUndo = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastUndoTime.current < 500) return;
    undoStack.current.push(contentRef.current);
    redoStack.current = [];
    lastUndoTime.current = now;
  }, []);

  // Image resize
  const resizingRef = useRef<{ lineIndex: number; startX: number; startWidth: number; imgEl: HTMLElement; lineEl: HTMLElement } | null>(null);

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ rect: DOMRect; filter: string; lineIndex: number } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const isDark = mounted && theme === 'dark';

  const textForStats = contentRef.current || '';
  const wordCount = textForStats.trim() ? textForStats.trim().split(/\s+/).length : 0;
  const charCount = textForStats.length;

  const scheduleDeferredPersistence = useCallback((pages: string[]) => {
    deferredPagesRef.current = [...pages];
    clearTimeout(deferredPersistTimeoutRef.current);
    deferredPersistTimeoutRef.current = setTimeout(() => {
      const latestPages = deferredPagesRef.current;
      if (dirHandleRef.current) {
        const markdowns = latestPages.map((page) => contentToMarkdown(page));
        void writePageFiles(dirHandleRef.current, markdowns);
      }
      void writeToOPFS(latestPages);
    }, 250);
  }, []);

  useEffect(() => {
    return () => clearTimeout(deferredPersistTimeoutRef.current);
  }, []);

  // --- Save helper ---
  const saveContent = useCallback((content: string) => {
    contentRef.current = content;
    pagesRef.current[currentPageRef.current] = content;
    const serialized = JSON.stringify(pagesRef.current);
    localStorage.setItem('zen-writing-pages', serialized);
    scheduleDeferredPersistence(pagesRef.current);
    // Auto-save feedback flash
    clearTimeout(savedFlashTimeoutRef.current);
    setSavedFlash(true);
    savedFlashTimeoutRef.current = setTimeout(() => setSavedFlash(false), 800);
  }, [scheduleDeferredPersistence]);

  // Image resize mouse handlers (declared after saveContent/pushUndo to avoid TDZ)
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizingRef.current) return;
      const { startX, startWidth, lineEl } = resizingRef.current;
      const newWidth = Math.max(100, startWidth + (e.clientX - startX));
      lineEl.style.width = newWidth + 'px';
      lineEl.dataset.width = String(Math.round(newWidth));
    };
    const handleMouseUp = () => {
      if (!resizingRef.current) return;
      resizingRef.current = null;
      if (editorRef.current) { pushUndo(true); saveContent(extractContent(editorRef.current)); }
    };
    // Block browser's default file/URL navigation on any drop
    const blockBrowserDrop = (e: DragEvent) => { e.preventDefault(); };
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);
    document.addEventListener('dragover', blockBrowserDrop, true);
    document.addEventListener('drop', blockBrowserDrop, true);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.removeEventListener('dragover', blockBrowserDrop, true);
      document.removeEventListener('drop', blockBrowserDrop, true);
    };
  }, [pushUndo, saveContent]);

  // --- Structural re-render ---
  const structuralUpdate = useCallback((
    content: string,
    cursorLine?: number,
    cursorOffset?: number,
    shouldFocus = true,
  ) => {
    saveContent(content);
    if (!editorRef.current) return;

    isResettingDOM.current = true;
    editorRef.current.innerHTML = contentToHTML(content, {
      editingTimerLine: editingTimerLineRef.current ?? undefined,
    });
    isResettingDOM.current = false;

    // Find timer slots and re-attach persistent containers
    const lines = content.split('\n');
    const timers = buildTimerSlots(lines, editingTimerLineRef.current);
    const activeIds = new Set<string>();
    timers.forEach(({ stableId, lineIndex }) => {
      activeIds.add(stableId);
      if (!timerContainers.current.has(stableId)) {
        timerContainers.current.set(stableId, document.createElement('div'));
      }
      const slot = editorRef.current!.querySelector(`[data-timer-slot="${lineIndex}"]`) as HTMLElement;
      if (slot) slot.appendChild(timerContainers.current.get(stableId)!);
    });
    // Clean up containers for removed timers
    Array.from(timerContainers.current.keys()).forEach((stableId) => {
      if (!activeIds.has(stableId)) {
        timerContainers.current.delete(stableId);
      }
    });
    setTimerSlots(timers);

    // Restore cursor and record where it should be so handleKeyDown can use it
    // if Enter fires before the RAF (browser sometimes overrides sync restore)
    if (cursorLine !== undefined) {
      trackedCursor.current = { lineIndex: cursorLine, offset: cursorOffset ?? 0 };
      pendingCursor.current = { lineIndex: cursorLine, offset: cursorOffset ?? 0 };
      if (shouldFocus && document.activeElement === editorRef.current) {
        setCursorPosition(editorRef.current, cursorLine, cursorOffset ?? 0);
      }
      requestAnimationFrame(() => {
        if (shouldFocus && editorRef.current) {
          editorRef.current.focus({ preventScroll: true });
          setCursorPosition(editorRef.current, cursorLine, cursorOffset ?? 0);
        }
        pendingCursor.current = null; // RAF fired — Selection API is reliable again
      });
    }
  }, [saveContent]);

  // --- Cursor normalizer ---
  // When structuralUpdate resets innerHTML, the browser can leave the cursor at the
  // editor container level (not inside a line div). Typing then inserts a raw text node
  // that extractContent silently skips, making typed text vanish. This beforeinput
  // listener moves the cursor inside the correct div before any character lands.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const ensureCursorInDiv = () => {
      const sel = window.getSelection();
      if (!sel || !sel.rangeCount) return;
      const range = sel.getRangeAt(0);

      // Case 1: cursor is inside a raw text node that's a direct child of the editor
      if (range.startContainer.nodeType === Node.TEXT_NODE &&
          range.startContainer.parentNode === el) {
        const divs = Array.from(el.childNodes).filter(n => n.nodeType === Node.ELEMENT_NODE);
        const target = divs[0] as HTMLElement | undefined;
        if (target) {
          try {
            const newRange = document.createRange();
            newRange.selectNodeContents(target);
            newRange.collapse(false); // end of div
            sel.removeAllRanges();
            sel.addRange(newRange);
          } catch { /* ignore */ }
        }
        return;
      }

      // Case 2: cursor is at the editor container level
      if (range.startContainer !== el) return;
      const children = el.childNodes;
      if (!children.length) return;
      const childOffset = range.startOffset;
      // Find the nearest element node (skip raw text nodes)
      let target: Node | null = null;
      if (childOffset === 0) {
        for (let i = 0; i < children.length; i++) {
          if (children[i].nodeType === Node.ELEMENT_NODE) { target = children[i]; break; }
        }
      } else {
        for (let i = Math.min(childOffset, children.length) - 1; i >= 0; i--) {
          if (children[i].nodeType === Node.ELEMENT_NODE) { target = children[i]; break; }
        }
      }
      if (!target) return;
      try {
        const newRange = document.createRange();
        newRange.selectNodeContents(target);
        newRange.collapse(childOffset === 0);
        sel.removeAllRanges();
        sel.addRange(newRange);
      } catch { /* ignore */ }
    };
    el.addEventListener('beforeinput', ensureCursorInDiv);
    return () => el.removeEventListener('beforeinput', ensureCursorInDiv);
  }, []);

  // --- Continuous cursor tracking via selectionchange ---
  // getCursorInfo() can return stale data when the cursor is at the editor container
  // level after an innerHTML reset (even with the sync restore + RAF). selectionchange
  // fires after every cursor move (typing, clicking, arrows), so we always have a
  // fresh known-good position for handleKeyDown to fall back on.
  useEffect(() => {
    const handler = () => {
      if (isResettingDOM.current) return; // ignore events fired during innerHTML reset
      const info = getCursorInfo();
      if (info) trackedCursor.current = { lineIndex: info.lineIndex, offset: info.offset };
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []); // getCursorInfo only uses stable refs (editorRef) — closure is safe

  // Pre-warm heavy export chunks so first-click latency is negligible.
  useEffect(() => { void import('jspdf'); }, []);

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
  }, [structuralUpdate]);

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
    localStorage.setItem('ezwrite-last-page', String(newPage));
    setCurrentPage(newPage);
  }, []);

  // Load page content when currentPage changes (not on mount)
  const hasMounted = useRef(false);
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    const pageContent = getPageContent(currentPage);
    const { lineIndex, offset } = getPageEndCursor(pageContent);
    const shouldFocus = shouldAutoFocusAfterPageSwitch(isTouchDevice);
    structuralUpdate(pageContent, lineIndex, offset, shouldFocus);
    setTimeout(() => {
      if (shouldFocus) {
        editorRef.current?.focus();
      }
      setPageTransition('none');
    }, 250);
  }, [currentPage, isTouchDevice, structuralUpdate]);

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
      editorRef.current?.focus({ preventScroll: true });
      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      setCursorPosition(editorRef.current!, lastLine, lines[lastLine]?.length || 0);
      scrollToLine(lastLine);
    }
  };

  // Handle mousedown for image resize handles
  const handleEditorMouseDown = (e: React.MouseEvent) => {
    const target = e.target as HTMLElement;
    if (target.dataset.action !== 'resize') return;
    e.preventDefault();
    const lineIndex = parseInt(target.dataset.line || '0');
    const lineEl = editorRef.current?.childNodes[lineIndex] as HTMLElement | undefined;
    if (!lineEl) return;
    resizingRef.current = { lineIndex, startX: e.clientX, startWidth: lineEl.offsetWidth, imgEl: lineEl, lineEl };
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
    if (timerAlertMode === 'audio' || timerAlertMode === 'both') playChime();
    if (timerAlertMode === 'visual' || timerAlertMode === 'both') setTimerAlert(true);
    if (timerAlertMode === 'silent') { /* no alert */ }
  }, [timerAlertMode]);

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
    // Adjust for '>> ' prefix stripped from display in quote lines
    if (foundEl.dataset?.quotePrefix) {
      offset += 3;
    }
    if (foundEl.dataset?.headingPrefix) {
      offset += parseInt(foundEl.dataset.headingPrefix);
    }

    return { lineIndex: foundIdx, offset, lineDiv: foundEl };
  };

  // Handle input (text-only changes from user typing)
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;

    // Detect raw text nodes at container level — if found, DOM is corrupted.
    // Re-render to fix structure. extractContent now captures raw text content.
    let hasRawText = false;
    for (const node of editorRef.current.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        hasRawText = true;
        break;
      }
    }

    const rawContent = extractContent(editorRef.current);
    const newContent = normalizeEditorContent(rawContent);

    saveContent(newContent);
    triggerTyping();

    if (hasRawText) {
      // DOM has raw text nodes — figure out cursor position, then re-render cleanly
      const sel = window.getSelection();
      let fixLine = 0, fixOffset = 0;
      if (sel?.rangeCount) {
        const range = sel.getRangeAt(0);
        // If cursor is in a raw text node, compute position from it
        if (range.startContainer.nodeType === Node.TEXT_NODE &&
            range.startContainer.parentNode === editorRef.current) {
          fixOffset = range.startOffset;
          // Count nodes before cursor to find line index
          let idx = 0;
          for (const child of editorRef.current.childNodes) {
            if (child === range.startContainer) break;
            idx++;
          }
          fixLine = idx;
        } else {
          const cur = getCursorInfo();
          if (cur) { fixLine = cur.lineIndex; fixOffset = cur.offset; }
        }
      }
      structuralUpdate(newContent, fixLine, fixOffset);
      // fall through — structuralUpdate places the cursor synchronously so
      // the slash check below still works for the common "/" case
    } else if (newContent !== rawContent) {
      // Swipe/gesture typing can insert leading whitespace inside an existing line div.
      // Re-render so the DOM stays in sync with contentRef.
      const cur = getCursorInfo();
      structuralUpdate(newContent, cur?.lineIndex ?? 0, cur?.offset ?? 0);
      // fall through to slash check
    }

    // Check for slash commands.
    // getCursorInfo() can return null immediately after a DOM reset, so fall back to
    // pendingCursor (set synchronously by structuralUpdate) when needed.
    const info = getCursorInfo() ?? (pendingCursor.current
      ? { lineIndex: pendingCursor.current.lineIndex, offset: pendingCursor.current.offset, lineDiv: null as unknown as HTMLElement }
      : null);
    if (info) {
      const lines = newContent.split('\n');
      const lineText = lines[info.lineIndex] || '';
      const visibleText = lineText.startsWith(LIST_EXIT) ? lineText.slice(LIST_EXIT.length) : lineText;
      // Match: optional leading spaces, then /, then optional word chars — covers empty line and accidental single-space line
      const trimmed = visibleText.trim();
      if (/^\/\w{0,10}$/.test(trimmed)) {
        const filter = trimmed.slice(1);
        const matches = SLASH_COMMANDS.filter(c => c.name.startsWith(filter.toLowerCase()));
        if (matches.length > 0) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const range = sel.getRangeAt(0);
            const rect = range.getBoundingClientRect();
            if (!slashPopup) setPopupHighlight(0);
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
        const next = lineIndex + 1;
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

  const handleFloatingSlashButton = useCallback(() => {
    if (!editorRef.current) return;

    pushUndo(true);

    // If the editor already has an active cursor inside it, insert at that position.
    // Only fall back to the bottom of the document when there is no cursor.
    const sel = window.getSelection();
    const hasCursor = sel && sel.rangeCount > 0 &&
      editorRef.current.contains(sel.getRangeAt(0).startContainer);

    if (hasCursor) {
      editorRef.current.focus({ preventScroll: true });
      // On mobile: scroll line to upper portion of viewport before inserting /
      // so the popup rect is stable and the cursor doesn't visually jump
      if (isTouchDevice && kbHeightRef.current > 0) {
        const info = getCursorInfo();
        if (info?.lineDiv) {
          const vp = window.visualViewport;
          const vpHeight = vp ? vp.height : window.innerHeight;
          const lineRect = info.lineDiv.getBoundingClientRect();
          window.scrollBy({ top: lineRect.top - vpHeight * 0.35, behavior: 'instant' } as ScrollToOptions);
        }
      }
      document.execCommand('insertText', false, '/');
    } else {
      const { content, lineIndex, offset } = getFloatingSlashButtonCursor(contentRef.current);
      structuralUpdate(content, lineIndex, offset, true);
      requestAnimationFrame(() => {
        editorRef.current?.focus({ preventScroll: true });
        document.execCommand('insertText', false, '/');
      });
    }
  }, [pushUndo, structuralUpdate]);

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Let polaroid captions handle their own key events
    const targetEl = e.target as HTMLElement;
    if (targetEl.classList.contains('polaroid-caption')) {
      if (e.key === 'Enter') e.preventDefault(); // no newlines in caption
      return;
    }

    // Priority: pendingCursor (set by structuralUpdate, RAF not yet fired)
    //        → trackedCursor (last known-good from selectionchange)
    //        → live getCursorInfo() (may return stale state at container level)
    const _cursor = pendingCursor.current ?? trackedCursor.current;
    const info = _cursor
      ? { lineIndex: _cursor.lineIndex, offset: _cursor.offset, lineDiv: editorRef.current?.children[_cursor.lineIndex] as HTMLElement ?? null }
      : getCursorInfo();

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

    // Backspace at start of quote visible text (offset 3 = just after '>> ') → revert to plain text
    if (e.key === 'Backspace' && getLineType(lines, lineIndex) === 'quote' && offset <= 3) {
      e.preventDefault();
      pushUndo(true);
      lines[lineIndex] = lines[lineIndex].replace(/^>> ?/, '');
      structuralUpdate(lines.join('\n'), lineIndex, 0);
      return;
    }
    // Backspace at start of heading → revert to plain text
    if (e.key === 'Backspace' && getLineType(lines, lineIndex) === 'heading1' && offset <= 2) {
      e.preventDefault();
      pushUndo(true);
      lines[lineIndex] = lines[lineIndex].replace(/^# /, '');
      structuralUpdate(lines.join('\n'), lineIndex, 0);
      return;
    }
    if (e.key === 'Backspace' && getLineType(lines, lineIndex) === 'heading2' && offset <= 3) {
      e.preventDefault();
      pushUndo(true);
      lines[lineIndex] = lines[lineIndex].replace(/^## /, '');
      structuralUpdate(lines.join('\n'), lineIndex, 0);
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

    // Cmd/Ctrl+Left/Right — switch page
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
      e.preventDefault();
      switchToPage(currentPageRef.current - 1);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
      e.preventDefault();
      switchToPage(currentPageRef.current + 1);
      return;
    }

    // Cmd/Ctrl+Arrow move line
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
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
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
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

      // Image line — never split, just insert a blank line after it
      if (getLineType(freshLines, li) === 'image') {
        freshLines.splice(li + 1, 0, '');
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

      // Quote: continue on Enter, exit on empty quote line
      if (lineType === 'quote') {
        const visibleText = currentLine.replace(/^>> ?/, '');
        if (!visibleText.trim()) {
          freshLines[li] = '';
          structuralUpdate(freshLines.join('\n'), li, 0);
          scrollToLine(li);
          return;
        }
        // freshOffset is relative to stored content ('>> text'), split within visible part
        const splitAt = Math.max(0, Math.min(freshOffset, currentLine.length) - 3);
        freshLines[li] = '>> ' + visibleText.slice(0, splitAt);
        freshLines.splice(li + 1, 0, '>> ' + visibleText.slice(splitAt));
        structuralUpdate(freshLines.join('\n'), li + 1, 3);
        scrollToLine(li + 1);
        return;
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
        // Enter on empty list item → un-indent one level if nested, else exit list
        if (!cleanNoIndent.trim()) {
          if (listIndentLevel > 0) {
            freshLines[li] = INDENT.repeat(listIndentLevel - 1);
            structuralUpdate(freshLines.join('\n'), li, 0);
          } else {
            freshLines.splice(li, 1, LIST_EXIT);
            structuralUpdate(freshLines.join('\n'), li, 0);
            scrollToLine(li);
          }
          return;
        }
        const struck = isLineStruck(currentLine);
        const off = Math.min(freshOffset, clean.length);
        freshLines[li] = struck ? STRUCK_MARKER + clean.slice(0, off) : clean.slice(0, off);
        // New line carries indent prefix + text after cursor
        freshLines.splice(li + 1, 0, listIndentPrefix + clean.slice(off));
      } else if (currentLine.startsWith(LIST_EXIT)) {
        // Keep marker pinned to this line; split only the visible text after it
        const { current, next } = splitExitedListLine(currentLine, freshOffset);
        freshLines[li] = current;
        freshLines.splice(li + 1, 0, next);
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

    const htmlData = e.clipboardData.getData('text/html');
    const plain = htmlData ? htmlToPlainLines(htmlData) : normalizePastedPlainText(raw);
    // Re-hydrate markdown checklists back into ezWrite's internal list representation.
    const normalized = markdownToContent(plain);
    const pastedLines = normalized.split('\n');

    // Resolve selection start/end → delete selected range before inserting
    const getLineOffsetFromDOMPoint = (container: Node, domOffset: number): { lineIndex: number; offset: number } | null => {
      if (!editorRef.current) return null;
      const children = Array.from(editorRef.current.childNodes) as HTMLElement[];
      let foundIdx = -1;
      let foundEl: HTMLElement | null = null;
      if (container === editorRef.current) {
        foundIdx = Math.max(0, Math.min(domOffset > 0 ? domOffset - 1 : 0, children.length - 1));
        foundEl = children[foundIdx] || null;
        return foundEl ? { lineIndex: foundIdx, offset: foundEl.textContent?.length ?? 0 } : null;
      }
      for (let i = 0; i < children.length; i++) {
        if (children[i].contains(container)) { foundIdx = i; foundEl = children[i]; break; }
      }
      if (foundIdx < 0 || !foundEl) return null;
      let textContainer: Node = foundEl;
      if ((foundEl as HTMLElement).dataset?.type === 'list-item') {
        const span = foundEl.querySelector('.ce-li-text');
        if (span) textContainer = span;
      }
      let offset = 0;
      try {
        const r = document.createRange();
        r.selectNodeContents(textContainer);
        r.setEnd(container, domOffset);
        offset = r.toString().length;
      } catch { /* */ }
      if ((foundEl as HTMLElement).dataset?.quotePrefix) offset += 3;
      if ((foundEl as HTMLElement).dataset?.headingPrefix) offset += parseInt((foundEl as HTMLElement).dataset.headingPrefix || '0');
      return { lineIndex: foundIdx, offset };
    };

    const sel = window.getSelection();
    const lines = contentRef.current.split('\n');
    let insertLineIndex: number;
    let insertOffset: number;

    if (sel && sel.rangeCount && !sel.getRangeAt(0).collapsed && editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
      const range = sel.getRangeAt(0);
      const startInfo = getLineOffsetFromDOMPoint(range.startContainer, range.startOffset);
      const endInfo = getLineOffsetFromDOMPoint(range.endContainer, range.endOffset);
      if (startInfo && endInfo && (startInfo.lineIndex !== endInfo.lineIndex || startInfo.offset !== endInfo.offset)) {
        const { lineIndex: sl, offset: so } = startInfo;
        const { lineIndex: el, offset: eo } = endInfo;
        if (sl === el) {
          lines[sl] = lines[sl].slice(0, so) + lines[sl].slice(eo);
        } else {
          lines.splice(sl, el - sl + 1, lines[sl].slice(0, so) + lines[el].slice(eo));
        }
        insertLineIndex = sl;
        insertOffset = so;
      } else {
        const info = getCursorInfo();
        insertLineIndex = info?.lineIndex ?? lines.length - 1;
        insertOffset = info?.offset ?? 0;
      }
    } else {
      const info = getCursorInfo();
      insertLineIndex = info?.lineIndex ?? lines.length - 1;
      insertOffset = info?.offset ?? (lines[info?.lineIndex ?? lines.length - 1]?.length ?? 0);
    }

    const currentLine = lines[insertLineIndex] ?? '';
    const before = currentLine.slice(0, insertOffset);
    const after = currentLine.slice(insertOffset);

    // If the pasted block contains a list header, keep it on its own line so
    // `getLineType` recognises the following items as list-items rather than
    // concatenating the header into surrounding prose.
    const hasListHeader = pastedLines.some(l => l === 'list');
    if (hasListHeader && (before !== '' || after !== '')) {
      const newLines: string[] = [];
      if (before !== '') newLines.push(before);
      newLines.push(...pastedLines);
      if (after !== '') newLines.push(after);
      lines.splice(insertLineIndex, 1, ...newLines);
      const cursorLineOffset = (before !== '' ? 1 : 0) + pastedLines.length - 1;
      const cursorLine = insertLineIndex + cursorLineOffset;
      structuralUpdate(lines.join('\n'), cursorLine, pastedLines[pastedLines.length - 1].length);
      return;
    }

    if (pastedLines.length === 1) {
      lines[insertLineIndex] = before + pastedLines[0] + after;
      structuralUpdate(lines.join('\n'), insertLineIndex, insertOffset + pastedLines[0].length);
    } else {
      const newLines = [
        before + pastedLines[0],
        ...pastedLines.slice(1, -1),
        pastedLines[pastedLines.length - 1] + after,
      ];
      lines.splice(insertLineIndex, 1, ...newLines);
      structuralUpdate(lines.join('\n'), insertLineIndex + pastedLines.length - 1, pastedLines[pastedLines.length - 1].length);
    }
  }, [pushUndo, structuralUpdate]);

  // Drag-and-drop image support
  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'copy';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();

    const insertImageSrc = (src: string) => {
      const lines = contentRef.current.split('\n');
      const targetLineIndex = getDropTargetLineIndex(editorRef.current, e.target);
      const fallbackLineIndex = getCursorInfo()?.lineIndex ?? null;
      const insertionIndex = getDropInsertionIndex(lines.length, targetLineIndex, fallbackLineIndex);
      lines.splice(insertionIndex, 0, `img::${src}`);
      pushUndo(true);
      structuralUpdate(lines.join('\n'), insertionIndex, 0);
    };

    // File drop (from Finder / desktop)
    const files = Array.from(e.dataTransfer.files);
    const imageFile = files.find(f => f.type.startsWith('image/'));
    if (imageFile) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const base64 = ev.target?.result as string;
        if (base64) insertImageSrc(base64);
      };
      reader.readAsDataURL(imageFile);
      return;
    }

    // URL drag (from browser — Google Images, etc.)
    const html = e.dataTransfer.getData('text/html');
    const uriList = e.dataTransfer.getData('text/uri-list');
    let imgSrc = '';
    if (html) {
      const match = html.match(/src="([^"]+)"/);
      if (match) imgSrc = match[1];
    }
    if (!imgSrc && uriList) {
      imgSrc = uriList.split('\n').find(u => u.trim() && !u.startsWith('#'))?.trim() || '';
    }
    if (imgSrc) insertImageSrc(imgSrc);
  }, [getCursorInfo, pushUndo, structuralUpdate]);

  // Resolve the line index in contentRef that a DOM node belongs to.
  const resolveLineIndexFromNode = useCallback((node: Node | null): number | null => {
    const editor = editorRef.current;
    if (!editor || !node) return null;
    let el: Node | null = node;
    while (el && el !== editor) {
      if (el.nodeType === Node.ELEMENT_NODE) {
        const ds = (el as HTMLElement).dataset;
        if (ds?.line && /^\d+$/.test(ds.line)) return parseInt(ds.line, 10);
      }
      el = el.parentNode;
    }
    const children = Array.from(editor.childNodes);
    const idx = children.findIndex(c => c === node || (c as Node).contains?.(node));
    return idx >= 0 ? idx : null;
  }, []);

  // Build markdown for the lines covered by the current selection.
  // Returns null when the selection is collapsed, outside the editor, or
  // fully within a single non-list line (letting native plain-text copy handle it).
  const buildMarkdownForSelection = useCallback((): string | null => {
    const editor = editorRef.current;
    const sel = window.getSelection();
    if (!editor || !sel || sel.isCollapsed || sel.rangeCount === 0) return null;
    const range = sel.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    const sLine = resolveLineIndexFromNode(range.startContainer);
    const eLine = resolveLineIndexFromNode(range.endContainer);
    if (sLine === null || eLine === null) return null;
    const start = Math.min(sLine, eLine);
    const end = Math.max(sLine, eLine);
    const lines = contentRef.current.split('\n');
    const touchesListItem = lines
      .slice(start, end + 1)
      .some((_, i) => getLineType(lines, start + i) === 'list-item');
    // Single-line selection in plain text: defer to native copy so partial
    // selections aren't silently expanded to the full line.
    if (start === end && !touchesListItem) return null;
    return contentToMarkdown(contentRef.current, { start, end });
  }, [resolveLineIndexFromNode]);

  const handleCopy = useCallback((e: React.ClipboardEvent) => {
    const md = buildMarkdownForSelection();
    if (md === null) return;
    e.preventDefault();
    e.clipboardData.setData('text/plain', md);
  }, [buildMarkdownForSelection]);

  // Item 13: cut handler for mobile — manually copy + delete selection
  const handleCut = useCallback(async (e: React.ClipboardEvent) => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return;
    const md = buildMarkdownForSelection();
    const text = md ?? sel.toString();
    try {
      e.preventDefault();
      e.clipboardData.setData('text/plain', text);
      document.execCommand('delete');
      if (editorRef.current) saveContent(extractContent(editorRef.current));
    } catch {
      try { await navigator.clipboard.writeText(text); } catch { /* */ }
    }
  }, [buildMarkdownForSelection, saveContent]);

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

  const saveAsShareCard = () => {
    const content = contentRef.current;
    if (!content.trim() || isExportingShareCard) return;
    setIsExportingShareCard(true);

    void (async () => {
      try {
        const canvas = document.createElement('canvas');
        const width = 1080;
        const height = 1920;
        const pixelRatio = 1.5;
        canvas.width = Math.round(width * pixelRatio);
        canvas.height = Math.round(height * pixelRatio);

        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        ctx.scale(pixelRatio, pixelRatio);

        const { background, paper, text, muted } = getShareCardPalette(colorTheme, theme === 'dark');

        ctx.fillStyle = background;
        ctx.fillRect(0, 0, width, height);
        ctx.fillStyle = paper;
        drawRoundedRect(ctx, 82, 110, width - 164, height - 220, 42);
        ctx.fill();

        const lines = getShareCardLines(content);
        const baseFontSize = lines.join('\n').length > 520 ? 34 : 40;
        const lineHeight = Math.round(baseFontSize * 1.44);
        const maxTextWidth = width - 300;
        const wrapped = wrapShareCardLines(ctx, lines, maxTextWidth, baseFontSize, useSerif);
        const visibleLines = wrapped.slice(0, 31);
        const textHeight = visibleLines.reduce((height, line) => height + (line ? lineHeight : Math.round(lineHeight * 0.7)), 0);
        let y = Math.max(260, Math.round((height - textHeight) / 2) - 20);

        ctx.fillStyle = text;
        ctx.font = getShareCardFont(baseFontSize, useSerif);
        ctx.textBaseline = 'top';

        visibleLines.forEach((line) => {
          if (!line) {
            y += Math.round(lineHeight * 0.7);
            return;
          }
          ctx.fillText(line, 150, y);
          y += lineHeight;
        });

        if (wrapped.length > visibleLines.length) {
          ctx.fillStyle = muted;
          ctx.fillText('...', 150, y);
        }

        ctx.fillStyle = muted;
        ctx.font = '400 28px "Libre Caslon Text", Georgia, serif';
        ctx.textAlign = 'right';
        ctx.fillText('ezwrite.', width - 150, height - 210);
        ctx.textAlign = 'left';

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
        if (!blob) return;
        await downloadOrShare(blob, `ezwrite-card-${new Date().toISOString().split('T')[0]}.png`);
      } finally {
        setIsExportingShareCard(false);
      }
    })();
  };

  const saveAsPdf = () => {
    const content = contentRef.current;
    if (!content.trim() || isExportingPdf) return;
    setIsExportingPdf(true);

    void (async () => {
      try {
        const { jsPDF } = await import('jspdf');
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
          split.forEach((wrappedLine: string) => {
            if (y > pageH - margin) { pdf.addPage(); y = margin; }
            pdf.text(wrappedLine, margin, y); y += lh;
          });
          y += lh * 0.3;
        });

        const filename = `ezwrite-${new Date().toISOString().split('T')[0]}.pdf`;

        // On mobile with share support, share the file; otherwise use jsPDF's
        // own save() which handles the blob-URL lifecycle correctly.
        const pdfBlob = pdf.output('blob');
        const file = new File([pdfBlob], filename, { type: 'application/pdf' });
        if (navigator.share && navigator.canShare?.({ files: [file] })) {
          try { await navigator.share({ files: [file], title: filename }); }
          catch { pdf.save(filename); }
        } else {
          pdf.save(filename);
        }
      } catch (err) {
        console.error('[ezwrite] PDF export failed:', err);
      } finally {
        setIsExportingPdf(false);
      }
    })();
  };

  // Glow helpers — matches text hue for color themes, original warm glow otherwise
  const glowHsl = colorTheme
    ? (isDark ? '53 38% 87%' : colorTheme === 'blue' ? '230 93% 35%' : colorTheme === 'green' ? '139 34% 24%' : '0 43% 34%')
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
      <div className="flex justify-between items-center px-4 py-4 sm:px-[64px] sm:pt-[64px] sm:pb-6 bg-background">
        <span
          className="font-playfair text-xl sm:text-2xl text-foreground tracking-tight"
          style={titleGlow}
        >
          ezwrite.
        </span>
        <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity duration-300">
          <button
            onClick={() => setSettingsOpen(true)}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Settings size={16} />
          </button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button disabled={!contentRef.current.trim()} aria-label="Share or export current page" className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-30">
                <span className="share-export-icon text-lg leading-none">↗</span>
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover rounded-xl">
              <DropdownMenuItem onClick={saveAsShareCard} className="cursor-pointer" disabled={isExportingShareCard}>
                {isExportingShareCard ? 'Preparing PNG...' : 'Share as PNG'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsPdf} className="cursor-pointer" disabled={isExportingPdf}>
                {isExportingPdf ? 'Preparing PDF…' : 'Download as PDF'}
              </DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsMd} className="cursor-pointer">Download as Markdown</DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={containerRef}
        data-editor-bg="true"
        className="flex-1 px-4 sm:px-[64px] bg-background flex flex-col cursor-text"
        onClick={handleContainerClick}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
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
              onCopy={handleCopy}
              onCut={handleCut}
              onClick={handleEditorClick}
              onMouseDown={handleEditorMouseDown}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
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

      {/* Floating / button — mobile only, inserts / to trigger command popup */}
      {isTouchDevice && !slashPopup && (
        <button
          onPointerDown={(e) => {
            e.preventDefault(); // keep editor focused / keyboard up
            handleFloatingSlashButton();
          }}
          className="fixed right-4 z-50 w-11 h-11 rounded-full bg-popover border border-border text-muted-foreground flex items-center justify-center shadow-lg transition-colors"
          style={{ bottom: kbHeight + 20 }}
          aria-label="Insert slash command"
        >
          <span className="font-mono text-lg leading-none">/</span>
        </button>
      )}

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
          kbHeight={kbHeight}
          isTouchDevice={isTouchDevice}
        />
      )}

      {/* Timer portals */}
      {timerSlots.map(({ stableId, config, lineIndex }) => {
        const container = timerContainers.current.get(stableId);
        if (!container) return null;
        return createPortal(
          <TimerWidget
            key={stableId}
            config={config}
            onRemove={() => {
              pushUndo(true);
              const ls = contentRef.current.split('\n');
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
      <Suspense fallback={null}>
        {(infoOpen || settingsOpen) && (
          <>
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

            <SettingsDialog
              open={settingsOpen}
              onOpenChange={setSettingsOpen}
              wordCount={wordCount}
              charCount={charCount}
              showStats={showStats}
              onToggleStats={handleToggleStats}
              colorTheme={colorTheme}
              onSelectColorTheme={handleSelectColorTheme}
              mode={theme === 'dark' ? 'dark' : 'light'}
              onToggleMode={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              useSerif={useSerif}
              onToggleFont={handleToggleFont}
              spellCheckEnabled={spellCheckEnabled}
              onToggleSpellCheck={handleToggleSpellCheck}
              dirName={getDirName(dirHandle)}
              onPickFolder={handlePickFolder}
              onClearFolder={handleClearFolder}
              fsSupported={isFileSystemSupported()}
            />
          </>
        )}
      </Suspense>
    </div>
  );
};

export default WritingInterface;
