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
const MIN_FRAME = 120;
const MAX_FRAME = 640;
const MIN_IMG = 80;

export default function PolaroidImage({ imageId, initialCaption, onCaptionChange, onRemove }: Props) {
  const [caption, setCaption] = useState(initialCaption);
  const [captionFocused, setCaptionFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [frameWidth, setFrameWidth] = useState(240);
  const [imgSize, setImgSize] = useState(216);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const src = loadImage(imageId);
  const rotation = seedRotation(imageId);

  // Auto-grow textarea height
  useEffect(() => {
    const ta = textareaRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    ta.style.height = ta.scrollHeight + 'px';
  }, [caption]);

  const startFrameResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startW = frameWidth;
    const onMove = (me: PointerEvent) => {
      const w = Math.max(MIN_FRAME, Math.min(MAX_FRAME, startW + (me.clientX - startX)));
      setFrameWidth(w);
      setImgSize(prev => Math.min(prev, w - PADDING * 2));
    };
    const onUp = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const startImgResize = (e: React.PointerEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const startY = e.clientY;
    const startSize = imgSize;
    const onMove = (me: PointerEvent) => {
      const delta = Math.max(me.clientX - startX, me.clientY - startY);
      setImgSize(Math.max(MIN_IMG, Math.min(frameWidth - PADDING * 2, startSize + delta)));
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
      contentEditable={false}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        display: 'inline-block',
        backgroundColor: '#F5ECDD',
        padding: `${PADDING}px ${PADDING}px ${PADDING}px`,
        boxShadow: '0 2px 12px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)',
        transform: `rotate(${rotation}deg)`,
        margin: '20px auto',
        width: `${frameWidth}px`,
        boxSizing: 'border-box',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      {/* Image with corner resize handle */}
      <div style={{ position: 'relative', width: `${imgSize}px`, height: `${imgSize}px` }}>
        <img
          src={src}
          alt={caption || 'photo'}
          style={{ display: 'block', width: '100%', height: '100%', objectFit: 'cover' }}
          draggable={false}
        />
        <div
          onPointerDown={startImgResize}
          title="Resize image"
          style={{
            position: 'absolute',
            bottom: 0,
            right: 0,
            width: 18,
            height: 18,
            cursor: 'nwse-resize',
            opacity: hovered ? 1 : 0,
            transition: 'opacity 0.15s',
            background: 'rgba(0,0,0,0.30)',
            borderRadius: '3px 0 0 0',
          }}
        />
      </div>

      {/* Caption - textarea wraps, grows, focus-indicated */}
      <textarea
        ref={textareaRef}
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={(e) => { setCaptionFocused(false); onCaptionChange(e.target.value); }}
        onFocus={() => setCaptionFocused(true)}
        placeholder="add caption…"
        rows={1}
        style={{
          display: 'block',
          width: '100%',
          minHeight: '32px',
          marginTop: '8px',
          background: 'transparent',
          border: 'none',
          borderBottom: captionFocused ? '1px solid rgba(58,46,30,0.4)' : '1px solid transparent',
          outline: 'none',
          textAlign: 'center',
          fontFamily: "'Caveat', cursive",
          fontSize: '16px',
          color: '#3a2e1e',
          padding: '2px 4px',
          resize: 'none',
          overflow: 'hidden',
          cursor: 'text',
          boxSizing: 'border-box',
          transition: 'border-color 0.15s',
          lineHeight: '1.35',
        }}
      />

      {/* Delete — hover only */}
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 20,
          height: 20,
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.55)',
          border: 'none',
          color: '#fff',
          fontSize: '11px',
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

      {/* Frame resize handle — right edge */}
      <div
        onPointerDown={startFrameResize}
        title="Resize frame"
        style={{
          position: 'absolute',
          top: 0,
          right: -5,
          bottom: 0,
          width: 10,
          cursor: 'ew-resize',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          opacity: hovered ? 1 : 0,
          transition: 'opacity 0.15s',
        }}
      >
        <div style={{ width: 3, height: 28, borderRadius: 2, background: 'rgba(0,0,0,0.28)' }} />
      </div>
    </div>
  );
}
