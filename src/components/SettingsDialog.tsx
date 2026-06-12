import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Cloud, Copy, Eye, EyeOff, FolderOpen, Lock, RefreshCw } from 'lucide-react';
import DialogSupportFooter from './DialogSupportFooter';
import AgentPairingSection from './AgentPairingSection';
import { BUG_REPORT_EMAIL } from '@/lib/bug-report';
import { copyLandingPageUrl, getLandingPageDisplayLabel, getLandingPageUrl } from '@/lib/app-links';
import type { ColorTheme } from './preferences';
import {
  resolveScratchpadLLMConfig,
  SCRATCHPAD_ANTHROPIC_BASE_URL,
  SCRATCHPAD_ANTHROPIC_MODEL,
  SCRATCHPAD_GROQ_BASE_URL,
  SCRATCHPAD_GROQ_MODEL,
  SCRATCHPAD_OPENCODE_FREE_MODEL,
  SCRATCHPAD_OPENCODE_MODEL,
  type ScratchpadLLMConfig,
  type ScratchpadLLMProvider,
} from '@/lib/scratchpad-llm';

const THEMES = [
  { id: '' as ColorTheme, label: 'orig', swatch: 'bg-[#171717] dark:bg-[#fafaf9]' },
  { id: 'blue' as ColorTheme, label: 'blue', swatch: 'bg-[#0623ad]' },
  { id: 'green' as ColorTheme, label: 'green', swatch: 'bg-[#285135]' },
  { id: 'red' as ColorTheme, label: 'red', swatch: 'bg-[#7C3232]' },
];

