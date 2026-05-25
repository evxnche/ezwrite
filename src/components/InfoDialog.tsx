import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isFileSystemSupported } from '@/lib/storage';
import DialogSupportFooter from './DialogSupportFooter';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  onInstall?: () => void;
  imagesEnabled?: boolean;
}

const InfoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  dirName,
  onPickFolder,
  onClearFolder,
  onInstall,
  imagesEnabled = true,
}) => {
  const [canInstall, setCanInstall] = useState(false);
  const fsSupported = isFileSystemSupported();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    setCanInstall(!!onInstall);
  }, [onInstall]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 4);
    };
    const id = setTimeout(check, 50);
    return () => clearTimeout(id);
  }, [open]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 4);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-2xl bg-popover text-popover-foreground !rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg truncate lowercase">shortcuts &amp; commands</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="font-mono space-y-5 text-sm leading-relaxed overflow-y-auto max-h-[60vh] sm:max-h-[75vh] lowercase"
          >
            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">/ commands</h3>
              <p className="text-muted-foreground mb-1">type <kbd className="px-1 py-0.5 bg-background rounded text-xs">/</kbd> at the start of a line:</p>
              <ol className="space-y-1 text-muted-foreground ml-3 list-decimal list-outside">
                <li className="pl-1"><span className="text-accent-foreground">/list</span> — checklist with checkboxes</li>
                <li className="pl-1"><span className="text-accent-foreground">/line</span> — horizontal divider</li>
                <li className="pl-1"><span className="text-accent-foreground">/timer</span> — start a timer</li>
                {imagesEnabled && (
                  <li className="pl-1"><span className="text-accent-foreground">/image</span> — insert an image</li>
                )}
                <li className="pl-1"><span className="text-accent-foreground">/sidetab</span> — toggle side tab</li>
                <li className="pl-1"><span className="text-accent-foreground">/help</span> — shortcuts &amp; commands</li>
                <li className="pl-1"><span className="text-accent-foreground">/settings</span> — open settings</li>
              </ol>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">headers</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground"># text</span> — large heading</li>
                <li><span className="text-foreground">## text</span> — smaller heading</li>
                <li><span className="text-foreground">&gt;&gt; text</span> — blockquote</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">timer options</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground">/timer</span> — stopwatch</li>
                <li><span className="text-foreground">/timer 5</span> — five min countdown</li>
                <li><span className="text-foreground">/timer 15:30</span> — countdown to 3:30pm</li>
                <li><span className="text-foreground">/timer 57 11</span> — custom pomodoro</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">shortcuts</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground">cmd/ctrl+↑/↓</span> — move line up/down</li>
                <li>
                  <span className="text-foreground">cmd/ctrl+←/→</span> — switch pages in a doc when enabled in settings<br />
                  <span className="ml-0 text-muted-foreground">(or use 2-finger swipe; turn off to use sentence navigation)</span>
                </li>
                <li>type <span className="text-foreground">/x</span> at end of a list item to toggle strikethrough</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">your data</h3>
              <ul className="space-y-1.5 text-muted-foreground ml-3">
                <li>your writing lives on your device.</li>
                <li>scratchpad notes stay local to each doc and are never exported.</li>
                <li className="text-amber-500 dark:text-amber-400">
                  on mobile, the local storage can be wiped by the browser. so turn on web sync for notes on mobile. this is being solved in the native apps that are coming soon.
                </li>
                <li>
                  theme, spellcheck, fonts, folder export, and sync live in{' '}
                  <span className="text-accent-foreground">/settings</span>.
                </li>
                {fsSupported && !dirName && (
                  <li className="pt-1">
                    <button onClick={onPickFolder} className="text-accent-foreground hover:underline lowercase font-mono">
                      choose a save folder →
                    </button>
                  </li>
                )}
                {fsSupported && dirName && (
                  <li className="pt-1">
                    saving to <span className="text-foreground">/{dirName}</span>
                    <button onClick={onClearFolder} className="text-accent-foreground hover:underline ml-2">change folder</button>
                  </li>
                )}
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">install as app</h3>
              <div className="mb-2 px-3 py-2 rounded-lg border border-border bg-muted/40 text-xs text-foreground">
                use chrome for installation (allows you to choose storage location)
              </div>
              <ul className="space-y-1 text-muted-foreground ml-3 text-xs">
                <li><span className="text-foreground">iphone / ipad:</span> tap the share icon → "add to home screen"</li>
                <li><span className="text-foreground">android:</span> tap browser menu → "add to home screen" or "install app"</li>
                <li><span className="text-foreground">mac (safari, sonoma+):</span> share icon in toolbar → "add to dock"</li>
                <li><span className="text-foreground">mac / desktop (chrome / edge):</span> install icon in the address bar</li>
              </ul>
              {canInstall && (
                <button
                  onClick={onInstall}
                  className="mt-2 ml-3 text-accent-foreground hover:underline text-sm font-mono lowercase"
                >
                  install now →
                </button>
              )}
            </section>

          </div>
          {!isAtBottom && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-popover to-transparent" />
          )}
        </div>
        <DialogSupportFooter variant="help" />
      </DialogContent>
    </Dialog>
  );
};

export default InfoDialog;
