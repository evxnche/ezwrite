import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Redo2, Undo2, X } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  keyboardHeight: number;
  onSlash: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const TAP_TARGET_SIZE_PX = 44;
const KEYBOARD_GAP_PX = 10;
const CLOSED_BOTTOM = 'calc(env(safe-area-inset-bottom, 0px) + 3.5rem)';
const tapTargetClass =
  'flex h-11 w-11 touch-manipulation select-none items-center justify-center rounded-full';
const buttonFaceClass =
  'flex h-8 w-8 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-md transition-[transform,opacity,colors] active:scale-95';

const MobileEditorDock: React.FC<Props> = ({
  canUndo,
  canRedo,
  keyboardHeight,
  onSlash,
  onUndo,
  onRedo,
}) => {
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const collapse = (event: MouseEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('click', collapse);
    return () => document.removeEventListener('click', collapse);
  }, [open]);

  const dockStyle: React.CSSProperties = keyboardHeight > 0
    ? { top: Math.max(8, window.innerHeight - keyboardHeight - TAP_TARGET_SIZE_PX - KEYBOARD_GAP_PX) }
    : { bottom: CLOSED_BOTTOM };

  return (
    <div
      ref={dockRef}
      className="fixed right-1.5 z-50"
      style={dockStyle}
      onPointerDown={(event) => event.stopPropagation()}
      onTouchStart={(event) => event.stopPropagation()}
      onTouchEnd={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      aria-label="Editor actions"
    >
      <div
        className={`absolute right-full top-0 mr-1 flex gap-1 transition-[transform,opacity] duration-150 ${
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-2 opacity-0'
        }`}
      >
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onSlash();
          }}
          className={tapTargetClass}
          aria-label="Insert slash command"
        >
          <span className={`${buttonFaceClass} font-mono text-base leading-none`}>/</span>
        </button>
        {canUndo && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onUndo();
            }}
            className={tapTargetClass}
            aria-label="Undo"
          >
            <span className={buttonFaceClass}>
              <Undo2 size={15} />
            </span>
          </button>
        )}
        {canRedo && (
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation();
              onRedo();
            }}
            className={tapTargetClass}
            aria-label="Redo"
          >
            <span className={buttonFaceClass}>
              <Redo2 size={15} />
            </span>
          </button>
        )}
      </div>

      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setOpen((value) => !value);
        }}
        className={tapTargetClass}
        aria-expanded={open}
        aria-label={open ? 'Close editor actions' : 'Open editor actions'}
      >
        <span className={`${buttonFaceClass} border-foreground/20 bg-background`}>
          {open ? <X size={14} /> : <MoreHorizontal size={17} />}
        </span>
      </button>
    </div>
  );
};

export default MobileEditorDock;
