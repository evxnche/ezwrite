import React, { useState, useEffect, useRef } from 'react';
import { Timer, Play, Pause, RotateCcw, Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ezwriteLogo from '/lovable-uploads/ebee81c8-358f-4e12-b5c6-72ed4348114f.png';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import jsPDF from 'jspdf';

const WritingInterface = () => {
  const [content, setContent] = useState('');
  const [wordCount, setWordCount] = useState(0);
  const [charCount, setCharCount] = useState(0);
  const [showStats, setShowStats] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  

  // Timer state
  const [timerDuration, setTimerDuration] = useState(15); // in minutes
  const [timeLeft, setTimeLeft] = useState(15 * 60); // in seconds
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

  // Timer effect - update when timeLeft changes
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

  // Update timeLeft when timer duration changes
  useEffect(() => {
    if (!isTimerRunning) {
      setTimeLeft(timerDuration * 60);
    }
  }, [timerDuration, isTimerRunning]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    console.log('Content change detected:', e.target.value);
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
    setTimeLeft(timerDuration * 60);
  };

  const formatTime = (seconds: number) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  };

  const saveAsTxt = () => {
    if (!content.trim()) return;
    
    console.log('Saving content length:', content.length);
    console.log('Content preview:', content.substring(0, 100) + '...');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `ezwrite-${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const saveAsPdf = () => {
    if (!content.trim()) return;

    console.log('Full content length:', content.length);
    console.log('Content sample:', content.substring(0, 200));
    
    const pdf = new jsPDF();
    
    // Split content into paragraphs first
    const paragraphs = content.split('\n');
    console.log('Number of paragraphs:', paragraphs.length);
    
    const pageHeight = pdf.internal.pageSize.height;
    const pageWidth = pdf.internal.pageSize.width;
    const margin = 20;
    const lineHeight = 6;
    const maxWidth = pageWidth - (2 * margin);
    
    pdf.setFont('helvetica', 'normal');
    pdf.setFontSize(11);
    
    let yPosition = margin;
    
    for (let i = 0; i < paragraphs.length; i++) {
      const paragraph = paragraphs[i];
      
      if (paragraph.trim() === '') {
        // Empty line
        yPosition += lineHeight;
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        continue;
      }
      
      // Split long paragraphs into multiple lines
      const lines = pdf.splitTextToSize(paragraph, maxWidth);
      console.log(`Paragraph ${i} split into ${lines.length} lines`);
      
      for (let j = 0; j < lines.length; j++) {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        
        pdf.text(lines[j], margin, yPosition);
        yPosition += lineHeight;
      }
      
      // Add space between paragraphs
      yPosition += lineHeight * 0.5;
    }
    
    console.log('PDF generated successfully');
    pdf.save(`ezwrite-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-stone-50 flex flex-col">
      {/* Header with minimal branding */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-gray-200">
        <div className="flex items-center gap-4 text-slate-600">
          <img 
            src={ezwriteLogo} 
            alt="ezwrite Logo" 
            className="h-8 w-auto"
          />
          <span className="text-left font-extrabold text-3xl text-gray-700">ezwrite.</span>
        </div>
        
        {/* Controls */}
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={saveAsTxt} disabled={!content.trim()} className="flex items-center gap-1">
              <Download size={14} />
              TXT
            </Button>
            <Button variant="outline" size="sm" onClick={saveAsPdf} disabled={!content.trim()} className="flex items-center gap-1">
              <Download size={14} />
              PDF
            </Button>
          </div>
          <button onClick={toggleTimer} className="text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200 flex items-center gap-1">
            <Timer size={16} />
            {showTimer ? 'hide focus timer' : 'focus timer'}
          </button>
          <button onClick={toggleStats} className="text-xs text-slate-500 hover:text-slate-700 transition-colors duration-200">
            {showStats ? 'hide word count' : 'word count'}
          </button>
        </div>
      </div>

      {/* Main writing area */}
      <div className="flex-1 px-6 bg-gray-200" style={{ display: 'flex', flexDirection: 'column' }}>
        <div className="w-full max-w-4xl mx-auto" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          {/* Timer controls */}
          {showTimer && (
            <div className="flex flex-col items-center gap-4 mb-8 opacity-0 animate-fade-in">
              <div className="flex items-center gap-4 mb-2">
                <span className="text-sm text-slate-600">Timer Duration:</span>
                <Select value={timerDuration.toString()} onValueChange={(value) => setTimerDuration(parseInt(value))}>
                  <SelectTrigger className="w-24">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5">5 min</SelectItem>
                    <SelectItem value="10">10 min</SelectItem>
                    <SelectItem value="15">15 min</SelectItem>
                    <SelectItem value="20">20 min</SelectItem>
                    <SelectItem value="25">25 min</SelectItem>
                    <SelectItem value="30">30 min</SelectItem>
                    <SelectItem value="45">45 min</SelectItem>
                    <SelectItem value="60">60 min</SelectItem>
                  </SelectContent>
                </Select>
              </div>
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
            </div>
          )}

          {/* Stats bar */}
          {showStats && (
            <div className="flex justify-center gap-8 mb-8 text-xs text-slate-400 opacity-0 animate-fade-in">
              <span>{wordCount} words</span>
              <span>{charCount} characters</span>
            </div>
          )}

          {/* Writing area */}
          <div className="relative">
            <textarea 
              ref={textareaRef} 
              value={content} 
              onChange={handleContentChange} 
              style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                lineHeight: '1.8',
                width: '100%',
                height: 'calc(100vh - 200px)',
                minHeight: '500px'
              }} 
              className="border-none outline-none resize-none text-lg leading-relaxed text-black placeholder:text-slate-300 font-light tracking-wide bg-gray-200" 
            />
            
            {/* Typing indicator */}
            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Footer with auto-save indicator and watermark */}
      <div className="text-center pb-6 opacity-40">
        <p className="text-xs text-slate-400">
          Your work is automatically saved
        </p>
        <p className="text-xs text-slate-400 mt-2">
          built by evan, for the sake of it.
        </p>
      </div>
    </div>
  );
};

export default WritingInterface;
