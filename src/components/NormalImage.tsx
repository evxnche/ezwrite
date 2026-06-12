import React, { useState, useRef, useEffect } from 'react';
import { loadImage } from '@/lib/imageStore';
import { ScanText } from 'lucide-react';

interface Props {
  imageId: string;
  initialCaption: string;
  initialWidth?: string;
  onCaptionChange: (caption: string) => void;
  onWidthChange: (width: string) => void;
  onRemove: () => void;
  onExtractText?: () => void;
  isExtracting?: boolean;
}

const MIN_WIDTH = 100;
const MAX_WIDTH = 1200;

export default function NormalImage({ imageId, initialCaption, initialWidth, onCaptionChange, onWidthChange, onRemove, onExtractText, isExtracting }: Props) {
  const [caption, setCaption] = useState(initialCaption);
  const [hovered, setHovered] = useState(false);
  const [imgWidth, setImgWidth] = useState(() => initialWidth ? parseInt(initialWidth) : 400);
  const [isMultiLine, setIsMultiLine] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  const src = loadImage(imageId);

  // Auto-grow textarea, detect multi-line
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    setIsMultiLine(ta.scrollHeight > lh + 8);
  }, [caption]);

  // Resize frame from bottom-right corner
  const startFrameResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = imgWidth;
    let finalW = startW;
    const onMove = (me: PointerEvent) => {
      finalW = Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, startW + (me.clientX - startX)));
      setImgWidth(finalW);
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      onWidthChange(String(finalW));
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!src) {
    return (
      <div
        contentEditable={false}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          display: 'inline-block',
          backgroundColor: 'transparent',
          margin: '20px auto',
          width: 240,
          boxSizing: 'border-box',
          position: 'relative',
          userSelect: 'none',
        }}
      >
        <div
          style={{
            width: '100%',
            height: 160,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            textAlign: 'center',
            color: 'var(--muted-foreground)',
            background: 'var(--muted)',
            opacity: 0.5,
            borderRadius: 8,
          }}
        >
          <div style={{ fontSize: '28px', marginBottom: 6 }}>🖼️</div>
          <div>photo missing</div>
          <button
            onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
            style={{
              marginTop: 10,
              padding: '4px 10px',
              fontSize: '12px',
              background: 'rgba(0,0,0,0.1)',
              border: 'none',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          >
            remove
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-block',
        margin: '20px auto',
        width: imgWidth,
        maxWidth: '100%',
        boxSizing: 'border-box',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <div style={{ position: 'relative' }}>
        <img
          src={src}
          alt={caption || 'photo'}
          style={{
            display: 'block',
            width: '100%',
            height: 'auto',
            borderRadius: 6,
            pointerEvents: 'none',
            outline: hovered ? '1px solid var(--border)' : 'none',
          }}
          draggable={false}
        />
        {/* Extracting overlay */}
        {isExtracting && (
          <div style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            background: 'rgba(0,0,0,0.6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#fff',
            fontFamily: 'inherit',
            fontSize: '14px',
            pointerEvents: 'none',
            zIndex: 10,
            borderRadius: 6,
          }}>
            extracting...
          </div>
        )}
      </div>

      {/* Caption — wraps, expands */}
      <textarea
        ref={textareaRef}
        value={caption}
        onChange={(e) => setCaption(e.target.value.replace(/\n+/g, ' '))}
        onKeyDown={(e) => { if (e.key === 'Enter') e.preventDefault(); }}
        onBlur={(e) => onCaptionChange(e.target.value.replace(/\n+/g, ' '))}
        placeholder="Add caption…"
        rows={1}
        style={{
          display: 'block',
          width: '100%',
          minHeight: '28px',
          marginTop: '6px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          textAlign: 'center',
          fontFamily: 'inherit',
          fontSize: '14px',
          color: 'var(--muted-foreground)',
          caretColor: 'var(--foreground)',
          padding: '2px 4px',
          resize: 'none',
          overflow: 'hidden',
          cursor: 'text',
          boxSizing: 'border-box',
          lineHeight: '1.4',
        }}
      />

      {/* Extract Text (OCR) — top-left, hover-only */}
      {onExtractText && (
        <button
          onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onExtractText(); }}
          style={{
            position: 'absolute',
            top: 6,
            left: 6,
            width: 24,
            height: 24,
            borderRadius: '4px',
            background: 'rgba(0,0,0,0.6)',
            border: 'none',
            color: '#fff',
            cursor: isExtracting ? 'wait' : 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
            opacity: hovered || isExtracting ? 1 : 0,
            transition: 'opacity 0.15s',
            pointerEvents: (hovered || isExtracting) && !isExtracting ? 'auto' : 'none',
            zIndex: 10,
          }}
          title="Extract text"
        >
          <ScanText size={14} />
        </button>
      )}

      {/* Delete — small, hover-only */}
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        style={{
          position: 'absolute',
          top: 6,
          right: 6,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.6)',
          border: 'none',
          color: '#fff',
          fontSize: '10px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s',
          pointerEvents: hovered ? 'auto' : 'none',
          zIndex: 10,
        }}
        aria-label="Remove photo"
      >
        ✕
      </button>

      {/* Frame resize corner — bottom-right, hover-only */}
      <div
        onPointerDown={startFrameResize}
        title="Resize"
        style={{
          position: 'absolute',
          bottom: 30, // Above caption
          right: 0,
          width: 16,
          height: 16,
          cursor: 'nwse-resize',
          opacity: hovered ? 0.7 : 0,
          transition: 'opacity 0.15s',
          background: 'radial-gradient(circle at bottom right, rgba(0,0,0,0.4) 30%, transparent 60%)',
          zIndex: 10,
        }}
      />
    </div>
  );
}
