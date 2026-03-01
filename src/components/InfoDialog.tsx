import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InfoDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md bg-popover text-popover-foreground rounded-xl">
        <DialogHeader>
          <DialogTitle className="font-playfair text-base sm:text-lg truncate">Shortcuts &amp; Commands</DialogTitle>
        </DialogHeader>
        <div className="font-mono space-y-5 text-sm leading-relaxed overflow-y-auto max-h-[70vh]">
          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">/ Commands</h3>
            <p className="text-muted-foreground mb-1">Type <kbd className="px-1 py-0.5 bg-background rounded text-xs">/</kbd> at the start of a line:</p>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="text-accent-foreground">/list</span> — checklist with checkboxes</li>
              <li><span className="text-accent-foreground">/line</span> — horizontal divider</li>
              <li><span className="text-accent-foreground">/timer</span> — start a timer</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">Headers</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="text-foreground"># text</span> — large heading</li>
              <li><span className="text-foreground">## text</span> — smaller heading</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">Timer Options</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="text-foreground">/timer 5</span> — five min countdown</li>
              <li><span className="text-foreground">/timer 15:30</span> — countdown to 3:30pm</li>
              <li><span className="text-foreground">/timer 57 11</span> — custom pomodoro</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">Keyboard Shortcuts</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="text-foreground">Alt+↑/↓</span> — move line up/down</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">List Features</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li>type <span className="text-foreground">/x</span> at end of a list item to toggle strikethrough</li>
              <li>two empty lines exit list mode</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-accent-foreground">Pages</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li>swipe left or right to switch between 5 pages</li>
            </ul>
          </section>

        </div>
        <div className="border-t border-border pt-3 mt-1">
          <p className="font-mono text-xs text-muted-foreground">dev hotline — <a href="mailto:evanbuildsstuff@gmail.com" className="text-accent-foreground hover:underline">evanbuildsstuff@gmail.com</a></p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InfoDialog;
