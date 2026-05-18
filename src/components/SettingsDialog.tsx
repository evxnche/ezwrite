import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { FolderOpen } from 'lucide-react';
import type { ColorTheme } from './preferences';

const THEMES = [
  { id: '' as ColorTheme, label: 'orig', swatch: 'bg-[#171717] dark:bg-[#fafaf9]' },
  { id: 'blue' as ColorTheme, label: 'blue', swatch: 'bg-[#0623ad]' },
  { id: 'green' as ColorTheme, label: 'green', swatch: 'bg-[#285135]' },
  { id: 'red' as ColorTheme, label: 'red', swatch: 'bg-[#7C3232]' },
];

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

        <div className={`space-y-4`}>

          {/* Theme — color orbs */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>theme</span>
            <div className={`flex gap-2`}>
              {THEMES.map(theme => (
                <button
                  key={theme.id}
                  onClick={() => {
                    if (colorTheme !== theme.id) onSelectColorTheme?.(theme.id);
                  }}
                  className={`w-7 h-7 rounded-full border-2 transition-all ${
                    colorTheme === theme.id ? 'border-accent-foreground scale-110' : 'border-transparent hover:scale-105'
                  }`}
                  style={theme.id === '' ? { background: document.documentElement.classList.contains('dark') ? '#171717' : '#EAE7D0' } : undefined}
                >
                  {theme.id === 'blue' && <div className={`w-full h-full rounded-full bg-[#0623ad]`} />}
                  {theme.id === 'green' && <div className={`w-full h-full rounded-full bg-[#285135]`} />}
                  {theme.id === 'red' && <div className={`w-full h-full rounded-full bg-[#7C3232]`} />}
                  {theme.id === '' && <div className={`w-full h-full rounded-full`} />}
                </button>
              ))}
            </div>
          </div>

          {/* Mode — light/dark rendered as word toggles */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>mode</span>
            <div className={`flex gap-2`}>
              <button
                onClick={() => { if (mode !== 'light') onToggleMode?.(); }}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-all font-mono ${
                  mode === 'light'
                    ? 'bg-accent/20 text-accent-foreground ring-1 ring-accent-foreground/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                light
              </button>
              <button
                onClick={() => { if (mode !== 'dark') onToggleMode?.(); }}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-all font-mono ${
                  mode === 'dark'
                    ? 'bg-accent/20 text-accent-foreground ring-1 ring-accent-foreground/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                dark
              </button>
            </div>
          </div>

          {/* Font style — serif/mono rendered in their own typefaces */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>font style</span>
            <div className={`flex gap-2`}>
              <button
                onClick={() => { if (!useSerif) onToggleFont?.(); }}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-all ${
                  useSerif
                    ? 'bg-accent/20 text-accent-foreground ring-1 ring-accent-foreground/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                style={{ fontFamily: "'Instrument Serif', serif" }}
              >
                serif
              </button>
              <button
                onClick={() => { if (useSerif) onToggleFont?.(); }}
                className={`px-2.5 py-1 rounded-[6px] text-xs transition-all font-mono ${
                  !useSerif
                    ? 'bg-accent/20 text-accent-foreground ring-1 ring-accent-foreground/30'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                mono
              </button>
            </div>
          </div>

          {/* Word/char count — iOS toggle */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>word/char count</span>
            <div className={`flex items-center gap-2`}>
              {showStats && (
                <span className={`text-xs text-muted-foreground`}>{wordCount ?? 0}w · {charCount ?? 0}c</span>
              )}
              <button
                onClick={onToggleStats}
                className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors ${
                  showStats ? 'bg-accent-foreground' : 'bg-muted-foreground/30'
                }`}
              >
                <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                  showStats ? 'translate-x-[20px]' : 'translate-x-[2px]'
                } mt-[2px]`} />
              </button>
            </div>
          </div>

          {/* Spellcheck — iOS toggle */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>spellcheck</span>
            <button
              onClick={onToggleSpellCheck}
              className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors ${
                spellCheckEnabled ? 'bg-accent-foreground' : 'bg-muted-foreground/30'
              }`}
            >
              <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                spellCheckEnabled ? 'translate-x-[20px]' : 'translate-x-[2px]'
              } mt-[2px]`} />
            </button>
          </div>

          {/* Storage — highlighted to draw attention */}
          {fsSupported && (
            <div className={`mt-2 rounded-xl border-2 border-dashed border-accent-foreground/40 bg-accent/10 p-3`}>
              {dirName ? (
                <div className={`flex items-center justify-between`}>
                  <span className={`flex items-center gap-1.5 text-xs text-foreground`}>
                    <FolderOpen size={14} className="text-accent-foreground" />
                    saving to <span className={`text-accent-foreground`}>/{dirName}</span>
                  </span>
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
                  className={`flex items-center gap-1.5 text-xs text-accent-foreground hover:underline w-full`}
                >
                  <FolderOpen size={14} />
                  choose save folder →
                </button>
              )}
            </div>
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