const SETTINGS_TABS = ['storage', 'customization', 'about', 'experimental', 'agent'] as const;
type SettingsTab = (typeof SETTINGS_TABS)[number];
// 'experimental' and 'agent' only appear once the //exp// cheat is unlocked.
const EXP_ONLY_TABS: ReadonlySet<SettingsTab> = new Set(['experimental', 'agent']);

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
  voicesEnabled?: boolean;
  onToggleVoices?: () => void;
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
  autoPairBrackets?: boolean;
  onToggleAutoPairBrackets?: () => void;
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
  scratchpadLLMConfig?: ScratchpadLLMConfig;
  onScratchpadLLMConfigChange?: (config: ScratchpadLLMConfig) => void;
  byokUnlocked?: boolean;
  onToggleByok?: () => void;
  expEnabled?: boolean;
  activeProjectId?: string | null;
  activeProjectTitle?: string;
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
  voicesEnabled,
  onToggleVoices,
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
  autoPairBrackets,
  onToggleAutoPairBrackets,
  scratchpadLLMConfig,
  onScratchpadLLMConfigChange,
  byokUnlocked,
  onToggleByok,
  expEnabled,
  activeProjectId,
  activeProjectTitle,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('storage');
  const visibleTabs = SETTINGS_TABS.filter(tab => (EXP_ONLY_TABS.has(tab) ? Boolean(expEnabled) : true));
  const [landingCopied, setLandingCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showOrKey, setShowOrKey] = useState(false);
  const landingPageUrl = getLandingPageUrl();
  const landingPageLabel = getLandingPageDisplayLabel();
  const resolvedScratchpadLLM = resolveScratchpadLLMConfig(scratchpadLLMConfig);
  const scratchpadProvider = scratchpadLLMConfig?.provider ?? resolvedScratchpadLLM.provider;
  const hasScratchpadConfig = !!(
    scratchpadLLMConfig?.apiKey
    || scratchpadLLMConfig?.baseURL
    || scratchpadLLMConfig?.model
    || scratchpadLLMConfig?.provider === 'opencode'
  );
  const showCustomBaseURL = scratchpadProvider === 'openai-compatible';
  const showAnthropicBaseURL = scratchpadProvider === 'anthropic';
  const scratchpadKeyPlaceholder =
    scratchpadProvider === 'groq'
      ? 'gsk_...'
      : scratchpadProvider === 'anthropic'
        ? 'sk-ant-...'
        : scratchpadProvider === 'openrouter'
          ? 'sk-or-v1-... or or-...'
          : scratchpadProvider === 'opencode'
            ? 'api key (optional — free models work without one)'
            : 'api key';
  const scratchpadModelPlaceholder =
    scratchpadProvider === 'groq'
      ? `model (optional — defaults to ${SCRATCHPAD_GROQ_MODEL})`
      : scratchpadProvider === 'anthropic'
        ? `model (optional — defaults to ${SCRATCHPAD_ANTHROPIC_MODEL})`
        : scratchpadProvider === 'openrouter'
          ? 'model (optional — leave blank for ezwrite fallback chain)'
          : scratchpadProvider === 'opencode'
            ? `model (optional — defaults to ${SCRATCHPAD_OPENCODE_MODEL})`
            : 'model (required — e.g. gpt-4o-mini)';
  const scratchpadStatus = !hasScratchpadConfig
    ? 'using shared key'
    : resolvedScratchpadLLM.validationError
      ? 'needs setup'
      : scratchpadProvider === 'anthropic'
        ? 'anthropic direct'
        : scratchpadProvider === 'groq'
          ? 'groq direct'
          : scratchpadProvider === 'openrouter'
            ? 'openrouter direct'
            : scratchpadProvider === 'opencode'
              ? scratchpadLLMConfig?.apiKey
                ? 'opencode'
                : 'opencode (free models)'
              : 'custom provider (direct)';

  const handleScratchpadProviderChange = (provider: ScratchpadLLMProvider) => {
    const next: ScratchpadLLMConfig = {
      provider,
      ...(scratchpadLLMConfig?.apiKey ? { apiKey: scratchpadLLMConfig.apiKey } : {}),
    };
    onScratchpadLLMConfigChange?.(next);
  };

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
          {visibleTabs.map(tab => (
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
                <SettingsToggle label="auto-close brackets" checked={autoPairBrackets} onToggle={onToggleAutoPairBrackets} />
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
                {voicesEnabled && (
                  <SettingsToggle label="record voice notes" checked={voicesEnabled} onToggle={onToggleVoices} />
                )}
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
                    <div className="text-[10px] text-destructive lowercase break-all whitespace-pre-wrap">
                      {syncError}
                    </div>
                  )}
                </div>
              </div>

              {byokUnlocked && (
              <div className="space-y-2">
                <h3 className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">byok</h3>
                <div className={`${PANEL_SURFACE} bg-muted/10 p-3 space-y-2`}>
                  <div className="text-[10px] text-muted-foreground lowercase">
                    add your own api key
                  </div>

                  {/* Provider */}
                  <select
                    value={scratchpadProvider}
                    onChange={(e) => handleScratchpadProviderChange(e.target.value as ScratchpadLLMProvider)}
                    className="w-full rounded-lg border border-border bg-background px-2 py-1 text-xs font-mono outline-none focus:border-accent-foreground/50"
                  >
                    <option value="openrouter">openrouter</option>
                    <option value="opencode">opencode (zen / go)</option>
                    <option value="groq">groq</option>
                    <option value="anthropic">anthropic (claude)</option>
                    <option value="openai-compatible">custom openai-compatible (enter base url + model)</option>
                  </select>

                  {/* API Key */}
                  <div className="relative">
                    <input
                      type={showOrKey ? 'text' : 'password'}
                      value={scratchpadLLMConfig?.apiKey ?? ''}
                      onChange={(e) => onScratchpadLLMConfigChange?.({ ...scratchpadLLMConfig, apiKey: e.target.value })}
                      placeholder={scratchpadKeyPlaceholder}
                      spellCheck={false}
                      autoCorrect="off"
                      autoCapitalize="none"
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 pr-8 font-mono text-xs outline-none focus:border-accent-foreground/50"
                    />
                    <button
                      type="button"
                      tabIndex={-1}
                      onClick={() => setShowOrKey((v) => !v)}
                      aria-label={showOrKey ? 'hide key' : 'show key'}
                      className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showOrKey ? <EyeOff size={13} /> : <Eye size={13} />}
                    </button>
                  </div>

                  {(showCustomBaseURL || showAnthropicBaseURL) && (
                    <input
                      type="text"
                      value={scratchpadLLMConfig?.baseURL ?? ''}
                      onChange={(e) => onScratchpadLLMConfigChange?.({ ...scratchpadLLMConfig, baseURL: e.target.value || undefined })}
                      placeholder={
                        showCustomBaseURL
                          ? 'base url (required — e.g. https://api.example.com/v1)'
                          : `base url override (optional — defaults to ${SCRATCHPAD_ANTHROPIC_BASE_URL})`
                      }
                      spellCheck={false}
                      autoCorrect="off"
                      className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50"
                    />
                  )}

                  {/* Model override */}
                  <input
                    type="text"
                    value={scratchpadLLMConfig?.model ?? ''}
                    onChange={(e) => onScratchpadLLMConfigChange?.({ ...scratchpadLLMConfig, model: e.target.value || undefined })}
                    placeholder={scratchpadModelPlaceholder}
                    spellCheck={false}
                    autoCorrect="off"
                    className="w-full rounded-lg border border-border bg-background px-2 py-1.5 font-mono text-xs outline-none focus:border-accent-foreground/50"
                  />

                  <div className="flex items-center justify-between gap-2">
                    {hasScratchpadConfig ? (
                      <button
                        type="button"
                        onClick={() => onScratchpadLLMConfigChange?.({})}
                        className="text-xs text-muted-foreground hover:text-foreground font-mono"
                      >
                        clear
                      </button>
                    ) : (
                      <span />
                    )}
                    <span className="text-[10px] text-muted-foreground lowercase">
                      {scratchpadStatus}
                    </span>
                  </div>

                  {resolvedScratchpadLLM.validationError && (
                    <div className="text-[10px] text-destructive lowercase break-all whitespace-pre-wrap">
                      {resolvedScratchpadLLM.validationError}
                    </div>
                  )}

                  {scratchpadProvider !== 'openrouter' && (
                    <div className="text-[10px] text-muted-foreground">
                      {scratchpadProvider === 'groq'
                        ? `groq fills ${SCRATCHPAD_GROQ_BASE_URL} and defaults to ${SCRATCHPAD_GROQ_MODEL}.`
                        : scratchpadProvider === 'anthropic'
                          ? `anthropic fills ${SCRATCHPAD_ANTHROPIC_BASE_URL} and defaults to ${SCRATCHPAD_ANTHROPIC_MODEL}.`
                          : scratchpadProvider === 'opencode'
                            ? `just paste your opencode key — zen or go, it detects which. defaults to ${SCRATCHPAD_OPENCODE_MODEL}; no key uses free models (${SCRATCHPAD_OPENCODE_FREE_MODEL}). opencode blocks browser requests, so calls relay through ezwrite's server; your key is forwarded, never stored.`
                            : 'custom openai-compatible providers need both a base url and model.'}
                    </div>
                  )}
                  <div className="text-[10px] text-muted-foreground">
                    key stays in browser only.
                  </div>
                </div>
              </div>
              )}
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
                  share with friends to give them access as well.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'experimental' && expEnabled && (
            <div role="tabpanel" className="space-y-6 pt-1">
              <div className="space-y-3">
                <div className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest border-b border-border/50 pb-1.5 mb-2">
                  Experimental
                </div>
                <p className="text-xs text-muted-foreground leading-relaxed lowercase">
                  hidden, in-progress features. toggle them here instead of typing the cheat codes.
                </p>
                <SettingsToggle
                  label="voice notes"
                  checked={voicesEnabled}
                  onToggle={onToggleVoices}
                />
                <SettingsToggle
                  label="bring your own key"
                  checked={byokUnlocked}
                  onToggle={onToggleByok}
                  hint={byokUnlocked ? <span className="text-[10px] text-muted-foreground/70 lowercase">config in storage tab</span> : undefined}
                />
                <p className="text-xs text-muted-foreground leading-relaxed lowercase">
                  connect ai agents to your notebooks in the <span className="text-accent-foreground">agent</span> tab.
                </p>
              </div>
            </div>
          )}

          {activeTab === 'agent' && expEnabled && (
            <div role="tabpanel" className="pt-1">
              <AgentPairingSection
                accessToken={accessToken}
                userId={userId}
                syncConfigured={syncConfigured}
                syncUnlocked={syncUnlocked}
                activeProjectId={activeProjectId}
                activeProjectTitle={activeProjectTitle}
              />
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
