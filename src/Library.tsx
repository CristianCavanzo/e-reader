import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import ePub from 'epubjs';
import { pdfjsLib } from './lib/pdfWorker';
import { db, Book, BookFormat, BookStatus, Collection, Theme, uuid, sha256 } from './db';
import { CollectionsPanel } from './components/CollectionsPanel';
import { buildSearchIndexForFile } from './services/searchIndex';
import { BookStatusBadge } from './components/BookStatusBadge';
import { LibrarySearch } from './components/LibrarySearch';
import { ReadingStatsDashboard } from './components/ReadingStatsDashboard';
import { SkeletonCard } from './components/Skeletons';
import { useConfirm } from './components/ConfirmProvider';
import { useToast } from './components/ToastProvider';

interface Props {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

interface PdfMetaInfo {
  Title?: string;
  Author?: string;
  Subject?: string;
  Keywords?: string;
}

interface BookWithCover extends Book {
  coverUrl?: string;
  progressPercentage?: number;
}

const statusOptions: BookStatus[] = ['unread', 'reading', 'paused', 'finished'];

function normalize(value: string) {
  return value.trim().toLowerCase();
}

export function Library({ theme, setTheme }: Props) {
  const { confirm } = useConfirm();
  const { toast } = useToast();
  const [books, setBooks] = useState<BookWithCover[]>([]);
  const [loading, setLoading] = useState(true);
  const [importing, setImporting] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [todayMinutes, setTodayMinutes] = useState(0);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<BookStatus | 'all'>('all');
  const [formatFilter, setFormatFilter] = useState<BookFormat | 'all'>('all');
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [collectionFilter, setCollectionFilter] = useState<string | 'all'>('all');
  const [collections, setCollections] = useState<Collection[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadBooks = async () => {
    setLoading(true);
    const [list, collectionRows] = await Promise.all([db.books.toArray(), db.collections.toArray()]);
    collectionRows.sort((a, b) => a.createdAt - b.createdAt);
    setCollections(collectionRows);
    const today = new Date().toISOString().slice(0, 10);
    const todayStats = await db.readingStats.where('date').equals(today).toArray();
    setTodayMinutes(todayStats.reduce((sum, stat) => sum + stat.minutesRead, 0));

    const ids = list.map((book) => book.id);
    const [covers, progresses] = await Promise.all([
      db.covers.bulkGet(ids),
      db.progress.bulkGet(ids),
    ]);

    const coverMap = new Map(ids.map((id, index) => [id, covers[index]]));
    const progressMap = new Map(ids.map((id, index) => [id, progresses[index]]));

    const withCovers: BookWithCover[] = list.map((book) => {
      const cover = coverMap.get(book.id);
      const progress = progressMap.get(book.id);
      return {
        ...book,
        status: book.status || 'unread',
        tags: book.tags || [],
        collectionIds: book.collectionIds || [],
        progressPercentage: progress?.percentage || 0,
        ...(cover ? { coverUrl: URL.createObjectURL(cover.data) } : {}),
      };
    });

    withCovers.sort((a, b) => {
      const aTime = a.lastOpenedAt || a.addedAt;
      const bTime = b.lastOpenedAt || b.addedAt;
      return bTime - aTime;
    });

    setBooks((current) => {
      current.forEach((book) => {
        if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
      });
      return withCovers;
    });
    setLoading(false);
  };

  useEffect(() => {
    void loadBooks();
  }, []);

  useEffect(() => {
    return () => {
      books.forEach((book) => {
        if (book.coverUrl) URL.revokeObjectURL(book.coverUrl);
      });
    };
  }, [books]);

  const filteredBooks = useMemo(() => {
    const q = normalize(query);
    return books.filter((book) => {
      if (statusFilter !== 'all' && (book.status || 'unread') !== statusFilter) return false;
      if (formatFilter !== 'all' && book.format !== formatFilter) return false;
      if (collectionFilter !== 'all' && !(book.collectionIds || []).includes(collectionFilter)) return false;
      if (!q) return true;
      const searchable = [book.title, book.author, ...(book.tags || [])].join(' ').toLowerCase();
      return searchable.includes(q);
    });
  }, [books, collectionFilter, formatFilter, query, statusFilter]);

  const importFile = async (file: File) => {
    const name = file.name.toLowerCase();
    let format: BookFormat;
    if (name.endsWith('.epub')) format = 'epub';
    else if (name.endsWith('.pdf')) format = 'pdf';
    else throw new Error(`Formato no soportado: ${file.name}. Solo EPUB y PDF.`);

    const hash = await sha256(file);
    const existing = await db.books.where('hash').equals(hash).first();
    if (existing) {
      toast(`"${existing.title}" ya estaba importado`, 'info');
      return;
    }

    let title = file.name.replace(/\.(epub|pdf)$/i, '');
    let author = 'Desconocido';
    let coverBlob: Blob | undefined;
    let pageCount: number | undefined;

    try {
      if (format === 'epub') {
        const arrayBuffer = await file.arrayBuffer();
        const book = ePub(arrayBuffer);
        const meta = await book.loaded.metadata;
        if (meta?.title) title = meta.title;
        if (meta?.creator) author = meta.creator;

        try {
          const coverUrl = await book.coverUrl();
          if (coverUrl) {
            const response = await fetch(coverUrl);
            coverBlob = await response.blob();
          }
        } catch (e) {
          console.warn('No se pudo extraer la portada del EPUB:', e);
        }

        book.destroy();
      } else {
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        pageCount = pdf.numPages;

        try {
          const meta = await pdf.getMetadata();
          const info = meta?.info as PdfMetaInfo | undefined;
          if (info?.Title) title = info.Title;
          if (info?.Author) author = info.Author;
        } catch (e) {
          console.warn('No se pudo extraer metadatos del PDF:', e);
        }

        try {
          const page = await pdf.getPage(1);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d');
          if (ctx) {
            await page.render({ canvasContext: ctx, viewport, canvas } as any).promise;
            coverBlob = await new Promise<Blob>((resolve, reject) => {
              canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('toBlob falló'))), 'image/jpeg', 0.85);
            });
          }
        } catch (e) {
          console.warn('No se pudo generar portada del PDF:', e);
        }

        await pdf.destroy();
      }
    } catch (e) {
      console.warn('Metadatos no disponibles, uso valores por defecto:', e);
    }

