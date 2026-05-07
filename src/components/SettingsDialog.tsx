import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Check } from 'lucide-react';
import type { ColorTheme } from './preferences';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // Stats
  wordCount?: number;
  charCount?: number;
  showStats?: boolean;
  onToggleStats?: () => void;
  // Theme
  colorTheme?: ColorTheme;
  onSelectColorTheme?: (theme: ColorTheme) => void;
  mode?: 'dark' | 'light';
  onToggleMode?: () => void;
  // Font
  useSerif?: boolean;
  onToggleFont?: () => void;
  // Spellcheck
  spellCheckEnabled?: boolean;
  onToggleSpellCheck?: () => void;
  // Folder
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  fsSupported?: boolean;
}

const THEMES = [
  { id: '', label: 'orig', swatch: 'bg-[#171717] dark:bg-[#fafaf9]' },
  { id: 'blue', label: 'blue', swatch: 'bg-[#0623ad]' },
  { id: 'green', label: 'green', swatch: 'bg-[#285135]' },
  { id: 'red', label: 'red', swatch: 'bg-[#7C3232]' },
];

const FONT_OPTIONS = [
  { id: 'serif', label: 'serif' },
  { id: 'mono', label: 'mono' },
];

export const SettingsDialog: React.FC<Props> = ({
  open,
  onOpenChange,
  wordCount,
  charCount,
  showStats,
  onToggleStats,
  colorTheme,
  onSelectColorTheme,
  mode,
  onToggleMode,
  useSerif,
  onToggleFont,
  spellCheckEnabled,
  onToggleSpellCheck,
  dirName,
  onPickFolder,
  onClearFolder,
  fsSupported,
}) => {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={`max-w-[90vw] sm:max-w-md bg-popover text-popover-foreground !rounded-2xl font-mono text-sm`}>
        <DialogHeader>
          <DialogTitle className={`font-mono text-base sm:text-lg lowercase truncate`}>
            settings
          </DialogTitle>
        </DialogHeader>

        <div className={`space-y-5`}>

          {/* Stats */}
          <section>
            <div className={`flex items-center justify-between`}>
              <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>word / char count</span>
              <button
                onClick={onToggleStats}
                className={`flex items-center gap-2 text-xs transition-colors ${showStats ? 'text-accent-foreground' : 'text-muted-foreground'}`}
              >
                {showStats ? (
                  <span className={`flex items-center gap-1`}>
                    <Check size={12} />
                    <span>{wordCount ?? 0} words · {charCount ?? 0} chars</span>
                  </span>
                ) : (
                  <span>off</span>
                )}
              </button>
            </div>
          </section>

          {/* Appearance section */}
          <section>
            <h3 className={`font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground`}>appearance</h3>

            {/* Font */}
            <div className={`mb-3`}>
              <span className={`text-xs text-muted-foreground mb-1.5 block`}>font</span>
              <div className={`flex gap-2`}>
                {FONT_OPTIONS.map(opt => (
                  <button
                    key={opt.id}
                    onClick={() => {
                      if (opt.id === 'serif' && !useSerif) onToggleFont?.();
                      if (opt.id === 'mono' && useSerif) onToggleFont?.();
                    }}
                    className={`flex-1 py-2 px-3 rounded-lg border transition-all text-xs ${
                      (opt.id === 'serif' && useSerif) || (opt.id === 'mono' && !useSerif)
                        ? 'border-accent-foreground bg-accent/30 text-accent-foreground'
                        : 'border-border text-muted-foreground hover:border-muted-foreground'
                    }`}
                    style={opt.id === 'serif' ? { fontFamily: `'Libre Caslon Text', serif` } : {}}
                  >
                    {opt.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Theme */}
            <div className={`mb-3`}>
              <div className={`flex items-center justify-between mb-1.5`}>
                <span className={`text-xs text-muted-foreground block`}>theme</span>
                <button
                  onClick={onToggleMode}
                  className={`text-xs transition-colors ${mode ? 'text-accent-foreground' : 'text-muted-foreground'}`}
                >
                  {mode === 'dark' ? 'dark' : 'light'}
                </button>
              </div>
              <div className={`flex gap-2`}>
                {THEMES.map(theme => (
                  <Tooltip key={theme.id} delayDuration={300}>
                    <TooltipTrigger asChild>
                      <button
                        onClick={() => {
                          if (colorTheme !== theme.id) onSelectColorTheme?.(theme.id as ColorTheme);
                        }}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          colorTheme === theme.id ? 'border-accent-foreground scale-110' : 'border-transparent hover:scale-105'
                        }`}
                        style={{ background: theme.id === '' ? (document.documentElement.classList.contains('dark') ? '#171717' : '#EAE7D0') : undefined }}
                      >
                        {theme.id === 'blue' && <div className={`w-full h-full rounded-full bg-[#0623ad]`} />}
                        {theme.id === 'green' && <div className={`w-full h-full rounded-full bg-[#285135]`} />}
                        {theme.id === 'red' && <div className={`w-full h-full rounded-full bg-[#7C3232]`} />}
                        {theme.id === '' && <div className={`w-full h-full rounded-full`} />}
                      </button>
                    </TooltipTrigger>
                    <TooltipContent>{theme.label}</TooltipContent>
                  </Tooltip>
                ))}
              </div>
            </div>

          </section>

          {/* Behavior section */}
          <section>
            <h3 className={`font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground`}>behavior</h3>

            {/* Spellcheck */}
            <div className={`flex items-center justify-between mb-3`}>
              <span className={`text-xs text-muted-foreground`}>spellcheck</span>
              <button
                onClick={onToggleSpellCheck}
                className={`text-xs transition-colors ${spellCheckEnabled ? 'text-accent-foreground' : 'text-muted-foreground'}`}
              >
                {spellCheckEnabled ? <span className={`flex items-center gap-1`}><Check size={12} /> on</span> : <span>off</span>}
              </button>
            </div>
          </section>

          {/* Storage section */}
          {fsSupported && (
            <section>
              <h3 className={`font-semibold mb-2 text-xs uppercase tracking-wider text-muted-foreground`}>storage</h3>
              {dirName ? (
                <div className={`flex items-center justify-between`}>
                  <span className={`text-xs text-foreground`}>saving to <span className={`text-accent-foreground`}>/{dirName}</span></span>
                  <button
                    onClick={onClearFolder}
                    className={`text-xs text-muted-foreground hover:text-foreground transition-colors`}
                  >
                    change
                  </button>
                </div>
              ) : (
                <button
                  onClick={onPickFolder}
                  className={`text-xs text-accent-foreground hover:underline`}
                >
                  choose save folder →
                </button>
              )}
            </section>
          )}

        </div>

        <div className={`border-t border-border pt-3 mt-1`}>
          <p className={`font-mono text-xs text-muted-foreground lowercase`}>
            ezwrite · built by evan :)
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
