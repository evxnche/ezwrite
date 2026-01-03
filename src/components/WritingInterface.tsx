import React, { useState, useEffect, useRef } from 'react';
import { Download } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import jsPDF from 'jspdf';

const WritingInterface = () => {
  const [content, setContent] = useState('');
  const [isTyping, setIsTyping] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const typingTimeoutRef = useRef<NodeJS.Timeout>();

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
    
    // Split content into paragraphs first
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
    
    pdf.save(`ezwrite-${new Date().toISOString().split('T')[0]}.pdf`);
  };

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Header with minimal branding */}
      <div className="flex justify-between items-center p-6 opacity-60 hover:opacity-100 transition-opacity duration-300 bg-background">
        <span className="font-serif text-2xl text-foreground tracking-wide">ezwrite.</span>
        
        {/* Controls */}
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

      {/* Main writing area */}
      <div className="flex-1 px-6 bg-background flex flex-col">
        <div className="w-full max-w-4xl mx-auto flex flex-col h-full">
          {/* Writing area */}
          <div className="relative pt-6 flex-1">
            <textarea 
              ref={textareaRef} 
              value={content} 
              onChange={handleContentChange} 
              style={{
                fontFamily: 'Helvetica, Arial, sans-serif',
                lineHeight: '1.8',
                width: '100%',
                height: 'calc(100vh - 120px)',
                minHeight: '500px',
                caretColor: 'hsl(var(--foreground))'
              }} 
              className="border-none outline-none resize-none text-lg leading-relaxed text-foreground font-light tracking-wide bg-background" 
            />
            
            {/* Typing indicator */}
            {isTyping && <div className="absolute bottom-4 right-4 w-2 h-2 bg-emerald-400 rounded-full animate-pulse" />}
          </div>
        </div>
      </div>
    </div>
  );
};

export default WritingInterface;