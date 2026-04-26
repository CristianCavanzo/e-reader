import { useEffect, useState } from 'react';
import { db, uuid, type Bookmark, type TocItem } from './db';

interface BookmarksPanelProps {
  bookId: string;
  currentPage: number;
  activeTocItem?: TocItem;
  onSelect: (page: number) => void;
}

export function BookmarksPanel({ bookId, currentPage, activeTocItem, onSelect }: BookmarksPanelProps) {
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftLabel, setDraftLabel] = useState('');

  const loadBookmarks = async () => {
    const rows = await db.bookmarks
      .where('bookId')
      .equals(bookId)
      .sortBy('createdAt');

    setBookmarks(rows.reverse());
  };

  useEffect(() => {
    void loadBookmarks();
  }, [bookId]);

  const addBookmark = async () => {
    const label = activeTocItem?.label || `Página ${currentPage}`;

    await db.bookmarks.add({
      id: uuid(),
      bookId,
      page: currentPage,
      label,
      createdAt: Date.now(),
    });

    await loadBookmarks();
  };

  const saveLabel = async (bookmark: Bookmark) => {
    await db.bookmarks.update(bookmark.id, {
      label: draftLabel.trim() || bookmark.label,
    });

    setEditingId(null);
    setDraftLabel('');
    await loadBookmarks();
  };

  const deleteBookmark = async (bookmarkId: string) => {
    await db.bookmarks.delete(bookmarkId);
    await loadBookmarks();
  };

  return (
    <div className="bookmarks-panel">
      <button type="button" className="sidebar-primary-action" onClick={() => void addBookmark()}>
        + Agregar bookmark aquí
      </button>

      {bookmarks.length === 0 ? (
        <p className="sidebar-empty">Aún no tienes marcadores en este libro.</p>
      ) : (
        <div className="sidebar-list">
          {bookmarks.map((bookmark) => (
            <article key={bookmark.id} className="sidebar-bookmark-item">
              <button
                type="button"
                className="sidebar-list-item"
                onClick={() => onSelect(bookmark.page || 1)}
              >
                <span className="sidebar-list-meta">Página {bookmark.page || '—'}</span>
                {editingId === bookmark.id ? (
                  <input
                    value={draftLabel}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => setDraftLabel(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') void saveLabel(bookmark);
                      if (event.key === 'Escape') setEditingId(null);
                    }}
                    autoFocus
                  />
                ) : (
                  <span>{bookmark.label}</span>
                )}
              </button>

              <div className="bookmark-actions">
                {editingId === bookmark.id ? (
                  <button type="button" onClick={() => void saveLabel(bookmark)}>Guardar</button>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setEditingId(bookmark.id);
                      setDraftLabel(bookmark.label);
                    }}
                  >
                    Renombrar
                  </button>
                )}
                <button type="button" onClick={() => void deleteBookmark(bookmark.id)}>Eliminar</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
