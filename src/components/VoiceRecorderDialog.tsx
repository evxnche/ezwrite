import React, { useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, Mic, Square, RotateCcw } from 'lucide-react';
import { saveVoice } from '@/lib/voiceStore';
import { formatVoiceDuration, MAX_VOICE_DURATION_MS, useVoiceRecorder } from './useVoiceRecorder';

interface VoiceSaveResult {
  id: string;
  durationSec: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (result: VoiceSaveResult) => void;
}

const VoiceRecorderDialog: React.FC<Props> = ({ open, onClose, onSave }) => {
  const {
    state,
    durationMs,
    error,
    previewUrl,
    previewBlob,
    start,
    stop,
    cancel,
    reRecord,
    reset,
  } = useVoiceRecorder();
  const [saving, setSaving] = React.useState(false);

  useEffect(() => {
    if (!open) reset();
  }, [open, reset]);

  const handleClose = () => {
    if (saving) return;
    cancel();
    onClose();
  };

  const handleSave = async () => {
    if (!previewBlob || saving) return;
    setSaving(true);
    try {
      const id = await saveVoice(previewBlob);
      const durationSec = Math.max(1, Math.round(durationMs / 1000));
      onSave({ id, durationSec });
      cancel();
      onClose();
    } finally {
      setSaving(false);
    }
  };

  const maxLabel = formatVoiceDuration(MAX_VOICE_DURATION_MS);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && handleClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Voice note</DialogTitle>
          <DialogDescription>
            Record up to {maxLabel}. Tap record, then stop when finished.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col items-center gap-4 mt-2 font-mono">
          <div className="text-3xl tabular-nums text-foreground">
            {formatVoiceDuration(durationMs)}
          </div>

          {error && (
            <p className="text-sm text-destructive text-center">{error}</p>
          )}

          {state === 'preview' && previewUrl && (
            <audio src={previewUrl} controls className="w-full max-w-sm" />
          )}

          <div className="flex flex-wrap items-center justify-center gap-2 w-full">
            {state === 'idle' && (
              <Button type="button" className="gap-2 min-h-11 px-6" onClick={() => void start()}>
                <Mic className="h-4 w-4" />
                Record
              </Button>
            )}

            {state === 'recording' && (
              <Button type="button" variant="destructive" className="gap-2 min-h-11 px-6" onClick={stop}>
                <Square className="h-4 w-4 fill-current" />
                Stop
              </Button>
            )}

            {state === 'preview' && (
              <>
                <Button type="button" variant="outline" className="gap-2 min-h-11" onClick={reRecord} disabled={saving}>
                  <RotateCcw className="h-4 w-4" />
                  Re-record
                </Button>
                <Button type="button" className="gap-2 min-h-11 px-6" onClick={() => void handleSave()} disabled={saving}>
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                  Insert
                </Button>
              </>
            )}

            {(state === 'idle' || state === 'preview') && (
              <Button type="button" variant="ghost" className="min-h-11" onClick={handleClose} disabled={saving}>
                Cancel
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default VoiceRecorderDialog;
