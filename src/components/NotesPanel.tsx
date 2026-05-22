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
  Pencil,
  Cloud,
  CloudOff,
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
  syncCanUse?: boolean;
  onSelectProject: (id: string) => void;
  onNewProject: () => void;
  onDeleteProject: (id: string) => void;
  onRenameProject: (id: string, newTitle: string) => void;
  isProjectSynced: (id: string) => boolean;
  onToggleProjectSync: (id: string) => void;
  onOpenSettings: () => void;
  onOpenScratchpad: () => void;
  onExportPageMd: () => void;
  onExportDocMd: () => void;
  onExportPng: () => void;
  onExportPagePdf: () => void;
  onExportDocPdf: () => void;
  onClose: () => void;
}

type ExpandedSection = 'export' | 'notes' | null;
type ExportFormat = 'md' | 'pdf' | null;

type DocMenuState = {
  id: string;
  title: string;
  x: number;
  y: number;
} | null;

const baseRowClass = 'w-full flex items-center gap-3 px-4 py-3 text-left font-mono text-xs text-foreground/85 hover:text-foreground transition-colors';

const NotesPanel: React.FC<Props> = ({
  open,
  projects,
  activeProjectId,
  canExportPage,
  canExportDoc,
  isExportingPdf,
  isExportingPng,
  syncCanUse = false,
  onSelectProject,
  onNewProject,
  onDeleteProject,
  onRenameProject,
  isProjectSynced,
  onToggleProjectSync,
  onOpenSettings,
  onOpenScratchpad,
  onExportPageMd,
  onExportDocMd,
  onExportPng,
  onExportPagePdf,
  onExportDocPdf,
  onClose,
}) => {
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<ExpandedSection>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(null);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [docMenu, setDocMenu] = useState<DocMenuState>(null);
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
    setDocMenu(null);
    setRenamingId(id);
    setRenameValue(title);
  };

  const openDocMenu = (id: string, title: string, x: number, y: number) => {
    cancelPendingClick();
    setRenamingId(null);
    setDocMenu({ id, title, x, y });
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

  const handleMenuDelete = (id: string) => {
    setDocMenu(null);
    onDeleteProject(id);
  };

  const handleMenuSync = (id: string) => {
    setDocMenu(null);
    onToggleProjectSync(id);
  };

  if (!open) return null;

  const toggleSection = (section: Exclude<ExpandedSection, null>) => {
    setExpanded((current) => current === section ? null : section);
    setExportFormat(null);
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
                {isExportingPng ? 'preparing img...' : 'img'}
              </button>
              <button
                onClick={() => setExportFormat((current) => current === 'md' ? null : 'md')}
                disabled={!canExportPage && !canExportDoc}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <FileText size={13} />
                <span>md</span>
                <span className="ml-auto text-muted-foreground/50">{exportFormat === 'md' ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
              </button>
              {exportFormat === 'md' && (
                <div className="pl-5 space-y-1">
                  <button
                    onClick={onExportPageMd}
                    disabled={!canExportPage}
                    className="w-full px-3 py-1.5 rounded-md text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                  >
                    page as md
                  </button>
                  <button
                    onClick={onExportDocMd}
                    disabled={!canExportDoc}
                    className="w-full px-3 py-1.5 rounded-md text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                  >
                    doc as md
                  </button>
                </div>
              )}
              <button
                onClick={() => setExportFormat((current) => current === 'pdf' ? null : 'pdf')}
                disabled={!canExportDoc || isExportingPdf}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
              >
                <FolderOpen size={13} />
                <span>{isExportingPdf ? 'preparing pdf...' : 'pdf'}</span>
                <span className="ml-auto text-muted-foreground/50">{exportFormat === 'pdf' ? <ChevronDown size={13} /> : <ChevronRight size={13} />}</span>
              </button>
              {exportFormat === 'pdf' && (
                <div className="pl-5 space-y-1">
                  <button
                    onClick={onExportPagePdf}
                    disabled={!canExportPage || isExportingPdf}
                    className="w-full px-3 py-1.5 rounded-md text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                  >
                    page as pdf
                  </button>
                  <button
                    onClick={onExportDocPdf}
                    disabled={!canExportDoc || isExportingPdf}
                    className="w-full px-3 py-1.5 rounded-md text-left font-mono text-[11px] text-muted-foreground hover:text-foreground hover:bg-muted/20 disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-muted-foreground transition-colors"
                  >
                    doc as pdf
                  </button>
                </div>
              )}
            </div>
          )}

          <button onClick={() => toggleSection('notes')} className={`${baseRowClass} mt-1`}>
            <FolderOpen size={15} />
            <span>docs</span>
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
              <span>new doc</span>
            </button>
            {projects.map((project) => {
              const title = getProjectTitle(project.id);
              const preview = getProjectPreview(project.id);
              const isActive = project.id === activeProjectId;
              const isHovered = hoveredId === project.id;
              const isRenaming = renamingId === project.id;
              const isSynced = isProjectSynced(project.id);

              const openProject = () => {
                setDocMenu(null);
                onSelectProject(project.id);
                onClose();
              };
              const handleRowClick = () => {
                if (isRenaming) return;
                setDocMenu(null);
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
                openDocMenu(project.id, title, e.clientX, e.clientY);
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
                >
                  <div
                    onClick={handleRowClick}
                    onDoubleClick={handleRowDoubleClick}
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
                    <div className="font-mono text-[10px] text-muted-foreground/35 mt-1 flex items-center gap-1.5">
                      <span>{timeAgo(project.updatedAt)}</span>
                      {isSynced && <Cloud size={10} />}
                    </div>
                  </div>
                  {isHovered && !isRenaming && (
                    <button
                      onClick={(e) => { e.stopPropagation(); setDocMenu(null); onDeleteProject(project.id); }}
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

        {docMenu && (
          <>
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setDocMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setDocMenu(null); }}
            />
            <div
              className="fixed z-[60] min-w-40 rounded-md border border-border/50 bg-popover py-1 shadow-xl"
              style={{
                left: Math.min(docMenu.x, window.innerWidth - 176),
                top: Math.min(docMenu.y, window.innerHeight - 104),
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                onClick={() => startRename(docMenu.id, docMenu.title)}
              >
                <Pencil size={13} />
                <span>rename doc</span>
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                onClick={() => handleMenuSync(docMenu.id)}
                disabled={!syncCanUse && !isProjectSynced(docMenu.id)}
              >
                {isProjectSynced(docMenu.id) ? <CloudOff size={13} /> : <Cloud size={13} />}
                <span>{isProjectSynced(docMenu.id) ? 'make local only' : 'sync doc'}</span>
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => handleMenuDelete(docMenu.id)}
              >
                <Trash2 size={13} />
                <span>delete doc</span>
              </button>
            </div>
          </>
        )}

        {expanded !== 'notes' && <div className="flex-1" />}
      </div>
    </>
  );
};

export default NotesPanel;
