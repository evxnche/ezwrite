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
  ChevronLeft,
  ArrowUpRight,
  Pencil,
  Cloud,
  CloudOff,
} from 'lucide-react';
import { type ProjectMeta, getProjectTitle, getProjectPreview, timeAgo, getSpacesSorted, listUnfiledProjects, listProjectsInSpace, type SpaceMeta } from '@/lib/projects';
import AudioPlayer from './AudioPlayer';
import ExportMenu from './ExportMenu';

interface Props {
  open: boolean;
  expEnabled: boolean;
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
  onCreateSpace: () => void;
  onDeleteSpace: (id: string) => void;
  onRenameSpace: (id: string, newTitle: string) => void;
  onNewProjectInSpace: (spaceId: string) => void;
  onMoveProjectToSpace: (projectId: string, spaceId: string | null) => void;
  onOpenSettings: () => void;
  onOpenScratchpad: () => void;
  onExportPageMd: () => void;
  onExportDocMd: () => void;
  onExportPng: () => void;
  onExportPagePdf: () => void;
  onExportDocPdf: () => void;
  onClose: () => void;
}

type ExpandedSection = 'export' | 'spaces' | null;
type ExportFormat = 'md' | 'pdf' | null;

type DocMenuState = {
  id: string;
  title: string;
  x: number;
  y: number;
} | null;

type SpaceMenuState = {
  id: string;
  title: string;
  x: number;
  y: number;
} | null;

const baseRowClass = 'w-full flex items-center gap-3 px-4 py-3 text-left font-mono text-xs text-foreground/85 hover:text-foreground transition-colors';

