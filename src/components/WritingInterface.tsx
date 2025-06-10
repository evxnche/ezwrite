import React, { useState, useEffect, useRef } from 'react';
import { Keyboard } from 'lucide-react';

const WritingInterface = () => {
  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
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
  return <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-50 flex flex-col">
      {/* Header with minimal branding */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300">
        <div className="flex items-center gap-2 text-slate-600">
          
          <span className="text-4xl font-extrabold text-zinc-900 text-left">wRITE</span>
        </div>
        
        {/* Stats toggle */}
        <button onClick={toggleStats} className="text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200">
          {showStats ? 'hide stats' : 'show stats'}
        </button>
      </div>

      {/* Main writing area */}
      <div className="flex-1 flex flex-col items-center justify-center px-6 pb-20 bg-gray-200">
        <div className="w-full max-w-4xl">
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
