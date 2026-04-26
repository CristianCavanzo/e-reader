import type { TocItem } from './db';
import { BookmarksPanel } from './BookmarksPanel';
import { NotesPanel } from './NotesPanel';
import { SearchPanel } from './SearchPanel';
import { TableOfContents } from './TableOfContents';
import type { PdfReaderBlock } from './pdfHybrid/pdfCoordinates';

export type ReaderPanel = 'contents' | 'search' | 'notes' | 'bookmarks';

interface Props {
  open: boolean;
  activePanel: ReaderPanel;
  setActivePanel: (panel: ReaderPanel) => void;
  bookId: string;
  tocItems: TocItem[];
  activeTocItem?: TocItem;
  activeTocItemId?: string;
  currentPage: number;
  smartBlocksByPage: Record<number, PdfReaderBlock[]>;
  onTocSelect: (item: TocItem) => void;
  onPageSelect: (page: number, blockId?: string) => void;
  chromeVisible?: boolean;
}

const panels: Array<{ id: ReaderPanel; label: string; icon: string }> = [
  { id: 'contents', label: 'Contenido', icon: '☰' },
  { id: 'search', label: 'Buscar', icon: '⌕' },
  { id: 'notes', label: 'Notas', icon: '✎' },
  { id: 'bookmarks', label: 'Marcadores', icon: '⌑' },
];

export function ReaderSidebar({
  open,
  activePanel,
  setActivePanel,
  bookId,
  tocItems,
  activeTocItem,
  activeTocItemId,
  currentPage,
  smartBlocksByPage,
  onTocSelect,
  onPageSelect,
  chromeVisible = true,
}: Props) {
  return (
    <aside
      className={`reader-sidebar ${open ? 'open' : ''} ${chromeVisible ? 'chrome-visible' : 'chrome-hidden'}`}
      aria-label="Panel del lector"
    >
      <div className="sidebar-tabs" role="tablist" aria-label="Opciones del lector">
        {panels.map((panel) => (
          <button
            key={panel.id}
            className={activePanel === panel.id ? 'active' : ''}
            onClick={() => setActivePanel(panel.id)}
            type="button"
            title={panel.label}
          >
            <span aria-hidden="true">{panel.icon}</span>
            <span>{panel.label}</span>
          </button>
        ))}
      </div>

      <div className="sidebar-panel">
        {activePanel === 'contents' ? (
          <TableOfContents
            items={tocItems}
            activeItemId={activeTocItemId}
            onSelect={onTocSelect}
          />
        ) : null}

        {activePanel === 'search' ? (
          <SearchPanel
            bookId={bookId}
            blocksByPage={smartBlocksByPage}
            onResultSelect={onPageSelect}
          />
        ) : null}

        {activePanel === 'notes' ? (
          <NotesPanel
            bookId={bookId}
            onSelect={onPageSelect}
          />
        ) : null}

        {activePanel === 'bookmarks' ? (
          <BookmarksPanel
            bookId={bookId}
            currentPage={currentPage}
            activeTocItem={activeTocItem}
            onSelect={(page) => onPageSelect(page)}
          />
        ) : null}
      </div>
    </aside>
  );
}
