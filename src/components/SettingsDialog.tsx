import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, FolderOpen, Lock, RefreshCw } from 'lucide-react';
import DialogSupportFooter from './DialogSupportFooter';
import { BUG_REPORT_EMAIL } from '@/lib/bug-report';
import { getLandingPageUrl } from '@/lib/app-links';
import type { ColorTheme } from './preferences';

const THEMES = [
  { id: '' as ColorTheme, label: 'orig', swatch: 'bg-[#171717] dark:bg-[#fafaf9]' },
  { id: 'blue' as ColorTheme, label: 'blue', swatch: 'bg-[#0623ad]' },
  { id: 'green' as ColorTheme, label: 'green', swatch: 'bg-[#285135]' },
  { id: 'red' as ColorTheme, label: 'red', swatch: 'bg-[#7C3232]' },
];

const SETTINGS_TABS = ['appearance', 'features', 'storage', 'about'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];

const SEGMENT_TRACK = 'flex gap-1 p-1 rounded-xl bg-muted/30 border border-border/60';
const PANEL_SURFACE = 'rounded-xl border border-border/60';

function segmentItemClass(active: boolean, extra = '') {
  return [
    'relative rounded-lg text-xs transition-colors',
    active
      ? 'text-accent-foreground after:absolute after:left-1/2 after:bottom-[4px] after:h-[2px] after:w-4 after:-translate-x-1/2 after:rounded-full after:bg-current'
      : 'text-muted-foreground hover:text-foreground',
    extra,
  ].join(' ');
}

