import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { GripVertical, X, NotebookPen } from 'lucide-react';
import type { NotesTransferMode } from './preferences';
import SlashCommandPopup from './SlashCommandPopup';
import TimerWidget from './TimerWidget';
import { clearTimerState } from './timer-storage';
import { buildTimerSlots } from './timer-identity';
import {
  contentToHTML,
  contentToScratchpadText,
  extractContent,
  getCleanLine,
  getLineType,
  getRawOffsetUpTo,
  INDENT,
  isLineStruck,
  LIST_EXIT,
  scratchpadTextToContent,
  setCursorPosition,
  STRUCK_MARKER,
  markdownToContent,
} from './writing-helpers';
import {
  getExactSlashCommand,
  finalizeTimerSlashCommand,
  getFloatingSelectionAnchorRect,
  getMarkdownRangeForSelection,
  normalizeEditorContent,
  normalizeClipboardPasteText,
  renumberFollowingPlainNumberedListItems,
  splitExitedListLine,
} from './editor-behavior';
import { EditorHistory, type EditorHistorySnapshot } from './editor-history';
import MobileHistoryControls from './MobileHistoryControls';
import { completeScratchpadPrompt } from '@/lib/openrouter';
import {
  parseScratchpadLlmPrompt,
  SCRATCHPAD_LLM_LOADING_LINE,
  splitScratchpadLlmResponse,
} from '@/lib/scratchpad-llm';

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
  /** Prefix for persisting timer runtime state (scoped to the active notebook). */
  timerScope?: string;
  /** Fires when a scratchpad timer completes a phase / finishes — used to alert the main editor. */
  onTimerComplete?: () => void;
  isTouchDevice?: boolean;
}

interface CursorInfo {
  lineIndex: number;
  offset: number;
  lineDiv: HTMLElement | null;
}

const MIN_WIDTH = 260;
const MAX_WIDTH = 720;

