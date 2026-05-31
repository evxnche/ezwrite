import React from 'react';
import { Redo2, Undo2 } from 'lucide-react';
import { MOBILE_FLOATING_SLASH_BUTTON_SIZE_PX } from './editor-behavior';

const BUTTON_SIZE_PX = MOBILE_FLOATING_SLASH_BUTTON_SIZE_PX;
const BUTTON_GAP_PX = 8;

interface Props {
  visible: boolean;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  /** Viewport `top` for the undo/redo toolbar row (pinned above the keyboard). */
  top?: number | null;
  /** Fallback bottom offset when `top` is unavailable. */
  fallbackBottom?: string;
}

const MobileHistoryControls: React.FC<Props> = ({
  visible,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  top,
  fallbackBottom = 'calc(env(safe-area-inset-bottom, 0px) + 1rem)',
}) => {
  if (!visible || (!canUndo && !canRedo)) return null;

  const useTop = top != null;
  const containerStyle: React.CSSProperties = useTop
    ? { top, bottom: 'auto' }
    : { top: 'auto', bottom: fallbackBottom };

  const buttonClass =
    'w-11 h-11 rounded-full bg-popover border border-border text-muted-foreground flex items-center justify-center shadow-lg transition-[top,colors] disabled:opacity-35 disabled:pointer-events-none';

  return (
    <div className="fixed left-4 z-50 flex flex-row gap-2" style={containerStyle}>
      {canUndo && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onUndo();
          }}
          className={buttonClass}
          style={{ width: BUTTON_SIZE_PX, height: BUTTON_SIZE_PX }}
          aria-label="Undo"
        >
          <Undo2 size={18} />
        </button>
      )}
      {canRedo && (
        <button
          type="button"
          onPointerDown={(e) => {
            e.preventDefault();
            onRedo();
          }}
          className={buttonClass}
          style={{ width: BUTTON_SIZE_PX, height: BUTTON_SIZE_PX }}
          aria-label="Redo"
        >
          <Redo2 size={18} />
        </button>
      )}
    </div>
  );
};

export { BUTTON_GAP_PX, BUTTON_SIZE_PX };
export default MobileHistoryControls;
