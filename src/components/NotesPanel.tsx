import React, { useEffect, useRef, useState } from 'react';
import {
  X,
  Plus,
  Trash2,
  Settings,
  FileText,
  Image,
  NotebookPen,
  FolderOpen,
  ChevronDown,
  ChevronRight,
  ArrowUpRight,
} from 'lucide-react';
import { type ProjectMeta, getProjectTitle, getProjectPreview, timeAgo } from '@/lib/projects';

interface Props {
  open: boolean;
  projects: ProjectMeta[];
  activeProjectId: string | null;
  canExportPage: boolean;
  canExportDoc: boolean;
  isExportingPdf: boolean;
  isExportingPng: boolean;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  onOpenSettings: () => void;
  onOpenScratchpad: () => void;
  onExportMd: () => void;
  onExportPng: () => void;
  onExportPagePdf: () => void;
  onExportDocPdf: () => void;
  onClose: () => void;
}

type ExpandedSection = 'export' | 'notes' | null;

const baseRowClass = 'w-full flex items-center gap-3 px-4 py-3 text-left font-mono text-xs text-foreground/85 hover:text-foreground transition-colors';

const NotesPanel: React.FC<Props> = ({
  open,
  projects,
  activeProjectId,
  canExportPage,
  canExportDoc,
  isExportingPdf,
  isExportingPng,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  onOpenSettings,
  onOpenScratchpad,
  onExportMd,
  onExportPng,
  onExportPagePdf,
  onExportDocPdf,
  onClose,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  const cancelPendingClick = () => {
    if (clickTimerRef.current !== null) {
      window.clearTimeout(clickTimerRef.current);
      clickTimerRef.current = null;
    }
  };

  useEffect(() => cancelPendingClick, []);

  const startRename = (id: string, title: string) => {
    cancelPendingClick();
    setRenamingId(id);
    setRenameValue(title);
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) onRenameProject(renamingId, trimmed);
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  if (!open) return null;

  const toggleSection = (section: Exclude<ExpandedSection, null>) => {
    setExpanded((current) => current === section ? null : section);
  };

  return (
    <>
      <div className="fixed inset-0 z-40 bg-background/50 backdrop-blur-sm" onClick={onClose} />
      <div className="fixed right-0 top-0 bottom-0 z-50 w-80 bg-popover border-l border-border flex flex-col shadow-2xl">
        <div className="flex items-center justify-end gap-1 px-4 py-3 border-b border-border/40">
          <button
            onClick={onClose}
            className="p-1.5 text-muted-foreground/40 hover:text-foreground transition-colors"
            aria-label="Close drawer"
          >
            <X size={13} />
          </button>
        </div>

        <div className="py-3">
          <button onClick={onOpenScratchpad} className={baseRowClass}>
            <NotebookPen size={15} />
            <span>scratchpad</span>
          </button>

          <button onClick={onOpenSettings} className={baseRowClass}>
            <Settings size={15} />
            <span>settings</span>
          </button>

          <button onClick={() => toggleSection('export')} className={baseRowClass}>
            <ArrowUpRight size={15} />
            <span>export</span>
            <span className="ml-auto text-muted-foreground/50">{expanded === 'export' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          </button>

          {expanded === 'export' && (
            <div className="px-4 pb-2 pt-1 space-y-1">
              <button
                onClick={onExportPng}
                disabled={!canExportPage || isExportingPng}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <Image size={13} />
                {isExportingPng ? 'preparing png...' : 'page as png'}
              </button>
              <button
                onClick={onExportMd}
                disabled={!canExportPage}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <FileText size={13} />
                page as markdown
              </button>
              <button
                onClick={onExportPagePdf}
                disabled={!canExportPage || isExportingPdf}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <FolderOpen size={13} />
                {isExportingPdf ? 'preparing pdf...' : 'page as pdf'}
              </button>
              <button
                onClick={onExportDocPdf}
                disabled={!canExportDoc || isExportingPdf}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <FolderOpen size={13} />
                {isExportingPdf ? 'preparing pdf...' : 'doc as pdf'}
              </button>
            </div>
          )}

          <button onClick={() => toggleSection('notes')} className={`${baseRowClass} mt-1`}>
            <FolderOpen size={15} />
            <span>notes</span>
            <span className="ml-auto text-muted-foreground/50">{expanded === 'notes' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}</span>
          </button>
        </div>

        {expanded === 'notes' && (
          <div className="flex-1 overflow-y-auto">
            <button
              onClick={onNewProject}
              className="w-full flex items-center gap-2 px-4 py-3 text-left font-mono text-xs text-muted-foreground hover:text-foreground hover:bg-muted/20 transition-colors"
              aria-label="New doc"
            >
              <Plus size={13} />
              <span>new note</span>
            </button>
            {projects.map((project) => {
              const title = getProjectTitle(project.id);
              const preview = getProjectPreview(project.id);
              const isActive = project.id === activeProjectId;
              const isHovered = hoveredId === project.id;
              const isRenaming = renamingId === project.id;

              const openProject = () => {
                onSelectProject(project.id);
                onClose();
              };
              const handleRowClick = () => {
                if (isRenaming) return;
                cancelPendingClick();
                clickTimerRef.current = window.setTimeout(() => {
                  clickTimerRef.current = null;
                  openProject();
                }, 360);
              };
              const handleRowDoubleClick = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                startRename(project.id, title);
              };
              const handleRowContextMenu = (e: React.MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                startRename(project.id, title);
              };
              const handleRowMouseDownCapture = (e: React.MouseEvent) => {
                if (e.button === 2) {
                  e.preventDefault();
                  e.stopPropagation();
                }
              };
              const handleRowKeyDown = (e: React.KeyboardEvent) => {
                if (isRenaming) return;
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  cancelPendingClick();
                  openProject();
                }
              };

              return (
                <div
                  key={project.id}
                  className={`relative border-b border-border/20 transition-colors ${
                    isActive ? 'bg-muted/40' : isHovered ? 'bg-muted/20' : ''
                  }`}
                  onMouseEnter={() => setHoveredId(project.id)}
                  onMouseLeave={() => setHoveredId(null)}
                  onMouseDownCapture={handleRowMouseDownCapture}
                  onContextMenuCapture={handleRowContextMenu}
                  onContextMenu={handleRowContextMenu}
                >
                  <div
                    onClick={handleRowClick}
                    onDoubleClick={handleRowDoubleClick}
                    onContextMenuCapture={handleRowContextMenu}
                    onKeyDown={handleRowKeyDown}
                    className={`w-full text-left px-4 py-3 pr-10 ${isRenaming ? '' : 'cursor-pointer'}`}
                    role="button"
                    tabIndex={0}
                  >
                    {isRenaming ? (
                      <input
                        ref={renameInputRef}
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        onClick={(e) => e.stopPropagation()}
                        onDoubleClick={(e) => e.stopPropagation()}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') { e.preventDefault(); commitRename(); }
                          else if (e.key === 'Escape') { e.preventDefault(); cancelRename(); }
                        }}
                        onBlur={commitRename}
                        className="w-full bg-transparent font-mono text-sm font-medium text-foreground leading-snug outline-none border-b border-foreground/30 focus:border-foreground/70"
                      />
                    ) : (
                      <div className="font-mono text-sm font-medium text-foreground truncate leading-snug">
                        {title}
                      </div>
                    )}
                    {preview && !isRenaming && (
                      <div className="font-mono text-xs text-muted-foreground/50 truncate mt-0.5 leading-snug">
                        {preview}
                      </div>
                    )}
                    <div className="font-mono text-[10px] text-muted-foreground/35 mt-1">
                      {timeAgo(project.updatedAt)}
                    </div>
                  </div>
                  {isHovered && !isRenaming && projects.length > 1 && (
                    <button
                      onClick={(e) => { e.stopPropagation(); onDeleteProject(project.id); }}
                      className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 text-muted-foreground/30 hover:text-destructive transition-colors"
                      aria-label="Delete doc"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {expanded !== 'notes' && <div className="flex-1" />}
      </div>
    </>
  );
};

export default NotesPanel;