    const book: Book = {
      id: uuid(),
      title,
      author,
      format,
      hash,
      fileSize: file.size,
      pageCount,
      status: 'unread',
      tags: [],
      collectionIds: [],
      addedAt: Date.now(),
    };

    await db.transaction('rw', db.books, db.files, db.covers, async () => {
      await db.books.add(book);
      await db.files.add({ id: book.id, data: file });
      if (coverBlob) await db.covers.add({ id: book.id, data: coverBlob });
    });

    void buildSearchIndexForFile(book.id, format, file).catch((indexError) => {
      console.warn('No se pudo indexar el texto completo:', indexError);
    });
  };

  const handleFiles = async (files: FileList | File[]) => {
    setImporting(true);
    setError(null);
    let firstError: string | null = null;
    let imported = 0;

    for (const file of Array.from(files)) {
      try {
        await importFile(file);
        imported += 1;
      } catch (e: any) {
        console.error(e);
        if (!firstError) firstError = e.message || 'Error al importar';
      }
    }

    if (firstError) setError(firstError);
    if (imported > 0) toast(`${imported} archivo(s) procesado(s)`, 'success');
    await loadBooks();
    setImporting(false);
  };

  const handleFileInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.length) {
      void handleFiles(e.target.files);
      e.target.value = '';
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files?.length) void handleFiles(e.dataTransfer.files);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    if (e.currentTarget === e.target) setDragOver(false);
  };

  const updateBookStatus = async (id: string, status: BookStatus) => {
    await db.books.update(id, {
      status,
      finishedAt: status === 'finished' ? Date.now() : undefined,
    });
    toast('Estado actualizado', 'success');
    await loadBooks();
  };

  const updateBookCollection = async (id: string, collectionId: string) => {
    const collectionIds = collectionId === 'none' ? [] : [collectionId];
    await db.books.update(id, { collectionIds });
    toast('Colección actualizada', 'success');
    await loadBooks();
  };

  const updateBookTags = async (id: string, value: string) => {
    const tags = value.split(',').map((tag) => tag.trim()).filter(Boolean);
    await db.books.update(id, { tags });
    toast('Tags actualizados', 'success');
    await loadBooks();
  };

  const deleteBook = async (id: string, title: string) => {
    const ok = await confirm({
      title: 'Eliminar libro',
      message: `¿Eliminar "${title}" junto con progreso, notas, highlights, flashcards e índice local?`,
      confirmLabel: 'Eliminar',
      variant: 'danger',
    });
    if (!ok) return;

    await (db as any).transaction(
      'rw',
      db.books,
      db.files,
      db.covers,
      db.progress,
      db.tocItems,
      db.readingSessions,
      db.highlights,
      db.bookmarks,
      db.readingStats,
      db.flashcards,
      db.studyGoals,
      db.searchIndex,
      db.exportRecords,
      async () => {
        await db.books.delete(id);
        await db.files.delete(id);
        await db.covers.delete(id);
        await db.progress.delete(id);
        await db.tocItems.where('bookId').equals(id).delete();
        await db.readingSessions.delete(id);
        await db.highlights.where('bookId').equals(id).delete();
        await db.bookmarks.where('bookId').equals(id).delete();
        await db.readingStats.where('bookId').equals(id).delete();
        await db.flashcards.where('bookId').equals(id).delete();
        await db.studyGoals.where('bookId').equals(id).delete();
        await db.searchIndex.where('bookId').equals(id).delete();
        await db.exportRecords.where('bookId').equals(id).delete();
      }
    );
    toast('Libro eliminado', 'success');
    await loadBooks();
  };

  return (
    <div className="library" onDrop={handleDrop} onDragOver={handleDragOver} onDragLeave={handleDragLeave}>
      <header className="library-header">
        <div>
          <h1>Mi biblioteca</h1>
          <p className="library-reading-today">Leíste {todayMinutes} min hoy</p>
        </div>
        <div className="header-actions">
          <select value={theme} onChange={(e) => setTheme(e.target.value as Theme)} aria-label="Tema">
            <option value="light">Claro</option>
            <option value="dark">Oscuro</option>
            <option value="sepia">Sepia</option>
          </select>
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}>
            {importing ? 'Importando…' : '+ Importar libros'}
          </button>
          <input ref={fileInputRef} type="file" accept=".epub,.pdf" multiple onChange={handleFileInput} style={{ display: 'none' }} />
        </div>
      </header>

      <ReadingStatsDashboard />

      <CollectionsPanel
        books={books}
        collections={collections}
        selectedCollectionId={collectionFilter}
        onSelect={setCollectionFilter}
        onRefresh={() => void loadBooks()}
      />

      <LibrarySearch
        query={query}
        onQueryChange={setQuery}
        status={statusFilter}
        onStatusChange={setStatusFilter}
        format={formatFilter}
        onFormatChange={setFormatFilter}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
      />

      {error && <div className="error-banner">{error}</div>}

      {loading ? (
        <div className="book-grid">
          {Array.from({ length: 8 }, (_, index) => <SkeletonCard key={index} />)}
        </div>
      ) : books.length === 0 ? (
        <div className={`empty-state ${dragOver ? 'drag-over' : ''}`}>
          <svg width="96" height="96" viewBox="0 0 96 96" aria-hidden="true">
            <rect x="18" y="14" width="46" height="68" rx="8" fill="currentColor" opacity="0.08" />
            <path d="M32 28h34a10 10 0 0 1 10 10v44H36a10 10 0 0 1-10-10V34a6 6 0 0 1 6-6Z" fill="currentColor" opacity="0.16" />
            <path d="M38 42h24M38 52h28M38 62h18" stroke="currentColor" strokeWidth="4" strokeLinecap="round" opacity="0.35" />
          </svg>
          <p style={{ fontSize: '1.1rem' }}>Aún no hay libros en tu biblioteca.</p>
          <p className="muted">Arrastra archivos <strong>EPUB</strong> o <strong>PDF</strong> aquí, o usa el botón <strong>+ Importar libros</strong>.</p>
          <p className="muted" style={{ fontSize: '0.85rem', marginTop: '1rem' }}>Los archivos se guardan localmente en este navegador. No se sube nada a ningún servidor.</p>
        </div>
      ) : filteredBooks.length === 0 ? (
        <div className="empty-state compact">
          <p>No hay libros para esos filtros.</p>
          <p className="muted">Limpia la búsqueda o cambia estado/formato.</p>
        </div>
      ) : (
        <div className={viewMode === 'grid' ? 'book-grid' : 'book-list'}>
          {filteredBooks.map((book) => (
            <div key={book.id} className={`book-card ${viewMode === 'list' ? 'book-card-list' : ''}`}>
              <Link to={`/read/${book.id}`} className="book-cover">
                {book.coverUrl ? <img src={book.coverUrl} alt={book.title} loading="lazy" /> : <div className="cover-placeholder"><span>{book.title.slice(0, 60)}</span></div>}
              </Link>
              <div className="book-info">
                <div className="book-title-row">
                  <Link to={`/read/${book.id}`} className="book-title" title={book.title}>{book.title}</Link>
                  <BookStatusBadge status={book.status || 'unread'} />
                </div>
                <p className="book-author" title={book.author}>{book.author}</p>
                <div className="book-progress" aria-label={`Progreso ${Math.round(book.progressPercentage || 0)}%`}>
                  <span style={{ width: `${Math.min(100, Math.max(0, book.progressPercentage || 0))}%` }} />
                </div>
                <div className="book-tags-row">
                  {(book.tags || []).slice(0, 4).map((tag) => <span key={tag} className="book-tag">#{tag}</span>)}
                </div>
                <div className="book-card-controls">
                  <label>
                    Estado
                    <select value={book.status || 'unread'} onChange={(event) => void updateBookStatus(book.id, event.target.value as BookStatus)}>
                      {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
                    </select>
                  </label>
                  <label>
                    Colección
                    <select value={(book.collectionIds || [])[0] || 'none'} onChange={(event) => void updateBookCollection(book.id, event.target.value)}>
                      <option value="none">Sin colección</option>
                      {collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.name}</option>)}
                    </select>
                  </label>
                  <label>
                    Tags
                    <input defaultValue={(book.tags || []).join(', ')} onBlur={(event) => void updateBookTags(book.id, event.target.value)} placeholder="python, ML…" />
                  </label>
                </div>
                <div className="book-actions">
                  <span className="format-badge">{book.format.toUpperCase()}</span>
                  {book.pageCount ? <span className="format-badge subtle">{book.pageCount} pág.</span> : null}
                  <button className="delete-btn" onClick={() => void deleteBook(book.id, book.title)} aria-label={`Eliminar ${book.title}`} title="Eliminar">×</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {dragOver && <div className="drop-overlay"><div className="drop-message">Suelta aquí para importar</div></div>}
    </div>
  );
}
