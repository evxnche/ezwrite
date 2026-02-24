import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const InfoDialog: React.FC<Props> = ({ open, onOpenChange }) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md bg-popover text-popover-foreground">
        <DialogHeader>
          <DialogTitle className="font-playfair text-lg">Shortcuts &amp; Commands</DialogTitle>
        </DialogHeader>
        <div className="space-y-5 text-sm leading-relaxed">
          <section>
            <h3 className="font-semibold mb-1.5 text-foreground">/ Commands</h3>
            <p className="text-muted-foreground mb-1">Type <kbd className="px-1 py-0.5 bg-background rounded text-xs font-mono">/</kbd> at the start of a line:</p>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="font-mono text-foreground">/list</span> — checklist with checkboxes</li>
              <li><span className="font-mono text-foreground">/line</span> — horizontal divider</li>
              <li><span className="font-mono text-foreground">/timer</span> — start a timer</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-foreground">Timer Options</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><span className="font-mono text-foreground">/timer</span> — stopwatch</li>
              <li><span className="font-mono text-foreground">/timer 5</span> — 5 min countdown</li>
              <li><span className="font-mono text-foreground">/timer 3:30</span> — countdown to 3:30</li>
              <li><span className="font-mono text-foreground">/timer pomo</span> — 25+5 pomodoro</li>
              <li><span className="font-mono text-foreground">/timer 57 11</span> — custom pomodoro</li>
            </ul>
            <p className="text-muted-foreground mt-1.5 ml-3">
              Controls: <span className="font-mono text-foreground">timer p</span> pause/resume · <span className="font-mono text-foreground">timer r</span> restart · <span className="font-mono text-foreground">timer s</span> stop
            </p>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-foreground">Keyboard Shortcuts</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li><kbd className="font-mono text-foreground">Ctrl+B</kbd> — bold text (**text**)</li>
              <li><kbd className="font-mono text-foreground">Ctrl+Z</kbd> — undo</li>
              <li><kbd className="font-mono text-foreground">Ctrl+Shift+Z</kbd> — redo</li>
              <li><kbd className="font-mono text-foreground">Tab</kbd> — indent</li>
              <li><kbd className="font-mono text-foreground">Shift+Tab</kbd> — unindent</li>
              <li><kbd className="font-mono text-foreground">Alt+↑/↓</kbd> — move line up/down</li>
            </ul>
          </section>

          <section>
            <h3 className="font-semibold mb-1.5 text-foreground">List Features</h3>
            <ul className="space-y-1 text-muted-foreground ml-3">
              <li>Click checkboxes to mark items done</li>
              <li>Type <span className="font-mono text-foreground">/x</span> at end of a list item to toggle strikethrough</li>
              <li>Two empty lines exit list mode</li>
            </ul>
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InfoDialog;
