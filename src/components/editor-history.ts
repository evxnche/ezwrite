import type { DeletedPageSnapshot } from './editor-behavior.ts';

export type EditorCursor = { lineIndex: number; offset: number };
export type EditorHistorySnapshot = { content: string; cursor?: EditorCursor };

export type EditorHistoryContentEntry = {
  type: 'content';
  pageIndex: number;
  content: string;
  cursor?: EditorCursor;
};

export type EditorHistoryPageDeleteEntry = {
  type: 'page-delete';
  deleted: DeletedPageSnapshot;
};

/** State captured before undoing a page delete — used to redo the delete. */
export type EditorHistoryPageDeleteRedoEntry = {
  type: 'page-delete-redo';
  deleted: DeletedPageSnapshot;
};

export type EditorHistoryEntry =
  | EditorHistoryContentEntry
  | EditorHistoryPageDeleteEntry
  | EditorHistoryPageDeleteRedoEntry;

export type EditorHistoryPresent = EditorHistorySnapshot & {
  pageIndex?: number;
  pages?: string[];
};

export type EditorHistoryPushOptions = {
  force?: boolean;
  pageIndex?: number;
};

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MAX_DEPTH = 50;

function contentEntriesEqual(a: EditorHistoryContentEntry, b: EditorHistoryContentEntry): boolean {
  if (a.pageIndex !== b.pageIndex || a.content !== b.content) return false;
  const ac = a.cursor;
  const bc = b.cursor;
  if (!ac && !bc) return true;
  if (!ac || !bc) return false;
  return ac.lineIndex === bc.lineIndex && ac.offset === bc.offset;
}

function snapshotToContentEntry(
  snapshot: EditorHistorySnapshot,
  pageIndex: number,
): EditorHistoryContentEntry {
  return { type: 'content', pageIndex, content: snapshot.content, cursor: snapshot.cursor };
}

function presentToContentEntry(present: EditorHistoryPresent): EditorHistoryContentEntry {
  return {
    type: 'content',
    pageIndex: present.pageIndex ?? 0,
    content: present.content,
    cursor: present.cursor,
  };
}

export function contentEntryToSnapshot(entry: EditorHistoryContentEntry): EditorHistorySnapshot {
  return { content: entry.content, cursor: entry.cursor };
}

export function isContentHistoryEntry(
  entry: EditorHistoryEntry,
): entry is EditorHistoryContentEntry {
  return entry.type === 'content';
}

function adjustContentPageIndices(
  stack: EditorHistoryEntry[],
  fromIndex: number,
  delta: number,
): void {
  for (const entry of stack) {
    if (entry.type === 'content' && entry.pageIndex >= fromIndex) {
      entry.pageIndex += delta;
    }
  }
}

export class EditorHistory {
  private undoStack: EditorHistoryEntry[] = [];
  private redoStack: EditorHistoryEntry[] = [];
  private lastPushTime = 0;
  private readonly debounceMs: number;
  private readonly maxDepth: number;

  constructor(options?: { debounceMs?: number; maxDepth?: number }) {
    this.debounceMs = options?.debounceMs ?? DEFAULT_DEBOUNCE_MS;
    this.maxDepth = options?.maxDepth ?? DEFAULT_MAX_DEPTH;
  }

  get canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  get canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  push(snapshot: EditorHistorySnapshot, opts?: EditorHistoryPushOptions): void {
    this.pushEntry(
      snapshotToContentEntry(snapshot, opts?.pageIndex ?? 0),
      opts,
    );
  }

  /** Keep undo indices aligned when a page is removed (not when recording the delete step itself). */
  notifyPageDeleted(deleted: DeletedPageSnapshot): void {
    this.pruneContentEntriesForPage(deleted.index);
    this.shiftContentPageIndicesAbove(deleted.index, -1);
  }

  pushPageDelete(deleted: DeletedPageSnapshot): void {
    this.notifyPageDeleted(deleted);
    this.pushEntry({ type: 'page-delete', deleted }, { force: true });
  }

  /** Drop text-undo steps for a page that was removed (page delete undo restores full page content). */
  private pruneContentEntriesForPage(pageIndex: number): void {
    const keep = (entry: EditorHistoryEntry) =>
      entry.type !== 'content' || entry.pageIndex !== pageIndex;
    this.undoStack = this.undoStack.filter(keep);
    this.redoStack = this.redoStack.filter(keep);
  }

  private shiftContentPageIndicesAbove(pageIndex: number, delta: number): void {
    if (delta === 0) return;
    if (delta < 0) {
      adjustContentPageIndices(this.undoStack, pageIndex + 1, delta);
      adjustContentPageIndices(this.redoStack, pageIndex + 1, delta);
      return;
    }
    adjustContentPageIndices(this.undoStack, pageIndex, delta);
    adjustContentPageIndices(this.redoStack, pageIndex, delta);
  }

  onPageRestored(restoredIndex: number): void {
    this.shiftContentPageIndicesAbove(restoredIndex, 1);
  }

  private pushEntry(entry: EditorHistoryEntry, opts?: EditorHistoryPushOptions): void {
    const now = Date.now();
    if (!opts?.force && now - this.lastPushTime < this.debounceMs) return;

    if (entry.type === 'content') {
      const top = this.undoStack[this.undoStack.length - 1];
      if (top?.type === 'content' && contentEntriesEqual(top, entry)) return;
    }

    this.undoStack.push(entry);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastPushTime = now;
  }

  undo(present: EditorHistoryPresent): EditorHistoryEntry | null {
    if (!this.undoStack.length) return null;

    this.redoStack.push(presentToContentEntry(present));
    const previous = this.undoStack.pop()!;
    if (previous.type === 'page-delete') {
      this.redoStack[this.redoStack.length - 1] = {
        type: 'page-delete-redo',
        deleted: previous.deleted,
      };
    }
    return previous;
  }

  redo(present: EditorHistoryPresent): EditorHistoryEntry | null {
    if (!this.redoStack.length) return null;

    const next = this.redoStack.pop()!;
    if (next.type === 'page-delete-redo') {
      this.undoStack.push({ type: 'page-delete', deleted: next.deleted });
    } else if (next.type === 'content') {
      this.undoStack.push(presentToContentEntry(present));
    } else {
      this.undoStack.push(next);
    }
    return next;
  }

  clear(): void {
    this.undoStack = [];
    this.redoStack = [];
    this.lastPushTime = 0;
  }
}

export const MOBILE_HISTORY_BUTTON_SIZE_PX = 44;
export const MOBILE_HISTORY_BUTTON_GAP_PX = 8;
/** Height of undo + redo stack when both buttons are visible. */
export const MOBILE_HISTORY_CONTROLS_STACK_HEIGHT_PX =
  MOBILE_HISTORY_BUTTON_SIZE_PX + MOBILE_HISTORY_BUTTON_GAP_PX + MOBILE_HISTORY_BUTTON_SIZE_PX;
