// Drop a looping audio file at this path in the public folder.
const AUDIO_LOOP_SRC = '/audio/loop.mp3';

type Listener = () => void;

const listeners = new Set<Listener>();

let audio: HTMLAudioElement | null = null;
let playing = false;
let error = false;

const notify = () => listeners.forEach((listener) => listener());

const init = () => {
  if (audio) return;
  audio = new Audio(AUDIO_LOOP_SRC);
  audio.loop = true;
  audio.preload = 'auto';

  audio.addEventListener('play', () => { playing = true; notify(); });
  audio.addEventListener('pause', () => { playing = false; notify(); });
  audio.addEventListener('ended', () => { playing = false; notify(); });
  audio.addEventListener('error', () => { error = true; playing = false; notify(); });
};

export interface AudioState {
  playing: boolean;
  error: boolean;
}

export const getAudioState = (): AudioState => ({ playing, error });

export const subscribeAudio = (listener: Listener): (() => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

export const toggleAudio = (): void => {
  init();
  if (!audio || error) return;

  if (audio.paused) {
    void audio.play().catch(() => {
      error = true;
      notify();
    });
  } else {
    audio.pause();
  }
};
