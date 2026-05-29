import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, Copy, Eye, EyeOff, FolderOpen, Lock, RefreshCw, Cpu } from 'lucide-react';
import DialogSupportFooter from './DialogSupportFooter';
import { BUG_REPORT_EMAIL } from '@/lib/bug-report';
import { copyLandingPageUrl, getLandingPageDisplayLabel, getLandingPageUrl } from '@/lib/app-links';
import type { ColorTheme } from './preferences';

const THEMES = [
  { id: '' as ColorTheme, label: 'orig', swatch: 'bg-[#171717] dark:bg-[#fafaf9]' },
  { id: 'blue' as ColorTheme, label: 'blue', swatch: 'bg-[#0623ad]' },
  { id: 'green' as ColorTheme, label: 'green', swatch: 'bg-[#285135]' },
  { id: 'red' as ColorTheme, label: 'red', swatch: 'bg-[#7C3232]' },
];

const SETTINGS_TABS = ['storage', 'customization', 'about'] as const;
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
  sidetabEnabled?: boolean;
  onToggleSidetab?: () => void;
  scratchpadEnabled?: boolean;
  onToggleScratchpad?: () => void;
  listEnabled?: boolean;
  onToggleList?: () => void;
  lineEnabled?: boolean;
  onToggleLine?: () => void;
  timerEnabled?: boolean;
  onToggleTimer?: () => void;
  helpEnabled?: boolean;
  onToggleHelp?: () => void;
  settingsCommandEnabled?: boolean;
  onToggleSettingsCommand?: () => void;
  polaroidFramesEnabled?: boolean;
  onTogglePolaroidFrames?: () => void;
  justifyText?: boolean;
  onToggleJustify?: () => void;
  exportCenterAlign?: boolean;
  onToggleExportCenterAlign?: () => void;
  notesTransferMode?: 'move' | 'copy';
  onToggleNotesTransferMode?: () => void;
  dirName?: string;
  onPickFolder?: () => void;
  onClearFolder?: () => void;
  fsSupported?: boolean;
  syncConfigured?: boolean;
  syncUnlocked?: boolean;
  syncBusy?: boolean;
  syncStatus?: string;
  syncError?: string;
  syncUsername?: string;
  syncPassword?: string;
  syncAccount?: string;
  syncPlan?: 'free' | 'paid';
  syncCanUse?: boolean;
  activeProjectSynced?: boolean;
  forceSyncAll?: boolean;
  onSyncUsernameChange?: (value: string) => void;
  onSyncPasswordChange?: (value: string) => void;
  onUnlockSync?: () => void;
  onCreateSyncAccount?: () => void;
  onLockSync?: () => void;
  onSyncNow?: () => void;
  onToggleActiveProjectSync?: () => void;
  accessToken?: string;
  userId?: string;
  mcpSyncEnabled?: boolean;
  onToggleMcpSync?: () => void;
  mcpToken?: string | null;
  mcpUrl?: string | null;
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
  sidetabEnabled,
  onToggleSidetab,
  scratchpadEnabled,
  onToggleScratchpad,
  listEnabled,
  onToggleList,
  lineEnabled,
  onToggleLine,
  timerEnabled,
  onToggleTimer,
  helpEnabled,
  onToggleHelp,
  settingsCommandEnabled,
  onToggleSettingsCommand,
  polaroidFramesEnabled,
  onTogglePolaroidFrames,
  justifyText,
  onToggleJustify,
  exportCenterAlign,
  onToggleExportCenterAlign,
  notesTransferMode,
  onToggleNotesTransferMode,
  dirName,
  onPickFolder,
  onClearFolder,
  fsSupported,
  syncConfigured,
  syncUnlocked,
  syncBusy,
  syncStatus,
  syncError,
  syncUsername,
  syncPassword,
  syncAccount,
  syncPlan = 'free',
  syncCanUse,
  activeProjectSynced,
  forceSyncAll,
  onSyncUsernameChange,
  onSyncPasswordChange,
  onUnlockSync,
  onCreateSyncAccount,
  onLockSync,
  onSyncNow,
  onToggleActiveProjectSync,
  accessToken,
  userId,
  mcpSyncEnabled,
  onToggleMcpSync,
  mcpToken,
  mcpUrl,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('storage');
  const [landingCopied, setLandingCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const landingPageUrl = getLandingPageUrl();
  const landingPageLabel = getLandingPageDisplayLabel();

  useEffect(() => {
    if (open) setActiveTab('storage');
  }, [open]);

  useEffect(() => {
    if (!landingCopied) return;
    const id = window.setTimeout(() => setLandingCopied(false), 2000);
    return () => window.clearTimeout(id);
  }, [landingCopied]);

  const handleCopyLandingPage = async () => {
    const ok = await copyLandingPageUrl();
    if (ok) setLandingCopied(true);
  };

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
          {activeTab === 'customization' && (
            <div role="tabpanel" className="space-y-6 pt-1">
              <div className="space-y-3">
                <div className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest border-b border-border/50 pb-1.5 mb-2">
                  Appearance
                </div>
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
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">mode</span>
                  <div className={`${SEGMENT_TRACK} w-32`}>
                    <button
                      type="button"
                      onClick={() => { if (mode === 'dark') onToggleMode?.(); }}
                      className={segmentItemClass(mode === 'light', 'flex-1 py-1 font-mono')}
                    >
                      light
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (mode === 'light') onToggleMode?.(); }}
                      className={segmentItemClass(mode === 'dark', 'flex-1 py-1 font-mono')}
                    >
                      dark
                    </button>
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-muted-foreground text-xs uppercase tracking-wider">font style</span>
                  <div className={`${SEGMENT_TRACK} w-32`}>
                    <button
                      type="button"
                      onClick={() => { if (useSerif) onToggleFont?.(); }}
                      className={`${segmentItemClass(!useSerif, 'flex-1 py-1 font-mono')}`}
                    >
                      mono
                    </button>
                    <button
                      type="button"
                      onClick={() => { if (!useSerif) onToggleFont?.(); }}
                      className={`${segmentItemClass(!!useSerif, 'flex-1 py-1 font-playfair italic')}`}
                    >
                      serif
                    </button>
                  </div>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest border-b border-border/50 pb-1.5 mb-2">
                  Preferences
                </div>
                <SettingsToggle
                  label="word/char count"
                  checked={showStats}
                  onToggle={onToggleStats}
                  hint={showStats ? (
                    <span className="text-xs text-muted-foreground">{wordCount ?? 0}w · {charCount ?? 0}c</span>
                  ) : undefined}
                />
                <SettingsToggle label="spellcheck" checked={spellCheckEnabled} onToggle={onToggleSpellCheck} />
                <SettingsToggle label="justify text in main editor" checked={justifyText} onToggle={onToggleJustify} />
                <SettingsToggle label="center align text in img export" checked={exportCenterAlign} onToggle={onToggleExportCenterAlign} />
                <SettingsToggle label="polaroid frames" checked={polaroidFramesEnabled} onToggle={onTogglePolaroidFrames} />
                <SettingsToggle label="cmd+←/→ pages" checked={cmdArrowPageNav} onToggle={onToggleCmdArrowPageNav} />
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between gap-3">
                    <span className="text-muted-foreground text-xs uppercase tracking-wider">transfer to scratchpad</span>
                    <div className={`${SEGMENT_TRACK} w-32`}>
                      <button
                        type="button"
                        onClick={() => { if (notesTransferMode === 'copy') onToggleNotesTransferMode?.(); }}
                        className={`${segmentItemClass(notesTransferMode === 'move', 'flex-1 py-1 font-mono')}`}
                      >
                        move
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (notesTransferMode === 'move') onToggleNotesTransferMode?.(); }}
                        className={`${segmentItemClass(notesTransferMode === 'copy', 'flex-1 py-1 font-mono')}`}
                      >
                        copy
                      </button>
                    </div>
                  </div>
                  <p className="text-muted-foreground/50 text-[10px] leading-snug">
                    {notesTransferMode === 'move'
                      ? 'selected text is moved from the editor to the scratchpad.'
                      : 'selected text is copied to the scratchpad.'}
                  </p>
                </div>
              </div>

              <div className="space-y-3">
                <div className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest border-b border-border/50 pb-1.5 mb-2">
                  / command
                </div>
                <SettingsToggle label="list" checked={listEnabled} onToggle={onToggleList} />
                <SettingsToggle label="line" checked={lineEnabled} onToggle={onToggleLine} />
                <SettingsToggle label="timer" checked={timerEnabled} onToggle={onToggleTimer} />
                <SettingsToggle label="side tab" checked={sidetabEnabled} onToggle={onToggleSidetab} />
                <SettingsToggle label="scratchpad" checked={scratchpadEnabled} onToggle={onToggleScratchpad} />
                <SettingsToggle label="insert images" checked={imagesEnabled} onToggle={onToggleImages} />
                <SettingsToggle label="help" checked={helpEnabled} onToggle={onToggleHelp} />
                <SettingsToggle label="settings" checked={settingsCommandEnabled} onToggle={onToggleSettingsCommand} />
              </div>
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
                            <div className="truncate text-foreground">{syncAccount}</div>
                            <div>{syncPlan === 'paid' ? 'paid sync active' : 'sync active'}</div>
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
                            type="text"
                            autoCapitalize="none"
                            autoCorrect="off"
                            spellCheck={false}
                            value={syncUsername ?? ''}
                            onChange={(e) => onSyncUsernameChange?.(e.target.value)}
                            placeholder="username"
                            disabled={syncBusy}
                            className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50"
                          />
                          <div className="relative">
                            <input
                              type={showPassword ? 'text' : 'password'}
                              value={syncPassword ?? ''}
                              onChange={(e) => onSyncPasswordChange?.(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') onUnlockSync?.();
                              }}
                              placeholder="password"
                              disabled={syncBusy}
                              className="w-full rounded-lg border border-border bg-background px-2 py-1.5 pr-8 font-mono text-xs outline-none focus:border-accent-foreground/50 disabled:opacity-50"
                            />
                            <button
                              type="button"
                              tabIndex={-1}
                              onClick={() => setShowPassword((v) => !v)}
                              disabled={syncBusy}
                              aria-label={showPassword ? 'hide password' : 'show password'}
                              className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground disabled:opacity-40"
                            >
                              {showPassword ? <EyeOff size={13} /> : <Eye size={13} />}
                            </button>
                          </div>
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
                          <div className="mt-2 text-xs text-muted-foreground space-y-1">
                            <p className="text-destructive font-semibold">
                            no mail collected, so there's no password reset. if you forget your password, synced notes cannot be recovered.
                            </p>
                          </div>
                        </div>
                      )}

                      <div className="flex items-center justify-between">
                        {forceSyncAll ? (
                          <span className="flex items-center gap-1.5 text-xs text-accent-foreground">
                            <Cloud size={13} />
                            all docs sync on mobile
                          </span>
                        ) : (
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
                        )}
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

              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">ai sync</h3>
                <div className={`${PANEL_SURFACE} bg-muted/10 p-3 space-y-3`}>
                  <div className="flex items-center justify-between">
                    <span className="flex items-center gap-1.5 text-muted-foreground text-xs uppercase tracking-wider">
                      <Cpu size={13} />
                      mcp server
                    </span>
                    <span className={`text-[10px] lowercase ${mcpUrl ? 'text-accent-foreground' : 'text-muted-foreground'}`}>
                      {mcpUrl ? 'ready' : 'needs folder'}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    share this url with your ai assistant (claude, cursor, codex, chatgpt) so it can read and write your notebooks.
                  </p>
                  <SettingsToggle
                    label="enable mcp sync"
                    checked={mcpSyncEnabled}
                    onToggle={onToggleMcpSync}
                  />
                  {mcpSyncEnabled && (
                    <div className="space-y-2">
                      {mcpUrl ? (
                        <>
                          <div className="rounded-lg border border-border/60 bg-muted/20 p-2 space-y-1.5">
                            <p className="text-[10px] text-muted-foreground uppercase tracking-wider">step 1 — start the server</p>
                            <code className="block font-mono text-[10px] text-foreground bg-background/50 rounded px-2 py-1 select-all">
                              cd mcp && bun run start
                            </code>
                            <p className="text-[10px] text-muted-foreground leading-relaxed">
                              keep this running in a terminal. that's what your llm talks to.
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              readOnly
                              value={mcpUrl}
                              className="flex-1 rounded-lg border border-border bg-muted/30 px-2 py-1.5 font-mono text-[10px] text-foreground outline-none select-all"
                              onClick={(e) => (e.target as HTMLInputElement).select()}
                            />
                            <button
                              type="button"
                              onClick={async () => {
                                try {
                                  await navigator.clipboard.writeText(mcpUrl);
                                } catch { /* */ }
                              }}
                              className="shrink-0 px-2.5 py-1.5 rounded-lg text-xs font-mono bg-accent/20 text-accent-foreground"
                            >
                              copy
                            </button>
                          </div>
                          <p className="text-[10px] text-muted-foreground leading-relaxed">
                            step 2 — paste this into your llm's mcp / server settings (claude desktop, cursor, codex, etc.)
                          </p>
                        </>
                      ) : (
                        <p className="text-xs text-muted-foreground leading-relaxed">
                          pick a save folder above to generate your mcp url.
                        </p>
                      )}
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
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">share access</h3>
                <div className="flex items-center gap-2">
                  <a
                    href={landingPageUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-accent-foreground hover:underline"
                  >
                    {landingPageLabel}
                  </a>
                  <button
                    type="button"
                    onClick={handleCopyLandingPage}
                    className="text-muted-foreground hover:text-accent-foreground transition-colors"
                    aria-label={landingCopied ? 'copied' : 'copy link'}
                  >
                    <Copy size={14} />
                  </button>
                  {landingCopied && (
                    <span className="text-[10px] text-accent-foreground">copied</span>
                  )}
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  share w/ friends to give them access as well.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogSupportFooter
          variant="settings"
          accessToken={accessToken}
          userId={userId}
        />
      </DialogContent>
    </Dialog>
  );
};

export default SettingsDialog;
