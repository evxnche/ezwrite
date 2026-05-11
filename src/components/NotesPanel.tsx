import React from 'react';
import { X, Plus } from 'lucide-react';
import { STRUCK_MARKER, LIST_EXIT, INDENT } from './writing-helpers';

interface Props {
  open: boolean;
  pages: string[];
  timestamps: number[];
  currentPage: number;
  onSelectPage: (index: number) => void;
  onNewPage: () => void;
  onClose: () => void;
}

function getPageTitle(content: string): string {
  if (!content.trim()) return 'untitled';
  for (const line of content.split('\n')) {
    let clean = line.trim();
    if (!clean || clean === 'list' || clean === 'line' || /^timer(\s|$)/i.test(clean)) continue;
    if (clean.startsWith('img::')) continue;
    clean = clean.replace(/^#{1,2}\s+/, '').replace(/^>> ?/, '');
    if (clean.startsWith(STRUCK_MARKER)) clean = clean.slice(STRUCK_MARKER.length);
    if (clean.startsWith(LIST_EXIT)) clean = clean.slice(LIST_EXIT.length);
    clean = clean.startsWith(INDENT) ? clean.replace(/^\s+/, '') : clean;
    if (clean.trim()) return clean.trim();
  }
  return 'untitled';
}

function getPagePreview(content: string, title: string): string {
  let foundTitle = false;
  for (const line of content.split('\n')) {
    let clean = line.trim();
    if (!clean) continue;
    clean = clean.replace(/^#{1,2}\s+/, '').replace(/^>> ?/, '');
    if (clean.startsWith('img::') || clean === 'list' || clean === 'line' || /^timer(\s|$)/i.test(clean)) continue;
    if (clean.startsWith(STRUCK_MARKER)) clean = clean.slice(STRUCK_MARKER.length);
    if (clean.startsWith(LIST_EXIT)) clean = clean.slice(LIST_EXIT.length);
    clean = clean.startsWith(INDENT) ? clean.replace(/^\s+/, '') : clean;
    clean = clean.trim();
    if (!clean) continue;
    if (!foundTitle && clean === title) { foundTitle = true; continue; }
    return clean;
  }
  return '';
}

function timeAgo(ts: number): string {
  if (!ts) return '';
  const diff = Date.now() - ts;
  const min = Math.floor(diff / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min}m ago`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const NotesPanel: React.FC<Props> = ({ open, pages, timestamps, currentPage, onSelectPage, onNewPage, onClose }) => {
  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed left-0 top-0 bottom-0 z-50 w-72 bg-popover border-r border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-between px-4 py-3 border-b border-border/50">
          <span className="font-mono text-[10px] text-muted-foreground/50 uppercase tracking-widest">pages</span>
          <div className="flex items-center gap-1">
            <button
              onClick={onNewPage}
              className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
              aria-label="New page"
            >
              <Plus size={13} />
            </button>
            <button
              onClick={onClose}
              className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
              aria-label="Close"
            >
              <X size={13} />
            </button>
          </div>
        </div>
        <div className="flex-1 overflow-y-auto">
          {pages.map((content, i) => {
            const title = getPageTitle(content);
            const preview = getPagePreview(content, title);
            const ts = timestamps[i];
            const isActive = i === currentPage;
            return (
              <button
                key={i}
                onClick={() => { onSelectPage(i); onClose(); }}
                className={`w-full text-left px-4 py-3 border-b border-border/20 transition-colors ${
                  isActive ? 'bg-muted/40' : 'hover:bg-muted/20'
                }`}
              >
                <div className="font-mono text-sm font-medium text-foreground truncate leading-snug">
                  {title}
                </div>
                {preview && (
                  <div className="font-mono text-xs text-muted-foreground/50 truncate mt-0.5 leading-snug">
                    {preview}
                  </div>
                )}
                {ts ? (
                  <div className="font-mono text-[10px] text-muted-foreground/35 mt-1">
                    {timeAgo(ts)}
                  </div>
                ) : null}
              </button>
            );
          })}
        </div>
      </div>
    </>
  );
};

export default NotesPanel;
