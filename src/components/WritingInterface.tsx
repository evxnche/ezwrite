import React, { useState, useEffect, useRef } from 'react';
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

// Hidden marker for struck-through items (zero-width space + special prefix)
const STRUCK_MARKER = '\u200B\u2713';

const WritingInterface = () => {
  const [content, setContent] = useState(() => {
    return localStorage.getItem('zen-writing-content') || '';
  });
  const [isTyping, setIsTyping] = useState(false);
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  const editorRef = useRef<HTMLDivElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();
  const hasLoadedRef = useRef(false);

  useEffect(() => {
    setMounted(true);
    if (editorRef.current) {
      editorRef.current.focus();
    }
  }, []);

  useEffect(() => {
    if (!hasLoadedRef.current) {
      hasLoadedRef.current = true;
      return;
    }
    localStorage.setItem('zen-writing-content', content);
  }, [content]);

  const isLineStruck = (line: string) => line.startsWith(STRUCK_MARKER);
  const getCleanLine = (line: string) => isLineStruck(line) ? line.slice(STRUCK_MARKER.length) : line;

  const isLineInListContext = (lines: string[], lineIndex: number): boolean => {
    for (let i = lineIndex - 1; i >= 0; i--) {
      const trimmed = lines[i].trim().toLowerCase();
      // Skip struck marker for comparison
      const clean = getCleanLine(trimmed);
      if (clean === 'list') return true;
      if (trimmed === '') return false;
    }
    return false;
  };

  const handleCheckboxToggle = (lineIndex: number) => {
    const lines = content.split('\n');
    const line = lines[lineIndex];

    if (isLineStruck(line)) {
      lines[lineIndex] = getCleanLine(line);
    } else {
      lines[lineIndex] = STRUCK_MARKER + line;
    }

    setContent(lines.join('\n'));
  };

  const handleLineChange = (lineIndex: number, newText: string) => {
    const lines = content.split('\n');
    const wasStruck = isLineStruck(lines[lineIndex]);
    // Preserve struck state
    lines[lineIndex] = wasStruck ? STRUCK_MARKER + newText : newText;
    setContent(lines.join('\n'));

    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
  };

  const handleTextareaChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    let newValue = e.target.value;
    const cursorPos = e.target.selectionStart;

    // Check for /x at end of current line
    const lines = newValue.split('\n');
    let charCount = 0;
    let targetLineIndex = -1;

    for (let i = 0; i < lines.length; i++) {
      charCount += lines[i].length + 1;
      if (charCount >= cursorPos) {
        targetLineIndex = i;
        break;
      }
    }

    if (targetLineIndex !== -1) {
      const line = lines[targetLineIndex];
      if (line.trimEnd().endsWith('/x')) {
        const inList = isLineInListContext(lines, targetLineIndex);
        if (inList) {
          const cleanLine = line.replace(/\/x\s*$/, '').trimEnd();
          if (isLineStruck(cleanLine)) {
            lines[targetLineIndex] = getCleanLine(cleanLine);
          } else {
            lines[targetLineIndex] = STRUCK_MARKER + cleanLine;
          }
          newValue = lines.join('\n');
        }
      }
    }

    setContent(newValue);
    setIsTyping(true);
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
  };

  const saveAsTxt = () => {
    if (!content.trim()) return;
    // Clean markers for export
    const cleanContent = content.split('\n').map(line => {
      if (isLineStruck(line)) return '[x] ' + getCleanLine(line);
      return line;
    }).join('\n');
    const blob = new Blob([cleanContent], { type: 'text/plain' });
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
      let paragraph = paragraphs[i];
      if (isLineStruck(paragraph)) {
        paragraph = '[x] ' + getCleanLine(paragraph);
      }
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

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  // Determine if content has any list sections
  const hasListSections = content.toLowerCase().includes('\nlist\n') || content.toLowerCase().startsWith('list\n') || content.toLowerCase() === 'list';

  // Render the content with checkboxes for list items
  const renderMixedContent = () => {
    const lines = content.split('\n');
    let inList = false;
    const segments: { type: 'text'; startIndex: number; endIndex: number }[] | { type: 'list-header'; index: number }[] | { type: 'list-item'; index: number; text: string; struck: boolean }[] = [];

    // Build segments
    const allSegments: Array<
      | { type: 'text'; lines: { index: number; text: string }[] }
      | { type: 'list-header'; index: number }
      | { type: 'list-item'; index: number; text: string; struck: boolean }
    > = [];

    let currentTextLines: { index: number; text: string }[] = [];

    const flushText = () => {
      if (currentTextLines.length > 0) {
        allSegments.push({ type: 'text', lines: [...currentTextLines] });
        currentTextLines = [];
      }
    };

    lines.forEach((line, index) => {
      const trimmed = getCleanLine(line).trim().toLowerCase();

      if (trimmed === 'list' && !isLineStruck(line)) {
        flushText();
        inList = true;
        allSegments.push({ type: 'list-header', index });
        return;
      }

      if (inList && line.trim() === '') {
        inList = false;
        currentTextLines.push({ index, text: line });
        return;
      }

      if (inList) {
        flushText();
        const struck = isLineStruck(line);
        const displayText = getCleanLine(line);
        allSegments.push({ type: 'list-item', index, text: displayText, struck });
        return;
      }

      currentTextLines.push({ index, text: line });
    });

    flushText();

    return allSegments.map((segment, segIdx) => {
      if (segment.type === 'text') {
        // Render as a textarea block for these lines
        const textValue = segment.lines.map(l => l.text).join('\n');
        const startLineIndex = segment.lines[0].index;
        const endLineIndex = segment.lines[segment.lines.length - 1].index;

        return (
          <textarea
            key={`text-${segIdx}`}
            value={textValue}
            onChange={(e) => {
              const newLines = content.split('\n');
              const replacementLines = e.target.value.split('\n');
              newLines.splice(startLineIndex, endLineIndex - startLineIndex + 1, ...replacementLines);
              const newContent = newLines.join('\n');

              // Process /x
              const cursorPos = e.target.selectionStart;
              const subLines = e.target.value.split('\n');
              let charCount = 0;
              let targetSubLine = -1;
              for (let i = 0; i < subLines.length; i++) {
                charCount += subLines[i].length + 1;
                if (charCount >= cursorPos) { targetSubLine = i; break; }
              }

              if (targetSubLine !== -1) {
                const actualLineIndex = startLineIndex + targetSubLine;
                const allLines = newContent.split('\n');
                const theLine = allLines[actualLineIndex];
                if (theLine && theLine.trimEnd().endsWith('/x')) {
                  const inListCtx = isLineInListContext(allLines, actualLineIndex);
                  if (inListCtx) {
                    const clean = theLine.replace(/\/x\s*$/, '').trimEnd();
                    if (isLineStruck(clean)) {
                      allLines[actualLineIndex] = getCleanLine(clean);
                    } else {
                      allLines[actualLineIndex] = STRUCK_MARKER + clean;
                    }
                    setContent(allLines.join('\n'));
                    setIsTyping(true);
                    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
                    typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
                    return;
                  }
                }
              }

              setContent(newContent);
              setIsTyping(true);
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 1000);
            }}
            style={{
              lineHeight: '1.8',
              width: '100%',
              height: `${Math.max(segment.lines.length * 1.8, 1.8)}em`,
              caretColor: 'hsl(40 60% 85%)',
              textShadow: '0 0 15px hsl(40 60% 70% / 0.5), 0 0 35px hsl(35 50% 60% / 0.3)',
            }}
            className="font-playfair border-none outline-none resize-none text-lg leading-relaxed text-foreground font-light tracking-wide bg-background block w-full"
          />
        );
      }

      if (segment.type === 'list-header') {
        return (
          <div key={`lh-${segIdx}`} className="font-playfair text-lg text-muted-foreground/40 font-light tracking-wide" style={{ lineHeight: '1.8' }}>
            list
          </div>
        );
      }

      if (segment.type === 'list-item') {
        return (
          <div key={`li-${segIdx}`} className="flex items-start gap-3" style={{ lineHeight: '1.8' }}>
            <button
              onClick={() => handleCheckboxToggle(segment.index)}
              className={`mt-1.5 w-4 h-4 rounded border flex-shrink-0 flex items-center justify-center transition-colors ${
                segment.struck
                  ? 'bg-primary/80 border-primary/80'
                  : 'border-muted-foreground/40 hover:border-primary/60'
              }`}
            >
              {segment.struck && (
                <svg width="10" height="10" viewBox="0 0 10 10" className="text-primary-foreground">
                  <path d="M2 5L4 7L8 3" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              )}
            </button>
            <input
              type="text"
              value={segment.text}
              onChange={(e) => handleLineChange(segment.index, e.target.value)}
              className={`flex-1 font-playfair text-lg font-light tracking-wide bg-transparent border-none outline-none ${
                segment.struck ? 'line-through text-muted-foreground/40' : 'text-foreground'
              }`}
              style={{
                caretColor: 'hsl(40 60% 85%)',
                ...(segment.struck ? {} : {
                  textShadow: '0 0 15px hsl(40 60% 70% / 0.5), 0 0 35px hsl(35 50% 60% / 0.3)'
                })
              }}
            />
          </div>
        );
      }

      return null;
    });
  };

  // Simple mode: no list sections, use plain textarea
  const useSimpleMode = !hasListSections;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-background">
        <span className="font-playfair text-2xl text-foreground tracking-wide" style={{ textShadow: '0 0 30px hsl(40 60% 70% / 0.5), 0 0 60px hsl(35 50% 60% / 0.3)' }}>ez.</span>

        <div className="flex items-center gap-1">
          {mounted && (
            <Button variant="ghost" size="icon" onClick={toggleTheme} className="text-muted-foreground hover:text-foreground">
              {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
            </Button>
          )}

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

            {useSimpleMode ? (
              <textarea
                ref={editorRef as React.RefObject<HTMLTextAreaElement>}
                value={content}
                onChange={handleTextareaChange}
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
            ) : (
              <div
                className="min-h-[500px]"
                style={{ minHeight: 'calc(100vh - 120px)' }}
              >
                {renderMixedContent()}
              </div>
            )}

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