const NotesPanel: React.FC<Props> = ({
  open,
  expEnabled,
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
  onCreateSpace,
  onDeleteSpace,
  onRenameSpace,
  onNewProjectInSpace,
  onMoveProjectToSpace,
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
  // With //exp// off the "notebooks" section is the only way to reach notebooks,
  // so open it by default (Spaces stays collapsed when on, matching before).
  const [expanded, setExpanded] = useState<ExpandedSection>(expEnabled ? null : 'spaces');
  const [exportFormat, setExportFormat] = useState<ExportFormat>(null);
  const [expandedSpaces, setExpandedSpaces] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renamingSpaceId, setRenamingSpaceId] = useState<string | null>(null);
  const [renameSpaceValue, setRenameSpaceValue] = useState('');
  const [docMenu, setDocMenu] = useState<DocMenuState>(null);
  const [docMenuView, setDocMenuView] = useState<'main' | 'move'>('main');
  const [spaceMenu, setSpaceMenu] = useState<SpaceMenuState>(null);
  const [unfiledExpanded, setUnfiledExpanded] = useState(true);
  const renameInputRef = useRef<HTMLInputElement | null>(null);
  const renameSpaceInputRef = useRef<HTMLInputElement | null>(null);
  const clickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (renamingId && renameInputRef.current) {
      renameInputRef.current.focus();
      renameInputRef.current.select();
    }
  }, [renamingId]);

  useEffect(() => {
    if (renamingSpaceId && renameSpaceInputRef.current) {
      renameSpaceInputRef.current.focus();
      renameSpaceInputRef.current.select();
    }
  }, [renamingSpaceId]);

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

  const startRenameSpace = (id: string, title: string) => {
    setSpaceMenu(null);
    setRenamingSpaceId(id);
    setRenameSpaceValue(title);
  };

  const openDocMenu = (id: string, title: string, x: number, y: number) => {
    cancelPendingClick();
    setRenamingId(null);
    setDocMenu({ id, title, x, y });
    setDocMenuView('main');
  };

  const openSpaceMenu = (id: string, title: string, x: number, y: number) => {
    setRenamingSpaceId(null);
    setSpaceMenu({ id, title, x, y });
  };

  const commitRename = () => {
    if (!renamingId) return;
    const trimmed = renameValue.trim();
    if (trimmed) onRenameProject(renamingId, trimmed);
    setRenamingId(null);
    setRenameValue('');
  };

  const commitRenameSpace = () => {
    if (!renamingSpaceId) return;
    const trimmed = renameSpaceValue.trim();
    if (trimmed) onRenameSpace(renamingSpaceId, trimmed);
    setRenamingSpaceId(null);
    setRenameSpaceValue('');
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue('');
  };

  const cancelRenameSpace = () => {
    setRenamingSpaceId(null);
    setRenameSpaceValue('');
  };

  const handleMenuDelete = (id: string) => {
    setDocMenu(null);
    onDeleteProject(id);
  };

  const handleMenuSync = (id: string) => {
    setDocMenu(null);
    onToggleProjectSync(id);
  };

  const handleMenuMoveToSpace = (projectId: string, spaceId: string | null) => {
    setDocMenu(null);
    onMoveProjectToSpace(projectId, spaceId);
  };

  const toggleSpace = (spaceId: string) => {
    setExpandedSpaces((current) => {
      const next = new Set(current);
      if (next.has(spaceId)) {
        next.delete(spaceId);
      } else {
        next.add(spaceId);
      }
      return next;
    });
  };

  if (!open) return null;

  const toggleSection = (section: Exclude<ExpandedSection, null>) => {
    setExpanded((current) => current === section ? null : section);
    setExportFormat(null);
  };

  const renderExportOptions = () => (
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
            notebook as md
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
            notebook as pdf
          </button>
        </div>
      )}
    </div>
  );

  const spaces = getSpacesSorted();
  const unfiledProjects = listUnfiledProjects();

  const renderProjectRow = (project: ProjectMeta, spaceId: string | null = null) => {
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
  };

  const renderSpaceSection = (space: SpaceMeta) => {
    const spaceProjects = listProjectsInSpace(space.id);
    const isExpanded = expandedSpaces.has(space.id);
    const isRenamingSpace = renamingSpaceId === space.id;

    const handleSpaceHeaderClick = () => {
      if (isRenamingSpace) return;
      toggleSpace(space.id);
    };

    const handleSpaceHeaderDoubleClick = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      startRenameSpace(space.id, space.title);
    };

    const handleSpaceHeaderContextMenu = (e: React.MouseEvent) => {
      e.preventDefault();
      e.stopPropagation();
      openSpaceMenu(space.id, space.title, e.clientX, e.clientY);
    };

    return (
      <div key={space.id} className="border-b border-border/30">
        <div
          onClick={handleSpaceHeaderClick}
          onDoubleClick={handleSpaceHeaderDoubleClick}
          onContextMenu={handleSpaceHeaderContextMenu}
          className="w-full flex items-center gap-2 px-4 py-2.5 text-left font-mono text-xs text-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors cursor-pointer"
        >
          {isExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          {isRenamingSpace ? (
            <input
              ref={renameSpaceInputRef}
              value={renameSpaceValue}
              onChange={(e) => setRenameSpaceValue(e.target.value)}
              onClick={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitRenameSpace(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancelRenameSpace(); }
              }}
              onBlur={commitRenameSpace}
              className="flex-1 bg-transparent font-mono text-xs font-medium text-foreground leading-snug outline-none border-b border-foreground/30 focus:border-foreground/70"
            />
          ) : (
            <>
              <span className="flex-1 font-medium truncate">{space.title}</span>
              <div className="flex items-center gap-2">
                <span 
                  className="p-0.5 hover:bg-muted/30 rounded transition-colors text-muted-foreground/50 hover:text-foreground"
                  onClick={(e) => { 
                    e.stopPropagation(); 
                    onNewProjectInSpace(space.id); 
                    setExpandedSpaces(current => new Set(current).add(space.id));
                  }}
                  title="New Notebook"
                >
                  <Plus size={13} />
                </span>
                <span className="text-muted-foreground/50">{spaceProjects.length}</span>
              </div>
            </>
          )}
        </div>
        {isExpanded && (
          <div className="bg-muted/5">
            {spaceProjects.map((project) => renderProjectRow(project, space.id))}
          </div>
        )}
      </div>
    );
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

        <div className="flex flex-col flex-1 min-h-0">
          <div className="py-3 shrink-0">
            {expEnabled ? (
              <>
                <button onClick={onOpenScratchpad} className={baseRowClass}>
                  <NotebookPen size={15} />
                  <span>scratchpad</span>
                  <ChevronRight size={14} className="ml-auto text-muted-foreground/50" />
                </button>

                <button onClick={() => toggleSection('spaces')} className={`${baseRowClass} mt-1 group`}>
                  <FolderOpen size={15} />
                  <span>spaces</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span
                      className="p-0.5 opacity-0 group-hover:opacity-100 hover:bg-muted/30 rounded transition-all text-muted-foreground/50 hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); onCreateSpace(); setExpanded('spaces'); }}
                      title="New Space"
                    >
                      <Plus size={13} />
                    </span>
                    <span className="text-muted-foreground/50">
                      {expanded === 'spaces' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </div>
                </button>
              </>
            ) : (
              <>
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

                {expanded === 'export' && renderExportOptions()}

                <button onClick={() => toggleSection('spaces')} className={`${baseRowClass} mt-1 group`}>
                  <FolderOpen size={15} />
                  <span>notebooks</span>
                  <div className="ml-auto flex items-center gap-2">
                    <span
                      className="p-0.5 hover:bg-muted/30 rounded transition-colors text-muted-foreground/50 hover:text-foreground"
                      onClick={(e) => { e.stopPropagation(); onNewProject(); setExpanded('spaces'); }}
                      title="New Notebook"
                    >
                      <Plus size={13} />
                    </span>
                    <span className="text-muted-foreground/50">
                      {expanded === 'spaces' ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                    </span>
                  </div>
                </button>
              </>
            )}
          </div>

          {expanded === 'spaces' && (
            <div className="flex-1 overflow-y-auto">
              {expEnabled ? (
                <>
                  {(() => {
                    try {
                      return spaces.map((space) => renderSpaceSection(space));
                    } catch (err) {
                      console.error('Error rendering spaces:', err);
                      return (
                        <div className="px-4 py-3 text-xs text-red-500">
                          Error loading spaces: {err instanceof Error ? err.message : String(err)}
                        </div>
                      );
                    }
                  })()}

                  <div className="border-t border-border/30 mt-2 pt-2">
                    <button
                      onClick={() => setUnfiledExpanded(!unfiledExpanded)}
                      className="w-full flex items-center gap-2 px-4 py-2 text-left font-mono text-xs text-muted-foreground/70 hover:text-foreground hover:bg-muted/10 transition-colors group"
                    >
                      {unfiledExpanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                      <span className="font-medium flex-1">unfiled notebooks</span>
                      <div className="flex items-center gap-2">
                        <span
                          className="p-0.5 hover:bg-muted/30 rounded transition-colors text-muted-foreground/50 hover:text-foreground"
                          onClick={(e) => { e.stopPropagation(); onNewProject(); setUnfiledExpanded(true); }}
                          title="New Notebook"
                        >
                          <Plus size={13} />
                        </span>
                        <span className="text-muted-foreground/50">{unfiledProjects.length}</span>
                      </div>
                    </button>
                    {unfiledExpanded && unfiledProjects.map((project) => renderProjectRow(project))}
                  </div>
                </>
              ) : (
                // //exp// off: flat notebook list (all projects, no Spaces grouping).
                projects.map((project) => renderProjectRow(project))
              )}
            </div>
          )}

          {!expEnabled && expanded === 'export' && (
            <div className="flex-1 overflow-y-auto">
              {renderExportOptions()}
            </div>
          )}

          {!expEnabled && <div className="flex-1" />}

          {expEnabled && (
            <div className="mt-auto border-t border-border/40 shrink-0">
              <AudioPlayer />
              <div className="flex items-center justify-evenly px-4 h-14 border-t border-border/30">
                <button
                  onClick={onOpenSettings}
                  className="p-2 text-muted-foreground/60 hover:text-foreground transition-colors"
                  aria-label="Settings"
                >
                  <Settings size={18} />
                </button>
                <ExportMenu
                  canExportPage={canExportPage}
                  canExportDoc={canExportDoc}
                  isExportingPdf={isExportingPdf}
                  isExportingPng={isExportingPng}
                  onExportPageMd={onExportPageMd}
                  onExportDocMd={onExportDocMd}
                  onExportPng={onExportPng}
                  onExportPagePdf={onExportPagePdf}
                  onExportDocPdf={onExportDocPdf}
                />
              </div>
            </div>
          )}
        </div>

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
                top: Math.min(docMenu.y, window.innerHeight - 180),
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              {docMenuView === 'main' ? (
                <>
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
                  {spaces.length > 0 && (
                    <>
                      <div className="my-1 border-t border-border/30" />
                      <button
                        className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                        onClick={(e) => { e.stopPropagation(); setDocMenuView('move'); }}
                      >
                        <FolderOpen size={13} />
                        <span className="flex-1">move to</span>
                        <ChevronRight size={13} />
                      </button>
                      <div className="my-1 border-t border-border/30" />
                    </>
                  )}
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-destructive hover:bg-destructive/10 transition-colors"
                    onClick={() => handleMenuDelete(docMenu.id)}
                  >
                    <Trash2 size={13} />
                    <span>delete doc</span>
                  </button>
                </>
              ) : (
                <>
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                    onClick={(e) => { e.stopPropagation(); setDocMenuView('main'); }}
                  >
                    <ChevronLeft size={13} />
                    <span>back</span>
                  </button>
                  <div className="my-1 border-t border-border/30" />
                  <button
                    className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                    onClick={() => handleMenuMoveToSpace(docMenu.id, null)}
                  >
                    <FolderOpen size={13} />
                    <span className="truncate">unfiled</span>
                  </button>
                  {spaces.map((space) => (
                    <button
                      key={space.id}
                      className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                      onClick={() => handleMenuMoveToSpace(docMenu.id, space.id)}
                    >
                      <FolderOpen size={13} />
                      <span className="truncate">{space.title}</span>
                    </button>
                  ))}
                </>
              )}
            </div>
          </>
        )}

        {spaceMenu && (
          <>
            <div
              className="fixed inset-0 z-[55]"
              onClick={() => setSpaceMenu(null)}
              onContextMenu={(e) => { e.preventDefault(); setSpaceMenu(null); }}
            />
            <div
              className="fixed z-[60] min-w-40 rounded-md border border-border/50 bg-popover py-1 shadow-xl"
              style={{
                left: Math.min(spaceMenu.x, window.innerWidth - 176),
                top: Math.min(spaceMenu.y, window.innerHeight - 104),
              }}
              onClick={(e) => e.stopPropagation()}
              onContextMenu={(e) => e.preventDefault()}
            >
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-foreground/85 hover:bg-muted/30 transition-colors"
                onClick={() => startRenameSpace(spaceMenu.id, spaceMenu.title)}
              >
                <Pencil size={13} />
                <span>rename space</span>
              </button>
              <button
                className="w-full flex items-center gap-2 px-3 py-2 text-left font-mono text-xs text-destructive hover:bg-destructive/10 transition-colors"
                onClick={() => { setSpaceMenu(null); onDeleteSpace(spaceMenu.id); }}
              >
                <Trash2 size={13} />
                <span>delete space</span>
              </button>
            </div>
          </>
        )}
      </div>
    </>
  );
};

export default NotesPanel;
