import React, { useState, useRef, useEffect } from 'react';
import { loadImage } from '@/lib/imageStore';

interface Props {
  imageId: string;
  initialCaption: string;
  onCaptionChange: (caption: string) => void;
  onRemove: () => void;
}

function seedRotation(id: string): number {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) & 0xffff;
  return ((hash % 7) - 3) * 0.85;
}

const PADDING = 12;
const MIN_FRAME = 100;
const MAX_FRAME = 640;

export default function PolaroidImage({ imageId, initialCaption, onCaptionChange, onRemove }: Props) {
  const [caption, setCaption] = useState(initialCaption);
  const [hovered, setHovered] = useState(false);
  const [moveMode, setMoveMode] = useState(false);
  const [panning, setPanning] = useState(false);
  const [frameWidth, setFrameWidth] = useState(240);
  const [cropPos, setCropPos] = useState({ x: 50, y: 50 });
  const [isMultiLine, setIsMultiLine] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const outerRef = useRef<HTMLDivElement>(null);
  const cropPosRef = useRef(cropPos);
  useEffect(() => { cropPosRef.current = cropPos; }, [cropPos]);
  const src = loadImage(imageId);
  const rotation = seedRotation(imageId);
  const imgSize = frameWidth - PADDING * 2;

  // Click outside or Escape exits move mode
  useEffect(() => {
    if (!moveMode) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMoveMode(false); };
    const onMouseDown = (e: MouseEvent) => {
      if (outerRef.current && !outerRef.current.contains(e.target as Node)) {
        setMoveMode(false);
      }
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('mousedown', onMouseDown);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('mousedown', onMouseDown);
    };
  }, [moveMode]);

  // Auto-grow textarea, detect multi-line
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    setIsMultiLine(ta.scrollHeight > lh + 8);
  }, [caption]);

  // Pan image within crop viewport (only when moveMode is active)
  const startPan = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!moveMode) return;
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const { x: cx, y: cy } = cropPosRef.current;
    setPanning(true);
    const onMove = (me: PointerEvent) => {
      const dx = (me.clientX - startX) / imgSize * 100;
      const dy = (me.clientY - startY) / imgSize * 100;
      setCropPos({
        x: Math.max(0, Math.min(100, cx - dx)),
        y: Math.max(0, Math.min(100, cy - dy)),
      });
    };
    const onUp = () => {
      setPanning(false);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  // Resize frame from bottom-right corner
  const startFrameResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = frameWidth;
    const onMove = (me: PointerEvent) => {
      setFrameWidth(Math.max(MIN_FRAME, Math.min(MAX_FRAME, startW + (me.clientX - startX))));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  if (!src) return null;

  return (
    <div
      ref={outerRef}
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-block',
        backgroundColor: '#F5ECDD',
        padding: PADDING,
        boxShadow: '0 2px 12px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)',
        transform: `rotate(${rotation}deg)`,
        margin: '20px auto',
        width: frameWidth,
        boxSizing: 'border-box',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Crop viewport — double-click to enter move mode, drag to pan */}
      <div
        onPointerDown={startPan}
        onDoubleClick={(e) => { e.preventDefault(); e.stopPropagation(); setMoveMode(true); }}
        style={{
          width: imgSize,
          height: imgSize,
          overflow: 'hidden',
          cursor: moveMode ? (panning ? 'grabbing' : 'grab') : 'default',
          position: 'relative',
          outline: moveMode ? '2px dashed rgba(0,0,0,0.35)' : 'none',
          outlineOffset: 2,
          boxSizing: 'border-box',
        }}
      >
        <img
          src={src}
          alt={caption || 'photo'}
          style={{
            display: 'block',
            width: '100%',
            height: '100%',
            objectFit: 'cover',
            objectPosition: `${cropPos.x}% ${cropPos.y}%`,
            pointerEvents: 'none',
          }}
          draggable={false}
        />
        {/* Move mode label */}
        {moveMode && (
          <div style={{
            position: 'absolute',
            bottom: 6,
            left: 0,
            right: 0,
            textAlign: 'center',
            fontSize: '10px',
            color: 'rgba(255,255,255,0.85)',
            textShadow: '0 1px 3px rgba(0,0,0,0.5)',
            pointerEvents: 'none',
            letterSpacing: '0.04em',
          }}>
            drag to reposition · esc to exit
          </div>
        )}
      </div>

      {/* Caption — wraps, font drops 1px on second line */}
      <textarea
        ref={textareaRef}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={(e) => onCaptionChange(e.target.value)}
        placeholder="add caption…"
        rows={1}
        style={{
          display: 'block',
          width: '100%',
          minHeight: '28px',
          marginTop: '8px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          textAlign: 'center',
          fontFamily: "'Caveat', cursive",
          fontSize: isMultiLine ? '17px' : '18px',
          color: '#3a2e1e',
          caretColor: '#111',
          padding: '2px 4px',
          resize: 'none',
          overflow: 'hidden',
          cursor: 'text',
          boxSizing: 'border-box',
          lineHeight: '1.35',
          transition: 'font-size 0.1s',
        }}
      />

      {/* Delete — small, hover-only */}
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 15,
          height: 15,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.50)',
          border: 'none',
          color: '#fff',
          fontSize: '8px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s',
          pointerEvents: hovered ? 'auto' : 'none',
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
          bottom: 0,
          right: 0,
          width: 20,
          height: 20,
          cursor: 'nwse-resize',
          opacity: hovered ? 0.55 : 0,
          transition: 'opacity 0.15s',
          background: 'linear-gradient(135deg, transparent 40%, rgba(0,0,0,0.35) 40%)',
        }}
      />
    </div>
  );
}
