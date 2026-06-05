import React, { useEffect, useRef, useState } from 'react';
import { loadVoice } from '@/lib/voiceStore';
import { formatVoiceDuration } from './useVoiceRecorder';
import { Pause, Play, X } from 'lucide-react';

interface Props {
  voiceId: string;
  initialLabel: string;
  durationSec: number;
  onLabelChange: (label: string) => void;
  onRemove: () => void;
}

export default function VoiceNote({
  voiceId,
  initialLabel,
  durationSec,
  onLabelChange,
  onRemove,
}: Props) {
  const [label, setLabel] = useState(initialLabel);
  const [audioUrl, setAudioUrl] = useState<string | null>(null);
  const [missing, setMissing] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  useEffect(() => {
    let revoked: string | null = null;
    let cancelled = false;
    void loadVoice(voiceId).then((result) => {
      if (cancelled) return;
      if (!result) {
        setMissing(true);
        return;
      }
      const url = URL.createObjectURL(result.blob);
      revoked = url;
      setAudioUrl(url);
    });
    return () => {
      cancelled = true;
      if (revoked) URL.revokeObjectURL(revoked);
    };
  }, [voiceId]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => {
      setPlaying(false);
      setElapsedMs(0);
    };
    const onTimeUpdate = () => setElapsedMs(audio.currentTime * 1000);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnded);
    audio.addEventListener('timeupdate', onTimeUpdate);
    return () => {
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnded);
      audio.removeEventListener('timeupdate', onTimeUpdate);
    };
  }, [audioUrl]);

  const totalMs = Math.max(durationSec * 1000, elapsedMs);
  const displayMs = playing || elapsedMs > 0 ? elapsedMs : totalMs;

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio || missing) return;
    if (audio.paused) void audio.play();
    else audio.pause();
  };

  return (
    <div className="ce-voice-block my-2 inline-flex max-w-full flex-col gap-2 rounded-xl border border-border bg-muted/20 px-3 py-2 font-mono text-sm">
      <div className="flex items-center gap-2">
        <button
          type="button"
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border bg-background hover:bg-muted/40 disabled:opacity-40"
          onClick={togglePlay}
          disabled={missing || !audioUrl}
          aria-label={playing ? 'Pause voice note' : 'Play voice note'}
        >
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-xs text-muted-foreground tabular-nums">
            {missing ? 'recording unavailable' : formatVoiceDuration(displayMs)}
            {!missing && durationSec > 0 ? ` / ${formatVoiceDuration(durationSec * 1000)}` : ''}
          </div>
        </div>
        <button
          type="button"
          className="ce-delete-btn flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted/40 hover:text-foreground"
          onClick={onRemove}
          aria-label="Remove voice note"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      {audioUrl && <audio ref={audioRef} src={audioUrl} preload="metadata" className="hidden" />}
      <input
        type="text"
        className="w-full bg-transparent text-xs text-foreground outline-none placeholder:text-muted-foreground"
        placeholder="add a label"
        value={label}
        onChange={(e) => {
          setLabel(e.target.value);
          onLabelChange(e.target.value);
        }}
      />
    </div>
  );
}
