import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  keyboardHeight: number;
  onSlash: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const KEYBOARD_GAP_PX = 8;
const CLOSED_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 0.75rem)';
const tapTargetClass =
  'flex h-10 w-10 touch-manipulation select-none items-center justify-center rounded-full';
const buttonFaceClass =
  'flex h-7 w-7 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-md transition-[transform,colors] active:scale-95';

function runAction(event: React.PointerEvent<HTMLButtonElement>, action: () => void) {
  event.preventDefault();
  event.stopPropagation();
  action();
}

const MobileEditorDock: React.FC<Props> = ({
  canUndo,
  canRedo,
  keyboardHeight,
  onSlash,
  onUndo,
  onRedo,
}) => {
  const dockBottom = keyboardHeight > 0
    ? `${keyboardHeight + KEYBOARD_GAP_PX}px`
    : CLOSED_BOTTOM;

  return (
    <div
      className="fixed right-1.5 z-50 flex flex-col-reverse items-center gap-0.5"
      style={{ bottom: dockBottom }}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      aria-label="Editor actions"
    >
      <button
        type="button"
        onPointerDown={(event) => runAction(event, onSlash)}
        className={tapTargetClass}
        aria-label="Insert slash command"
      >
        <span className={`${buttonFaceClass} border-foreground/20 bg-background font-mono text-sm leading-none`}>/</span>
      </button>
      {canUndo && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, onUndo)}
          className={tapTargetClass}
          aria-label="Undo"
        >
          <span className={buttonFaceClass}>
            <Undo2 size={14} />
          </span>
        </button>
      )}
      {canRedo && (
        <button
          type="button"
          onPointerDown={(event) => runAction(event, onRedo)}
          className={tapTargetClass}
          aria-label="Redo"
        >
          <span className={buttonFaceClass}>
            <Redo2 size={14} />
          </span>
        </button>
      )}
    </div>
  );
};

export default MobileEditorDock;
