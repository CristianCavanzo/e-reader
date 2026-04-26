import type { BookFormat, BookStatus } from '../db';

interface LibrarySearchProps {
  query: string;
  onQueryChange: (query: string) => void;
  status: BookStatus | 'all';
  onStatusChange: (status: BookStatus | 'all') => void;
  format: BookFormat | 'all';
  onFormatChange: (format: BookFormat | 'all') => void;
  viewMode: 'grid' | 'list';
  onViewModeChange: (mode: 'grid' | 'list') => void;
}

export function LibrarySearch({
  query,
  onQueryChange,
  status,
  onStatusChange,
  format,
  onFormatChange,
  viewMode,
  onViewModeChange,
}: LibrarySearchProps) {
  return (
    <section className="library-toolbar" aria-label="Filtros de biblioteca">
      <label className="library-search-box">
        <span>Buscar</span>
        <input
          type="search"
          value={query}
          placeholder="Título, autor o tag…"
          onChange={(event) => onQueryChange(event.target.value)}
        />
      </label>

      <label>
        Estado
        <select value={status} onChange={(event) => onStatusChange(event.target.value as BookStatus | 'all')}>
          <option value="all">Todos</option>
          <option value="unread">Pendiente</option>
          <option value="reading">Leyendo</option>
          <option value="paused">Pausado</option>
          <option value="finished">Terminado</option>
        </select>
      </label>

      <label>
        Formato
        <select value={format} onChange={(event) => onFormatChange(event.target.value as BookFormat | 'all')}>
          <option value="all">Todos</option>
          <option value="pdf">PDF</option>
          <option value="epub">EPUB</option>
        </select>
      </label>

      <div className="segmented-control" role="group" aria-label="Vista">
        <button type="button" className={viewMode === 'grid' ? 'active' : ''} onClick={() => onViewModeChange('grid')}>
          Grid
        </button>
        <button type="button" className={viewMode === 'list' ? 'active' : ''} onClick={() => onViewModeChange('list')}>
          Lista
        </button>
      </div>
    </section>
  );
}
