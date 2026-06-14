import React, { useEffect, useState } from 'react';
import { Play, Pause } from 'lucide-react';
import WaveLoader from './WaveLoader';
import { getAudioState, subscribeAudio, toggleAudio } from '@/lib/audioStore';

const AudioPlayer: React.FC = () => {
  const [state, setState] = useState(getAudioState);

  useEffect(() => {
    return subscribeAudio(() => setState(getAudioState()));
  }, []);

  return (
    <div className="flex items-center gap-3 h-14 px-4">
      <button
        onClick={toggleAudio}
        disabled={state.error}
        className="shrink-0 flex h-5 w-5 items-center justify-center text-foreground/80 hover:text-foreground disabled:opacity-30 transition-colors"
        aria-label={state.playing ? 'Pause audio' : 'Play audio'}
      >
        {state.playing ? <Pause size={14} fill="currentColor" /> : <Play size={14} fill="currentColor" className="ml-0.5" />}
      </button>
      <div className="relative flex-1 min-w-0">
        {state.error ? (
          <span className="block text-center font-mono text-[10px] text-muted-foreground/50">no audio</span>
        ) : (
          <WaveLoader playing={state.playing} />
        )}
      </div>
    </div>
  );
};

export default AudioPlayer;