function SettingsToggle({
  label,
  checked,
  onToggle,
  hint,
}: {
  label: string;
  checked?: boolean;
  onToggle?: () => void;
  hint?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-muted-foreground text-xs uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2 shrink-0">
        {hint}
        <button
          type="button"
          onClick={onToggle}
          className={`relative inline-flex h-[22px] w-[40px] shrink-0 cursor-pointer rounded-full transition-colors ${
            checked ? 'bg-accent-foreground' : 'bg-muted-foreground/30'
          }`}
        >
          <span
            className={`pointer-events-none inline-block h-[18px] w-[18px] rounded-full bg-white shadow-sm transition-transform mt-[2px] ${
              checked ? 'translate-x-[20px]' : 'translate-x-[2px]'
            }`}
          />
        </button>
      </div>
    </div>
  );
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  wordCount?: number;
  charCount?: number;
  showStats?: boolean;
  onToggleStats?: () => void;
  colorTheme?: ColorTheme;
  onSelectColorTheme?: (theme: ColorTheme) => void;
  mode?: 'dark' | 'light';
  onToggleMode?: () => void;
  useSerif?: boolean;
  onToggleFont?: () => void;
  spellCheckEnabled?: boolean;
  onToggleSpellCheck?: () => void;
  cmdArrowPageNav?: boolean;
  onToggleCmdArrowPageNav?: () => void;
  imagesEnabled?: boolean;
  onToggleImages?: () => void;
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  fsSupported?: boolean;
  syncConfigured?: boolean;
  syncUnlocked?: boolean;
  syncBusy?: boolean;
  syncStatus?: string;
  syncError?: string;
  syncEmail?: string;
  syncPassword?: string;
  syncUserEmail?: string;
  syncPlan?: 'free' | 'paid';
  syncCanUse?: boolean;
  activeProjectSynced?: boolean;
  onSyncEmailChange?: (value: string) => void;
  onSyncPasswordChange?: (value: string) => void;
  onUnlockSync?: () => void;
  onCreateSyncAccount?: () => void;
  onLockSync?: () => void;
  onSyncNow?: () => void;
  onToggleActiveProjectSync?: () => void;
  accessToken?: string;
  userId?: string;
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
  cmdArrowPageNav,
  onToggleCmdArrowPageNav,
  imagesEnabled,
  onToggleImages,
  dirName,
  onPickFolder,
  onClearFolder,
  fsSupported,
  syncConfigured,
  syncUnlocked,
  syncBusy,
  syncStatus,
  syncError,
  syncEmail,
  syncPassword,
  syncUserEmail,
  syncPlan = 'free',
  syncCanUse,
  activeProjectSynced,
  onSyncEmailChange,
  onSyncPasswordChange,
  onUnlockSync,
  onCreateSyncAccount,
  onLockSync,
  onSyncNow,
  onToggleActiveProjectSync,
  accessToken,
  userId,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('appearance');
  const landingPageUrl = getLandingPageUrl();

  useEffect(() => {
    if (open) setActiveTab('appearance');
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[90vw] sm:max-w-md h-[min(82vh,34rem)] grid-rows-[auto_auto_minmax(0,1fr)_auto] bg-popover text-popover-foreground !rounded-2xl font-mono text-sm">
        <DialogHeader>
          <DialogTitle className="font-mono text-base sm:text-lg lowercase truncate">
            settings
          </DialogTitle>
        </DialogHeader>

        <div className={SEGMENT_TRACK} role="tablist" aria-label="settings sections">
          {SETTINGS_TABS.map(tab => (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className={segmentItemClass(activeTab === tab, 'flex-1 px-2 py-1.5 lowercase font-mono')}
            >
              {tab}
            </button>
          ))}
        </div>

        <div className="overflow-y-auto pr-1 -mr-1">
          {activeTab === 'appearance' && (
            <div role="tabpanel" className="space-y-3 pt-1">
              <div className="flex items-center justify-between">
                <span className="text-muted-foreground text-xs uppercase tracking-wider">theme</span>
                <div className="flex gap-2">
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
                      {theme.id === 'blue' && <div className="w-full h-full rounded-full bg-[#0623ad]" />}
                      {theme.id === 'green' && <div className="w-full h-full rounded-full bg-[#285135]" />}
                      {theme.id === 'red' && <div className="w-full h-full rounded-full bg-[#7C3232]" />}
                      {theme.id === '' && <div className="w-full h-full rounded-full" />}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs uppercase tracking-wider shrink-0">mode</span>
                <div className={`${SEGMENT_TRACK} shrink-0`}>
                  <button
                    type="button"
                    onClick={() => { if (mode !== 'light') onToggleMode?.(); }}
                    className={segmentItemClass(mode === 'light', 'px-2.5 py-1 font-mono')}
                  >
                    light
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (mode !== 'dark') onToggleMode?.(); }}
                    className={segmentItemClass(mode === 'dark', 'px-2.5 py-1 font-mono')}
                  >
                    dark
                  </button>
                </div>
              </div>

              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground text-xs uppercase tracking-wider shrink-0">font style</span>
                <div className={`${SEGMENT_TRACK} shrink-0`}>
                  <button
                    type="button"
                    onClick={() => { if (!useSerif) onToggleFont?.(); }}
                    className={segmentItemClass(useSerif, 'px-2.5 py-1')}
                    style={{ fontFamily: "'Instrument Serif', serif" }}
                  >
                    serif
                  </button>
                  <button
                    type="button"
                    onClick={() => { if (useSerif) onToggleFont?.(); }}
                    className={segmentItemClass(!useSerif, 'px-2.5 py-1 font-mono')}
                  >
                    mono
                  </button>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'features' && (
            <div role="tabpanel" className="space-y-3 pt-1">
              <SettingsToggle
                label="word/char count"
                checked={showStats}
                onToggle={onToggleStats}
                hint={showStats ? (
                  <span className="text-xs text-muted-foreground">{wordCount ?? 0}w · {charCount ?? 0}c</span>
                ) : undefined}
              />
              <SettingsToggle label="spellcheck" checked={spellCheckEnabled} onToggle={onToggleSpellCheck} />
              <SettingsToggle label="cmd+←/→ pages" checked={cmdArrowPageNav} onToggle={onToggleCmdArrowPageNav} />
              <SettingsToggle label="images" checked={imagesEnabled} onToggle={onToggleImages} />
            </div>
          )}

          {activeTab === 'storage' && (
            <div role="tabpanel" className="space-y-4 pt-1">
              {fsSupported && (
                <div className="space-y-2">
                  <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">local folder</h3>
                  <div className={`${PANEL_SURFACE} border-2 border-dashed border-accent-foreground/40 bg-accent/10 p-3`}>
                    {dirName ? (
                      <div className="flex items-center justify-between">
                        <span className="flex items-center gap-1.5 text-xs text-foreground">
                          <FolderOpen size={14} className="text-accent-foreground" />
                          saving to <span className="text-accent-foreground">/{dirName}</span>
                        </span>
                        <button
                          onClick={onClearFolder}
                          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
                        >
                          change
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={onPickFolder}
                        className="flex items-center gap-1.5 text-xs text-accent-foreground hover:underline w-full"
                      >
                        <FolderOpen size={14} />
                        choose save folder →
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">sync</h3>
                <div className={`${PANEL_SURFACE} bg-muted/10 p-3 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
                      <Lock size={13} />
                      account
                    </span>
                    <span className="text-[10px] text-muted-foreground lowercase">{syncStatus}</span>
                  </div>

                  {!syncConfigured ? (
                    <div className="text-xs text-muted-foreground lowercase">
                      add supabase env to enable sync
                    </div>
                  ) : (
                    <>
                      {syncUnlocked ? (
                        <div className="flex items-center justify-between gap-2">
                          <div className="min-w-0 text-xs text-muted-foreground lowercase">
                            <div className="truncate text-foreground">{syncUserEmail}</div>
                            <div>{syncPlan === 'paid' ? 'paid sync active' : 'free: local only'}</div>
                          </div>
                          <button
                            onClick={onLockSync}
                            disabled={syncBusy}
                            className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground disabled:opacity-40"
                          >
                            sign out
                          </button>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="email"
                            value={syncEmail ?? ''}
                            onChange={(e) => onSyncEmailChange?.(e.target.value)}
                            placeholder="email"
                            disabled={syncBusy}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50"
                          />
                          <input
                            type="password"
                            value={syncPassword ?? ''}
                            onChange={(e) => onSyncPasswordChange?.(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') onUnlockSync?.();
                            }}
                            placeholder="password"
                            disabled={syncBusy}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50"
                          />
                          <div className="flex items-center gap-2">
                            <button
                              onClick={onUnlockSync}
                              disabled={syncBusy}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-mono bg-accent/20 text-accent-foreground disabled:opacity-40"
                            >
                              sign in
                            </button>
                            <button
                              onClick={onCreateSyncAccount}
                              disabled={syncBusy}
                              className="px-2.5 py-1.5 rounded-lg text-xs font-mono text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              create
                            </button>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        <button
                          onClick={onToggleActiveProjectSync}
                          disabled={syncBusy || !syncCanUse}
                          className={`flex items-center gap-1.5 text-xs transition-colors ${
                            activeProjectSynced ? 'text-accent-foreground' : 'text-muted-foreground hover:text-foreground'
                          } disabled:opacity-40`}
                        >
                          <Cloud size={13} />
                          {activeProjectSynced ? 'current doc synced' : 'sync current doc'}
                        </button>
                        <button
                          onClick={onSyncNow}
                          disabled={syncBusy || !syncCanUse}
                          className="flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground disabled:opacity-40"
                        >
                          <RefreshCw size={13} />
                          now
                        </button>
                      </div>
                    </>
                  )}

                  {syncError && (
                    <div className="text-[10px] text-destructive lowercase">
                      {syncError}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {activeTab === 'about' && (
            <div role="tabpanel" className="space-y-4 pt-1 lowercase">
              <div className="space-y-1.5">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">dev hotline</h3>
                <p className="text-sm text-foreground">
                  <a href={`mailto:${BUG_REPORT_EMAIL}`} className="text-accent-foreground hover:underline">
                    {BUG_REPORT_EMAIL}
                  </a>
                </p>
              </div>
              <div className="space-y-1.5">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">share w/ friends</h3>
                <a
                  href={landingPageUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-accent-foreground hover:underline break-all"
                >
                  {landingPageUrl}
                </a>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  send friends here to join the waitlist and get access.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogSupportFooter
          variant="settings"
          contactEmail={syncUserEmail}
          accessToken={accessToken}
          userId={userId}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
