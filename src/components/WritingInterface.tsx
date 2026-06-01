import React, { useState, useEffect, useRef, useCallback, useMemo, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { ChevronLeft, Trash2, NotebookPen } from 'lucide-react';
import { useTheme } from 'next-themes';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SlashCommandPopup from './SlashCommandPopup';
import TimerWidget from './TimerWidget';
import { clearTimerState } from './timer-storage';
import PolaroidImage from './PolaroidImage';
import NormalImage from './NormalImage';
import { useImagePicker } from './useImagePicker';
import { saveImage, loadImage, processImageForStorage, gcOrphanImages } from '@/lib/imageStore';
import ImageDropDialog from './ImageDropDialog';
import { recognizeImage } from '@/lib/ocr';
import {
  getInitialColorTheme,
  getNextColorTheme,
  pickColorTheme,
  getInitialNotesTransferMode,
  type NotesTransferMode,
  type ColorTheme,
} from './preferences';
import { buildTimerSlots, getAddedTimerStableIds, getRemovedTimerStableIds } from './timer-identity';
import {
  getTouchGestureIntent,
  getPageEndCursor,
  prepareFloatingSlashButtonCommand,
  getShareCardLines,
  getShareCardPalette,
  normalizeClipboardPasteText,
  normalizeEditorContent,
  deletePageFromList,
  type DeletedPageSnapshot,
  indentPlainListLineForTab,
  renumberFollowingPlainNumberedListItems,
  restoreDeletedPageToList,
  shouldAutoFocusAfterPageSwitch,
  splitExitedListLine,
  getFloatingSelectionAnchorRect,
  getSelectedLineRange,
  moveSelectedLineRange,
  type SelectedLineRange,
  getMarkdownRangeForSelection,
  getExactSlashCommand,
  finalizeTimerSlashCommand,
  autoInsertTimerArgSpace,
  getClosestLineIndexForClick,
} from './editor-behavior';
import {
  STRUCK_MARKER, LIST_EXIT, getCleanLine, isLineStruck, getLineType,
  getTimerArgs, getSlashCommands, INDENT,
  contentToHTML, extractContent, setCursorPosition,
  contentToMarkdown, markdownToContent, getRawOffsetUpTo, hasRenderableInlineMarkdown,
  extractContentSliceForSelection,
} from './writing-helpers';
import {
  isFileSystemSupported, getSavedHandle, pickSaveDirectory,
  writeProjectFiles, clearHandle, getDirName, writeToOPFS,
  requestPersistentBrowserStorage,
} from '@/lib/storage';
import {
  initProjects,
  listProjects,
  getActiveProjectId,
  setActiveProjectId,
  createProject,
  deleteProject,
  getProjectMeta,
  getProjectTitle,
  renameProjectTitle,
  getProjectPages,
  saveProjectPages,
  saveProjectSnapshot,
  getProjectTimestamps,
  saveProjectTimestamps,
  getProjectLastPage,
  saveProjectLastPage,
  getProjectScratchpad,
  saveProjectScratchpad,
  setProjectSyncEnabled,
  markProjectSynced,
  updateProjectMeta,
  pageToTitle,
  type ProjectMeta,
} from '@/lib/projects';
import {
  createSyncSession,
  decryptRemoteSyncNote,
  deleteRemoteSyncNote,
  getSyncConfigStatus,
  listRemoteSyncNotes,
  setOnSessionRefreshed,
  upsertRemoteSyncNote,
  type RemoteSyncNote,
  type SyncSession,
} from '@/lib/sync-client';
import { buildSyncProjectSnapshot, hashSnapshot } from '@/lib/sync-crypto';
import { runSequentialSyncBatch, toSyncError } from '@/lib/sync-retry';
import { recordBugReportBreadcrumb, setBugReportRuntimeContext } from '@/lib/bug-report';
import { loadSyncSession, saveSyncSession, clearSyncSession } from '@/lib/sync-session-store';
import MobileSyncGate from './MobileSyncGate';
import { EditorHistory, type EditorHistorySnapshot } from './editor-history';
import MobileEditorDock from './MobileEditorDock';


const InfoDialog = lazy(() => import('./InfoDialog'));
const SettingsDialog = lazy(() => import('./SettingsDialog'));
const NotesPanel = lazy(() => import('./NotesPanel'));
const ScratchpadPanel = lazy(() => import('./ScratchpadPanel'));

const SYNC_DEBOUNCE_MS = 1800;
// Slack allowed between a project's local edit time and its last push/pull marker
// before we treat it as a genuine local change (covers clock + write jitter).
const SYNC_FUDGE_MS = 500;

function buildImageSlots(lines: string[]): Array<{ id: string; caption: string; width: string; lineIndex: number }> {
  return lines.flatMap((line, i) => {
    const m = line.match(/^polaroid::([^|]+)\|?([^|]*)?\|?(.*)?$/);
    if (!m) return [];
    return [{ id: m[1], caption: m[2] ?? '', width: m[3] ?? '', lineIndex: i }];
  });
}

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

function getUntitledFolderName(projectId: string): string {
  const projects = listProjects();
  const untitledProjects = projects.filter(p => !p.title?.trim() || p.title.trim() === 'untitled');
  const index = untitledProjects.findIndex(p => p.id === projectId);
  return `Untitled_${String(index + 1).padStart(3, '0')}`;
}

function getInitialProjectState(): { projects: ProjectMeta[]; activeProjectId: string | null } {
  initProjects();
  return {
    projects: listProjects(),
    activeProjectId: getActiveProjectId(),
  };
}

function sanitizeFileStem(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'untitled';
}

const getShareCardFont = (fontSize: number, useSerif: boolean) =>
  `400 ${fontSize}px ${useSerif ? '"Playfair Display", Georgia, serif' : '"IBM Plex Mono", monospace'}`;

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

const MOBILE_FIXED_UI_CLEARANCE_PX = 132;
/**
 * Room kept between the caret line and the keyboard: enough to clear the
 * floating toolbar (~44px button + 8px margin) plus a line of breathing space.
 */
const MOBILE_CARET_KEYBOARD_MARGIN_PX = 88;
const MOBILE_EDITOR_BOTTOM_PADDING = 'calc(env(safe-area-inset-bottom, 0px) + 13rem)';
const MOBILE_FOOTER_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 0.5rem)';
const MOBILE_PAGE_DOTS_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 2.75rem)';
const PAGE_DELETE_NOTICE_MS = 3500;

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

function getCoverCropRect(sourceWidth: number, sourceHeight: number, targetWidth: number, targetHeight: number) {
  if (sourceWidth <= 0 || sourceHeight <= 0 || targetWidth <= 0 || targetHeight <= 0) {
    return { sx: 0, sy: 0, sw: sourceWidth, sh: sourceHeight };
  }

  const sourceAspect = sourceWidth / sourceHeight;
  const targetAspect = targetWidth / targetHeight;
  if (sourceAspect > targetAspect) {
    const sw = sourceHeight * targetAspect;
    return { sx: (sourceWidth - sw) / 2, sy: 0, sw, sh: sourceHeight };
  }

  const sh = sourceWidth / targetAspect;
  return { sx: 0, sy: (sourceHeight - sh) / 2, sw: sourceWidth, sh };
}

function drawImageCover(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement,
  x: number,
  y: number,
  width: number,
  height: number,
) {
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  const crop = getCoverCropRect(sourceWidth, sourceHeight, width, height);
  ctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, x, y, width, height);
}

function loadImageElement(src: string): Promise<HTMLImageElement> {
  const img = new Image();
  return new Promise((resolve, reject) => {
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Image failed to load'));
    img.src = src;
  });
}

