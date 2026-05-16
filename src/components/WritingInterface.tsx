import React, { useState, useEffect, useRef, useCallback, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Trash2 } from 'lucide-react';
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
  getMarkdownRangeForSelection,
  getExactSlashCommand,
  getClosestLineIndexForClick,
} from './editor-behavior';
import {
  STRUCK_MARKER, LIST_EXIT, getCleanLine, isLineStruck, getLineType,
  getTimerArgs, SLASH_COMMANDS, INDENT,
  contentToHTML, extractContent, setCursorPosition,
  contentToMarkdown, markdownToContent,
} from './writing-helpers';
import {
  isFileSystemSupported, getSavedHandle, pickSaveDirectory,
  writeProjectFiles, clearHandle, getDirName, writeToOPFS,
} from '@/lib/storage';
import {
  initProjects,
  listProjects,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  deleteProject,
  renameProjectTitle,
  getProjectPages,
  saveProjectPages,
  getProjectTimestamps,
  saveProjectTimestamps,
  getProjectLastPage,
  saveProjectLastPage,
  getProjectScratchpad,
  saveProjectScratchpad,
  pageToTitle,
  type ProjectMeta,
} from '@/lib/projects';


const InfoDialog = lazy(() => import('./InfoDialog'));
const SettingsDialog = lazy(() => import('./SettingsDialog'));
const NotesPanel = lazy(() => import('./NotesPanel'));
const ScratchpadPanel = lazy(() => import('./ScratchpadPanel'));

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
const WELCOME_PROJECT_CONTENT = `hi.\n\ni am evan.\n\nthinking is cool.\nwriting is thinking.\n\ni write. you write. we all write.\nwriting today is a slog.\na battle of point sizes, typefaces, and colours.\n\nhence, ezwrite.\ni like pen and paper. this is close.\n\nthere isn't much to it.\n/line splits things up.\n/list keeps you on track with checklists.\n/timer pulls up a timer + some more func (check out /help).\nor just type in "/help" and you'll find all the help you need.\nbtw your data stays on your device. go to /settings and pick your location.\n\nit's yours now. go write.\n\nto report bugs or just say hi, evanbuildsstuff@gmail.com\n\njust do things. ez.\n\n-evan`;

const getDefaultPage = (index: number): string => {
  if (index === 0) return DEFAULT_PAGE_CONTENT;
  return '';
};

function getInitialProjectState(): { projects: ProjectMeta[]; activeProjectId: string | null } {
  initProjects();
  let projects = listProjects();
  let activeProjectId = getActiveProjectId();
  if (projects.length === 0) {
    const meta = createProject(WELCOME_PROJECT_CONTENT);
    projects = [meta];
    activeProjectId = meta.id;
  }
  return { projects, activeProjectId };
}

function sanitizeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

const getShareCardFont = (fontSize: number, useSerif: boolean) =>
  `400 ${fontSize}px ${useSerif ? '"Playfair Display", Georgia, serif' : '"Roboto Mono", monospace'}`;

