import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Download, Sun, Moon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useTheme } from 'next-themes';
import jsPDF from 'jspdf';

const WritingInterface = () => {
  const [content, setContent] = useState(() => {
    return localStorage.getItem('zen-writing-content') || '';
  });
  const [isTyping, setIsTyping] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (textareaRef.current) {
      textareaRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    localStorage.setItem('zen-writing-content', content);
  }, [content]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check if user just typed /x at the end of a line
    const processed = processSlashX(newValue, cursorPos);
    setContent(processed);
    setIsTyping(true);

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }
    typingTimeoutRef.current = setTimeout(() => {
      setIsTyping(false);
    }, 1000);
  };

  const processSlashX = (text: string, cursorPos: number): string => {
    const lines = text.split('\n');
    let charCount = 0;
    let targetLineIndex = -1;

    // Find which line the cursor is on
    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length + 1; // +1 for \n
      if (charCount >= cursorPos) {
        targetLineIndex = i;
        break;
      }
    }

    if (targetLineIndex === -1) return text;

    const line = lines[targetLineIndex];

    // Check if line ends with /x
    if (line.trimEnd().endsWith('/x')) {
      // Check if this line is within a list context
      const isInList = isLineInListContext(lines, targetLineIndex);
      if (isInList) {
        // Remove /x and prepend ~~strikethrough~~ marker
        const cleanLine = line.replace(/\/x\s*$/, '').trimEnd();
        // Toggle: if already struck, unstrike
        if (cleanLine.startsWith('~~') && cleanLine.endsWith('~~')) {
          lines[targetLineIndex] = cleanLine.slice(2, -2);
        } else {
          lines[targetLineIndex] = '~~' + cleanLine + '~~';
        }
        return lines.join('\n');
      }
    }

    return text;
  };

  const isLineInListContext = (lines: string[], lineIndex: number): boolean => {
    // Walk backwards to find if there's a "list" keyword before this line
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim().toLowerCase();
      if (trimmed === 'list') return true;
      // If we hit an empty line, stop looking
      if (trimmed === '') return false;
    }
    return false;
  };

  const handleCheckboxToggle = (lineIndex: number) => {
    const lines = content.split('\n');
    const line = lines[lineIndex];
    const isStruck = line.startsWith('~~') && line.endsWith('~~');

    if (isStruck) {
      lines[lineIndex] = line.slice(2, -2);
    } else {
      lines[lineIndex] = '~~' + line + '~~';
    }

    setContent(lines.join('\n'));
  };

  const saveAsTxt = () => {
    if (!content.trim()) return;
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
    const pdf = new jsPDF();
    const paragraphs = content.split('\n');
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
        yPosition += lineHeight;
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        continue;
      }
      const lines = pdf.splitTextToSize(paragraph, maxWidth);
      for (let j = 0; j < lines.length; j++) {
        if (yPosition > pageHeight - margin) {
          pdf.addPage();
          yPosition = margin;
        }
        pdf.text(lines[j], margin, yPosition);
        yPosition += lineHeight;
      }
      yPosition += lineHeight * 0.5;
    }

    pdf.save(`ezwrite-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  // Parse content into renderable lines with list context
  const renderContent = () => {
    const lines = content.split('\n');
    let inList = false;
    const elements: React.ReactNode[] = [];

    lines.forEach((line, index) => {
      const trimmed = line.trim().toLowerCase();

      if (trimmed === 'list') {
        inList = true;
        elements.push(
          <div key={index} className="font-playfair text-lg text-muted-foreground/60 font-light tracking-wide py-0.5">
            {line}
          </div>
        );
        return;
      }

      if (inList && trimmed === '') {
        inList = false;
        elements.push(<div key={index} className="h-[1.8em]" />);
        return;
      }

      if (inList && trimmed !== '') {
        const isStruck = line.startsWith('~~') && line.endsWith('~~');
        const displayText = isStruck ? line.slice(2, -2) : line;

        elements.push(
          <div key={index} className="flex items-start gap-3 py-0.5 group">
            <button
              onClick={() => handleCheckboxToggle(index)}
              className={`mt-1.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                isStruck
                  ? 'bg-primary/80 border-primary/80'
                  : 'border-muted-foreground/40 hover:border-primary/60'
              }`}
            >
              {isStruck && (
                <svg width="10" height="10" viewBox="0 0 10 10" className="text-primary-foreground">
                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <span
              className={`font-playfair text-lg font-light tracking-wide ${
                isStruck ? 'line-through text-muted-foreground/40' : 'text-foreground'
              }`}
              style={!isStruck ? {
                textShadow: '0 0 15px hsl(40 60% 70% / 0.5), 0 0 35px hsl(35 50% 60% / 0.3)'
              } : undefined}
            >
              {displayText}
            </span>
          </div>
        );
        return;
      }

      if (trimmed === '') {
        elements.push(<div key={index} className="h-[1.8em]" />);
      } else {
        elements.push(
          <div
            key={index}
            className="font-playfair text-lg text-foreground font-light tracking-wide py-0.5"
            style={{
              textShadow: '0 0 15px hsl(40 60% 70% / 0.5), 0 0 35px hsl(35 50% 60% / 0.3)'
            }}
          >
            {line}
          </div>
        );
      }
    });

    return elements;
  };

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-background">
        <span className="font-playfair text-2xl text-foreground tracking-wide" style={{ textShadow: '0 0 30px hsl(40 60% 70% / 0.5), 0 0 60px hsl(35 50% 60% / 0.3)' }}>ez.</span>

        <div className="flex items-center gap-1">
          {/* Theme toggle */}
          {mounted && (
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          )}

          {/* Export */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" disabled={!content.trim()} className="text-muted-foreground hover:text-foreground">
                <Download size={18} />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover">
              <DropdownMenuItem onClick={saveAsTxt} className="cursor-pointer">
                Download as TXT
              </DropdownMenuItem>
              <DropdownMenuItem onClick={saveAsPdf} className="cursor-pointer">
                Download as PDF
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Main writing area */}
      <div className="flex-1 px-3 bg-background flex flex-col">
        <div className="w-full max-w-4xl mx-auto flex flex-col h-full">
          <div className="relative pt-6 flex-1">
            {/* Glowing cursor overlay - visible when empty */}
            {!content && (
              <div
                className="absolute top-6 left-0 pointer-events-none"
                style={{
                  width: '2px',
                  height: '24px',
                  background: 'hsl(40 60% 85%)',
                  boxShadow: '0 0 10px hsl(40 60% 70% / 0.9), 0 0 20px hsl(40 60% 70% / 0.7), 0 0 40px hsl(35 50% 60% / 0.5)',
                  animation: 'blink 1s ease-in-out infinite'
                }}
              />
            )}

            {/* Overlay for rendered list items */}
            {content.toLowerCase().includes('list') && (
              <div className="absolute top-6 left-0 right-0 pointer-events-none z-10">
                <div className="pointer-events-auto">
                  {/* This is rendered below the textarea */}
                </div>
              </div>
            )}

            <textarea
              ref={textareaRef}
              value={content}
              onChange={handleContentChange}
              style={{
                lineHeight: '1.8',
                width: '100%',
                height: 'calc(100vh - 120px)',
                minHeight: '500px',
                caretColor: content ? 'hsl(40 60% 85%)' : 'transparent',
                textShadow: '0 0 15px hsl(40 60% 70% / 0.5), 0 0 35px hsl(35 50% 60% / 0.3)'
              }}
              className="font-playfair border-none outline-none resize-none text-lg leading-relaxed text-foreground font-light tracking-wide bg-background"
            />

            {/* Typing indicator */}
            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
          </div>
        </div>
      </div>

      {/* Floating Footer */}
      <div className="fixed bottom-4 left-0 right-0 text-center pointer-events-none opacity-40 hover:opacity-70 transition-opacity duration-300">
        <span className="font-playfair text-sm text-foreground tracking-wide pointer-events-auto" style={{ textShadow: '0 0 30px hsl(40 60% 70% / 0.5), 0 0 60px hsl(35 50% 60% / 0.3)' }}>built by evan :)</span>
      </div>
    </div>
  );
};

export default WritingInterface;
