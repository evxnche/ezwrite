import React, { useEffect, useRef, useState } from 'react';
import { MoreHorizontal, Redo2, Undo2, X } from 'lucide-react';

interface Props {
  canUndo: boolean;
  canRedo: boolean;
  onSlash: () => void;
  onUndo: () => void;
  onRedo: () => void;
}

const buttonClass =
  'flex h-11 w-11 items-center justify-center rounded-full border border-border bg-popover text-muted-foreground shadow-lg transition-[transform,opacity,colors] active:scale-95 disabled:pointer-events-none disabled:opacity-35';

const MobileEditorDock: React.FC<Props> = ({
  canUndo,
  canRedo,
  onSlash,
  onUndo,
  onRedo,
}) => {
  const [open, setOpen] = useState(false);
  const dockRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;

    const collapse = (event: PointerEvent) => {
      if (!dockRef.current?.contains(event.target as Node)) setOpen(false);
    };

    document.addEventListener('pointerdown', collapse);
    return () => document.removeEventListener('pointerdown', collapse);
  }, [open]);

  return (
    <div
      ref={dockRef}
      className="fixed right-3 top-[52dvh] z-50 -translate-y-1/2"
      aria-label="Editor actions"
    >
      <div
        className={`absolute right-full top-0 mr-2 flex gap-2 transition-[transform,opacity] duration-150 ${
          open ? 'translate-x-0 opacity-100' : 'pointer-events-none translate-x-3 opacity-0'
        }`}
      >
        <button
          type="button"
          onPointerDown={(event) => {
            event.preventDefault();
            onSlash();
          }}
          className={buttonClass}
          aria-label="Insert slash command"
        >
          <span className="font-mono text-lg leading-none">/</span>
        </button>
        {canUndo && (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              onUndo();
            }}
            className={buttonClass}
            aria-label="Undo"
          >
            <Undo2 size={18} />
          </button>
        )}
        {canRedo && (
          <button
            type="button"
            onPointerDown={(event) => {
              event.preventDefault();
              onRedo();
            }}
            className={buttonClass}
            aria-label="Redo"
          >
            <Redo2 size={18} />
          </button>
        )}
      </div>

      <button
        type="button"
        onPointerDown={(event) => {
          event.preventDefault();
          setOpen((value) => !value);
        }}
        className={`${buttonClass} border-foreground/20 bg-background`}
        aria-expanded={open}
        aria-label={open ? 'Close editor actions' : 'Open editor actions'}
      >
        {open ? <X size={17} /> : <MoreHorizontal size={20} />}
      </button>
    </div>
  );
};

export default MobileEditorDock;
