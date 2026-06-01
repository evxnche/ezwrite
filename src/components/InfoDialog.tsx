import React, { useEffect, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { isFileSystemSupported } from '@/lib/storage';
import DialogSupportFooter from './DialogSupportFooter';

const HELP_TABS = ['commands', 'shortcuts', 'formatting', 'about'] as const;
type HelpTab = (typeof HELP_TABS)[number];

const SEGMENT_TRACK = 'flex gap-1 p-1 rounded-xl bg-muted/30 border border-border/60';

function segmentItemClass(active: boolean) {
  return [
    'relative rounded-lg text-xs transition-colors flex-1 px-2 py-1.5 lowercase font-mono',
    active
      ? 'text-accent-foreground after:absolute after:left-1/2 after:bottom-[4px] after:h-[2px] after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-current'
      : 'text-muted-foreground hover:text-foreground',
  ].join(' ');
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  dirName?: string;
  onClearFolder?: () => void;
  onInstall?: () => void;
  imagesEnabled?: boolean;
  contactEmail?: string;
  accessToken?: string;
  userId?: string;
}

const InfoDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  dirName,
  onClearFolder,
  onInstall,
  imagesEnabled = true,
  contactEmail,
  accessToken,
  userId,
}) => {
  const [activeTab, setActiveTab] = useState<HelpTab>('commands');
  const [canInstall, setCanInstall] = useState(false);
  const fsSupported = isFileSystemSupported();
  const scrollRef = useRef<HTMLDivElement>(null);
  const [isAtBottom, setIsAtBottom] = useState(false);

  useEffect(() => {
    setCanInstall(!!onInstall);
  }, [onInstall]);

  useEffect(() => {
    if (open) setActiveTab('commands');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    const check = () => {
      setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 4);
    };
    const id = setTimeout(check, 50);
    return () => clearTimeout(id);
  }, [open, activeTab]);

  const handleScroll = () => {
    const el = scrollRef.current;
    if (!el) return;
    setIsAtBottom(el.scrollHeight - el.scrollTop <= el.clientHeight + 4);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-2xl h-[min(82vh,34rem)] grid grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-popover text-popover-foreground !rounded-2xl">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg truncate lowercase">shortcuts &amp; commands</DialogTitle>
        </DialogHeader>

        <div className={SEGMENT_TRACK} role="tablist" aria-label="help sections">
          {HELP_TABS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={segmentItemClass(activeTab === tab)}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="relative">
          <div
            ref={scrollRef}
            onScroll={handleScroll}
            className="font-mono space-y-5 text-sm leading-relaxed overflow-y-auto max-h-[50vh] sm:max-h-[60vh] lowercase"
          >
            {activeTab === 'commands' && (
              <>
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
                    <li className="pl-1"><span className="text-accent-foreground">/scratchpad</span> — toggle scratchpad</li>
                  </ol>
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
              </>
            )}

            {activeTab === 'shortcuts' && (
              <>
                <section>
                  <h3 className="font-semibold mb-1.5 text-accent-foreground">gestures</h3>
                  <ul className="space-y-1 text-muted-foreground ml-3">
                    <li><span className="text-foreground">2-finger swipe</span> — switch pages (trackpad)</li>
                    <li><span className="text-foreground">swipe left/right</span> — switch pages (touch)</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold mb-1.5 text-accent-foreground">keyboard shortcuts</h3>
                  <ul className="space-y-1 text-muted-foreground ml-3">
                    <li><span className="text-foreground">cmd/ctrl+z</span> — undo</li>
                    <li><span className="text-foreground">cmd/ctrl+shift+z</span> or <span className="text-foreground">cmd/ctrl+y</span> — redo</li>
                    <li><span className="text-foreground">cmd/ctrl+↑/↓</span> — move line up/down</li>
                    <li><span className="text-foreground">cmd/ctrl+←/→</span> — switch pages (when enabled in settings)</li>
                    <li><span className="text-foreground">cmd/ctrl+d</span> — delete current page</li>
                    <li><span className="text-foreground">tab</span> — indent (8 spaces)</li>
                    <li><span className="text-foreground">shift+tab</span> — unindent</li>
                    <li><span className="text-foreground">cmd/ctrl+shift+m</span> — move selection to scratchpad</li>
                  </ul>
                </section>
              </>
            )}

            {activeTab === 'formatting' && (
              <>
                <section>
                  <h3 className="font-semibold mb-1.5 text-accent-foreground">headers</h3>
                  <ul className="space-y-1 text-muted-foreground ml-3">
                    <li><span className="text-foreground"># text</span> — large heading</li>
                    <li><span className="text-foreground">## text</span> — smaller heading</li>
                    <li><span className="text-foreground">&gt;&gt; text</span> — blockquote</li>
                  </ul>
                </section>

                <section>
                  <h3 className="font-semibold mb-1.5 text-accent-foreground">checklist tips</h3>
                  <ul className="space-y-1 text-muted-foreground ml-3">
                    <li>type <span className="text-foreground">/x</span> at end of item to toggle strikethrough</li>
                    <li>click checkbox to toggle complete</li>
                  </ul>
                </section>
              </>
            )}

            {activeTab === 'about' && (
              <>
                <section>
                  <h3 className="font-semibold mb-1.5 text-accent-foreground">your data</h3>
                  <ul className="space-y-1.5 text-muted-foreground ml-3">
                    <li>your writing lives on your device by default.</li>
                    <li>enable sync in settings to backup your notes across devices with end-to-end encryption. scratchpad notes stay local to each doc and are never exported or synced.</li>
                    <li className="text-amber-500 dark:text-amber-400">
                      on mobile, the local storage can be wiped by the browser. so turn on web sync for notes on mobile. this is being solved in the native apps that are coming soon.
                    </li>
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
              </>
            )}
          </div>
          {!isAtBottom && (
            <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-10 bg-gradient-to-t from-popover to-transparent" />
          )}
        </div>
        <DialogSupportFooter
          variant="help"
          contactEmail={contactEmail}
          accessToken={accessToken}
          userId={userId}
        />
      </DialogContent>
    </Dialog>
  );
};

export default InfoDialog;
