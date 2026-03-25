import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { SpellCheck, Folder, Palette } from 'lucide-react';
import { isFileSystemSupported } from '@/lib/storage';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  onInstall?: () => void;
  spellCheckEnabled?: boolean;
  onToggleSpellCheck?: () => void;
  useSerif?: boolean;
  onToggleFont?: () => void;
  colorTheme?: string;
  onToggleColorTheme?: () => void;
}

const InfoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  dirName,
  onPickFolder,
  onClearFolder,
  onInstall,
  spellCheckEnabled,
  onToggleSpellCheck,
  useSerif,
  onToggleFont,
  colorTheme,
  onToggleColorTheme,
}) => {
  const [canInstall, setCanInstall] = useState(false);
  const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'done'>('idle');

  const handleCheckUpdate = async () => {
    setUpdateStatus('checking');
    try {
      const reg = await navigator.serviceWorker?.getRegistration();
      if (reg) await reg.update();
    } catch {}
    setUpdateStatus('done');
    setTimeout(() => setUpdateStatus('idle'), 3000);
  };
  const fsSupported = isFileSystemSupported();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    setCanInstall(!!onInstall);
  }, [onInstall]);

  // Check scroll position when dialog opens or content changes
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 4);
    };
    // Defer to let the DOM settle
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
      <DialogContent className="max-w-[90vw] sm:max-w-md bg-popover text-popover-foreground !rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg truncate lowercase">shortcuts &amp; commands</DialogTitle>
        </DialogHeader>
        {/* Toolbar row below header */}
        <div className="flex items-center gap-3 pb-2 border-b border-border w-full">
          {onToggleFont && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleFont}
                  className="transition-colors font-serif text-base leading-none select-none"
                  style={{ color: useSerif ? 'hsl(var(--accent-foreground))' : 'hsl(var(--muted-foreground))' }}
                >
                  A
                </button>
              </TooltipTrigger>
              <TooltipContent>{useSerif ? 'switch to monospace' : 'switch to serif'}</TooltipContent>
            </Tooltip>
          )}
          {onToggleSpellCheck && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleSpellCheck}
                  className="transition-colors"
                  style={{ color: spellCheckEnabled ? 'hsl(var(--accent-foreground))' : 'hsl(var(--muted-foreground))' }}
                >
                  <SpellCheck size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{spellCheckEnabled ? 'disable spellcheck' : 'enable spellcheck'}</TooltipContent>
            </Tooltip>
          )}
          {onToggleColorTheme && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onToggleColorTheme}
                  className="transition-colors"
                  style={{ color: colorTheme ? 'hsl(var(--foreground))' : 'hsl(var(--muted-foreground))' }}
                >
                  <Palette size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent>
                {!colorTheme ? 'blue theme' : colorTheme === 'blue' ? 'green theme' : colorTheme === 'green' ? 'red theme' : 'original theme'}
              </TooltipContent>
            </Tooltip>
          )}
          {fsSupported && onPickFolder && (
            <Tooltip delayDuration={0}>
              <TooltipTrigger asChild>
                <button
                  onClick={onPickFolder}
                  className="transition-colors"
                  style={{ color: dirName ? 'hsl(var(--accent-foreground))' : 'hsl(var(--muted-foreground))' }}
                >
                  <Folder size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent>{dirName ? `saving to /${dirName} — click to change` : 'choose save folder'}</TooltipContent>
            </Tooltip>
          )}
          <button
            onClick={handleCheckUpdate}
            disabled={updateStatus === 'checking'}
            className="ml-auto font-mono text-xs lowercase transition-colors disabled:opacity-40"
            style={{ color: updateStatus === 'done' ? 'hsl(var(--accent-foreground))' : 'hsl(var(--muted-foreground))' }}
          >
            {updateStatus === 'checking' ? 'checking...' : updateStatus === 'done' ? 'up to date ✓' : 'click to update'}
          </button>
        </div>
        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="font-mono space-y-5 text-sm leading-relaxed overflow-y-auto max-h-[70vh] lowercase"
          >
            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">/ commands</h3>
              <p className="text-muted-foreground mb-1">type <kbd className="px-1 py-0.5 bg-background rounded text-xs">/</kbd> at the start of a line:</p>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-accent-foreground">/list</span> — checklist with checkboxes</li>
                <li><span className="text-accent-foreground">/line</span> — horizontal divider</li>
                <li><span className="text-accent-foreground">/timer</span> — start a timer</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">headers</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground"># text</span> — large heading</li>
                <li><span className="text-foreground">## text</span> — smaller heading</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">timer options</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground">/timer 5</span> — five min countdown</li>
                <li><span className="text-foreground">/timer 15:30</span> — countdown to 3:30pm</li>
                <li><span className="text-foreground">/timer 57 11</span> — custom pomodoro</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">shortcuts</h3>
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground">alt+↑/↓</span> — move line up/down</li>
                <li>type <span className="text-foreground">/x</span> at end of a list item to toggle strikethrough</li>
                <li>swipe left or right to switch between 5 pages</li>
              </ul>
            </section>

            <section>
              <h3 className="font-semibold mb-1.5 text-accent-foreground">your data</h3>
              <ul className="space-y-1.5 text-muted-foreground ml-3">
                <li>your writing lives on your device.</li>
                <li className="text-amber-500 dark:text-amber-400">⚠ on mobile, browser storage can be wiped by the os — download regularly to back up.</li>
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
              <ul className="space-y-1 text-muted-foreground ml-3">
                <li><span className="text-foreground">iphone / ipad:</span> tap the share icon → "add to home screen"</li>
                <li><span className="text-foreground">android:</span> tap browser menu → "add to home screen" or "install app"</li>
                <li><span className="text-foreground">mac (safari, sonoma+):</span> tap the share icon in the toolbar → "add to dock"</li>
                <li><span className="text-foreground">mac / desktop (chrome / edge):</span> look for the install icon in the address bar</li>
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
        <div className="border-t border-border pt-3 mt-1">
          <p className="font-mono text-xs text-muted-foreground lowercase">dev hotline — <a href="mailto:evanbuildsstuff@gmail.com" className="text-accent-foreground hover:underline">evanbuildsstuff@gmail.com</a></p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default InfoDialog;
