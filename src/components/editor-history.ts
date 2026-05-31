export type EditorCursor = { lineIndex: number; offset: number };
export type EditorHistorySnapshot = { content: string; cursor?: EditorCursor };

const DEFAULT_DEBOUNCE_MS = 500;
const DEFAULT_MAX_DEPTH = 50;

function snapshotsEqual(a: EditorHistorySnapshot, b: EditorHistorySnapshot): boolean {
  if (a.content !== b.content) return false;
  const ac = a.cursor;
  const bc = b.cursor;
  if (!ac && !bc) return true;
  if (!ac || !bc) return false;
  return ac.lineIndex === bc.lineIndex && ac.offset === bc.offset;
}

export class EditorHistory {
  private undoStack: EditorHistorySnapshot[] = [];
  private redoStack: EditorHistorySnapshot[] = [];
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

  push(snapshot: EditorHistorySnapshot, opts?: { force?: boolean }): void {
    const now = Date.now();
    if (!opts?.force && now - this.lastPushTime < this.debounceMs) return;

    const top = this.undoStack[this.undoStack.length - 1];
    if (top && snapshotsEqual(top, snapshot)) return;

    this.undoStack.push(snapshot);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack = [];
    this.lastPushTime = now;
  }

  undo(current: EditorHistorySnapshot): EditorHistorySnapshot | null {
    if (!this.undoStack.length) return null;

    this.redoStack.push(current);
    const previous = this.undoStack.pop()!;
    return previous;
  }

  redo(current: EditorHistorySnapshot): EditorHistorySnapshot | null {
    if (!this.redoStack.length) return null;

    this.undoStack.push(current);
    const next = this.redoStack.pop()!;
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