const VISUAL_METRICS = {
  editorMaxWidth: 'none',
  editorFontSize: '17px',
  editorLineHeight: '1.8',
  themedTitleGlow: { near: 0.28, far: 0.13 },
  themedEditorGlow: { near: 0.18, far: 0.10 },
  warmTitleGlow: '0 0 20px hsl(40 60% 70% / 0.2), 0 0 40px hsl(35 50% 60% / 0.10)',
  warmEditorGlow: '0 0 10px hsl(40 60% 70% / 0.22), 0 0 25px hsl(35 50% 60% / 0.12)',
  darkTextColor: '#F0EEDE',
} as const;

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
  // --- Projects & Pages ---
  const initialProjectStateRef = useRef<{ projects: ProjectMeta[]; activeProjectId: string | null } | null>(null);
  if (!initialProjectStateRef.current) {
    initialProjectStateRef.current = getInitialProjectState();
  }
  const [projects, setProjects] = useState<ProjectMeta[]>(initialProjectStateRef.current.projects);
  const [activeProjectId, setActiveProjectIdState] = useState<string | null>(initialProjectStateRef.current.activeProjectId);
  const activeProjectIdRef = useRef(activeProjectId);
  activeProjectIdRef.current = activeProjectId;

  const pagesRef = useRef<string[] | null>(null);
  if (!pagesRef.current && activeProjectId) {
    pagesRef.current = getProjectPages(activeProjectId);
  } else if (!pagesRef.current) {
    pagesRef.current = [''];
  }

  const getPageContent = (index: number): string =>
    pagesRef.current[index] ?? getDefaultPage(index);

  const [pageCount, setPageCount] = useState(() => pagesRef.current?.length ?? 1);
  const [isPageEmpty, setIsPageEmpty] = useState(() => (pagesRef.current?.[0] ?? '').trim() === '');
  const [notesOpen, setNotesOpen] = useState(false);
  const [scratchpadOpen, setScratchpadOpen] = useState(false);
  const [scratchpadWidth, setScratchpadWidth] = useState(() => {
    const saved = localStorage.getItem('ezwrite-scratchpad-width');
    const width = saved ? parseInt(saved, 10) : 340;
    return Number.isFinite(width) ? Math.max(260, Math.min(720, width)) : 340;
  });
  const [scratchpad, setScratchpad] = useState(() => activeProjectId ? getProjectScratchpad(activeProjectId) : '');
  const [timestamps, setTimestamps] = useState<number[]>(() => {
    if (activeProjectId) return getProjectTimestamps(activeProjectId);
    return [];
  });
  const [currentPage, setCurrentPage] = useState(() => {
    if (activeProjectId) {
      const n = getProjectLastPage(activeProjectId);
      if (n >= 0 && n < (pagesRef.current?.length ?? 1)) return n;
    }
    return 0;
  });
  const currentPageRef = useRef(currentPage);
  const contentRef = useRef(getPageContent(currentPage));

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
  const backgroundPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextBackgroundFocusRef = useRef(false);

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
      writeProjectFiles(h, activeProjectIdRef.current ?? 'default', markdowns, scratchpad);
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
  const [timerSlots, setTimerSlots] = useState<Array<{ stableId: string; config: string; lineIndex: number }>>([]);
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
  const scratchpadPersistTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scratchpadRef = useRef(scratchpad);
  useEffect(() => { scratchpadRef.current = scratchpad; }, [scratchpad]);
  const pushUndo = useCallback((force = false) => {
    const now = Date.now();
    if (!force && now - lastUndoTime.current < 500) return;
    undoStack.current.push(contentRef.current);
    redoStack.current = [];
    lastUndoTime.current = now;
  }, []);

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ rect: DOMRect; filter: string; lineIndex: number } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const isDark = mounted && theme === 'dark';

  const textForStats = contentRef.current || '';
  const wordCount = textForStats.trim() ? textForStats.trim().split(/\s+/).length : 0;
  const charCount = textForStats.length;

  const getCurrentDocExportStem = () => sanitizeFileStem(pageToTitle(pagesRef.current[0] ?? ''));
  const getCurrentExportStem = () => {
    const base = getCurrentDocExportStem();
    return pageCount > 1 ? `${base}-p${currentPageRef.current + 1}` : base;
  };

  const persistScratchpad = useCallback((value: string, projectId = activeProjectIdRef.current) => {
    if (!projectId) return;
    saveProjectScratchpad(projectId, value);
    const pagesSnapshot = [...pagesRef.current];
    clearTimeout(scratchpadPersistTimeoutRef.current);
    scratchpadPersistTimeoutRef.current = setTimeout(() => {
      if (dirHandleRef.current) {
        const markdowns = pagesSnapshot.map((page) => contentToMarkdown(page));
        void writeProjectFiles(dirHandleRef.current, projectId, markdowns, value);
      }
      void writeToOPFS(pagesSnapshot, projectId, value);
    }, 250);
  }, []);

  useEffect(() => {
    localStorage.setItem('ezwrite-scratchpad-width', String(scratchpadWidth));
  }, [scratchpadWidth]);

  const scheduleDeferredPersistence = useCallback((pages: string[], projectId = activeProjectIdRef.current) => {
    if (!projectId) return;
    const pagesSnapshot = [...pages];
    const scratchpadSnapshot = scratchpadRef.current;
    clearTimeout(deferredPersistTimeoutRef.current);
    deferredPersistTimeoutRef.current = setTimeout(() => {
      if (dirHandleRef.current) {
        const markdowns = pagesSnapshot.map((page) => contentToMarkdown(page));
        void writeProjectFiles(dirHandleRef.current, projectId, markdowns, scratchpadSnapshot);
      }
      void writeToOPFS(pagesSnapshot, projectId, scratchpadSnapshot);
    }, 250);
  }, []);

  const flushCurrentProject = useCallback((scratchpadValue = scratchpadRef.current) => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    if (editorRef.current) {
      const content = extractContent(editorRef.current);
      contentRef.current = content;
      pagesRef.current[currentPageRef.current] = content;
    }

    const latestPages = [...pagesRef.current];
    saveProjectPages(projectId, latestPages);
    clearTimeout(deferredPersistTimeoutRef.current);
    clearTimeout(scratchpadPersistTimeoutRef.current);
    if (dirHandleRef.current) {
      const markdowns = latestPages.map((page) => contentToMarkdown(page));
      void writeProjectFiles(dirHandleRef.current, projectId, markdowns, scratchpadValue);
    }
    void writeToOPFS(latestPages, projectId, scratchpadValue, { delay: 0 });
  }, []);

  useEffect(() => {
    const flushForLifecycle = () => flushCurrentProject();
    const flushWhenHidden = () => {
      if (document.visibilityState === 'hidden') flushForLifecycle();
    };
    document.addEventListener('visibilitychange', flushWhenHidden);
    window.addEventListener('pagehide', flushForLifecycle);
    window.addEventListener('beforeunload', flushForLifecycle);
    return () => {
      flushForLifecycle();
      document.removeEventListener('visibilitychange', flushWhenHidden);
      window.removeEventListener('pagehide', flushForLifecycle);
      window.removeEventListener('beforeunload', flushForLifecycle);
      clearTimeout(deferredPersistTimeoutRef.current);
      clearTimeout(scratchpadPersistTimeoutRef.current);
    };
  }, [flushCurrentProject]);

  // --- Save helper ---
  const saveContent = useCallback((content: string) => {
    contentRef.current = content;
    pagesRef.current[currentPageRef.current] = content;
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      saveProjectPages(projectId, pagesRef.current);
      scheduleDeferredPersistence(pagesRef.current);
    }
    setIsPageEmpty(content.trim() === '');
    setTimestamps(prev => {
      const next = [...prev];
      next[currentPageRef.current] = Date.now();
      if (projectId) saveProjectTimestamps(projectId, next);
      return next;
    });
  }, [scheduleDeferredPersistence]);

  // --- Structural re-render ---
  const structuralUpdate = useCallback((
    content: string,
    cursorLine?: number,
    cursorOffset?: number,
    shouldFocus = true,
    persist = true,
  ) => {
    contentRef.current = content;
    setIsPageEmpty(content.trim() === '');
    if (persist) saveContent(content);
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
  const hasInitialMounted = useRef(false);
  useEffect(() => {
    if (hasInitialMounted.current) return;
    hasInitialMounted.current = true;
    setMounted(true);
    if (editorRef.current) {
      structuralUpdate(contentRef.current, 0, 0, true, false);
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
    if (newPage < 0 || newPage === currentPageRef.current) return;
    if (newPage > pagesRef.current.length) return;
    if (newPage === pagesRef.current.length) {
      pagesRef.current.push('');
      setPageCount(pagesRef.current.length);
      const projectId = activeProjectIdRef.current;
      if (projectId) saveProjectPages(projectId, pagesRef.current);
    }
    // Save current page
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      const projectId = activeProjectIdRef.current;
      if (projectId) saveProjectPages(projectId, pagesRef.current);
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
    const projectId = activeProjectIdRef.current;
    if (projectId) saveProjectLastPage(projectId, newPage);
    currentPageRef.current = newPage;
    setCurrentPage(newPage);
  }, []);

  // Load page content when currentPage changes (not on mount).
  // Use a ref for structuralUpdate so this effect only runs when currentPage
  // or isTouchDevice changes — not when structuralUpdate's dependencies churn.
  const structuralUpdateRef = useRef(structuralUpdate);
  structuralUpdateRef.current = structuralUpdate;
  const hasMounted = useRef(false);
  const prevPageForEffect = useRef(currentPage);
  useEffect(() => {
    if (!hasMounted.current) { hasMounted.current = true; return; }
    if (prevPageForEffect.current === currentPage) return;
    prevPageForEffect.current = currentPage;
    const pageContent = getPageContent(currentPage);
    const { lineIndex, offset } = getPageEndCursor(pageContent);
    const shouldFocus = shouldAutoFocusAfterPageSwitch(isTouchDevice) && !scratchpadOpen;
    structuralUpdateRef.current(pageContent, lineIndex, offset, shouldFocus, false);
    setIsPageEmpty(pageContent.trim() === '');
    setTimeout(() => {
      if (shouldFocus) {
        editorRef.current?.focus();
      }
      setPageTransition('none');
    }, 250);
  }, [currentPage, isTouchDevice, scratchpadOpen]);

  // --- Delete page ---
  const deletePage = useCallback((pageIndex: number) => {
    if (pagesRef.current.length <= 1) return;
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
    }
    const current = currentPageRef.current;
    pagesRef.current.splice(pageIndex, 1);
    let newPage: number;
    if (pageIndex < current) {
      newPage = current - 1;
    } else if (pageIndex === current) {
      newPage = Math.min(current, pagesRef.current.length - 1);
    } else {
      newPage = current;
    }
    const newContent = pagesRef.current[newPage] ?? '';
    setPageCount(pagesRef.current.length);
    const projectId = activeProjectIdRef.current;
    if (projectId) {
      saveProjectPages(projectId, pagesRef.current);
      saveProjectLastPage(projectId, newPage);
    }
    if (dirHandleRef.current) {
      void writeProjectFiles(dirHandleRef.current, projectId ?? 'default', pagesRef.current.map(p => contentToMarkdown(p)), scratchpad);
    }
    void writeToOPFS(pagesRef.current, projectId ?? undefined, scratchpad);
    editingTimerLineRef.current = null;
    undoStack.current = [];
    redoStack.current = [];
    setShowDots(true);
    clearTimeout(dotsTimeoutRef.current);
    dotsTimeoutRef.current = setTimeout(() => setShowDots(false), 500);
    contentRef.current = newContent;
    currentPageRef.current = newPage;
    setIsPageEmpty(newContent.trim() === '');
    setCurrentPage(newPage);
    if (pageIndex === current && newPage === current) {
      const { lineIndex, offset } = getPageEndCursor(newContent);
      structuralUpdate(newContent, lineIndex, offset, !isTouchDevice);
    }
  }, [scratchpad, structuralUpdate, isTouchDevice]);

  // --- Project switching ---
  const switchToProject = useCallback((projectId: string) => {
    if (projectId === activeProjectIdRef.current) return;
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      const currentProjectId = activeProjectIdRef.current;
      if (currentProjectId) saveProjectPages(currentProjectId, pagesRef.current);
      if (currentProjectId) persistScratchpad(scratchpad, currentProjectId);
    }
    const newPages = getProjectPages(projectId);
    const newCurrentPage = getProjectLastPage(projectId);
    pagesRef.current = newPages;
    contentRef.current = newPages[newCurrentPage] ?? newPages[0] ?? '';
    setActiveProjectIdState(projectId);
    activeProjectIdRef.current = projectId;
    setActiveProjectId(projectId);
    setTimestamps(getProjectTimestamps(projectId));
    setScratchpad(getProjectScratchpad(projectId));
    setPageCount(newPages.length);
    setCurrentPage(newCurrentPage);
    currentPageRef.current = newCurrentPage;
    setIsPageEmpty(contentRef.current.trim() === '');
    setScratchpadOpen(false);
    undoStack.current = [];
    redoStack.current = [];
    editingTimerLineRef.current = null;
    const { lineIndex, offset } = getPageEndCursor(contentRef.current);
    structuralUpdate(contentRef.current, lineIndex, offset, !isTouchDevice, false);
    setTimeout(() => {
      if (!isTouchDevice) editorRef.current?.focus();
      setPageTransition('none');
    }, 250);
  }, [persistScratchpad, scratchpad, structuralUpdate, isTouchDevice]);

  const handleNewProject = useCallback(() => {
    if (editorRef.current) {
      const currentProjectId = activeProjectIdRef.current;
      if (currentProjectId) {
        pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
        saveProjectPages(currentProjectId, pagesRef.current);
        persistScratchpad(scratchpad, currentProjectId);
      }
    }
    const meta = createProject('');
    setProjects(listProjects());
    switchToProject(meta.id);
  }, [persistScratchpad, scratchpad, switchToProject]);

  const handleDeleteProject = useCallback((id: string) => {
    deleteProject(id);
    const newProjects = listProjects();
    setProjects(newProjects);
    if (id === activeProjectIdRef.current) {
      if (newProjects.length > 0) {
        switchToProject(newProjects[0].id);
      } else {
        const meta = createProject('');
        setProjects([meta]);
        switchToProject(meta.id);
      }
    }
  }, [switchToProject]);

  const handleRenameProject = useCallback((id: string, newTitle: string) => {
    // Save current editor state first so unsaved edits on other lines aren't lost.
    if (id === activeProjectIdRef.current && editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      saveProjectPages(id, pagesRef.current);
    }
    renameProjectTitle(id, newTitle);
    setProjects(listProjects());
    if (id === activeProjectIdRef.current) {
      const newPages = getProjectPages(id);
      pagesRef.current = newPages;
      if (currentPageRef.current === 0 && editorRef.current) {
        structuralUpdate(newPages[0] ?? '', undefined, undefined, false, false);
      }
    }
  }, [structuralUpdate]);

  const handleOpenDocs = useCallback(() => {
    setScratchpadOpen(false);
    setNotesOpen(true);
  }, []);

  const handleOpenScratchpad = useCallback(() => {
    setNotesOpen(false);
    setScratchpadOpen(true);
  }, []);

  const handleScratchpadChange = useCallback((value: string) => {
    setScratchpad(value);
    persistScratchpad(value);
  }, [persistScratchpad]);

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
    // Don't trigger page switch if user was selecting text.
    // Use isCollapsed instead of toString() — toString() can return
    // whitespace from a collapsed cursor inside contentEditable.
    const sel = window.getSelection();
    if (hadSelection || (sel && !sel.isCollapsed)) return;
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
    e.preventDefault();
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
    const selection = window.getSelection();
    if (suppressNextBackgroundFocusRef.current || (selection && !selection.isCollapsed && selection.toString())) {
      suppressNextBackgroundFocusRef.current = false;
      return;
    }
    if (target === containerRef.current || target.dataset?.editorBg === 'true') {
      editorRef.current?.focus({ preventScroll: true });
      const lineNodes = Array.from(editorRef.current!.childNodes) as HTMLElement[];
      const lineRects = lineNodes.map((lineNode) => lineNode.getBoundingClientRect());
      const lineIndex = getClosestLineIndexForClick(e.clientY, lineRects);

      if (lineIndex !== null) {
        const lineRect = lineRects[lineIndex];
        const offset = e.clientX <= lineRect.left ? 0 : (lineNodes[lineIndex]?.textContent?.length ?? 0);
        setCursorPosition(editorRef.current!, lineIndex, offset);
        return;
      }

      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      setCursorPosition(editorRef.current!, lastLine, lines[lastLine]?.length || 0);
    }
  };

  const handleContainerMouseDown = (e: React.MouseEvent) => {
    backgroundPointerStartRef.current = { x: e.clientX, y: e.clientY };
    suppressNextBackgroundFocusRef.current = false;
  };

  const handleContainerMouseMove = (e: React.MouseEvent) => {
    const start = backgroundPointerStartRef.current;
    if (!start) return;
    if (Math.abs(e.clientX - start.x) > 4 || Math.abs(e.clientY - start.y) > 4) {
      suppressNextBackgroundFocusRef.current = true;
    }
  };

  const handleContainerMouseUp = () => {
    if (window.getSelection()?.toString()) {
      suppressNextBackgroundFocusRef.current = true;
    }
    backgroundPointerStartRef.current = null;
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

  const applySlashCommand = useCallback((command: string, lineIndex: number) => {
    // Bug 7: use fresh DOM content instead of potentially stale contentRef
    const lines = editorRef.current ? extractContent(editorRef.current).split('\n') : contentRef.current.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;
    pushUndo(true);
    if (command === 'help') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      setInfoOpen(true);
    } else if (command === 'settings') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      setSettingsOpen(true);
    } else if (command === 'docs') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      handleOpenDocs();
    } else if (command === 'notes') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      handleOpenScratchpad();
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
  }, [handleOpenDocs, handleOpenScratchpad, pushUndo, structuralUpdate]);

  // Slash command select
  const handleSlashSelect = useCallback((command: string) => {
    if (!slashPopup) return;
    applySlashCommand(command, slashPopup.lineIndex);
  }, [applySlashCommand, slashPopup]);

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

    // Cmd+D — delete current page
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      deletePage(currentPageRef.current);
      return;
    }

    // Cmd+S / Ctrl+S — explicit save
    if ((e.metaKey || e.ctrlKey) && e.key === 's') {
      e.preventDefault();
      if (editorRef.current) {
        const content = extractContent(editorRef.current);
        pagesRef.current[currentPageRef.current] = content;
        contentRef.current = content;
        const projectId = activeProjectIdRef.current;
        if (projectId) saveProjectPages(projectId, pagesRef.current);
      }
      if (dirHandleRef.current) {
        void writeProjectFiles(dirHandleRef.current, activeProjectIdRef.current ?? 'default', pagesRef.current.map(p => contentToMarkdown(p)), scratchpad);
      }
      void writeToOPFS(pagesRef.current, activeProjectIdRef.current ?? undefined, scratchpad);
      clearTimeout(savedFlashTimeoutRef.current);
      setSavedFlash(true);
      savedFlashTimeoutRef.current = setTimeout(() => setSavedFlash(false), 1500);
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

      const freshContent = extractContent(editorRef.current!);
      const freshLines = freshContent.split('\n');
      const freshOffset = offset;
      const li = Math.min(lineIndex, freshLines.length - 1);
      const currentLine = freshLines[li] || '';
      const exactSlashCommand = getExactSlashCommand(currentLine);
      if (exactSlashCommand) {
        applySlashCommand(exactSlashCommand, li);
        return;
      }
      pushUndo(true);

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
        const slashNumberedMatch = currentLine.match(/^(\s*)(\d+)\/ (.*)/);
        const singleQuoteMatch = currentLine.match(/^(\s*> )(.*)/);
        if (bulletMatch) {
          const prefix = bulletMatch[1];
          const text = bulletMatch[2];
          if (!text.trim()) {
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
        if (numberedMatch || slashNumberedMatch) {
          const match = numberedMatch ?? slashNumberedMatch;
          const indent = match![1];
          const num = parseInt(match![2], 10);
          const text = match![3];
          const separator = numberedMatch ? '. ' : '/ ';
          const fullPrefix = `${indent}${num}${separator}`;
          if (!text.trim()) {
            freshLines[li] = '';
            structuralUpdate(freshLines.join('\n'), li, 0);
            scrollToLine(li);
            return;
          }
          const splitAt = Math.max(0, Math.min(freshOffset, currentLine.length) - fullPrefix.length);
          const nextPrefix = `${indent}${num + 1}${separator}`;
          freshLines[li] = fullPrefix + text.slice(0, splitAt);
          freshLines.splice(li + 1, 0, nextPrefix + text.slice(splitAt));
          structuralUpdate(freshLines.join('\n'), li + 1, nextPrefix.length);
          scrollToLine(li + 1);
          return;
        }
        if (singleQuoteMatch) {
          const prefix = singleQuoteMatch[1];
          const text = singleQuoteMatch[2];
          if (!text.trim()) {
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

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'none';
  }, []);

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const getLinePointFromDOMPoint = useCallback((container: Node, domOffset: number): { lineIndex: number; offset: number } | null => {
    const editor = editorRef.current;
    if (!editor) return null;
    const children = Array.from(editor.childNodes) as HTMLElement[];
    let lineIndex = -1;
    let lineEl: HTMLElement | null = null;

    if (container === editor) {
      lineIndex = Math.max(0, Math.min(domOffset > 0 ? domOffset - 1 : 0, children.length - 1));
      lineEl = children[lineIndex] || null;
      return lineEl ? {
        lineIndex,
        offset: domOffset > lineIndex ? (lineEl.textContent?.length ?? 0) : 0,
      } : null;
    }

    for (let i = 0; i < children.length; i++) {
      if (children[i].contains(container)) {
        lineIndex = i;
        lineEl = children[i];
        break;
      }
    }

    if (lineIndex < 0 || !lineEl) return null;

    let textContainer: Node = lineEl;
    if (lineEl.dataset?.type === 'list-item') {
      const textSpan = lineEl.querySelector('.ce-li-text');
      if (textSpan) textContainer = textSpan;
    }

    let offset = 0;
    try {
      const lineRange = document.createRange();
      lineRange.selectNodeContents(textContainer);
      lineRange.setEnd(container, domOffset);
      offset = lineRange.toString().length;
    } catch {
      offset = 0;
    }

    if (lineEl.dataset?.indent) offset += parseInt(lineEl.dataset.indent) * INDENT.length;
    if (lineEl.dataset?.quotePrefix) offset += 3;
    if (lineEl.dataset?.headingPrefix) offset += parseInt(lineEl.dataset.headingPrefix);

    return { lineIndex, offset };
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
    const startPoint = getLinePointFromDOMPoint(range.startContainer, range.startOffset);
    const endPoint = getLinePointFromDOMPoint(range.endContainer, range.endOffset);
    if (!startPoint || !endPoint) return null;
    const lines = contentRef.current.split('\n');
    const markdownRange = getMarkdownRangeForSelection(startPoint, endPoint, lines);
    if (!markdownRange) return null;
    return contentToMarkdown(contentRef.current, markdownRange);
  }, [getLinePointFromDOMPoint]);

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

  // Web Share API is supported on macOS Safari/Chrome too, which would surface the OS
  // share sheet on desktop and block direct downloads. Gate it to phone/tablet-class
  // devices (coarse pointer + small viewport) so desktop always gets an anchor download.
  const isMobileShareDevice = () =>
    typeof window !== 'undefined' &&
    window.matchMedia?.('(pointer: coarse) and (max-width: 820px)').matches === true;

  const downloadOrShare = async (blob: Blob, filename: string) => {
    const file = new File([blob], filename, { type: blob.type });
    if (isMobileShareDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
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
    downloadOrShare(blob, `${getCurrentExportStem()}.md`);
  };

  const saveDocAsMd = () => {
    const pages = pagesRef.current.filter((page) => page.trim());
    if (!pages.length) return;
    const exported = pages.map((page) => contentToMarkdown(page)).join('\n\n---\n\n');
    const blob = new Blob([exported], { type: 'text/markdown' });
    downloadOrShare(blob, `${getCurrentDocExportStem()}.md`);
  };

  const saveAsShareCard = () => {
    const content = contentRef.current;
    if (!content.trim() || isExportingShareCard) return;
    setIsExportingShareCard(true);

    void (async () => {
      try {
        const canvas = document.createElement('canvas');
        const width = 1080;
        const height = 1350;
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
        const baseFontSize = lines.join('\n').length > 300 ? 20 : 24;
        const lineHeight = Math.round(baseFontSize * 1.5);
        const maxTextWidth = width - 200;
        const wrapped = wrapShareCardLines(ctx, lines, maxTextWidth, baseFontSize, useSerif);
        const maxLines = Math.floor((height - 240) / lineHeight);
        const visibleLines = wrapped.slice(0, maxLines);
        const textHeight = visibleLines.reduce((h, line) => h + (line ? lineHeight : Math.round(lineHeight * 0.7)), 0);
        let y = Math.max(140, Math.round((height - textHeight) / 2) - 10);

        ctx.fillStyle = text;
        ctx.font = getShareCardFont(baseFontSize, useSerif);
        ctx.textBaseline = 'top';

        visibleLines.forEach((line) => {
          if (!line) {
            y += Math.round(lineHeight * 0.7);
            return;
          }
          ctx.fillText(line, 110, y);
          y += lineHeight;
        });

        if (wrapped.length > visibleLines.length) {
          ctx.fillStyle = muted;
          ctx.fillText('...', 110, y);
        }

        ctx.fillStyle = muted;
        ctx.font = '400 26px "Instrument Serif", Georgia, serif';
        ctx.textAlign = 'right';
        const prevSpacing = (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing;
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = '-0.04em';
        ctx.fillText('ezwrite.', width - 110, height - 130);
        (ctx as CanvasRenderingContext2D & { letterSpacing?: string }).letterSpacing = prevSpacing ?? 'normal';
        ctx.textAlign = 'left';

        const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png', 0.95));
        if (!blob) return;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${getCurrentExportStem()}.png`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } finally {
        setIsExportingShareCard(false);
      }
    })();
  };

  const buildPdf = async (pages: string[]) => {
    const { jsPDF } = await import('jspdf');
    const pdf = new jsPDF();
    const pageH = pdf.internal.pageSize.height;
    const pageW = pdf.internal.pageSize.width;
    const margin = 20;
    const lh = 6;
    const maxW = pageW - 2 * margin;
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    let y = margin;

    const renderLines = (lines: string[]) => {
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
    };

    pages.forEach((page, pageIndex) => {
      if (pageIndex > 0) {
        pdf.addPage();
        y = margin;
      }
      renderLines(page.split('\n'));
    });

    return pdf;
  };

  const savePdfFile = async (pages: string[], filename: string) => {
    if (isExportingPdf) return;
    setIsExportingPdf(true);
    try {
      const pdf = await buildPdf(pages);
      const pdfBlob = pdf.output('blob');
      const file = new File([pdfBlob], filename, { type: 'application/pdf' });
      if (isMobileShareDevice() && navigator.share && navigator.canShare?.({ files: [file] })) {
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
  };

  const savePageAsPdf = () => {
    const content = contentRef.current;
    if (!content.trim()) return;
    void savePdfFile([content], `${getCurrentExportStem()}.pdf`);
  };

  const saveDocAsPdf = () => {
    const pages = pagesRef.current.filter((page) => page.trim());
    if (!pages.length) return;
    void savePdfFile(pages, `${getCurrentDocExportStem()}.pdf`);
  };

  // Glow helpers — matches text hue for color themes, original warm glow otherwise
  const glowHsl = colorTheme
    ? (isDark ? '53 38% 87%' : colorTheme === 'blue' ? '230 93% 35%' : colorTheme === 'green' ? '139 34% 24%' : '0 43% 34%')
    : null;
  const visualMetrics = VISUAL_METRICS;
  const visualTextStyle: React.CSSProperties = isDark && visualMetrics.darkTextColor
    ? { color: visualMetrics.darkTextColor }
    : {};
  const titleGlow: React.CSSProperties = glowHsl
    ? {
        ...visualTextStyle,
        textShadow: `0 0 20px hsl(${glowHsl} / ${visualMetrics.themedTitleGlow.near}), 0 0 40px hsl(${glowHsl} / ${visualMetrics.themedTitleGlow.far})`,
      }
    : isDark ? { ...visualTextStyle, textShadow: visualMetrics.warmTitleGlow } : {};
  const editorShellStyle: React.CSSProperties = {
    maxWidth: visualMetrics.editorMaxWidth,
  };

  // Editor styles
  const editorStyle: React.CSSProperties = {
    ...visualTextStyle,
    fontSize: isTouchDevice ? '16px' : visualMetrics.editorFontSize,
    lineHeight: visualMetrics.editorLineHeight,
    caretColor: glowHsl ? `hsl(${glowHsl})` : (isDark ? 'hsl(40 60% 85%)' : 'hsl(0 0% 25%)'),
    outline: 'none',
    whiteSpace: 'pre-wrap',
    wordBreak: 'break-word',
    ...(glowHsl
      ? { textShadow: `0 0 10px hsl(${glowHsl} / ${visualMetrics.themedEditorGlow.near}), 0 0 25px hsl(${glowHsl} / ${visualMetrics.themedEditorGlow.far})` }
      : isDark ? { textShadow: visualMetrics.warmEditorGlow } : {}),
  };

  return (
    <div
      className="min-h-screen bg-background flex flex-col"
      style={{ paddingRight: scratchpadOpen && !isTouchDevice ? scratchpadWidth : undefined }}
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
          className="text-xl sm:text-2xl text-foreground"
          style={{ ...titleGlow, letterSpacing: '-0.04em', fontFamily: "'Instrument Serif', serif", fontSize: '26px' }}
        >
          ezwrite.
        </span>
        <div className="flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity duration-300">
          {isPageEmpty && pageCount > 1 && (
            <button
              onClick={() => deletePage(currentPage)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete current page"
            >
              <Trash2 size={16} />
            </button>
          )}
          <button
            onClick={handleOpenDocs}
            className="text-muted-foreground hover:text-foreground transition-colors"
            aria-label="Open docs"
          >
            <ChevronLeft size={16} />
          </button>
        </div>
      </div>

      {/* Editor */}
      <div
        ref={containerRef}
        data-editor-bg="true"
        className="flex-1 px-4 sm:px-[64px] bg-background flex flex-col cursor-text"
        onClick={handleContainerClick}
        onMouseDown={handleContainerMouseDown}
        onMouseMove={handleContainerMouseMove}
        onMouseUp={handleContainerMouseUp}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
      >
        <div className="w-full mx-auto flex flex-col h-full" style={editorShellStyle} data-editor-bg="true">
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

      {/* Pages */}
      <div
        className={`fixed bottom-10 left-0 right-0 flex justify-center items-center gap-2 pointer-events-none transition-opacity duration-500 ${showDots ? 'opacity-60' : 'opacity-0'}`}
        aria-label="Pages in this doc"
      >
        {pageCount <= 8 ? (
          Array.from({ length: pageCount }).map((_, i) => (
            <button
              key={i}
              onClick={() => switchToPage(i)}
              title={`page ${i + 1} of ${pageCount}`}
              className="pointer-events-auto transition-all duration-200 rounded-full bg-foreground"
              style={{
                width: currentPage === i ? '6px' : '4px',
                height: currentPage === i ? '6px' : '4px',
                opacity: currentPage === i ? 1 : 0.4,
              }}
              aria-label={`Go to page ${i + 1} of ${pageCount}`}
            />
          ))
        ) : (
          <span className="font-mono text-[10px] pointer-events-auto" style={{ opacity: 0.5 }}>
            page {currentPage + 1} / {pageCount}
          </span>
        )}
      </div>

      {/* Save indicator */}
      {savedFlash && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 font-mono text-[10px] text-foreground/40 pointer-events-none select-none">
          saved
        </div>
      )}

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

      {/* Docs panel */}
      <Suspense fallback={null}>
        <NotesPanel
          open={notesOpen}
          projects={projects}
          activeProjectId={activeProjectId}
          canExportPage={Boolean(contentRef.current.trim())}
          canExportDoc={pagesRef.current.some((page) => page.trim())}
          isExportingPdf={isExportingPdf}
          isExportingPng={isExportingShareCard}
          onSelectProject={(id) => switchToProject(id)}
          onNewProject={handleNewProject}
          onDeleteProject={handleDeleteProject}
          onRenameProject={handleRenameProject}
          onOpenSettings={() => { setNotesOpen(false); setSettingsOpen(true); }}
          onOpenScratchpad={handleOpenScratchpad}
          onExportPageMd={saveAsMd}
          onExportDocMd={saveDocAsMd}
          onExportPng={saveAsShareCard}
          onExportPagePdf={savePageAsPdf}
          onExportDocPdf={saveDocAsPdf}
          onClose={() => setNotesOpen(false)}
        />
      </Suspense>

      <Suspense fallback={null}>
        <ScratchpadPanel
          open={scratchpadOpen}
          value={scratchpad}
          width={scratchpadWidth}
          useSerif={useSerif}
          onChange={handleScratchpadChange}
          onResize={setScratchpadWidth}
          onClose={() => setScratchpadOpen(false)}
        />
      </Suspense>

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
