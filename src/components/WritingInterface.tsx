import React, { useState, useEffect, useRef } from 'react';
import { Timer, Play, Pause, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
const WritingInterface = () => {
  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [isTyping, setIsTyping] = useState(false);

  // Timer state
  const [timeLeft, setTimeLeft] = useState(15 * 60); // 15 minutes in seconds
  const [isTimerRunning, setIsTimerRunning] = useState(false);
  const [showTimer, setShowTimer] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const timerRef = useRef<NodeJS.Timeout>();
  useEffect(() => {
    const words = content.trim() ? content.trim().split(/\s+/).length : 0;
    setWordCount(words);
    setCharCount(content.length);
  }, [content]);
  useEffect(() => {
    // Auto-save to localStorage
    localStorage.setItem('zen-writing-content', content);
  }, [content]);
  useEffect(() => {
    // Load saved content
    const savedContent = localStorage.getItem('zen-writing-content');
    if (savedContent) {
      setContent(savedContent);
    }

    // Focus the textarea on mount
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  // Timer effect
  useEffect(() => {
    if (isTimerRunning && timeLeft > 0) {
      timerRef.current = setTimeout(() => {
        setTimeLeft(timeLeft - 1);
      }, 1000);
    } else if (timeLeft === 0) {
      setIsTimerRunning(false);
    }
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, [isTimerRunning, timeLeft]);
  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setContent(e.target.value);
    setIsTyping(true);

    // Clear existing timeout
    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    // Set typing to false after 1 second of no typing
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };
  const toggleStats = () => {
    setShowStats(!showStats);
  };
  const toggleTimer = () => {
    setShowTimer(!showTimer);
  };
  const startTimer = () => {
    setIsTimerRunning(true);
  };
  const stopTimer = () => {
    setIsTimerRunning(false);
  };
  const resetTimer = () => {
    setIsTimerRunning(false);
    setTimeLeft(15 * 60);
  };
  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };
  return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-50 flex flex-col">
      {/* Header with minimal branding */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-gray-200">
        <div className="flex items-center gap-2 text-slate-600">
          <span className="text-left font-extrabold text-3xl text-gray-700 ">WRITE</span>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4">
          <button onClick={toggleTimer} className="text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200 flex items-center gap-1">
            <Timer size={16} />
            {showTimer ? 'hide timer' : 'show timer'}
          </button>
          <button onClick={toggleStats} className="text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200">
            {showStats ? 'hide stats' : 'show stats'}
          </button>
        </div>
      </div>

      {/* Main writing area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20 bg-gray-200">
        <div className="w-full max-w-4xl">
          {/* Timer controls */}
          {showTimer && <div className="flex flex-col items-center gap-4 mb-8 opacity-0 animate-fade-in">
              <div className="text-3xl font-mono text-slate-700">
                {formatTime(timeLeft)}
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={startTimer} disabled={isTimerRunning} className="flex items-center gap-1">
                  <Play size={14} />
                  Start
                </Button>
                <Button variant="outline" size="sm" onClick={stopTimer} disabled={!isTimerRunning} className="flex items-center gap-1">
                  <Pause size={14} />
                  Stop
                </Button>
                <Button variant="outline" size="sm" onClick={resetTimer} className="flex items-center gap-1">
                  <RotateCcw size={14} />
                  Reset
                </Button>
              </div>
            </div>}

          {/* Stats bar */}
          {showStats && <div className="flex justify-center gap-8 mb-8 text-xs text-slate-400 opacity-0 animate-fade-in">
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
            </div>}

          {/* Writing area */}
          <div className="relative">
            <textarea ref={textareaRef} value={content} onChange={handleContentChange} placeholder="Start writing your thoughts..." style={{
            fontFamily: 'Helvetica, Arial, sans-serif',
            lineHeight: '1.8'
          }} className="w-full h-96 border-none outline-none resize-none text-lg leading-relaxed text-black placeholder:text-slate-300 font-light tracking-wide bg-gray-200" />
            
            {/* Typing indicator */}
            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Footer with auto-save indicator */}
      <div className="text-center pb-6 opacity-40">
        <p className="text-xs text-slate-400">
          Your work is automatically saved
        </p>
      </div>
    </div>;
};
export default WritingInterface;