const ScratchpadPanel: React.FC<Props> = ({
  open,
  value,
  width,
  useSerif,
  notesTransferMode,
  onChange,
  onMoveToEditor,
  onClose,
  onResize,
  slashCommands,
  timerScope,
  onTimerComplete,
  isTouchDevice = false,
}) => {
  const isResizingRef = useRef(false);
  const editorRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef(scratchpadTextToContent(value));
  const lastEmittedTextRef = useRef(value);
  const timerContainers = useRef<Map<string, HTMLElement>>(new Map());
  const editingTimerLineRef = useRef<number | null>(null);
  const trackedCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  const pendingCursor = useRef<{ lineIndex: number; offset: number } | null>(null);
  const llmAbortRef = useRef<AbortController | null>(null);
  const editorHistory = useRef(new EditorHistory());
  const suppressInputHistoryRef = useRef(false);
  const [historyVersion, setHistoryVersion] = useState(0);
  const bumpHistory = useCallback(() => setHistoryVersion((v) => v + 1), []);

  const [selectionText, setSelectionText] = useState('');
  const [selectionRect, setSelectionRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [timerSlots, setTimerSlots] = useState<Array<{ stableId: string; config: string; lineIndex: number }>>([]);
  const [slashPopup, setSlashPopup] = useState<{ filter: string; lineIndex: number; rect: DOMRect } | null>(null);
  const [popupHighlight, setPopupHighlight] = useState(0);

  const filteredCommands = useMemo(
    () => (slashPopup ? slashCommands.filter((command) => command.name.startsWith(slashPopup.filter.toLowerCase())) : []),
    [slashCommands, slashPopup],
  );

  useEffect(() => {
    if (slashPopup && filteredCommands.length === 0) setSlashPopup(null);
  }, [filteredCommands.length, slashPopup]);

  const emitContent = useCallback((nextContent: string) => {
    contentRef.current = nextContent;
    const nextText = contentToScratchpadText(nextContent);
    lastEmittedTextRef.current = nextText;
    onChange(nextText);
  }, [onChange]);

  const structuralUpdate = useCallback((
    nextContent: string,
    cursorLine?: number,
    cursorOffset?: number,
    shouldFocus = true,
    emit = true,
  ) => {
    if (emit) emitContent(nextContent);
    else contentRef.current = nextContent;

    if (!editorRef.current) return;

    suppressInputHistoryRef.current = true;
    editorRef.current.innerHTML = contentToHTML(nextContent, {
      editingTimerLine: editingTimerLineRef.current ?? undefined,
      hideUnnamedListHeaders: true,
    });

    const lines = nextContent.split('\n');
    const timers = buildTimerSlots(lines, editingTimerLineRef.current);
    const activeIds = new Set<string>();

    timers.forEach(({ stableId, lineIndex }) => {
      activeIds.add(stableId);
      if (!timerContainers.current.has(stableId)) {
        timerContainers.current.set(stableId, document.createElement('div'));
      }
      const slot = editorRef.current?.querySelector(`[data-timer-slot="${lineIndex}"]`) as HTMLElement | null;
      if (slot) slot.appendChild(timerContainers.current.get(stableId)!);
    });

    Array.from(timerContainers.current.keys()).forEach((stableId) => {
      if (!activeIds.has(stableId)) timerContainers.current.delete(stableId);
    });
    setTimerSlots(timers);

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
        pendingCursor.current = null;
        suppressInputHistoryRef.current = false;
      });
    } else {
      requestAnimationFrame(() => {
        suppressInputHistoryRef.current = false;
      });
    }
  }, [emitContent]);

  useEffect(() => {
    if (value === lastEmittedTextRef.current) return;
    const nextContent = scratchpadTextToContent(value);
    contentRef.current = nextContent;
    editingTimerLineRef.current = null;
    editorHistory.current.clear();
    bumpHistory();
    if (open && editorRef.current) {
      structuralUpdate(nextContent, undefined, undefined, false, false);
    }
  }, [bumpHistory, open, structuralUpdate, value]);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => {
      structuralUpdate(contentRef.current, undefined, undefined, false, false);
      if (!editorRef.current) return;
      editorRef.current.focus({ preventScroll: true });
      const lines = contentRef.current.split('\n');
      const lineIndex = Math.max(0, lines.length - 1);
      const offset = lines[lineIndex]?.length ?? 0;
      trackedCursor.current = { lineIndex, offset };
      setCursorPosition(editorRef.current, lineIndex, offset);
    });
  }, [open, structuralUpdate]);

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

  const getLineOffsetFromDOMPoint = useCallback((container: Node, domOffset: number): { lineIndex: number; offset: number } | null => {
    if (!editorRef.current) return null;

    const children = Array.from(editorRef.current.childNodes) as HTMLElement[];
    let foundIdx = -1;
    let foundEl: HTMLElement | null = null;

    if (container === editorRef.current) {
      foundIdx = Math.max(0, Math.min(domOffset > 0 ? domOffset - 1 : 0, children.length - 1));
      foundEl = children[foundIdx] || null;
    } else {
      for (let i = 0; i < children.length; i++) {
        if (children[i].contains(container)) {
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
      if (container === editorRef.current) {
        offset = domOffset > foundIdx ? (foundEl.textContent?.length ?? 0) : 0;
      } else {
        const result = getRawOffsetUpTo(textContainer, container, domOffset);
        offset = result.offset;
      }
    } catch {
      offset = 0;
    }

    if (foundEl.dataset?.indent) offset += parseInt(foundEl.dataset.indent, 10) * INDENT.length;
    if (foundEl.dataset?.quotePrefix) offset += 3;
    if (foundEl.dataset?.headingPrefix) offset += parseInt(foundEl.dataset.headingPrefix, 10);

    return { lineIndex: foundIdx, offset };
  }, []);

  const getCursorInfo = useCallback((): CursorInfo | null => {
    if (!editorRef.current) return null;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const point = getLineOffsetFromDOMPoint(range.startContainer, range.startOffset);
    if (!point) return null;
    return {
      ...point,
      lineDiv: editorRef.current.children[point.lineIndex] as HTMLElement | null,
    };
  }, [getLineOffsetFromDOMPoint]);

  const captureHistorySnapshot = useCallback((): EditorHistorySnapshot => {
    const tracked = pendingCursor.current ?? trackedCursor.current;
    const live = tracked ?? getCursorInfo();
    return {
      content: contentRef.current,
      cursor: live ? { lineIndex: live.lineIndex, offset: live.offset } : undefined,
    };
  }, [getCursorInfo]);

  const pushUndo = useCallback((force = false) => {
    editorHistory.current.push(captureHistorySnapshot(), { force });
    bumpHistory();
  }, [captureHistorySnapshot, bumpHistory]);

  const applyHistorySnapshot = useCallback((snapshot: EditorHistorySnapshot) => {
    const lineIndex = snapshot.cursor?.lineIndex ?? 0;
    const offset = snapshot.cursor?.offset ?? 0;
    structuralUpdate(snapshot.content, lineIndex, offset, !isTouchDevice);
  }, [isTouchDevice, structuralUpdate]);

  const performUndo = useCallback(() => {
    const snapshot = editorHistory.current.undo(captureHistorySnapshot());
    if (!snapshot) return;
    applyHistorySnapshot(snapshot);
    bumpHistory();
  }, [applyHistorySnapshot, bumpHistory, captureHistorySnapshot]);

  const performRedo = useCallback(() => {
    const snapshot = editorHistory.current.redo(captureHistorySnapshot());
    if (!snapshot) return;
    applyHistorySnapshot(snapshot);
    bumpHistory();
  }, [applyHistorySnapshot, bumpHistory, captureHistorySnapshot]);

  const updateSelection = useCallback(() => {
    if (!editorRef.current) return;
    const sel = window.getSelection();
    if (!sel || !sel.rangeCount || sel.isCollapsed) {
      setSelectionText('');
      setSelectionRect(null);
      return;
    }

    const range = sel.getRangeAt(0);
    if (!editorRef.current.contains(range.commonAncestorContainer)) {
      setSelectionText('');
      setSelectionRect(null);
      return;
    }

    const startPoint = getLineOffsetFromDOMPoint(range.startContainer, range.startOffset);
    const endPoint = getLineOffsetFromDOMPoint(range.endContainer, range.endOffset);

    let nextSelection = sel.toString();
    if (startPoint && endPoint) {
      const textRange = getMarkdownRangeForSelection(startPoint, endPoint, contentRef.current.split('\n'));
      if (textRange) {
        nextSelection = contentToScratchpadText(contentRef.current, textRange);
      }
    }

    if (!nextSelection) {
      setSelectionText('');
      setSelectionRect(null);
      return;
    }

    const rect = getFloatingSelectionAnchorRect(sel, range);
    setSelectionText(nextSelection);
    setSelectionRect(rect ? {
      top: rect.top,
      left: rect.left,
      width: rect.width,
      height: rect.height,
    } : null);
  }, [getLineOffsetFromDOMPoint]);

  useEffect(() => {
    if (!open) return undefined;
    const handleSelectionChange = () => {
      const sel = window.getSelection();
      if (!sel || !editorRef.current) return;
      if (sel.isCollapsed) {
        const point = getLineOffsetFromDOMPoint(sel.anchorNode ?? editorRef.current, sel.anchorOffset);
        if (point) trackedCursor.current = point;
      }
      if (editorRef.current.contains(sel.anchorNode) || editorRef.current.contains(sel.focusNode)) {
        updateSelection();
      } else {
        setSelectionText('');
        setSelectionRect(null);
      }
    };
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [open, updateSelection]);

  const handleMoveToEditor = useCallback(() => {
    if (!editorRef.current || !selectionText) return;

    const sel = window.getSelection();
    const range = sel && sel.rangeCount ? sel.getRangeAt(0) : null;
    const startPoint = range ? getLineOffsetFromDOMPoint(range.startContainer, range.startOffset) : null;

    onMoveToEditor(selectionText);

    if (notesTransferMode === 'move' && range && editorRef.current.contains(range.commonAncestorContainer)) {
      range.deleteContents();
      const rawContent = extractContent(editorRef.current);
      const nextContent = normalizeEditorContent(rawContent);
      structuralUpdate(nextContent, startPoint?.lineIndex ?? 0, startPoint?.offset ?? 0);
    }

    setSelectionText('');
    setSelectionRect(null);
  }, [getLineOffsetFromDOMPoint, notesTransferMode, onMoveToEditor, selectionText, structuralUpdate]);

  const runScratchpadLlmQuery = useCallback(async (lineIndex: number, prompt: string) => {
    llmAbortRef.current?.abort();
    const controller = new AbortController();
    llmAbortRef.current = controller;

    pushUndo(true);
    const lines = contentRef.current.split('\n');
    const loadingIndex = lineIndex + 1;
    lines.splice(loadingIndex, 0, SCRATCHPAD_LLM_LOADING_LINE);
    structuralUpdate(lines.join('\n'), loadingIndex, SCRATCHPAD_LLM_LOADING_LINE.length);

    try {
      const { text: answer } = await completeScratchpadPrompt(prompt, controller.signal);
      if (controller.signal.aborted) return;

      const fresh = contentRef.current.split('\n');
      const loadingLineIndex = fresh.findIndex(
        (line, index) => index > lineIndex && line === SCRATCHPAD_LLM_LOADING_LINE,
      );
      const insertAt = loadingLineIndex >= 0 ? loadingLineIndex : lineIndex + 1;
      const responseLines = splitScratchpadLlmResponse(answer);
      fresh.splice(insertAt, 1, ...responseLines, '');
      structuralUpdate(
        fresh.join('\n'),
        insertAt + responseLines.length,
        0,
      );
    } catch (error) {
      if (controller.signal.aborted) return;

      const fresh = contentRef.current.split('\n');
      const loadingLineIndex = fresh.findIndex(
        (line, index) => index > lineIndex && line === SCRATCHPAD_LLM_LOADING_LINE,
      );
      const insertAt = loadingLineIndex >= 0 ? loadingLineIndex : lineIndex + 1;
      const message = error instanceof Error ? error.message : 'LLM request failed';
      fresh.splice(insertAt, 1, `// error: ${message}`, '');
      structuralUpdate(fresh.join('\n'), insertAt + 1, 0);
    }
  }, [pushUndo, structuralUpdate]);

  const applySlashCommand = useCallback((command: string, lineIndex: number) => {
    const lines = contentRef.current.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    pushUndo(true);
    if (command === 'timer') {
      const finalizedLines = finalizeTimerSlashCommand(lines, lineIndex);
      if (finalizedLines) {
        structuralUpdate(finalizedLines.join('\n'), lineIndex + 1, 0);
      } else {
        lines[lineIndex] = '/timer ';
        structuralUpdate(lines.join('\n'), lineIndex, 7);
      }
    } else if (command === 'line') {
      lines[lineIndex] = 'line';
      if (lineIndex >= lines.length - 1) lines.push('');
      structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
    } else if (command === 'list') {
      lines[lineIndex] = 'list';
      if (lineIndex >= lines.length - 1 || lines[lineIndex + 1] !== '') {
        lines.splice(lineIndex + 1, 0, '');
      }
      structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
    }

    setSlashPopup(null);
  }, [pushUndo, structuralUpdate]);

  const handleBeforeInput = useCallback(() => {
    pushUndo();
  }, [pushUndo]);

  const handleInput = useCallback(() => {
    if (!editorRef.current) return;
    if (!suppressInputHistoryRef.current) {
      pushUndo();
    }

    let hasRawTextNode = false;
    for (const node of editorRef.current.childNodes) {
      if (node.nodeType === Node.TEXT_NODE && node.textContent) {
        hasRawTextNode = true;
        break;
      }
    }

    const rawContent = extractContent(editorRef.current);
    const nextContent = normalizeEditorContent(rawContent);
    const info = getCursorInfo();

    if (info) trackedCursor.current = { lineIndex: info.lineIndex, offset: info.offset };

    if (hasRawTextNode || nextContent !== rawContent) {
      structuralUpdate(nextContent, info?.lineIndex ?? 0, info?.offset ?? 0);
      return;
    }

    emitContent(nextContent);

    if (info) {
      const lines = nextContent.split('\n');
      const lineText = lines[info.lineIndex] || '';
      const visibleText = lineText.startsWith(LIST_EXIT) ? lineText.slice(LIST_EXIT.length) : lineText;
      const trimmed = visibleText.trim();

      if (/^\/\w{0,10}$/.test(trimmed)) {
        const filter = trimmed.slice(1);
        const matches = slashCommands.filter((command) => command.name.startsWith(filter.toLowerCase()));
        if (matches.length > 0) {
          const sel = window.getSelection();
          if (sel && sel.rangeCount) {
            const rect = sel.getRangeAt(0).getBoundingClientRect();
            if (!slashPopup) setPopupHighlight(0);
            setSlashPopup({ rect, filter, lineIndex: info.lineIndex });
          }
          return;
        }
      }

      const domType = info.lineDiv?.dataset?.type;
      const computedType = getLineType(lines, info.lineIndex);
      if (domType && domType !== computedType) {
        structuralUpdate(nextContent, info.lineIndex, info.offset);
        return;
      }
    }

    if (slashPopup) setSlashPopup(null);
  }, [emitContent, getCursorInfo, pushUndo, slashCommands, slashPopup, structuralUpdate]);

  const handleEditorClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const target = e.target as HTMLElement;
    const actionTarget = target.closest('[data-action]') as HTMLElement | null;
    if (!actionTarget) return;

    if (actionTarget.dataset.action === 'link') {
      e.preventDefault();
      const url = actionTarget.getAttribute('href');
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      return;
    }

    if (actionTarget.dataset.action === 'delete') {
      e.preventDefault();
      pushUndo(true);
      const lineIndex = parseInt(actionTarget.dataset.line || '-1', 10);
      const lines = contentRef.current.split('\n');
      if (lineIndex < 0 || lineIndex >= lines.length) return;
      lines.splice(lineIndex, 1);
      if (lines.length === 0) lines.push('');
      const target = Math.min(lineIndex, lines.length - 1);
      structuralUpdate(lines.join('\n'), target, 0);
      return;
    }

    const toggle = target.closest('[data-action="toggle"]') as HTMLElement | null;
    if (!toggle) return;

    e.preventDefault();
    pushUndo(true);
    const lineIndex = parseInt(toggle.dataset.line || '-1', 10);
    const lines = contentRef.current.split('\n');
    if (lineIndex < 0 || lineIndex >= lines.length) return;

    const clean = getCleanLine(lines[lineIndex]);
    lines[lineIndex] = isLineStruck(lines[lineIndex]) ? clean : STRUCK_MARKER + clean;
    structuralUpdate(lines.join('\n'), lineIndex, clean.length);
  }, [pushUndo, structuralUpdate]);

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

    const normalized = markdownToContent(plainWithLoading);
    const pastedLines = normalized.split('\n');

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
  }, [structuralUpdate, getCursorInfo, getLineOffsetFromDOMPoint]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (slashPopup && filteredCommands.length > 0) {
      if (e.key === 'ArrowDown') { e.preventDefault(); setPopupHighlight((index) => Math.min(index + 1, filteredCommands.length - 1)); return; }
      if (e.key === 'ArrowUp') { e.preventDefault(); setPopupHighlight((index) => Math.max(index - 1, 0)); return; }
      if (e.key === 'Enter') { e.preventDefault(); if (filteredCommands[popupHighlight]) applySlashCommand(filteredCommands[popupHighlight].name, slashPopup.lineIndex); return; }
      if (e.key === 'Escape') { e.preventDefault(); setSlashPopup(null); return; }

      const num = parseInt(e.key, 10);
      if (!Number.isNaN(num) && num >= 1 && num <= filteredCommands.length) {
        e.preventDefault();
        applySlashCommand(filteredCommands[num - 1].name, slashPopup.lineIndex);
        return;
      }
    }

    if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === 'm') {
      e.preventDefault();
      handleMoveToEditor();
      return;
    }

    const liveInfo = getCursorInfo();
    const tracked = pendingCursor.current ?? trackedCursor.current;
    const info = liveInfo ?? (tracked
      ? {
          lineIndex: tracked.lineIndex,
          offset: tracked.offset,
          lineDiv: editorRef.current?.children[tracked.lineIndex] as HTMLElement ?? null,
        }
      : null);

    if (!info) {
      if (e.key === 'Enter') {
        e.preventDefault();
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
    const lineType = getLineType(lines, lineIndex);

    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !e.shiftKey) {
      e.preventDefault();
      performUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && ((e.key.toLowerCase() === 'z' && e.shiftKey) || e.key.toLowerCase() === 'y')) {
      e.preventDefault();
      performRedo();
      return;
    }

    if (e.key === 'Tab' && !e.shiftKey) {
      e.preventDefault();
      pushUndo(true);
      if (lineType === 'list-item') {
        const clean = getCleanLine(currentLine);
        lines[lineIndex] = (isLineStruck(currentLine) ? STRUCK_MARKER : '') + INDENT + clean;
        structuralUpdate(lines.join('\n'), lineIndex, offset + INDENT.length);
        return;
      }

      lines[lineIndex] = currentLine.slice(0, offset) + INDENT + currentLine.slice(offset);
      structuralUpdate(lines.join('\n'), lineIndex, offset + INDENT.length);
      return;
    }

    if (e.key === 'Tab' && e.shiftKey) {
      e.preventDefault();
      pushUndo(true);
      if (lineType === 'list-item') {
        const clean = getCleanLine(currentLine);
        if (!clean.startsWith(INDENT)) return;
        lines[lineIndex] = (isLineStruck(currentLine) ? STRUCK_MARKER : '') + clean.slice(INDENT.length);
        structuralUpdate(lines.join('\n'), lineIndex, Math.max(0, offset - INDENT.length));
        return;
      }

      if (!currentLine.startsWith(INDENT)) return;
      lines[lineIndex] = currentLine.slice(INDENT.length);
      structuralUpdate(lines.join('\n'), lineIndex, Math.max(0, offset - INDENT.length));
      return;
    }

    if (e.key === 'Backspace' && lineType === 'list-item' && offset === 0) {
      e.preventDefault();
      pushUndo(true);
      const clean = getCleanLine(currentLine);
      let indentLevel = 0;
      let visibleText = clean;
      while (visibleText.startsWith(INDENT)) {
        indentLevel++;
        visibleText = visibleText.slice(INDENT.length);
      }

      if (!visibleText.trim()) {
        if (indentLevel > 0) {
          lines[lineIndex] = INDENT.repeat(indentLevel - 1);
          structuralUpdate(lines.join('\n'), lineIndex, 0);
        } else {
          lines.splice(lineIndex, 1, LIST_EXIT);
          structuralUpdate(lines.join('\n'), lineIndex, 0);
        }
        return;
      }

      if (clean.startsWith(INDENT)) {
        lines[lineIndex] = (isLineStruck(currentLine) ? STRUCK_MARKER : '') + clean.slice(INDENT.length);
        structuralUpdate(lines.join('\n'), lineIndex, 0);
      }
      return;
    }

    if (e.key === 'Backspace' && offset >= INDENT.length && lineType !== 'list-item') {
      if (currentLine.substring(offset - INDENT.length, offset) === INDENT) {
        e.preventDefault();
        pushUndo(true);
        lines[lineIndex] = currentLine.substring(0, offset - INDENT.length) + currentLine.substring(offset);
        structuralUpdate(lines.join('\n'), lineIndex, offset - INDENT.length);
        return;
      }
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      const llmPrompt = parseScratchpadLlmPrompt(currentLine);
      if (llmPrompt) {
        void runScratchpadLlmQuery(lineIndex, llmPrompt);
        return;
      }

      const finalizedTimerLines = finalizeTimerSlashCommand(lines, lineIndex);
      if (finalizedTimerLines) {
        pushUndo(true);
        structuralUpdate(finalizedTimerLines.join('\n'), lineIndex + 1, 0);
        return;
      }

      const exactSlashCommand = getExactSlashCommand(currentLine, slashCommands);
      if (exactSlashCommand) {
        applySlashCommand(exactSlashCommand, lineIndex);
        return;
      }

      pushUndo(true);

      if (editingTimerLineRef.current === lineIndex) {
        editingTimerLineRef.current = null;
        if (lineIndex >= lines.length - 1) lines.push('');
        structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
        return;
      }

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
              lines[lineIndex] = newIndent + bullet + ' ';
              const updatedLines = renumberFollowingPlainNumberedListItems(lines, lineIndex);
              structuralUpdate(updatedLines.join('\n'), lineIndex, updatedLines[lineIndex]?.length ?? lines[lineIndex].length);
            } else {
              lines[lineIndex] = indent;
              structuralUpdate(lines.join('\n'), lineIndex, indent.length);
            }
            return;
          }

          const splitAt = Math.max(0, Math.min(offset, currentLine.length) - fullPrefix.length);
          let nextPrefix = fullPrefix;
          const numMatch = bullet.match(/\d+/);
          if (numMatch) {
            const nextNum = parseInt(numMatch[0], 10) + 1;
            nextPrefix = `${indent}${bullet.replace(/\d+/, nextNum.toString())} `;
          }

          lines[lineIndex] = fullPrefix + text.slice(0, splitAt);
          lines.splice(lineIndex + 1, 0, nextPrefix + text.slice(splitAt));
          const updatedLines = renumberFollowingPlainNumberedListItems(lines, lineIndex + 1);
          const updatedPrefix = updatedLines[lineIndex + 1]?.match(/^(\s*)([-*>]|\d+[./])\s/)?.[0] ?? nextPrefix;
          structuralUpdate(updatedLines.join('\n'), lineIndex + 1, updatedPrefix.length);
          return;
        }
      }

      if (lineType === 'list-item') {
        const clean = getCleanLine(currentLine);
        let indentLevel = 0;
        let cleanNoIndent = clean;
        while (cleanNoIndent.startsWith(INDENT)) {
          indentLevel++;
          cleanNoIndent = cleanNoIndent.slice(INDENT.length);
        }

        if (!cleanNoIndent.trim()) {
          if (indentLevel > 0) {
            lines[lineIndex] = INDENT.repeat(indentLevel - 1);
            structuralUpdate(lines.join('\n'), lineIndex, 0);
          } else {
            lines.splice(lineIndex, 1, LIST_EXIT);
            structuralUpdate(lines.join('\n'), lineIndex, 0);
          }
          return;
        }

        const struck = isLineStruck(currentLine);
        const splitOffset = Math.min(offset, clean.length);
        const indentPrefix = INDENT.repeat(indentLevel);
        lines[lineIndex] = struck ? STRUCK_MARKER + clean.slice(0, splitOffset) : clean.slice(0, splitOffset);
        lines.splice(lineIndex + 1, 0, indentPrefix + clean.slice(splitOffset));
        structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
        return;
      }

      if (currentLine.startsWith(LIST_EXIT)) {
        const { current, next } = splitExitedListLine(currentLine, offset);
        lines[lineIndex] = current;
        lines.splice(lineIndex + 1, 0, next);
        structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
        return;
      }

      let indentPrefix = '';
      let visibleLine = currentLine;
      while (visibleLine.startsWith(INDENT)) {
        indentPrefix += INDENT;
        visibleLine = visibleLine.slice(INDENT.length);
      }

      const clampedOffset = Math.min(offset, currentLine.length);
      lines[lineIndex] = currentLine.slice(0, clampedOffset);
      const afterCursor = currentLine.slice(clampedOffset);
      const nextLine = indentPrefix && clampedOffset >= indentPrefix.length
        ? indentPrefix + afterCursor.trimStart()
        : afterCursor;
      lines.splice(lineIndex + 1, 0, nextLine);
      structuralUpdate(lines.join('\n'), lineIndex + 1, 0);
      return;
    }

    if (e.key === 'Escape' && editingTimerLineRef.current === lineIndex) {
      e.preventDefault();
      pushUndo(true);
      lines.splice(lineIndex, 1);
      if (!lines.length) lines.push('');
      editingTimerLineRef.current = null;
      structuralUpdate(lines.join('\n'), Math.max(0, lineIndex - 1), 0);
    }
  };

  void historyVersion;
  const canContentUndo = editorHistory.current.canUndo;
  const canContentRedo = editorHistory.current.canRedo;

  return (
    <div
      aria-hidden={!open}
      className={`fixed top-0 right-0 bottom-0 z-50 bg-popover border-l border-border shadow-2xl flex flex-col ${open ? '' : 'hidden'}`}
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

      <div
        ref={editorRef}
        contentEditable
        suppressContentEditableWarning
        spellCheck={false}
        onInput={handleInput}
        onBeforeInput={handleBeforeInput}
        onKeyDown={handleKeyDown}
        onClick={handleEditorClick}
        onPaste={handlePaste}
        className={`flex-1 overflow-y-auto px-4 py-4 outline-none border-0 text-sm sm:text-[15px] font-light tracking-wide leading-relaxed text-foreground placeholder:text-muted-foreground/40 ce-editor scratchpad-editor ${
          useSerif ? 'font-playfair' : 'font-mono'
        }`}
      />

      {isTouchDevice && open && !slashPopup && (
        <MobileHistoryControls
          visible
          canUndo={canContentUndo}
          canRedo={canContentRedo}
          onUndo={performUndo}
          onRedo={performRedo}
          fallbackBottom="calc(env(safe-area-inset-bottom, 0px) + 5rem)"
        />
      )}

      {selectionText && selectionRect && (
        <button
          className="fixed z-50 flex items-center justify-center bg-background border border-border shadow-lg rounded-full p-2 text-foreground/80 hover:text-foreground hover:bg-accent/50 transition-all hover:scale-105 active:scale-95 cursor-pointer"
          style={{
            top: Math.max(16, Math.min(selectionRect.top - 44, window.innerHeight - 64)),
            left: Math.max(8, Math.min(selectionRect.left + (selectionRect.width / 2) - 18, window.innerWidth - 44)),
          }}
          onPointerDown={(e) => {
            e.preventDefault();
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
          onSelect={(name) => applySlashCommand(name, slashPopup.lineIndex)}
          onClose={() => setSlashPopup(null)}
          rect={slashPopup.rect}
        />
      )}

      {timerSlots.map(({ stableId, config, lineIndex }) => {
        const container = timerContainers.current.get(stableId);
        if (!container) return null;
        const persistKey = timerScope ? `${timerScope}:${stableId}` : undefined;
        return createPortal(
          <TimerWidget
            key={stableId}
            config={config}
            persistKey={persistKey}
            onComplete={onTimerComplete}
            onRemove={() => {
              clearTimerState(persistKey);
              pushUndo(true);
              const lines = contentRef.current.split('\n');
              lines.splice(lineIndex, 1);
              if (!lines.length) lines.push('');
              structuralUpdate(lines.join('\n'), Math.max(0, Math.min(lineIndex, lines.length - 1)), 0);
            }}
          />,
          container,
        );
      })}
    </div>
  );
};

export default ScratchpadPanel;
