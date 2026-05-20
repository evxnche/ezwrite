import React, { useState } from 'react';
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
  // range roughly [-2.5, 2.5] degrees
  return ((hash % 7) - 3) * 0.85;
}

export default function PolaroidImage({ imageId, initialCaption, onCaptionChange, onRemove }: Props) {
  const [caption, setCaption] = useState(initialCaption);
  const src = loadImage(imageId);
  const rotation = seedRotation(imageId);

  if (!src) return null;

  return (
    <div
      contentEditable={false}
      style={{
        display: 'inline-block',
        backgroundColor: '#F5ECDD',
        padding: '12px 12px 52px',
        boxShadow: '0 2px 12px rgba(0,0,0,0.20), 0 1px 4px rgba(0,0,0,0.10)',
        transform: `rotate(${rotation}deg)`,
        margin: '20px auto',
        maxWidth: '240px',
        position: 'relative',
        userSelect: 'none',
      }}
    >
      <img
        src={src}
        alt={caption || 'photo'}
        style={{ display: 'block', width: '216px', height: '216px', objectFit: 'cover' }}
        draggable={false}
      />
      <input
        value={caption}
        onChange={(e) => setCaption(e.target.value)}
        onBlur={(e) => onCaptionChange(e.target.value)}
        placeholder="add caption…"
        style={{
          position: 'absolute',
          bottom: 0,
          left: 0,
          right: 0,
          height: '44px',
          background: 'transparent',
          border: 'none',
          outline: 'none',
          textAlign: 'center',
          fontFamily: "'Caveat', cursive",
          fontSize: '16px',
          color: '#3a2e1e',
          padding: '0 8px',
          cursor: 'text',
        }}
      />
      <button
        onPointerDown={(e) => { e.preventDefault(); e.stopPropagation(); onRemove(); }}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: '20px',
          height: '20px',
          borderRadius: '50%',
          background: 'rgba(0,0,0,0.28)',
          border: 'none',
          color: '#fff',
          fontSize: '11px',
          lineHeight: '20px',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: 0,
        }}
        aria-label="Remove photo"
      >
        ✕
      </button>
    </div>
  );
}
