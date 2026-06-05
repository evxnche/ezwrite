import { useCallback, useEffect, useRef, useState } from 'react';

export const MAX_VOICE_DURATION_MS = 3 * 60 * 1000;

export type VoiceRecorderState = 'idle' | 'recording' | 'preview';

function pickRecorderMimeType(): string {
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/webm',
    'audio/mp4',
    'audio/ogg;codecs=opus',
  ];
  if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported) {
    for (const mime of candidates) {
      if (MediaRecorder.isTypeSupported(mime)) return mime;
    }
  }
  return '';
}

function stopStream(stream: MediaStream | null) {
  stream?.getTracks().forEach((track) => track.stop());
}

export function useVoiceRecorder() {
  const [state, setState] = useState<VoiceRecorderState>('idle');
  const [durationMs, setDurationMs] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [previewBlob, setPreviewBlob] = useState<Blob | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef('');
  const startedAtRef = useRef(0);
  const tickRef = useRef<ReturnType<typeof setInterval>>();
  const maxTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const revokePreviewUrl = useCallback(() => {
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
  }, [previewUrl]);

  const reset = useCallback(() => {
    clearInterval(tickRef.current);
    clearTimeout(maxTimerRef.current);
    recorderRef.current = null;
    chunksRef.current = [];
    stopStream(streamRef.current);
    streamRef.current = null;
    revokePreviewUrl();
    setPreviewBlob(null);
    setDurationMs(0);
    setError(null);
    setState('idle');
  }, [revokePreviewUrl]);

  const finishRecording = useCallback(() => {
    clearInterval(tickRef.current);
    clearTimeout(maxTimerRef.current);
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === 'inactive') return;

    recorder.onstop = () => {
      const mime = mimeTypeRef.current || recorder.mimeType || 'audio/webm';
      const blob = new Blob(chunksRef.current, { type: mime });
      stopStream(streamRef.current);
      streamRef.current = null;
      recorderRef.current = null;
      chunksRef.current = [];
      if (blob.size === 0) {
        setError('Recording was empty. Try again.');
        setState('idle');
        return;
      }
      const url = URL.createObjectURL(blob);
      setPreviewBlob(blob);
      setPreviewUrl(url);
      setState('preview');
    };
    recorder.stop();
  }, []);

  const start = useCallback(async () => {
    reset();
    if (typeof navigator === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('Microphone recording is not supported in this browser.');
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = pickRecorderMimeType();
      mimeTypeRef.current = mimeType;
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);
      recorderRef.current = recorder;
      chunksRef.current = [];
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };
      recorder.onerror = () => {
        setError('Recording failed. Try again.');
        reset();
      };
      recorder.start(250);
      startedAtRef.current = Date.now();
      setDurationMs(0);
      setState('recording');
      tickRef.current = setInterval(() => {
        setDurationMs(Date.now() - startedAtRef.current);
      }, 200);
      maxTimerRef.current = setTimeout(() => finishRecording(), MAX_VOICE_DURATION_MS);
    } catch {
      stopStream(streamRef.current);
      streamRef.current = null;
      setError('Microphone access was denied or unavailable.');
      setState('idle');
    }
  }, [finishRecording, reset]);

  const stop = useCallback(() => {
    if (state !== 'recording') return;
    finishRecording();
  }, [finishRecording, state]);

  const cancel = useCallback(() => {
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      recorder.onstop = () => reset();
      recorder.stop();
      return;
    }
    reset();
  }, [reset]);

  const reRecord = useCallback(() => {
    revokePreviewUrl();
    setPreviewBlob(null);
    setDurationMs(0);
    setError(null);
    setState('idle');
  }, [revokePreviewUrl]);

  useEffect(() => () => {
    clearInterval(tickRef.current);
    clearTimeout(maxTimerRef.current);
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== 'inactive') recorder.stop();
    stopStream(streamRef.current);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
  }, [previewUrl]);

  return {
    state,
    durationMs,
    error,
    previewBlob,
    previewUrl,
    start,
    stop,
    cancel,
    reRecord,
    reset,
  };
}

export function formatVoiceDuration(ms: number): string {
  const totalSec = Math.max(0, Math.floor(ms / 1000));
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  return `${min}:${sec.toString().padStart(2, '0')}`;
}
