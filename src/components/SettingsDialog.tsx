import React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, FolderOpen, Lock, RefreshCw } from 'lucide-react';
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
  // Paper mode
  paperMode?: boolean;
  onTogglePaperMode?: () => void;
  // Folder
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  fsSupported?: boolean;
  // Sync
  syncConfigured?: boolean;
  syncUnlocked?: boolean;
  syncBusy?: boolean;
  syncStatus?: string;
  syncError?: string;
  syncPassword?: string;
  activeProjectSynced?: boolean;
  onSyncPasswordChange?: (value: string) => void;
  onUnlockSync?: () => void;
  onLockSync?: () => void;
  onSyncNow?: () => void;
  onToggleActiveProjectSync?: () => void;
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
  paperMode,
  onTogglePaperMode,
  dirName,
  onPickFolder,
  onClearFolder,
  fsSupported,
  syncConfigured,
  syncUnlocked,
  syncBusy,
  syncStatus,
  syncError,
  syncPassword,
  activeProjectSynced,
  onSyncPasswordChange,
  onUnlockSync,
  onLockSync,
  onSyncNow,
  onToggleActiveProjectSync,
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

          {/* Paper mode — iOS toggle */}
          <div className={`flex items-center justify-between`}>
            <span className={`text-muted-foreground text-xs uppercase tracking-wider`}>paper mode</span>
            <button
              onClick={onTogglePaperMode}
              className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors ${
                paperMode ? 'bg-accent-foreground' : 'bg-muted-foreground/30'
              }`}
            >
              <span className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform ${
                paperMode ? 'translate-x-[20px]' : 'translate-x-[2px]'
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

          <div className={`mt-2 rounded-xl border border-border/60 bg-muted/10 p-3 space-y-3`}>
            <div className={`flex items-center justify-between`}>
              <span className={`flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider`}>
                <Lock size={13} />
                sync
              </span>
              <span className={`text-[10px] text-muted-foreground lowercase`}>{syncStatus}</span>
            </div>

            {!syncConfigured ? (
              <div className={`text-xs text-muted-foreground lowercase`}>
                add supabase env to enable sync
              </div>
            ) : (
              <>
                <div className={`flex items-center gap-2`}>
                  <input
                    type="password"
                    value={syncPassword ?? ''}
                    onChange={(e) => onSyncPasswordChange?.(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') onUnlockSync?.();
                    }}
                    placeholder={syncUnlocked ? 'sync unlocked' : 'sync password'}
                    disabled={syncBusy || syncUnlocked}
                    className={`min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50`}
                  />
                  {syncUnlocked ? (
                    <button
                      onClick={onLockSync}
                      disabled={syncBusy}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-mono text-muted-foreground hover:text-foreground disabled:opacity-40`}
                    >
                      lock
                    </button>
                  ) : (
                    <button
                      onClick={onUnlockSync}
                      disabled={syncBusy}
                      className={`px-2.5 py-1.5 rounded-md text-xs font-mono bg-accent/20 text-accent-foreground disabled:opacity-40`}
                    >
                      unlock
                    </button>
                  )}
                </div>

                <div className={`flex items-center justify-between`}>
                  <button
                    onClick={onToggleActiveProjectSync}
                    disabled={syncBusy}
                    className={`flex items-center gap-1.5 text-xs transition-colors ${
                      activeProjectSynced ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                    } disabled:opacity-40`}
                  >
                    <Cloud size={13} />
                    {activeProjectSynced ? 'current doc synced' : 'sync current doc'}
                  </button>
                  <button
                    onClick={onSyncNow}
                    disabled={syncBusy || !syncUnlocked}
                    className={`flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40`}
                  >
                    <RefreshCw size={13} />
                    now
                  </button>
                </div>
              </>
            )}

            {syncError && (
              <div className={`text-[10px] text-destructive lowercase`}>
                {syncError}
              </div>
            )}
          </div>

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