async function createCoverImageDataUrl(src: string, size: number, mimeType: string): Promise<string> {
  const img = await loadImageElement(src);
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return src;
  drawImageCover(ctx, img, 0, 0, size, size);
  return canvas.toDataURL(mimeType, 0.92);
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
  const [selectionRect, setSelectionRect] = useState<DOMRect | null>(null);
  const [selectionText, setSelectionText] = useState<string>('');
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
  const [pendingProjectDelete, setPendingProjectDelete] = useState<{ id: string; title: string } | null>(null);
  const [imageDropDialog, setImageDropDialog] = useState<{
    open: boolean;
    dataUrl: string | null;
    insertAtLine: number;
    isProcessing: boolean;
  }>({ open: false, dataUrl: null, insertAtLine: 0, isProcessing: false });
  const [syncUsername, setSyncUsername] = useState('');
  const [syncPassword, setSyncPassword] = useState('');
  const [syncSession, setSyncSession] = useState<SyncSession | null>(null);
  const [sessionRestored, setSessionRestored] = useState(false);
  const [syncStatus, setSyncStatus] = useState('local only');
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncError, setSyncError] = useState('');
  const syncPushTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const syncQueueRef = useRef<Set<string>>(new Set());
  const syncSessionRef = useRef<SyncSession | null>(null);
  const [timerAlert, setTimerAlert] = useState(false);
  const [pageTransition, setPageTransition] = useState<'none' | 'slide-left' | 'slide-right'>('none');
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const editorRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const editingTimerLineRef = useRef<number | null>(null);
  const backgroundPointerStartRef = useRef<{ x: number; y: number } | null>(null);
  const suppressNextBackgroundFocusRef = useRef(false);

  useEffect(() => {
    syncSessionRef.current = syncSession;
  }, [syncSession]);

  // Sweep orphaned photo bytes (deleted photos still in localStorage) once on mount.
  // Runs after first paint so it doesn't compete with initial render.
  useEffect(() => {
    const timer = window.setTimeout(() => {
      const allContent: string[] = [];
      for (const p of listProjects()) {
        allContent.push(...getProjectPages(p.id));
        allContent.push(getProjectScratchpad(p.id));
      }
      gcOrphanImages(allContent);
    }, 1500);
    return () => window.clearTimeout(timer);
  }, []);

  // Page dots — show briefly on page switch
  const [showDots, setShowDots] = useState(false);
  const dotsTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Touch device + keyboard height
  const isTouchDevice = useState(() => {
    if (typeof window === 'undefined') return false;
    // ?mobile=1 forces the mobile experience (incl. the sign-in gate) on desktop for demos.
    const forcedMobile = new URLSearchParams(window.location.search).get('mobile') === '1';
    return forcedMobile || window.matchMedia('(pointer: coarse)').matches;
  })[0];
  const [kbHeight, setKbHeight] = useState(0);
  const kbHeightRef = useRef(0);
  const getCursorInfoRef = useRef<(() => { lineIndex: number; offset: number } | null)>(() => null);

  useEffect(() => {
    if (!isTouchDevice) return;
    const vv = window.visualViewport;
    if (!vv) return;
    const update = () => {
      const h = Math.max(0, window.innerHeight - vv.height - vv.offsetTop);
      kbHeightRef.current = h;
      setKbHeight(h);
    };
    update();
    vv.addEventListener('resize', update);
    vv.addEventListener('scroll', update);
    return () => {
      vv.removeEventListener('resize', update);
      vv.removeEventListener('scroll', update);
    };
  }, [isTouchDevice]);

  // Color theme toggle — cycles: '' → 'blue' → 'green' → 'red' → ''
  const [colorTheme, setColorTheme] = useState<ColorTheme>(() => getInitialColorTheme());
  const [notesTransferMode, setNotesTransferMode] = useState<NotesTransferMode>(() => getInitialNotesTransferMode());
  const handleToggleNotesTransferMode = () => {
    setNotesTransferMode(v => {
      const next: NotesTransferMode = v === 'move' ? 'copy' : 'move';
      localStorage.setItem('ezwrite-notes-transfer-mode', next);
      return next;
    });
  };
  useEffect(() => {
    if (colorTheme) {
      document.documentElement.setAttribute('data-color-theme', colorTheme);
    } else {
      document.documentElement.removeAttribute('data-color-theme');
    }
  }, [colorTheme]);

  // Keep theme-color meta tag in sync with actual background
  useEffect(() => {
    if (!mounted) return;
    const bg = getComputedStyle(document.body).backgroundColor;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) {
      // Convert rgb(r, g, b) to hex
      const m = bg.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
      if (m) {
        const hex = '#' + [m[1], m[2], m[3]]
          .map(x => parseInt(x).toString(16).padStart(2, '0'))
          .join('');
        meta.setAttribute('content', hex);
      }
    }
  }, [mounted, theme, colorTheme]);
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

  // Cmd+←/→ page navigation (persisted, default on)
  const [cmdArrowPageNav, setCmdArrowPageNav] = useState(() =>
    localStorage.getItem('ezwrite-cmd-arrow-pages') !== 'false'
  );
  const handleToggleCmdArrowPageNav = () => {
    setCmdArrowPageNav(v => {
      const next = !v;
      localStorage.setItem('ezwrite-cmd-arrow-pages', String(next));
      return next;
    });
  };

  // Images in editor (persisted, default on)
  const [imagesEnabled, setImagesEnabled] = useState(() =>
    localStorage.getItem('ezwrite-images-enabled') !== 'false'
  );
  const handleToggleImages = () => {
    setImagesEnabled(v => {
      const next = !v;
      localStorage.setItem('ezwrite-images-enabled', String(next));
      return next;
    });
  };

  const [scratchpadEnabled, setScratchpadEnabled] = useState(() =>
    localStorage.getItem('ezwrite-scratchpad-enabled') !== 'false'
  );
  const handleToggleScratchpad = () => {
    setScratchpadEnabled(v => {
      const next = !v;
      localStorage.setItem('ezwrite-scratchpad-enabled', String(next));
      return next;
    });
  };

  const [sidetabEnabled, setSidetabEnabled] = useState(() =>
    localStorage.getItem('ezwrite-sidetab-enabled') !== 'false'
  );
  const handleToggleSidetab = () => {
    setSidetabEnabled(v => {
      const next = !v;
      localStorage.setItem('ezwrite-sidetab-enabled', String(next));
      return next;
    });
  };

  const [listEnabled, setListEnabled] = useState(() => localStorage.getItem('ezwrite-list-enabled') !== 'false');
  const handleToggleList = () => setListEnabled(v => { const next = !v; localStorage.setItem('ezwrite-list-enabled', String(next)); return next; });

  const [lineEnabled, setLineEnabled] = useState(() => localStorage.getItem('ezwrite-line-enabled') !== 'false');
  const handleToggleLine = () => setLineEnabled(v => { const next = !v; localStorage.setItem('ezwrite-line-enabled', String(next)); return next; });

  const [timerEnabled, setTimerEnabled] = useState(() => localStorage.getItem('ezwrite-timer-enabled') !== 'false');
  const handleToggleTimer = () => setTimerEnabled(v => { const next = !v; localStorage.setItem('ezwrite-timer-enabled', String(next)); return next; });

  const [helpEnabled, setHelpEnabled] = useState(() => localStorage.getItem('ezwrite-help-enabled') !== 'false');
  const handleToggleHelp = () => setHelpEnabled(v => { const next = !v; localStorage.setItem('ezwrite-help-enabled', String(next)); return next; });

  const [settingsCommandEnabled, setSettingsCommandEnabled] = useState(() => localStorage.getItem('ezwrite-settings-command-enabled') !== 'false');
  const handleToggleSettingsCommand = () => setSettingsCommandEnabled(v => { const next = !v; localStorage.setItem('ezwrite-settings-command-enabled', String(next)); return next; });

  const [polaroidFramesEnabled, setPolaroidFramesEnabled] = useState(() => localStorage.getItem('ezwrite-polaroid-frames-enabled') !== 'false');
  const handleTogglePolaroidFrames = () => setPolaroidFramesEnabled(v => { const next = !v; localStorage.setItem('ezwrite-polaroid-frames-enabled', String(next)); return next; });

  // Text justification toggle (persisted, default off)
  const [justifyText, setJustifyText] = useState(() => localStorage.getItem('ezwrite-justify-text') === 'true');
  const handleToggleJustify = () => setJustifyText(v => { const next = !v; localStorage.setItem('ezwrite-justify-text', String(next)); return next; });

  // Export image center-align toggle (persisted, default off — left-aligned)
  const [exportCenterAlign, setExportCenterAlign] = useState(() => localStorage.getItem('ezwrite-export-center-align') === 'true');
  const handleToggleExportCenterAlign = () => setExportCenterAlign(v => { const next = !v; localStorage.setItem('ezwrite-export-center-align', String(next)); return next; });

  // Auto-pair brackets toggle (persisted, default on)
  const [autoPairBrackets, setAutoPairBrackets] = useState(() => localStorage.getItem('ezwrite-auto-pair-brackets') !== 'false');
  const handleToggleAutoPairBrackets = () => setAutoPairBrackets(v => { const next = !v; localStorage.setItem('ezwrite-auto-pair-brackets', String(next)); return next; });

  const slashCommands = useMemo(() => getSlashCommands({
    imagesEnabled,
    sidetabEnabled,
    scratchpadEnabled,
    listEnabled,
    lineEnabled,
    timerEnabled,
    helpEnabled,
    settingsCommandEnabled,
  }), [
    imagesEnabled,
    sidetabEnabled,
    scratchpadEnabled,
    listEnabled,
    lineEnabled,
    timerEnabled,
    helpEnabled,
    settingsCommandEnabled,
  ]);

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
    localStorage.getItem('ezwrite-font') === 'serif'
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

  useEffect(() => {
    void requestPersistentBrowserStorage();
  }, []);

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
      const activeId = activeProjectIdRef.current;
      const title = activeId ? getProjectTitle(activeId) : undefined;
      const folderTitle = title === 'untitled' && activeId ? getUntitledFolderName(activeId) : title;
    writeProjectFiles(h, activeId ?? 'default', pagesRef.current, scratchpad, folderTitle);
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
  // Track image (polaroid) slots for portal rendering
  const [imageSlots, setImageSlots] = useState<Array<{ id: string; caption: string; width: string; lineIndex: number }>>([]);
  const imageContainers = useRef<Map<string, HTMLElement>>(new Map());
  const { pickImage } = useImagePicker();
  const pickImageRef = useRef(pickImage);
  pickImageRef.current = pickImage;
  // Tracks the cursor position set by structuralUpdate while the RAF hasn't fired yet.
  // handleKeyDown uses this instead of live getCursorInfo() during that window.
  const pendingCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  // Continuously tracked cursor from selectionchange — fallback when pendingCursor is null
  // and getCursorInfo() might return stale state (e.g. cursor at container level after innerHTML reset).
  const trackedCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  // True while structuralUpdate is resetting innerHTML — suppresses selectionchange tracking.
  const isResettingDOM = useRef(false);
  // Undo / Redo
  const editorHistory = useRef(new EditorHistory());
  const deletedPageUndoStack = useRef<DeletedPageSnapshot[]>([]);
  const suppressInputHistoryRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);
  const deferredPersistTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const scratchpadPersistTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const pageDeleteNoticeTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const [deletedPageUndoCount, setDeletedPageUndoCount] = useState(0);
  const [pageDeleteNoticeVisible, setPageDeleteNoticeVisible] = useState(false);
  const scratchpadRef = useRef(scratchpad);
  useEffect(() => { scratchpadRef.current = scratchpad; }, [scratchpad]);

  const captureHistorySnapshot = useCallback((): EditorHistorySnapshot => {
    const tracked = pendingCursor.current ?? trackedCursor.current;
    const live = tracked ?? getCursorInfoRef.current();
    return {
      content: contentRef.current,
      cursor: live ? { lineIndex: live.lineIndex, offset: live.offset } : undefined,
    };
  }, []);

  const clearEditorHistory = useCallback(() => {
    editorHistory.current.clear();
    bumpHistory();
  }, [bumpHistory]);

  const pushUndo = useCallback((force = false) => {
    editorHistory.current.push(captureHistorySnapshot(), { force });
    bumpHistory();
  }, [captureHistorySnapshot, bumpHistory]);

  const clearDeletedPageUndo = useCallback(() => {
    deletedPageUndoStack.current = [];
    setDeletedPageUndoCount(0);
    setPageDeleteNoticeVisible(false);
    clearTimeout(pageDeleteNoticeTimeoutRef.current);
  }, []);

  const showDeletedPageUndoNotice = useCallback(() => {
    setDeletedPageUndoCount(deletedPageUndoStack.current.length);
    setPageDeleteNoticeVisible(true);
    clearTimeout(pageDeleteNoticeTimeoutRef.current);
    pageDeleteNoticeTimeoutRef.current = setTimeout(() => {
      setPageDeleteNoticeVisible(false);
    }, PAGE_DELETE_NOTICE_MS);
  }, []);

  // Slash popup
  const [slashPopup, setSlashPopup] = useState<{ rect: DOMRect; filter: string; lineIndex: number } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const isDark = mounted && theme === 'dark';

  const textForStats = contentRef.current || '';
  const wordCount = textForStats.trim() ? textForStats.trim().split(/\s+/).length : 0;
  const charCount = textForStats.length;
  const bugReportTelemetryReadyRef = useRef(false);
  const lastBugReportPageRef = useRef(currentPage);
  const lastBugReportProjectRef = useRef(activeProjectId);
  const lastBugReportSyncUnlockedRef = useRef(Boolean(syncSession));
  const lastBugReportSyncErrorRef = useRef(syncError);

  useEffect(() => {
    setBugReportRuntimeContext({
      activeProjectId: activeProjectId ?? 'none',
      activeProjectSynced: Boolean(activeProjectId && getProjectMeta(activeProjectId)?.syncEnabled),
      cmdArrowPageNav,
      currentPage: currentPage + 1,
      dirHandleAttached: Boolean(dirHandle),
      imagesEnabled,
      infoOpen,
      isTouchDevice,
      keyboardOpen: kbHeight > 0,
      notesOpen,
      pageCharCount: charCount,
      pageCount,
      projectCount: projects.length,
      scratchpadCharCount: scratchpad.length,
      scratchpadOpen,
      settingsOpen,
      spellCheckEnabled,
      syncConfigured: getSyncConfigStatus() === 'ready',
      syncError,
      syncPlan: syncSession?.plan ?? 'free',
      syncStatus,
      syncUnlocked: Boolean(syncSession),
      wordCount,
    });
  }, [
    activeProjectId,
    charCount,
    cmdArrowPageNav,
    currentPage,
    dirHandle,
    imagesEnabled,
    infoOpen,
    isTouchDevice,
    kbHeight,
    notesOpen,
    pageCount,
    projects.length,
    scratchpad.length,
    scratchpadOpen,
    settingsOpen,
    spellCheckEnabled,
    syncError,
    syncSession,
    syncStatus,
    wordCount,
  ]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) {
      bugReportTelemetryReadyRef.current = true;
      return;
    }
    if (lastBugReportPageRef.current !== currentPage) {
      recordBugReportBreadcrumb('switched page', {
        currentPage: currentPage + 1,
        pageCount,
      });
      lastBugReportPageRef.current = currentPage;
    }
  }, [currentPage, pageCount]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (lastBugReportProjectRef.current !== activeProjectId) {
      recordBugReportBreadcrumb('switched project', {
        activeProjectId: activeProjectId ?? 'none',
        projectCount: projects.length,
      });
      lastBugReportProjectRef.current = activeProjectId;
    }
  }, [activeProjectId, projects.length]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (notesOpen) recordBugReportBreadcrumb('opened notes');
  }, [notesOpen]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (infoOpen) recordBugReportBreadcrumb('opened help');
  }, [infoOpen]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (settingsOpen) recordBugReportBreadcrumb('opened settings');
  }, [settingsOpen]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (scratchpadOpen) recordBugReportBreadcrumb('opened scratchpad');
  }, [scratchpadOpen]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    const unlocked = Boolean(syncSession);
    if (lastBugReportSyncUnlockedRef.current === unlocked) return;
    recordBugReportBreadcrumb(unlocked ? 'unlocked sync' : 'locked sync', {
      syncPlan: syncSession?.plan ?? 'free',
    });
    lastBugReportSyncUnlockedRef.current = unlocked;
  }, [syncSession]);

  useEffect(() => {
    if (!bugReportTelemetryReadyRef.current) return;
    if (!syncError || syncError === lastBugReportSyncErrorRef.current) return;
    recordBugReportBreadcrumb('sync error', { syncError });
    lastBugReportSyncErrorRef.current = syncError;
  }, [syncError]);

  const getCurrentDocExportStem = () => sanitizeFileStem(
    activeProjectIdRef.current ? getProjectTitle(activeProjectIdRef.current) : pageToTitle(pagesRef.current[0] ?? '')
  );
  const getCurrentExportStem = () => {
    const base = getCurrentDocExportStem();
    return pageCount > 1 ? `${base}-p${currentPageRef.current + 1}` : base;
  };

  const pushProjectToSync = useCallback(async (
    projectId: string,
    session = syncSessionRef.current,
    opts: { keepalive?: boolean } = {},
  ) => {
    if (!session || getSyncConfigStatus() !== 'ready') return;
    const meta = getProjectMeta(projectId);
    if (!meta?.syncEnabled) return;
    const pages = projectId === activeProjectIdRef.current ? [...pagesRef.current] : getProjectPages(projectId);
    const scratch = projectId === activeProjectIdRef.current ? scratchpadRef.current : getProjectScratchpad(projectId);
    const snapshot = buildSyncProjectSnapshot({
      projectId,
      title: getProjectTitle(projectId),
      pages,
      scratchpad: scratch,
      updatedAt: meta.updatedAt,
    });
    const hash = await hashSnapshot(snapshot);
    if (hash === meta.syncLastPayloadHash) {
      // Unchanged since last push — advance the marker so we stop re-checking.
      updateProjectMeta(projectId, { syncLastPushedAt: meta.updatedAt });
      return;
    }
    const row = await upsertRemoteSyncNote(session, {
      projectId,
      title: snapshot.title,
      pages,
      scratchpad: scratch,
      updatedAt: meta.updatedAt,
    }, opts);
    markProjectSynced(projectId, row.updated_at, meta.updatedAt, hash);
    setProjects(listProjects());
  }, []);

  const runProjectSync = useCallback(async (
    projectId: string,
    options: {
      session?: SyncSession | null;
      keepalive?: boolean;
      queueOnError?: boolean;
      suppressSuccessStatus?: boolean;
      suppressFailureStatus?: boolean;
    } = {},
  ) => {
    try {
      await pushProjectToSync(projectId, options.session ?? syncSessionRef.current, {
        keepalive: options.keepalive,
      });
      syncQueueRef.current.delete(projectId);
      if (!options.suppressSuccessStatus && syncQueueRef.current.size === 0) {
        setSyncError('');
        setSyncStatus('synced');
      }
      return { ok: true as const };
    } catch (error) {
      const syncError = toSyncError(error);
      if (options.queueOnError !== false) syncQueueRef.current.add(projectId);
      if (!options.suppressFailureStatus) {
        setSyncError(syncError.message);
        setSyncStatus('sync failed');
      }
      return { ok: false as const, error: syncError };
    }
  }, [pushProjectToSync]);

  const flushSyncQueue = useCallback(async () => {
    const queuedProjectIds = [...syncQueueRef.current];
    if (queuedProjectIds.length === 0) return;
    syncQueueRef.current.clear();
    setSyncError('');
    setSyncStatus('syncing...');
    const { failed: failedProjects } = await runSequentialSyncBatch(queuedProjectIds, async (projectId) => {
      const result = await runProjectSync(projectId, {
        suppressSuccessStatus: true,
        suppressFailureStatus: true,
      });
      if (!result.ok) throw result.error;
    });
    if (failedProjects.length === 0) {
      setSyncError('');
      setSyncStatus('synced');
    } else {
      setSyncError(failedProjects[0]?.error.message ?? 'Sync failed');
      setSyncStatus('sync failed');
    }
  }, [runProjectSync]);

  const scheduleSyncPush = useCallback((projectId = activeProjectIdRef.current) => {
    if (!projectId || !syncSessionRef.current) return;
    if (!getProjectMeta(projectId)?.syncEnabled) return;
    const timers = syncPushTimersRef.current;
    const existing = timers.get(projectId);
    if (existing) clearTimeout(existing);
    timers.set(projectId, setTimeout(() => {
      timers.delete(projectId);
      void runProjectSync(projectId);
    }, SYNC_DEBOUNCE_MS));
  }, [runProjectSync]);

  const persistScratchpad = useCallback((value: string, projectId = activeProjectIdRef.current) => {
    if (!projectId) return;
    saveProjectScratchpad(projectId, value);
    const pagesSnapshot = [...pagesRef.current];
    clearTimeout(scratchpadPersistTimeoutRef.current);
    scratchpadPersistTimeoutRef.current = setTimeout(() => {
      if (dirHandleRef.current) {
        void writeProjectFiles(dirHandleRef.current, projectId, pagesSnapshot, value, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
      }
      void writeToOPFS(pagesSnapshot, projectId, value, {}, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
      scheduleSyncPush(projectId);
    }, 250);
  }, [scheduleSyncPush]);

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
        void writeProjectFiles(dirHandleRef.current, projectId, pagesSnapshot, scratchpadSnapshot, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
      }
      void writeToOPFS(pagesSnapshot, projectId, scratchpadSnapshot, {}, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
      scheduleSyncPush(projectId);
    }, 250);
  }, [scheduleSyncPush]);

  const persistPageStructure = useCallback((pages: string[], selectedPage: number) => {
    const projectId = activeProjectIdRef.current;
    const pagesSnapshot = [...pages];
    const scratchpadSnapshot = scratchpadRef.current;
    clearTimeout(deferredPersistTimeoutRef.current);

    if (projectId) {
      saveProjectPages(projectId, pagesSnapshot);
      saveProjectLastPage(projectId, selectedPage);
    }
    if (dirHandleRef.current) {
      void writeProjectFiles(dirHandleRef.current, projectId ?? 'default', pagesSnapshot, scratchpadSnapshot, projectId ? (getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId)) : undefined);
    }
    void writeToOPFS(pagesSnapshot, projectId ?? undefined, scratchpadSnapshot, {}, projectId ? (getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId)) : undefined);
    if (projectId) scheduleSyncPush(projectId);
  }, [scheduleSyncPush]);

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
      void writeProjectFiles(dirHandleRef.current, projectId, latestPages, scratchpadValue, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
    }
    void writeToOPFS(latestPages, projectId, scratchpadValue, { delay: 0 }, getProjectTitle(projectId) === 'untitled' ? getUntitledFolderName(projectId) : getProjectTitle(projectId));
    scheduleSyncPush(projectId);
  }, [scheduleSyncPush]);

  useEffect(() => {
    const timers = syncPushTimersRef.current;
    const flushForLifecycle = () => {
      flushCurrentProject();
      const session = syncSessionRef.current;
      const projectId = activeProjectIdRef.current;
      if (session && projectId && getProjectMeta(projectId)?.syncEnabled) {
        const pending = timers.get(projectId);
        if (pending) { clearTimeout(pending); timers.delete(projectId); }
        // Best-effort immediate push so the last edit isn't lost on tab close.
        void runProjectSync(projectId, { keepalive: true });
      }
    };
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
      clearTimeout(pageDeleteNoticeTimeoutRef.current);
      for (const timer of timers.values()) clearTimeout(timer);
      timers.clear();
    };
  }, [flushCurrentProject, runProjectSync]);

  useEffect(() => {
    const handleOnline = () => {
      if (syncQueueRef.current.size > 0 && syncSessionRef.current) {
        void flushSyncQueue();
      }
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flushSyncQueue]);

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

    suppressInputHistoryRef.current = true;
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

    // Find image slots and re-attach persistent containers
    const images = buildImageSlots(lines);
    const activeImageIds = new Set<string>();
    images.forEach(({ id, lineIndex: imgLine }) => {
      activeImageIds.add(id);
      if (!imageContainers.current.has(id)) {
        imageContainers.current.set(id, document.createElement('div'));
      }
      const imgSlot = editorRef.current!.querySelector(`[data-image-slot="${imgLine}"]`) as HTMLElement;
      if (imgSlot) imgSlot.appendChild(imageContainers.current.get(id)!);
    });
    Array.from(imageContainers.current.keys()).forEach((id) => {
      if (!activeImageIds.has(id)) imageContainers.current.delete(id);
    });
    setImageSlots(images);

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
        suppressInputHistoryRef.current = false;
      });
    } else {
      requestAnimationFrame(() => {
        suppressInputHistoryRef.current = false;
      });
    }
  }, [saveContent]);

  const handleInsertFromScratchpad = useCallback((text: string) => {
    if (!text) return;

    const hasLinkMarkdown = /(\[[^\]]+\]\(https?:\/\/[^\s)]+\)|https?:\/\/\S+)/.test(text);

    // Attempt native insert first if editor is focused (plain text only — insertText drops link markup)
    if (!hasLinkMarkdown && document.activeElement === editorRef.current) {
      if (document.execCommand('insertText', false, text)) {
        if (editorRef.current) {
          const textContent = extractContent(editorRef.current);
          contentRef.current = textContent;
          saveContent(textContent);
          setIsPageEmpty(textContent.trim() === '');
        }
        return;
      }
    }

    // Fallback: append or insert based on cursor
    pushUndo(true);
    let newContent = contentRef.current;
    let newLineIndex = 0;
    let newOffset = 0;

    const currentCursor = pendingCursor.current ?? trackedCursor.current;
    if (currentCursor) {
      const { lineIndex, offset } = currentCursor;
      const lines = newContent.split('\n');
      if (lineIndex >= 0 && lineIndex < lines.length) {
        const line = lines[lineIndex];
        lines[lineIndex] = line.substring(0, offset) + text + line.substring(offset);
        newLineIndex = lineIndex;
        newOffset = offset + text.length;
      } else {
        lines.push(text);
        newLineIndex = lines.length - 1;
        newOffset = text.length;
      }
      newContent = lines.join('\n');
    } else {
      newContent = newContent + (newContent.endsWith('\n') ? '' : '\n') + text;
      newLineIndex = newContent.split('\n').length - 1;
      newOffset = text.length;
    }

    structuralUpdate(newContent, newLineIndex, newOffset);
  }, [pushUndo, structuralUpdate, saveContent]);

  const moveToNotes = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || !editorRef.current) return;
    const textToMove = extractContentSliceForSelection(
      editorRef.current,
      contentRef.current,
      sel,
    );
    if (!textToMove) return;

    if (!scratchpadOpen) setScratchpadOpen(true);

    const newScratchpad = scratchpad.trim() 
      ? scratchpad + '\n\n' + textToMove
      : textToMove;
    
    setScratchpad(newScratchpad);
    if (activeProjectId) {
      saveProjectScratchpad(activeProjectId, newScratchpad);
    }

    if (notesTransferMode === 'move') {
      // Attempt native deletion first to preserve undo history if possible.
      // document.execCommand('delete') might not work in all modern setups but is the standard way.
      if (!document.execCommand('delete', false)) {
        // Fallback: manually delete from range
        const range = sel.getRangeAt(0);
        range.deleteContents();
        
        // Update our internal state manually since we bypassed execCommand
        if (editorRef.current) {
          const textContent = extractContent(editorRef.current);
          contentRef.current = textContent;
          saveContent(textContent);
          setIsPageEmpty(textContent.trim() === '');
        }
      }

      if (editorRef.current && !extractContent(editorRef.current).trim()) {
        structuralUpdate('', 0, 0);
      }
    }

    setSelectionRect(null);
    setSelectionText('');
  }, [scratchpad, activeProjectId, saveContent, notesTransferMode, scratchpadOpen, structuralUpdate]);

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
      const sel = window.getSelection();
      if (!sel) return;

      if (!sel.isCollapsed && sel.rangeCount > 0 && editorRef.current?.contains(sel.anchorNode)) {
        const text = sel.toString();
        if (text.trim()) {
          setSelectionText(text);
          // Wait a frame so the browser can calculate the rect accurately after selection
          requestAnimationFrame(() => {
            const currentSel = window.getSelection();
            if (!currentSel || currentSel.rangeCount === 0 || currentSel.isCollapsed) {
              setSelectionRect(null);
              return;
            }
            try {
              setSelectionRect(
                getFloatingSelectionAnchorRect(currentSel, currentSel.getRangeAt(0)),
              );
            } catch (err) {
              setSelectionRect(null);
            }
          });
        } else {
          setSelectionRect(null);
          setSelectionText('');
        }
      } else {
        setSelectionRect(null);
        setSelectionText('');
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []); // getCursorInfo only uses stable refs (editorRef) — closure is safe

  // Pre-warm heavy export chunks so first-click latency is negligible.
  useEffect(() => { void import('jspdf'); }, []);

  // --- Mount ---
  // Mobile can render the sign-in gate first, so wait to hydrate until the editor exists.
  const hasHydratedInitialEditor = useRef(false);
  useEffect(() => {
    setMounted(true);
    if (hasHydratedInitialEditor.current || !editorRef.current) return;
    hasHydratedInitialEditor.current = true;
    structuralUpdate(contentRef.current, 0, 0, true, false);
    setTimeout(() => {
      editorRef.current?.focus();
      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      const lastLen = lines[lastLine]?.length || 0;
      if (editorRef.current) setCursorPosition(editorRef.current, lastLine, lastLen);
    }, 100);
  }, [structuralUpdate, syncSession]);

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
    clearEditorHistory();
    // Show dots briefly while switching pages.
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
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
    }
    const current = currentPageRef.current;
    const result = deletePageFromList(pagesRef.current, pageIndex, current);
    if (!result) return;

    pagesRef.current = result.pages;
    deletedPageUndoStack.current.push(result.deleted);
    setDeletedPageUndoCount(deletedPageUndoStack.current.length);
    showDeletedPageUndoNotice();

    const newPage = result.nextPage;
    const newContent = result.pages[newPage] ?? '';
    setPageCount(result.pages.length);
    persistPageStructure(result.pages, newPage);
    editingTimerLineRef.current = null;
    clearEditorHistory();
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
  }, [clearEditorHistory, persistPageStructure, showDeletedPageUndoNotice, structuralUpdate, isTouchDevice]);

  const restoreLastDeletedPage = useCallback(() => {
    const deletedPage = deletedPageUndoStack.current.pop();
    if (!deletedPage) return false;

    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
    }

    const restored = restoreDeletedPageToList(pagesRef.current, deletedPage);
    pagesRef.current = restored.pages;
    const restoredContent = restored.pages[restored.restoredPage] ?? '';

    setDeletedPageUndoCount(deletedPageUndoStack.current.length);
    if (deletedPageUndoStack.current.length === 0) {
      setPageDeleteNoticeVisible(false);
      clearTimeout(pageDeleteNoticeTimeoutRef.current);
    } else {
      showDeletedPageUndoNotice();
    }

    setPageCount(restored.pages.length);
    persistPageStructure(restored.pages, restored.restoredPage);
    editingTimerLineRef.current = null;
    clearEditorHistory();
    setShowDots(true);
    clearTimeout(dotsTimeoutRef.current);
    dotsTimeoutRef.current = setTimeout(() => setShowDots(false), 500);
    contentRef.current = restoredContent;
    currentPageRef.current = restored.restoredPage;
    setIsPageEmpty(restoredContent.trim() === '');
    setCurrentPage(restored.restoredPage);
    const { lineIndex, offset } = getPageEndCursor(restoredContent);
    structuralUpdate(restoredContent, lineIndex, offset, !isTouchDevice, false);
    return true;
  }, [clearEditorHistory, persistPageStructure, showDeletedPageUndoNotice, structuralUpdate, isTouchDevice]);

  const applyHistorySnapshot = useCallback((snapshot: EditorHistorySnapshot) => {
    const lineIndex = snapshot.cursor?.lineIndex ?? 0;
    const offset = snapshot.cursor?.offset ?? 0;
    structuralUpdate(snapshot.content, lineIndex, offset, !isTouchDevice);
  }, [structuralUpdate, isTouchDevice]);

  const performUndo = useCallback(() => {
    if (restoreLastDeletedPage()) return;
    const snapshot = editorHistory.current.undo(captureHistorySnapshot());
    if (!snapshot) return;
    applyHistorySnapshot(snapshot);
    bumpHistory();
  }, [applyHistorySnapshot, bumpHistory, captureHistorySnapshot, restoreLastDeletedPage]);

  const performRedo = useCallback(() => {
    const snapshot = editorHistory.current.redo(captureHistorySnapshot());
    if (!snapshot) return;
    applyHistorySnapshot(snapshot);
    bumpHistory();
  }, [applyHistorySnapshot, bumpHistory, captureHistorySnapshot]);

  useEffect(() => {
    const handleGlobalPageDeleteUndo = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey) || event.shiftKey || event.key.toLowerCase() !== 'z') return;
      if (deletedPageUndoStack.current.length === 0) return;

      const target = event.target as HTMLElement | null;
      const outsideEditorTextField = target?.closest('input, textarea, [contenteditable="true"]') &&
        !editorRef.current?.contains(target);
      if (outsideEditorTextField) return;

      event.preventDefault();
      event.stopPropagation();
      event.stopImmediatePropagation();
      restoreLastDeletedPage();
    };

    window.addEventListener('keydown', handleGlobalPageDeleteUndo, true);
    return () => window.removeEventListener('keydown', handleGlobalPageDeleteUndo, true);
  }, [restoreLastDeletedPage]);

  // --- Project switching ---
  const switchToProject = useCallback((projectId: string) => {
    if (projectId === activeProjectIdRef.current) return;
    if (editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      const currentProjectId = activeProjectIdRef.current;
      if (currentProjectId) saveProjectPages(currentProjectId, pagesRef.current);
      if (currentProjectId) persistScratchpad(scratchpad, currentProjectId);
    }
    clearDeletedPageUndo();
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
    clearEditorHistory();
    editingTimerLineRef.current = null;
    const { lineIndex, offset } = getPageEndCursor(contentRef.current);
    structuralUpdate(contentRef.current, lineIndex, offset, !isTouchDevice, false);
    setTimeout(() => {
      if (!isTouchDevice) editorRef.current?.focus();
      setPageTransition('none');
    }, 250);
  }, [clearDeletedPageUndo, clearEditorHistory, persistScratchpad, scratchpad, structuralUpdate, isTouchDevice]);

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
    setPendingProjectDelete({ id, title: getProjectTitle(id) });
  }, []);

  const confirmDeleteProject = useCallback(() => {
    const pendingDelete = pendingProjectDelete;
    if (!pendingDelete) return;
    const { id } = pendingDelete;
    setPendingProjectDelete(null);
    const meta = getProjectMeta(id);
    const wasSynced = Boolean(meta?.syncEnabled);
    deleteProject(id);
    const newProjects = listProjects();
    setProjects(newProjects);
    if (id === activeProjectIdRef.current) {
      if (newProjects.length > 0) {
        switchToProject(newProjects[0].id);
      } else {
        const created = createProject('');
        setProjects([created]);
        switchToProject(created.id);
      }
    }
    const session = syncSessionRef.current;
    if (wasSynced && session) {
      deleteRemoteSyncNote(session, id).catch((error) => {
        setSyncError(error instanceof Error ? error.message : 'Sync delete failed');
      });
    }
  }, [pendingProjectDelete, switchToProject]);

  const cancelDeleteProject = useCallback(() => {
    setPendingProjectDelete(null);
  }, []);

  const handleRenameProject = useCallback((id: string, newTitle: string) => {
    // Save current editor state first so unsaved edits on other lines aren't lost.
    if (id === activeProjectIdRef.current && editorRef.current) {
      pagesRef.current[currentPageRef.current] = extractContent(editorRef.current);
      saveProjectPages(id, pagesRef.current);
    }
    renameProjectTitle(id, newTitle);
    scheduleSyncPush(id);
    setProjects(listProjects());
    if (id === activeProjectIdRef.current) {
      const newPages = getProjectPages(id);
      pagesRef.current = newPages;
      if (currentPageRef.current === 0 && editorRef.current) {
        structuralUpdate(newPages[0] ?? '', undefined, undefined, false, false);
      }
    }
  }, [scheduleSyncPush, structuralUpdate]);

  const handleOpenDocs = useCallback(() => {
    setScratchpadOpen(false);
    setNotesOpen(true);
  }, []);

  const handleOpenScratchpad = useCallback(() => {
    setNotesOpen(false);
    setScratchpadOpen(true);
  }, []);

  const handleToggleSideTab = useCallback(() => {
    setNotesOpen(v => {
      if (v) {
        setScratchpadOpen(false);
        return false;
      }
      setScratchpadOpen(false);
      return true;
    });
  }, []);

  const handleScratchpadChange = useCallback((value: string) => {
    setScratchpad(value);
    persistScratchpad(value);
  }, [persistScratchpad]);

  const refreshActiveProjectFromStorage = useCallback(() => {
    const projectId = activeProjectIdRef.current;
    if (!projectId) return;
    const nextPages = getProjectPages(projectId);
    const nextPage = Math.min(getProjectLastPage(projectId), nextPages.length - 1);
    clearDeletedPageUndo();
    pagesRef.current = nextPages;
    contentRef.current = nextPages[nextPage] ?? nextPages[0] ?? '';
    currentPageRef.current = nextPage;
    setCurrentPage(nextPage);
    setPageCount(nextPages.length);
    setScratchpad(getProjectScratchpad(projectId));
    setTimestamps(getProjectTimestamps(projectId));
    setIsPageEmpty(contentRef.current.trim() === '');
    const { lineIndex, offset } = getPageEndCursor(contentRef.current);
    structuralUpdate(contentRef.current, lineIndex, offset, !isTouchDevice, false);
  }, [clearDeletedPageUndo, isTouchDevice, structuralUpdate]);

  const applyRemoteSyncRows = useCallback(async (rows: RemoteSyncNote[], session: SyncSession): Promise<number> => {
    const touchedIds = new Set<string>();
    let activeDeleted = false;
    let maxUpdatedAt = 0;
    for (const row of rows) {
      maxUpdatedAt = Math.max(maxUpdatedAt, row.updated_at);
      const projectId = row.project_id;
      const local = getProjectMeta(projectId);
      const remoteChanged = row.updated_at > (local?.syncLastRemoteUpdatedAt ?? 0);
      const localChanged = Boolean(
        local?.syncEnabled &&
        local.updatedAt > (local.syncLastPushedAt ?? local.syncLastPulledAt ?? 0) + SYNC_FUDGE_MS,
      );

      if (row.deleted) {
        // Remote tombstone: drop the local copy unless it has unsynced local edits.
        if (local && !localChanged) {
          if (projectId === activeProjectIdRef.current) activeDeleted = true;
          deleteProject(projectId);
          touchedIds.add(projectId);
        }
        continue;
      }

      const snapshot = await decryptRemoteSyncNote(row, session);

      if (local && remoteChanged && localChanged) {
        const conflictId = `${snapshot.projectId}-conflict-${Date.now().toString(36)}`;
        saveProjectSnapshot({
          id: conflictId,
          title: `${snapshot.title || 'untitled'} conflict`,
          pages: snapshot.pages,
          scratchpad: snapshot.scratchpad,
          updatedAt: snapshot.updatedAt,
          syncEnabled: false,
        });
        touchedIds.add(conflictId);
        continue;
      }

      if (!local || remoteChanged) {
        saveProjectSnapshot({
          id: snapshot.projectId,
          title: snapshot.title,
          pages: snapshot.pages,
          scratchpad: snapshot.scratchpad,
          updatedAt: snapshot.updatedAt,
          syncEnabled: true,
          syncLastRemoteUpdatedAt: row.updated_at,
          syncLastPushedAt: snapshot.updatedAt,
          syncLastPulledAt: Date.now(),
          syncLastPayloadHash: await hashSnapshot(snapshot),
        });
        touchedIds.add(snapshot.projectId);
      }
    }
    setProjects(listProjects());

    const activeId = activeProjectIdRef.current;
    const projectsNow = listProjects();
    if (activeDeleted || (activeId && !projectsNow.some((p) => p.id === activeId))) {
      const fallback = projectsNow[0];
      if (fallback) {
        activeProjectIdRef.current = fallback.id;
        setActiveProjectIdState(fallback.id);
        setActiveProjectId(fallback.id);
        refreshActiveProjectFromStorage();
      } else {
        const created = createProject('');
        setProjects(listProjects());
        activeProjectIdRef.current = created.id;
        setActiveProjectIdState(created.id);
        refreshActiveProjectFromStorage();
      }
    } else if (activeId && touchedIds.has(activeId)) {
      refreshActiveProjectFromStorage();
    }
    return maxUpdatedAt;
  }, [refreshActiveProjectFromStorage]);

  const syncAllProjects = useCallback(async (session: SyncSession) => {
    setSyncBusy(true);
    setSyncError('');
    setSyncStatus('syncing...');
    const cursorKey = `ezwrite-sync-cursor-${session.userId}`;
    const since = Number(localStorage.getItem(cursorKey) ?? '0') || 0;
    let maxUpdatedAt = since;
    let pullError: Error | null = null;
    try {
      const rows = await listRemoteSyncNotes(session, since);
      maxUpdatedAt = await applyRemoteSyncRows(rows, session);
    } catch (error) {
      pullError = toSyncError(error);
    }
    try {
      const syncedProjects = listProjects().filter((project) => project.syncEnabled);
      const projectIdsToPush: string[] = [];
      for (const project of syncedProjects) {
        const latest = getProjectMeta(project.id);
        if (!latest) continue;
        const needsPush = !latest.syncLastPushedAt || latest.updatedAt > latest.syncLastPushedAt + SYNC_FUDGE_MS;
        if (needsPush) projectIdsToPush.push(project.id);
      }
      const { failed: failedProjects } = await runSequentialSyncBatch(projectIdsToPush, async (projectId) => {
        const result = await runProjectSync(projectId, {
          session,
          suppressSuccessStatus: true,
          suppressFailureStatus: true,
        });
        if (!result.ok) throw result.error;
      });
      if (!pullError && maxUpdatedAt > since) {
        localStorage.setItem(cursorKey, String(maxUpdatedAt));
      }
      setProjects(listProjects());
      if (pullError) {
        setSyncError(pullError.message);
        setSyncStatus('sync failed');
      } else if (failedProjects.length > 0) {
        setSyncError(failedProjects[0]?.error.message ?? 'Sync failed');
        setSyncStatus('sync failed');
      } else {
        setSyncError('');
        setSyncStatus('synced');
      }
    } catch (error) {
      setSyncError(toSyncError(error).message);
      setSyncStatus('sync failed');
    } finally {
      void saveSyncSession(session);
      setSyncBusy(false);
    }
  }, [applyRemoteSyncRows, runProjectSync]);

  const enableSyncForAllLocalProjects = useCallback(() => {
    let changed = false;
    for (const p of listProjects()) {
      if (!p.syncEnabled) { setProjectSyncEnabled(p.id, true); changed = true; }
    }
    if (changed) setProjects(listProjects());
  }, []);

  const handleUnlockSync = useCallback(async (createAccount = false) => {
    const username = syncUsername.trim().toLowerCase();
    const password = syncPassword.trim();
    if (!username) {
      setSyncError('Enter username');
      return;
    }
    if (!password) {
      setSyncError('Enter password');
      return;
    }
    if (getSyncConfigStatus() !== 'ready') {
      setSyncError('Supabase env missing');
      return;
    }
    setSyncBusy(true);
    setSyncError('');
    try {
      const session = await createSyncSession({ username, password, createAccount });
      setSyncSession(session);
      syncSessionRef.current = session;
      setSyncStatus('sync unlocked');
      if (isTouchDevice) enableSyncForAllLocalProjects();
      await syncAllProjects(session);
    } catch (error) {
      const raw = error instanceof Error ? error.message : '';
      const friendly = /invalid_credentials|invalid login/i.test(raw)
        ? 'wrong username or password.'
        : /user_already_exists|already registered/i.test(raw)
          ? 'that username is taken. try signing in instead.'
          : /failed to fetch|networkerror|err_internet|load failed/i.test(raw)
            ? "couldn't reach the server. check your connection."
            : /supabase env missing/i.test(raw)
              ? 'sync is not configured.'
              : "couldn't sign in. please try again.";
      setSyncError(friendly);
      setSyncStatus('sync failed');
    } finally {
      setSyncBusy(false);
    }
  }, [syncUsername, syncPassword, syncAllProjects, isTouchDevice, enableSyncForAllLocalProjects]);

  const handleLockSync = useCallback(() => {
    const session = syncSessionRef.current;
    if (session) localStorage.removeItem(`ezwrite-sync-cursor-${session.userId}`);
    syncQueueRef.current.clear();
    setSyncSession(null);
    syncSessionRef.current = null;
    void clearSyncSession();
    setSyncUsername('');
    setSyncPassword('');
    setSyncError('');
    setSyncStatus('local only');
  }, []);

  // Restore a persisted sign-in on mount so login survives reloads (and the mobile
  // gate doesn't re-prompt every visit). Runs once.
  // Persist a rotated refresh token the moment it changes, so a reload never
  // restores a spent token and fails with `refresh_token_already_used`.
  useEffect(() => {
    setOnSessionRefreshed((session) => { void saveSyncSession(session); });
    return () => setOnSessionRefreshed(null);
  }, []);

  const sessionRestoreStartedRef = useRef(false);
  useEffect(() => {
    if (sessionRestoreStartedRef.current) return;
    sessionRestoreStartedRef.current = true;
    let cancelled = false;
    (async () => {
      try {
        const restored = await loadSyncSession();
        if (cancelled || !restored) return;
        setSyncSession(restored);
        syncSessionRef.current = restored;
        setSyncStatus('sync unlocked');
        if (isTouchDevice) enableSyncForAllLocalProjects();
        await syncAllProjects(restored);
      } catch {
        // ignore — fall through to gate / local-only
      } finally {
        if (!cancelled) setSessionRestored(true);
      }
    })();
    return () => { cancelled = true; };
  }, [isTouchDevice, enableSyncForAllLocalProjects, syncAllProjects]);

  // On mobile, every doc must sync (no device-only writing). Keep the flag set on any
  // newly created project while signed in.
  useEffect(() => {
    if (!isTouchDevice || !syncSession) return;
    enableSyncForAllLocalProjects();
  }, [projects, isTouchDevice, syncSession, enableSyncForAllLocalProjects]);

  const handleToggleProjectSync = useCallback((projectId: string) => {
    flushCurrentProject();
    const project = getProjectMeta(projectId);
    const next = !project?.syncEnabled;
    if (next && !syncSessionRef.current) {
      setSyncStatus('sign in to sync');
      return;
    }
    setProjectSyncEnabled(projectId, next);
    setProjects(listProjects());
    if (!next) {
      syncQueueRef.current.delete(projectId);
      if (syncQueueRef.current.size > 0) {
        setSyncStatus('sync failed');
      } else {
        setSyncError('');
        setSyncStatus(syncSessionRef.current ? 'sync unlocked' : 'local only');
      }
      return;
    }
    setSyncStatus('syncing...');
    void runProjectSync(projectId);
  }, [flushCurrentProject, runProjectSync]);

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
    const sel = window.getSelection();
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    const dy = e.changedTouches[0].clientY - touchStartY.current;
    const intent = getTouchGestureIntent({
      dx,
      dy,
      hasSelection: hadSelection || Boolean(sel && !sel.isCollapsed),
      isKeyboardOpen: kbHeightRef.current > 0,
      isEditorFocused: document.activeElement === editorRef.current,
    });

    if (intent === 'dismiss-keyboard') {
      dismissEditorKeyboard();
      return;
    }

    if (intent === 'page-next') {
      switchToPage(currentPageRef.current + 1);
      return;
    }

    if (intent === 'page-prev') {
      switchToPage(currentPageRef.current - 1);
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

  const keepLineComfortablyVisible = useCallback((lineNode: HTMLElement, behavior: ScrollBehavior = 'smooth') => {
    const rect = lineNode.getBoundingClientRect();
    // When the keyboard is up, keep the caret line ~2 lines above it. With no
    // keyboard, fall back to the fixed clearance for the bottom UI/footer.
    const clearance = Math.max(
      kbHeightRef.current + MOBILE_CARET_KEYBOARD_MARGIN_PX,
      MOBILE_FIXED_UI_CLEARANCE_PX,
    );
    const maxBottom = window.innerHeight - clearance;
    if (rect.bottom <= maxBottom) return;

    window.scrollBy({
      top: rect.bottom - maxBottom,
      behavior,
    });
  }, []);

  const scrollToLine = useCallback((lineIndex: number, behavior: ScrollBehavior = 'smooth') => {
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      const lineNode = editorRef.current.childNodes[lineIndex] as HTMLElement;
      if (!lineNode) return;
      if (isTouchDevice) {
        keepLineComfortablyVisible(lineNode, behavior);
        return;
      }
      lineNode.scrollIntoView({ block: 'nearest', behavior });
    });
  }, [isTouchDevice, keepLineComfortablyVisible]);

  const dismissEditorKeyboard = useCallback(() => {
    setSlashPopup(null);
    const active = document.activeElement;
    if (active instanceof HTMLElement) active.blur();
    window.getSelection()?.removeAllRanges();
  }, []);

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
        if (isTouchDevice) scrollToLine(lineIndex, 'auto');
        return;
      }

      const lines = contentRef.current.split('\n');
      const lastLine = lines.length - 1;
      setCursorPosition(editorRef.current!, lastLine, lines[lastLine]?.length || 0);
      if (isTouchDevice) scrollToLine(lastLine, 'auto');
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
    let target = e.target as HTMLElement;
    
    // Find the closest action target (e.g. if click was on a child of the link)
    const actionTarget = target.closest('[data-action]');
    if (actionTarget) {
      target = actionTarget as HTMLElement;
    }

    const action = target.dataset.action;
    if (!action) return;

    if (action === 'link') {
      e.preventDefault();
      const url = target.getAttribute('href');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

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
      return;
    }

    if (action === 'rename-list') {
      e.preventDefault();
      e.stopPropagation();

      const span = target;
      const originalName = span.textContent || 'rename list';

      // Hide the blinking cursor while editing
      const headerDiv = span.closest('.ce-list-header');
      if (headerDiv) headerDiv.classList.add('ce-lh-editing');

      // Make the text span editable
      span.contentEditable = 'true';
      if (originalName === 'rename list') {
        span.textContent = '';
      }
      span.focus();

      // Place cursor at the end of the text (no highlight)
      const range = document.createRange();
      range.selectNodeContents(span);
      range.collapse(false);
      const sel = window.getSelection();
      if (sel) { sel.removeAllRanges(); sel.addRange(range); }

      const commitRename = () => {
        span.contentEditable = 'false';
        if (headerDiv) headerDiv.classList.remove('ce-lh-editing');
        const newName = (span.textContent || '').trim() || 'rename list';
        span.textContent = newName;
        // Update the underlying content
        pushUndo(true);
        const lines = contentRef.current.split('\n');
        lines[lineIndex] = newName.toLowerCase() === 'rename list' ? 'list' : `list::${newName}`;
        structuralUpdate(lines.join('\n'));
      };

      const handleBlur = () => {
        span.removeEventListener('blur', handleBlur);
        span.removeEventListener('keydown', handleKeyDown);
        commitRename();
      };

      const handleKeyDown = (ev: Event) => {
        const ke = ev as KeyboardEvent;
        if (ke.key === 'Enter') {
          ke.preventDefault();
          span.blur(); // triggers handleBlur -> commitRename
        } else if (ke.key === 'Escape') {
          ke.preventDefault();
          span.textContent = originalName;
          span.removeEventListener('blur', handleBlur);
          span.removeEventListener('keydown', handleKeyDown);
          span.contentEditable = 'false';
          if (headerDiv) headerDiv.classList.remove('ce-lh-editing');
        }
      };

      span.addEventListener('blur', handleBlur);
      span.addEventListener('keydown', handleKeyDown);
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

    let textContainer: Node = foundEl;
    if (foundEl.dataset?.type === 'list-item') {
      const textSpan = foundEl.querySelector('.ce-li-text');
      if (textSpan) textContainer = textSpan;
    }

    let offset = 0;
    try {
      if (range.startContainer === editorRef.current) {
        offset = range.startOffset > foundIdx ? (foundEl.textContent?.length ?? 0) : 0;
      } else {
        const res = getRawOffsetUpTo(textContainer, range.startContainer, range.startOffset);
        offset = res.offset;
      }
    } catch {
      offset = 0;
    }

    if (foundEl.dataset?.indent) {
      offset += parseInt(foundEl.dataset.indent) * INDENT.length;
    }
    if (foundEl.dataset?.quotePrefix) {
      offset += 3;
    }
    if (foundEl.dataset?.headingPrefix) {
      offset += parseInt(foundEl.dataset.headingPrefix);
    }

    return { lineIndex: foundIdx, offset, lineDiv: foundEl };
  };

  getCursorInfoRef.current = () => {
    const info = getCursorInfo();
    return info ? { lineIndex: info.lineIndex, offset: info.offset } : null;
  };

  // Handle input (text-only changes from user typing)
  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    if (!suppressInputHistoryRef.current) {
      pushUndo();
    }

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
    getRemovedTimerStableIds(contentRef.current.split('\n'), newContent.split('\n'))
      .forEach((stableId) => clearTimerState(`main:${activeProjectIdRef.current ?? 'none'}:${currentPageRef.current}:${stableId}`));

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
        const matches = slashCommands.filter(c => c.name.startsWith(filter.toLowerCase()));
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

      if (lineEl && hasRenderableInlineMarkdown(lineEl.textContent || '')) {
        structuralUpdate(newContent, info.lineIndex, info.offset);
        return;
      }

      scrollToLine(info.lineIndex);
    }

    if (slashPopup) setSlashPopup(null);
  }, [slashCommands, slashPopup, pushUndo, structuralUpdate, saveContent, scrollToLine]);

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
    } else if (command === 'sidetab') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      handleToggleSideTab();
    } else if (command === 'scratchpad') {
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      handleOpenScratchpad();
    } else if (command === 'image') {
      if (!imagesEnabled) return;
      lines[lineIndex] = '';
      structuralUpdate(lines.join('\n'), lineIndex, 0, false);
      setSlashPopup(null);
      void (async () => {
        const result = await pickImageRef.current();
        if (!result) return;
        const processed = await processImageForStorage(result.dataUrl);
        const id = saveImage(processed);
        pushUndo(true);
        const cur = editorRef.current ? extractContent(editorRef.current) : contentRef.current;
        const ls = cur.split('\n');
        ls[lineIndex] = `polaroid::${id}|`;
        if (lineIndex >= ls.length - 1) ls.push('');
        structuralUpdate(ls.join('\n'), lineIndex + 1, 0);
      })();
      return;
    } else if (command === 'timer') {
      lines[lineIndex] = '/timer ';
      structuralUpdate(lines.join('\n'), lineIndex, 7);
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
  }, [handleToggleSideTab, imagesEnabled, pushUndo, structuralUpdate]);

  // Slash command select
  const handleSlashSelect = useCallback((command: string) => {
    if (!slashPopup) return;
    applySlashCommand(command, slashPopup.lineIndex);
  }, [applySlashCommand, slashPopup]);

  const filteredCommands = slashPopup
    ? slashCommands.filter(c => c.name.startsWith(slashPopup.filter.toLowerCase()))
    : [];

  useEffect(() => {
    if (slashPopup && filteredCommands.length === 0) setSlashPopup(null);
  }, [slashPopup, filteredCommands.length]);

  const openSlashPopup = useCallback((lineIndex: number, filter = '') => {
    requestAnimationFrame(() => {
      if (!editorRef.current) return;
      editorRef.current.focus({ preventScroll: true });
      setCursorPosition(editorRef.current, lineIndex, filter.length + 1);
      if (isTouchDevice) scrollToLine(lineIndex, 'auto');
      requestAnimationFrame(() => {
        const sel = window.getSelection();
        if (!sel || !sel.rangeCount) return;
        const rect = sel.getRangeAt(0).getBoundingClientRect();
        setPopupHighlight(0);
        setSlashPopup({ rect, filter, lineIndex });
      });
    });
  }, [isTouchDevice, scrollToLine]);

  const handleFloatingSlashButton = useCallback(() => {
    const currentLineIndex = getCursorInfo()?.lineIndex ?? trackedCursor.current?.lineIndex ?? null;
    const { content, lineIndex, offset, filter } = prepareFloatingSlashButtonCommand(
      contentRef.current,
      currentLineIndex,
    );

    if (content !== contentRef.current) {
      pushUndo(true);
      structuralUpdate(content, lineIndex, offset, true);
    }

    openSlashPopup(lineIndex, filter);
  }, [openSlashPopup, pushUndo, structuralUpdate]);

  const getEditorSelectedLineRange = useCallback((): SelectedLineRange | null => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection || selection.isCollapsed || selection.rangeCount === 0) return null;

    const range = selection.getRangeAt(0);
    if (!editor.contains(range.commonAncestorContainer)) return null;
    const lines = Array.from(editor.childNodes);
    if (lines.length === 0) return null;

    const getLinePoint = (container: Node, offset: number, isEnd: boolean) => {
      if (container === editor) {
        return {
          lineIndex: Math.max(0, Math.min(offset, isEnd ? lines.length : lines.length - 1)),
          offset: 0,
        };
      }

      const lineIndex = lines.findIndex((line) => line === container || line.contains(container));
      return lineIndex < 0 ? null : { lineIndex, offset };
    };

    const startPoint = getLinePoint(range.startContainer, range.startOffset, false);
    const endPoint = getLinePoint(range.endContainer, range.endOffset, true);
    return startPoint && endPoint ? getSelectedLineRange(startPoint, endPoint) : null;
  }, []);

  const selectEditorLineRange = useCallback((range: SelectedLineRange) => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    const firstLine = editor?.childNodes[range.start];
    const lastLine = editor?.childNodes[range.end];
    if (!editor || !selection || !firstLine || !lastLine) return;

    const domRange = document.createRange();
    domRange.setStart(firstLine, 0);
    domRange.setEnd(lastLine, lastLine.childNodes.length);
    selection.removeAllRanges();
    selection.addRange(domRange);
  }, []);

  const moveEditorLines = useCallback((
    direction: 'up' | 'down',
    lineIndex: number,
    offset: number,
  ) => {
    if (!editorRef.current) return;

    const selectedRange = getEditorSelectedLineRange();
    const freshLines = extractContent(editorRef.current).split('\n');
    const moved = moveSelectedLineRange(
      freshLines,
      selectedRange ?? { start: lineIndex, end: lineIndex },
      direction,
    );
    if (!moved) return;

    pushUndo(true);
    structuralUpdate(moved.lines.join('\n'), moved.range.start, selectedRange ? 0 : offset);
    if (selectedRange) {
      selectEditorLineRange(moved.range);
      requestAnimationFrame(() => selectEditorLineRange(moved.range));
    }
  }, [getEditorSelectedLineRange, pushUndo, selectEditorLineRange, structuralUpdate]);

  // Key handler
  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    // Clear selection rect on any key down that isn't a modifier
    if (!e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
      setSelectionRect(null);
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      moveToNotes();
      return;
    }

    // Priority: pendingCursor (set by structuralUpdate, RAF not yet fired)
    //        → trackedCursor (last known-good from selectionchange)
    //        → live getCursorInfo() (may return stale state at container level)
    const _cursor = pendingCursor.current ?? trackedCursor.current;
    const info = _cursor
      ? { lineIndex: _cursor.lineIndex, offset: _cursor.offset, lineDiv: editorRef.current?.children[_cursor.lineIndex] as HTMLElement ?? null }
      : getCursorInfo();

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
    const currentLine = lines[lineIndex] || '';

    const timerArgAutofill = autoInsertTimerArgSpace(currentLine, offset, e.key);
    if (!e.metaKey && !e.ctrlKey && !e.altKey && timerArgAutofill) {
      e.preventDefault();
      pushUndo(true);
      lines[lineIndex] = timerArgAutofill.line;
      structuralUpdate(lines.join('\n'), lineIndex, timerArgAutofill.cursorOffset);
      return;
    }

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

    // Ctrl+Z
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      performUndo();
      return;
    }
    // Ctrl+Shift+Z / Ctrl+Y
    if ((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      performRedo();
      return;
    }

    // Cmd+D — delete current page
    if ((e.metaKey || e.ctrlKey) && e.key === 'd') {
      e.preventDefault();
      deletePage(currentPageRef.current);
      return;
    }


    // Tab - 8 space indent
    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      pushUndo(true);

      const indentedList = indentPlainListLineForTab(lines, lineIndex, offset);
      if (indentedList) {
        structuralUpdate(indentedList.lines.join('\n'), lineIndex, indentedList.offset);
        return;
      }

      document.execCommand('insertText', false, INDENT);
      requestAnimationFrame(() => {
        if (editorRef.current) {
          saveContent(extractContent(editorRef.current));
        }
      });
      return;
    }

    // Shift+Tab - unindent
    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      const lineText = lines[lineIndex] || '';
      if (lineText.startsWith(INDENT)) {
        pushUndo(true);
        lines[lineIndex] = lineText.slice(INDENT.length);
        structuralUpdate(lines.join('\n'), lineIndex, Math.max(0, offset - INDENT.length));
      }
      return;
    }

    // Backspace immediately after an indent
    if (e.key === 'Backspace' && offset >= INDENT.length) {
      const lineText = lines[lineIndex] || '';
      // If the string exactly before the cursor is the indent, remove it
      if (lineText.substring(offset - INDENT.length, offset) === INDENT) {
        e.preventDefault();
        pushUndo(true);
        lines[lineIndex] = lineText.substring(0, offset - INDENT.length) + lineText.substring(offset);
        structuralUpdate(lines.join('\n'), lineIndex, offset - INDENT.length);
        return;
      }
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

    // Cmd/Ctrl+Left/Right — switch page (optional; off = native sentence navigation)
    if (cmdArrowPageNav && (e.metaKey || e.ctrlKey) && e.key === 'ArrowLeft') {
      e.preventDefault();
      switchToPage(currentPageRef.current - 1);
      return;
    }
    if (cmdArrowPageNav && (e.metaKey || e.ctrlKey) && e.key === 'ArrowRight') {
      e.preventDefault();
      switchToPage(currentPageRef.current + 1);
      return;
    }

    // Cmd/Ctrl+Arrow move the selected lines together, or the current line.
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowUp') {
      e.preventDefault();
      moveEditorLines('up', lineIndex, offset);
      return;
    }
    if ((e.metaKey || e.ctrlKey) && e.key === 'ArrowDown') {
      e.preventDefault();
      moveEditorLines('down', lineIndex, offset);
      return;
    }

    // Auto-close brackets: (), [], {}
    const BRACKET_PAIRS: Record<string, string> = { '(': ')', '[': ']', '{': '}' };
    if (autoPairBrackets && BRACKET_PAIRS[e.key]) {
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
    if (autoPairBrackets && e.key === '"') {
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
      const finalizedTimerLines = finalizeTimerSlashCommand(freshLines, li);
      if (finalizedTimerLines) {
        pushUndo(true);
        getAddedTimerStableIds(freshLines, finalizedTimerLines)
          .forEach((stableId) => clearTimerState(`main:${activeProjectIdRef.current ?? 'none'}:${currentPageRef.current}:${stableId}`));
        structuralUpdate(finalizedTimerLines.join('\n'), li + 1, 0);
        scrollToLine(li + 1);
        return;
      }
      const exactSlashCommand = getExactSlashCommand(currentLine, slashCommands);
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
        const listMatch = currentLine.match(/^(\s*)([-*>]|\d+[./])\s(.*)/);
        if (listMatch) {
          const indent = listMatch[1];
          const bullet = listMatch[2];
          const text = listMatch[3];
          const fullPrefix = `${indent}${bullet} `;
          
          if (!text.trim()) {
            if (indent.length >= INDENT.length) {
              const newIndent = indent.slice(0, indent.length - INDENT.length);
              freshLines[li] = newIndent + bullet + ' ';
              const updatedLines = renumberFollowingPlainNumberedListItems(freshLines, li);
              structuralUpdate(updatedLines.join('\n'), li, updatedLines[li]?.length ?? freshLines[li].length);
            } else {
              freshLines[li] = indent;
              structuralUpdate(freshLines.join('\n'), li, indent.length);
            }
            scrollToLine(li);
            return;
          }
          
          const splitAt = Math.max(0, Math.min(freshOffset, currentLine.length) - fullPrefix.length);
          let nextPrefix = fullPrefix;
          const numMatch = bullet.match(/\d+/);
          if (numMatch) {
            const nextNum = parseInt(numMatch[0], 10) + 1;
            nextPrefix = `${indent}${bullet.replace(/\d+/, nextNum.toString())} `;
          }
          
          freshLines[li] = fullPrefix + text.slice(0, splitAt);
          freshLines.splice(li + 1, 0, nextPrefix + text.slice(splitAt));
          const updatedLines = renumberFollowingPlainNumberedListItems(freshLines, li + 1);
          const updatedPrefix = updatedLines[li + 1]?.match(/^(\s*)([-*>]|\d+[./])\s/)?.[0] ?? nextPrefix;
          structuralUpdate(updatedLines.join('\n'), li + 1, updatedPrefix.length);
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
    const plain = normalizeClipboardPasteText(raw, htmlData);

    const urlsToFetch: string[] = [];
    const plainWithLoading = plain.replace(/(?<!\]\()(https?:\/\/[^\s<]+)/g, (url) => {
      urlsToFetch.push(url);
      return `[Loading title...](${url})`;
    });

    // Re-hydrate markdown checklists back into ezWrite's internal list representation.
    const normalized = markdownToContent(plainWithLoading);
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
    } else {
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
    }

    urlsToFetch.forEach(url => {
      fetch(`/api/link-title?url=${encodeURIComponent(url)}`)
        .then(res => res.json())
        .then(data => {
          if (data && data.title) {
            const newContent = contentRef.current.replace(`[Loading title...](${url})`, `[${data.title}](${url})`);
            if (newContent !== contentRef.current) structuralUpdate(newContent);
          } else {
            const newContent = contentRef.current.replace(`[Loading title...](${url})`, url);
            if (newContent !== contentRef.current) structuralUpdate(newContent);
          }
        })
        .catch(() => {
          const newContent = contentRef.current.replace(`[Loading title...](${url})`, url);
          if (newContent !== contentRef.current) structuralUpdate(newContent);
        });
    });
  }, [pushUndo, structuralUpdate]);

  const handleImageCaptionChange = useCallback((id: string, newCaption: string) => {
    const slot = editorRef.current?.querySelector(`[data-image-id="${id}"]`) as HTMLElement | null;
    if (slot) slot.dataset.imageCaption = newCaption;
    const ls = contentRef.current.split('\n');
    const idx = ls.findIndex(l => l.startsWith(`polaroid::${id}|`));
    if (idx >= 0) {
      const parts = ls[idx].split('|');
      ls[idx] = `polaroid::${id}|${newCaption}` + (parts[2] ? `|${parts[2]}` : '');
      contentRef.current = ls.join('\n');
      saveContent(contentRef.current);
    }
  }, [saveContent]);

  const handleImageWidthChange = useCallback((id: string, newWidth: string) => {
    const slot = editorRef.current?.querySelector(`[data-image-id="${id}"]`) as HTMLElement | null;
    if (slot) slot.dataset.imageWidth = newWidth;
    const ls = contentRef.current.split('\n');
    const idx = ls.findIndex(l => l.startsWith(`polaroid::${id}|`));
    if (idx >= 0) {
      const parts = ls[idx].split('|');
      ls[idx] = `polaroid::${id}|${parts[1] || ''}|${newWidth}`;
      contentRef.current = ls.join('\n');
      saveContent(contentRef.current);
    }
  }, [saveContent]);

  const processDroppedFiles = useCallback(async (files: FileList | null, clientY: number) => {
    if (!imagesEnabled || !files) return;
    const file = Array.from(files).find(f => f.type.startsWith('image/'));
    if (!file) return;
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (!dataUrl) return;

    const current = editorRef.current ? extractContent(editorRef.current) : contentRef.current;
    const ls = current.split('\n');
    let insertAt = ls.length;
    if (editorRef.current) {
      const lineNodes = Array.from(editorRef.current.childNodes) as HTMLElement[];
      const lineRects = lineNodes.map((node) => node.getBoundingClientRect());
      const closest = getClosestLineIndexForClick(clientY, lineRects);
      insertAt = closest !== null ? closest + 1 : ls.length;
    }
    insertAt = Math.min(Math.max(0, insertAt), ls.length);

    setImageDropDialog({ open: true, dataUrl, insertAtLine: insertAt, isProcessing: false });
  }, [imagesEnabled]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    if (!imagesEnabled) return;
    const hasImage = Array.from(e.dataTransfer.types).includes('Files');
    if (hasImage) {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'copy';
    }
  }, [imagesEnabled]);

  const handleDrop = useCallback((e: React.DragEvent) => {
    if (!imagesEnabled) return;
    const hasImage = Array.from(e.dataTransfer.types).includes('Files');
    if (hasImage) {
      e.preventDefault();
      e.stopPropagation();
      void processDroppedFiles(e.dataTransfer.files, e.clientY);
    }
  }, [imagesEnabled, processDroppedFiles]);

  useEffect(() => {
    const onWindowDragOver = (e: DragEvent) => {
      if (!imagesEnabled || !e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.types).includes('Files')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    };
    const onWindowDrop = (e: DragEvent) => {
      if (!imagesEnabled || !e.dataTransfer) return;
      if (!Array.from(e.dataTransfer.files).some(f => f.type.startsWith('image/'))) return;
      e.preventDefault();
      void processDroppedFiles(e.dataTransfer.files, e.clientY);
    };
    window.addEventListener('dragover', onWindowDragOver);
    window.addEventListener('drop', onWindowDrop);
    return () => {
      window.removeEventListener('dragover', onWindowDragOver);
      window.removeEventListener('drop', onWindowDrop);
    };
  }, [imagesEnabled, processDroppedFiles]);

  const handleInsertDroppedImage = useCallback(async () => {
    const { dataUrl, insertAtLine } = imageDropDialog;
    if (!dataUrl) return;
    setImageDropDialog(prev => ({ ...prev, isProcessing: true }));
    const processed = await processImageForStorage(dataUrl);
    const id = saveImage(processed);
    pushUndo(true);
    const current = editorRef.current ? extractContent(editorRef.current) : contentRef.current;
    const ls = current.split('\n');
    const insertAt = Math.min(Math.max(0, insertAtLine), ls.length);
    ls.splice(insertAt, 0, `polaroid::${id}|`);
    if (ls[ls.length - 1] !== '') ls.push('');
    structuralUpdate(ls.join('\n'), insertAt + 1, 0);
    setImageDropDialog({ open: false, dataUrl: null, insertAtLine: 0, isProcessing: false });
  }, [imageDropDialog, pushUndo, structuralUpdate]);

  const handleOCRDroppedImage = useCallback(async () => {
    const { dataUrl, insertAtLine } = imageDropDialog;
    if (!dataUrl) return;
    setImageDropDialog(prev => ({ ...prev, isProcessing: true }));
    try {
      const text = await recognizeImage(dataUrl);
      const current = editorRef.current ? extractContent(editorRef.current) : contentRef.current;
      const ls = current.split('\n');
      const insertAt = Math.min(Math.max(0, insertAtLine), ls.length);
      if (text) {
        pushUndo(true);
        const ocrLines = text.split(/\r?\n/).filter(l => l.trim() !== '');
        if (ocrLines.length > 0) {
          ls.splice(insertAt, 0, ...ocrLines);
          if (ls[ls.length - 1] !== '') ls.push('');
          structuralUpdate(ls.join('\n'), insertAt + ocrLines.length, 0);
        } else {
          const processed = await processImageForStorage(dataUrl);
          const id = saveImage(processed);
          ls.splice(insertAt, 0, `polaroid::${id}|`);
          if (ls[ls.length - 1] !== '') ls.push('');
          structuralUpdate(ls.join('\n'), insertAt + 1, 0);
        }
      } else {
        const processed = await processImageForStorage(dataUrl);
        const id = saveImage(processed);
        pushUndo(true);
        ls.splice(insertAt, 0, `polaroid::${id}|`);
        if (ls[ls.length - 1] !== '') ls.push('');
        structuralUpdate(ls.join('\n'), insertAt + 1, 0);
      }
    } catch {
      const processed = await processImageForStorage(dataUrl);
      const id = saveImage(processed);
      pushUndo(true);
      const current = editorRef.current ? extractContent(editorRef.current) : contentRef.current;
      const ls = current.split('\n');
      const insertAt = Math.min(Math.max(0, insertAtLine), ls.length);
      ls.splice(insertAt, 0, `polaroid::${id}|`);
      if (ls[ls.length - 1] !== '') ls.push('');
      structuralUpdate(ls.join('\n'), insertAt + 1, 0);
    }
    setImageDropDialog({ open: false, dataUrl: null, insertAtLine: 0, isProcessing: false });
  }, [imageDropDialog, pushUndo, structuralUpdate]);

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

        const textOnlyLines = getShareCardLines(content);
        const hasImages = content.split('\n').some((l: string) => l.startsWith('polaroid::'));
        const baseFontSize = textOnlyLines.join('\n').length > 300 ? 20 : 24;
        const lineHeight = Math.round(baseFontSize * 1.5);
        const maxTextWidth = width - 200;

        const exportTextAlign = exportCenterAlign ? 'center' : 'left';
        const exportTextX = exportCenterAlign ? width / 2 : 110;

        if (!hasImages) {
          // Text-only rendering
          const wrapped = wrapShareCardLines(ctx, textOnlyLines, maxTextWidth, baseFontSize, useSerif);
          const maxLines = Math.floor((height - 240) / lineHeight);
          const visibleLines = wrapped.slice(0, maxLines);
          const textHeight = visibleLines.reduce((h, line) => h + (line ? lineHeight : Math.round(lineHeight * 0.7)), 0);
          let y = Math.max(140, Math.round((height - textHeight) / 2) - 10);
          ctx.fillStyle = text;
          ctx.font = getShareCardFont(baseFontSize, useSerif);
          ctx.textAlign = exportTextAlign;
          ctx.textBaseline = 'top';
          visibleLines.forEach((line) => {
            if (!line) { y += Math.round(lineHeight * 0.7); return; }
            ctx.fillText(line, exportTextX, y);
            y += lineHeight;
          });
          if (wrapped.length > visibleLines.length) {
            ctx.fillStyle = muted;
            ctx.fillText('...', exportTextX, y);
          }
        } else {
          // Document-order render: text and images interleaved
          await document.fonts.load('400 22px "Caveat"');
          const imgCache = new Map<string, HTMLImageElement>();
          for (const rawLine of content.split('\n')) {
            const m = rawLine.match(/^polaroid::([^|]+)\|?(.*)?$/);
            if (!m) continue;
            const data = loadImage(m[1]);
            if (!data) continue;
            const img = new Image();
            await new Promise<void>(res => { img.onload = () => res(); img.onerror = () => res(); img.src = data; });
            imgCache.set(m[1], img);
          }
          let y = 160;
          const contentLines = content.split('\n');
          for (let i = 0; i < contentLines.length; i++) {
            if (y > height - 180) break;
            const rawLine = contentLines[i];
            const lt = getLineType(contentLines, i);
            if (lt === 'image') {
              const m = rawLine.match(/^polaroid::([^|]+)\|?(.*)?$/);
              if (!m) continue;
              const img = imgCache.get(m[1]);
              if (!img) continue;
              const cap = (m[2] ?? '').trim();
              const imgSz = Math.min(280, width - 220);
              const frameP = 14; const capH = 48;
              const fW = imgSz + frameP * 2; const fH = imgSz + frameP * 2 + capH;
              if (y + fH > height - 160) break;
              ctx.save();
              ctx.translate(width / 2, y + fH / 2);
              ctx.shadowColor = 'rgba(0,0,0,0.22)'; ctx.shadowBlur = 20;
              ctx.fillStyle = '#F5ECDD';
              ctx.fillRect(-fW / 2, -fH / 2, fW, fH);
              ctx.shadowBlur = 0;
              ctx.save();
              ctx.beginPath();
              ctx.rect(-imgSz / 2, -fH / 2 + frameP, imgSz, imgSz);
              ctx.clip();
              drawImageCover(ctx, img, -imgSz / 2, -fH / 2 + frameP, imgSz, imgSz);
              ctx.restore();
              if (cap) {
                ctx.fillStyle = '#3a2e1e';
                ctx.font = '400 22px "Caveat", cursive';
                ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
                ctx.fillText(cap, 0, fH / 2 - capH / 2);
              }
              ctx.restore();
              y += fH + 24;
            } else if (lt === 'timer' || lt === 'list-header') {
              // skip
            } else if (lt === 'divider') {
              y += Math.round(lineHeight * 0.5);
            } else {
              let line = rawLine;
              if (isLineStruck(line)) line = line.slice(STRUCK_MARKER.length);
              if (line.startsWith(LIST_EXIT)) line = line.slice(LIST_EXIT.length);
              while (line.startsWith(INDENT)) line = line.slice(INDENT.length);
              const trimmed = line.trim().replace(/^#{1,2}\s+/, '');
              const displayLine = lt === 'list-item'
                ? ((isLineStruck(rawLine) ? '[x] ' : '[ ] ') + trimmed)
                : trimmed;
              ctx.fillStyle = text;
              ctx.font = getShareCardFont(baseFontSize, useSerif);
              ctx.textAlign = exportTextAlign; ctx.textBaseline = 'top';
              if (!displayLine) {
                y += Math.round(lineHeight * 0.7);
              } else {
                const wls = wrapShareCardLines(ctx, [displayLine], maxTextWidth, baseFontSize, useSerif);
                for (const wl of wls) {
                  if (y > height - 180) break;
                  ctx.fillText(wl, exportTextX, y); y += lineHeight;
                }
              }
            }
          }
        }

        ctx.textAlign = 'left';
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

    const renderLines = async (lines: string[]) => {
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const type = getLineType(lines, i);
        if (type === 'divider') {
          if (y > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.setDrawColor(180); pdf.line(margin, y, pageW - margin, y);
          y += lh;
          continue;
        }
        if (type === 'timer') {
          const text = `⏱ ${getTimerArgs(line) || 'stopwatch'}`;
          if (y > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.text(text, margin, y); y += lh;
          continue;
        }
        if (type === 'heading1') {
          pdf.setFontSize(18); pdf.setFont('helvetica', 'bold');
          const text = line.replace(/^#\s*/, '');
          if (y > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.text(text, margin, y); y += lh * 1.8;
          pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
          continue;
        }
        if (type === 'heading2') {
          pdf.setFontSize(15); pdf.setFont('helvetica', 'bold');
          const text = line.replace(/^##\s*/, '');
          if (y > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.text(text, margin, y); y += lh * 1.5;
          pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
          continue;
        }
        if (type === 'image') {
          const m = line.match(/^polaroid::([^|]+)\|?(.*)?$/);
          if (m) {
            const imgData = loadImage(m[1]);
            if (imgData) {
              try {
                const fmtRaw = (imgData.match(/^data:image\/(\w+);/) ?? [])[1] ?? 'jpeg';
                const fmt = fmtRaw.toUpperCase().replace('JPG', 'JPEG');
                const imgMm = 70;
                const croppedImgData = await createCoverImageDataUrl(imgData, 900, fmt === 'PNG' ? 'image/png' : 'image/jpeg');
                const croppedFmt = fmt === 'PNG' ? 'PNG' : 'JPEG';
                if (y + imgMm > pageH - margin) { pdf.addPage(); y = margin; }
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                (pdf as any).addImage(croppedImgData, croppedFmt, margin, y, imgMm, imgMm);
                y += imgMm + lh * 0.5;
                const cap = m[2]?.trim();
                if (cap) {
                  pdf.setFontSize(9); pdf.setFont('helvetica', 'italic');
                  // eslint-disable-next-line @typescript-eslint/no-explicit-any
                  pdf.text(cap, margin + imgMm / 2, y, { align: 'center' } as any);
                  pdf.setFontSize(11); pdf.setFont('helvetica', 'normal');
                  y += lh * 1.5;
                }
              } catch { /* skip if format unsupported */ }
            }
          }
          continue;
        }
        let text = cleanForExport(line);
        if (type === 'list-header') { text = ''; y += lh * 0.5; continue; }
        if (!text.trim()) { y += lh; if (y > pageH - margin) { pdf.addPage(); y = margin; } continue; }
        const split = pdf.splitTextToSize(text, maxW);
        split.forEach((wrappedLine: string) => {
          if (y > pageH - margin) { pdf.addPage(); y = margin; }
          pdf.text(wrappedLine, margin, y); y += lh;
        });
        y += lh * 0.3;
      }
    };

    for (let pageIndex = 0; pageIndex < pages.length; pageIndex++) {
      if (pageIndex > 0) {
        pdf.addPage();
        y = margin;
      }
      await renderLines(pages[pageIndex].split('\n'));
    }

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
  const editorBottomPadding = isTouchDevice ? MOBILE_EDITOR_BOTTOM_PADDING : '200px';

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

  void historyVersion;
  const canContentUndo = editorHistory.current.canUndo;
  const canContentRedo = editorHistory.current.canRedo;

  const syncConfigured = getSyncConfigStatus() === 'ready';
  if (isTouchDevice && syncConfigured && !syncSession) {
    return (
      <MobileSyncGate
        loading={!sessionRestored}
        username={syncUsername}
        password={syncPassword}
        busy={syncBusy}
        error={syncError}
        onUsernameChange={setSyncUsername}
        onPasswordChange={setSyncPassword}
        onSignIn={() => handleUnlockSync(false)}
        onCreateAccount={() => handleUnlockSync(true)}
      />
    );
  }

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
          className="brand-title text-xl sm:text-2xl text-foreground"
          style={{ ...titleGlow, letterSpacing: '-0.04em', fontFamily: "'Instrument Serif', serif", fontSize: '26px' }}
        >
          ezwrite.
        </span>
      </div>

      {/* Floating Actions */}
      <div className="fixed top-5 right-4 sm:top-[70px] sm:right-[64px] z-50 flex items-center gap-3 opacity-60 hover:opacity-100 transition-opacity duration-300">
        <div className="w-4 h-4 flex items-center justify-center">
          {isPageEmpty && pageCount > 1 && (
            <button
              onClick={() => deletePage(currentPage)}
              className="text-muted-foreground hover:text-destructive transition-colors"
              aria-label="Delete current page"
            >
              <Trash2 size={16} />
            </button>
          )}
        </div>
        <button
          onClick={handleOpenDocs}
          className="text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Open notebooks"
        >
          <ChevronLeft size={16} />
        </button>
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
            style={{ paddingBottom: editorBottomPadding }}
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
              className={`${useSerif ? 'font-playfair' : 'font-mono'} text-base sm:text-lg font-light tracking-wide text-foreground ce-editor${justifyText ? ' ce-justify' : ''}`}
              style={editorStyle}
              spellCheck={spellCheckEnabled}
            />

            {selectionRect && containerRef.current && (
              createPortal(
                <button
                  className="fixed z-50 flex items-center justify-center bg-background border border-border shadow-lg rounded-full p-2 text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
                  style={{
                    top: Math.max(16, Math.min(selectionRect.top - 44, window.innerHeight - 64)),
                    left: Math.max(8, Math.min(selectionRect.left + (selectionRect.width / 2) - 18, window.innerWidth - 44)),
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    moveToNotes();
                  }}
                  aria-label="Move selection to notes (Cmd+Shift+M)"
                  title="Move to notes (Cmd+Shift+M)"
                >
                  <NotebookPen size={16} />
                </button>,
                document.body
              )
            )}

            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-accent-foreground rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {pageDeleteNoticeVisible && deletedPageUndoCount > 0 && (
        <div
          className="fixed left-0 right-0 z-50 flex justify-center pointer-events-none"
          style={{ bottom: isTouchDevice ? 'calc(env(safe-area-inset-bottom, 0px) + 5.25rem)' : '5.5rem' }}
          aria-live="polite"
        >
          <div className="pointer-events-auto flex items-center gap-2 text-xs font-mono text-foreground">
            <span>page deleted.</span>
            <button
              type="button"
              onClick={restoreLastDeletedPage}
              className="font-bold text-accent-foreground hover:text-foreground transition-colors"
            >
              undo.
            </button>
          </div>
        </div>
      )}

      {/* Pages */}
      <div
        className={`fixed bottom-10 left-0 right-0 flex justify-center items-center gap-2 pointer-events-none transition-opacity duration-500 ${showDots ? 'opacity-60' : 'opacity-0'}`}
        style={isTouchDevice ? { bottom: MOBILE_PAGE_DOTS_BOTTOM } : undefined}
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


      {isTouchDevice && !scratchpadOpen && !slashPopup && (
        <MobileEditorDock
          canUndo={canContentUndo || deletedPageUndoCount > 0}
          canRedo={canContentRedo}
          keyboardHeight={kbHeight}
          onSlash={handleFloatingSlashButton}
          onUndo={performUndo}
          onRedo={performRedo}
        />
      )}

      {/* Footer */}
      <div
        className="fixed bottom-3 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-70 transition-opacity duration-300"
        style={isTouchDevice ? { bottom: MOBILE_FOOTER_BOTTOM } : undefined}
      >
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
        const persistKey = `main:${activeProjectId ?? 'none'}:${currentPage}:${stableId}`;
        return createPortal(
          <TimerWidget
            key={stableId}
            config={config}
            persistKey={persistKey}
            onRemove={() => {
              clearTimerState(persistKey);
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

      {/* Image portals */}
      {imageSlots.map(({ id, caption, width, lineIndex }) => {
        const container = imageContainers.current.get(id);
        if (!container) return null;
        
        const handleRemove = () => {
          pushUndo(true);
          const ls = contentRef.current.split('\n');
          const idx = ls.findIndex(l => l.startsWith(`polaroid::${id}`));
          if (idx >= 0) {
            ls.splice(idx, 1);
            if (!ls.length) ls.push('');
            structuralUpdate(ls.join('\n'), Math.min(idx, ls.length - 1), 0);
          }
        };

        const Component = polaroidFramesEnabled ? PolaroidImage : NormalImage;
        
        return createPortal(
          <Component
            key={id}
            imageId={id}
            initialCaption={caption}
            initialWidth={width}
            onCaptionChange={(newCaption) => handleImageCaptionChange(id, newCaption)}
            onWidthChange={(newWidth) => handleImageWidthChange(id, newWidth)}
            onRemove={handleRemove}
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
          isProjectSynced={(id) => Boolean(getProjectMeta(id)?.syncEnabled)}
          syncCanUse={Boolean(syncSession)}
          onToggleProjectSync={handleToggleProjectSync}
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
          notesTransferMode={notesTransferMode}
          onChange={handleScratchpadChange}
          onMoveToEditor={handleInsertFromScratchpad}
          onResize={setScratchpadWidth}
          onClose={() => setScratchpadOpen(false)}
          timerScope={`scratch:${activeProjectId ?? 'none'}`}
          onTimerComplete={handleTimerComplete}
          isTouchDevice={isTouchDevice}
          slashCommands={getSlashCommands({
            imagesEnabled: false,
            sidetabEnabled: false,
            scratchpadEnabled: false,
            listEnabled: true,
            lineEnabled: true,
            timerEnabled: true
          }).filter(c => ['list', 'line', 'timer'].includes(c.name))}
        />
      </Suspense>

      <Dialog open={Boolean(pendingProjectDelete)} onOpenChange={(open) => { if (!open) cancelDeleteProject(); }}>
        <DialogContent className="max-w-[90vw] sm:max-w-md bg-popover text-popover-foreground !rounded-2xl">
          <DialogHeader>
            <DialogTitle className="font-mono text-base lowercase">delete notebook?</DialogTitle>
            <DialogDescription className="font-mono text-sm lowercase">
              delete this notebook and everything inside it? this cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="font-mono text-sm text-foreground lowercase">
            {pendingProjectDelete?.title || 'untitled'}
          </div>
          <DialogFooter className="gap-2 sm:gap-2">
            <Button
              type="button"
              variant="outline"
              className="font-mono lowercase"
              onClick={cancelDeleteProject}
            >
              keep notebook
            </Button>
            <Button
              type="button"
              variant="destructive"
              className="font-mono lowercase"
              onClick={confirmDeleteProject}
            >
              delete notebook
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
              imagesEnabled={imagesEnabled}
              accessToken={syncSession?.accessToken}
              userId={syncSession?.userId}
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
              cmdArrowPageNav={cmdArrowPageNav}
              onToggleCmdArrowPageNav={handleToggleCmdArrowPageNav}
              imagesEnabled={imagesEnabled}
              onToggleImages={handleToggleImages}
              sidetabEnabled={sidetabEnabled}
              onToggleSidetab={handleToggleSidetab}
              scratchpadEnabled={scratchpadEnabled}
              onToggleScratchpad={handleToggleScratchpad}
              listEnabled={listEnabled}
              onToggleList={handleToggleList}
              lineEnabled={lineEnabled}
              onToggleLine={handleToggleLine}
              timerEnabled={timerEnabled}
              onToggleTimer={handleToggleTimer}
              helpEnabled={helpEnabled}
              onToggleHelp={handleToggleHelp}
              settingsCommandEnabled={settingsCommandEnabled}
              onToggleSettingsCommand={handleToggleSettingsCommand}
              polaroidFramesEnabled={polaroidFramesEnabled}
              onTogglePolaroidFrames={handleTogglePolaroidFrames}
              justifyText={justifyText}
              onToggleJustify={handleToggleJustify}
              exportCenterAlign={exportCenterAlign}
              onToggleExportCenterAlign={handleToggleExportCenterAlign}
              autoPairBrackets={autoPairBrackets}
              onToggleAutoPairBrackets={handleToggleAutoPairBrackets}
              dirName={getDirName(dirHandle)}
              onPickFolder={handlePickFolder}
              onClearFolder={handleClearFolder}
              fsSupported={isFileSystemSupported()}
              syncConfigured={getSyncConfigStatus() === 'ready'}
              syncUnlocked={Boolean(syncSession)}
              syncAccount={syncSession?.username}
              accessToken={syncSession?.accessToken}
              userId={syncSession?.userId}
              syncPlan={syncSession?.plan ?? 'free'}
              syncBusy={syncBusy}
              syncStatus={syncStatus}
              syncError={syncError}
              syncUsername={syncUsername}
              syncPassword={syncPassword}
              syncCanUse={Boolean(syncSession)}
              activeProjectSynced={Boolean(activeProjectId && getProjectMeta(activeProjectId)?.syncEnabled)}
              forceSyncAll={isTouchDevice}
              onSyncUsernameChange={setSyncUsername}
              onSyncPasswordChange={setSyncPassword}
              onUnlockSync={() => handleUnlockSync(false)}
              onCreateSyncAccount={() => handleUnlockSync(true)}
              onLockSync={handleLockSync}
              onSyncNow={() => {
                if (syncSessionRef.current) void syncAllProjects(syncSessionRef.current);
              }}
              onToggleActiveProjectSync={() => {
                if (activeProjectIdRef.current) handleToggleProjectSync(activeProjectIdRef.current);
              }}
              notesTransferMode={notesTransferMode}
              onToggleNotesTransferMode={handleToggleNotesTransferMode}
            />
          </>
        )}
      </Suspense>

      <ImageDropDialog
        open={imageDropDialog.open}
        onClose={() => setImageDropDialog({ open: false, dataUrl: null, insertAtLine: 0, isProcessing: false })}
        onOCR={handleOCRDroppedImage}
        onInsertImage={handleInsertDroppedImage}
        isProcessing={imageDropDialog.isProcessing}
      />
    </div>
  );
};

export default WritingInterface;
