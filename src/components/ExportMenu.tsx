import React from 'react';
import { ArrowUpRight, FileText, FolderOpen, Image } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

interface Props {
  canExportPage: boolean;
  canExportDoc: boolean;
  isExportingPdf: boolean;
  isExportingPng: boolean;
  onExportPageMd: () => void;
  onExportDocMd: () => void;
  onExportPng: () => void;
  onExportPagePdf: () => void;
  onExportDocPdf: () => void;
}

const itemClass = 'font-mono text-xs lowercase text-foreground/85 focus:text-foreground py-2';
const subTriggerClass = 'font-mono text-xs lowercase text-foreground/85 focus:text-foreground py-2';

const ExportMenu: React.FC<Props> = ({
  canExportPage,
  canExportDoc,
  isExportingPdf,
  isExportingPng,
  onExportPageMd,
  onExportDocMd,
  onExportPng,
  onExportPagePdf,
  onExportDocPdf,
}) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          className="p-2 text-muted-foreground/60 hover:text-foreground transition-colors"
          aria-label="Export"
        >
          <ArrowUpRight size={18} />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side="top" align="center" sideOffset={8} className="min-w-[10rem]">
        <DropdownMenuItem
          onClick={onExportPng}
          disabled={!canExportPage || isExportingPng}
          className={itemClass}
        >
          <Image size={14} className="mr-2" />
          {isExportingPng ? 'preparing img...' : 'img'}
        </DropdownMenuItem>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canExportPage && !canExportDoc} className={subTriggerClass}>
            <FileText size={14} className="mr-2" />
            <span>md</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={onExportPageMd}
              disabled={!canExportPage}
              className={itemClass}
            >
              page as md
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onExportDocMd}
              disabled={!canExportDoc}
              className={itemClass}
            >
              notebook as md
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>

        <DropdownMenuSub>
          <DropdownMenuSubTrigger disabled={!canExportDoc || isExportingPdf} className={subTriggerClass}>
            <FolderOpen size={14} className="mr-2" />
            <span>{isExportingPdf ? 'preparing pdf...' : 'pdf'}</span>
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent>
            <DropdownMenuItem
              onClick={onExportPagePdf}
              disabled={!canExportPage || isExportingPdf}
              className={itemClass}
            >
              page as pdf
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={onExportDocPdf}
              disabled={!canExportDoc || isExportingPdf}
              className={itemClass}
            >
              notebook as pdf
            </DropdownMenuItem>
          </DropdownMenuSubContent>
        </DropdownMenuSub>
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default ExportMenu;
