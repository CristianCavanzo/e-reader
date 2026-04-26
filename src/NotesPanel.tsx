import { useEffect, useState } from 'react';
import { db, type Flashcard, type Highlight, uuid } from './db';
import { useToast } from './components/ToastProvider';

interface NotesPanelProps {
  bookId: string;
  onSelect: (page: number, blockId?: string) => void;
}

export function NotesPanel({ bookId, onSelect }: NotesPanelProps) {
  const { toast } = useToast();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState('');

  const loadHighlights = async () => {
    const rows = await db.highlights.where('bookId').equals(bookId).sortBy('createdAt');
    setHighlights(rows.reverse());
  };

  useEffect(() => {
    void loadHighlights();
  }, [bookId]);

  const startEditing = (highlight: Highlight) => {
    setEditingId(highlight.id);
    setDraftNote(highlight.note || '');
  };

  const saveNote = async (highlight: Highlight) => {
    await db.highlights.update(highlight.id, {
      note: draftNote.trim() || undefined,
      updatedAt: Date.now(),
    });
    setEditingId(null);
    setDraftNote('');
    toast('Nota actualizada', 'success');
    await loadHighlights();
  };

  const deleteHighlight = async (highlightId: string) => {
    await db.highlights.delete(highlightId);
    await db.flashcards.where('highlightId').equals(highlightId).delete();
    toast('Highlight eliminado', 'info');
    await loadHighlights();
  };

  const convertToFlashcard = async (highlight: Highlight) => {
    const existing = await db.flashcards.where('highlightId').equals(highlight.id).first();
    if (existing) {
      toast('Ese highlight ya tiene flashcard', 'info');
      return;
    }

    const now = Date.now();
    const card: Flashcard = {
      id: uuid(),
      bookId,
      highlightId: highlight.id,
      front: highlight.text,
      back: highlight.note || 'Explica este fragmento con tus propias palabras.',
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewAt: now,
      createdAt: now,
    };

    await db.transaction('rw', db.flashcards, db.highlights, async () => {
      await db.flashcards.add(card);
      await db.highlights.update(highlight.id, { isFlashcard: true, updatedAt: now });
    });
    toast('Flashcard creada', 'success');
    await loadHighlights();
  };

  if (highlights.length === 0) {
    return <p className="sidebar-empty">Todavía no tienes notas ni highlights en este libro.</p>;
  }

  return (
    <div className="sidebar-list notes-panel">
      {highlights.map((highlight) => (
        <article key={highlight.id} className="sidebar-note-item">
          <button type="button" className="sidebar-list-item" onClick={() => highlight.page ? onSelect(highlight.page, highlight.blockId) : undefined}>
            <span className="sidebar-list-meta">
              <span className={`note-color-dot highlight-${highlight.color}`} />
              {highlight.page ? `Página ${highlight.page}` : highlight.cfi ? 'EPUB' : '—'}
              {highlight.category ? ` · ${highlight.category}` : ''}
            </span>
            <span>{highlight.text}</span>
          </button>

          {editingId === highlight.id ? (
            <div className="note-editor">
              <textarea value={draftNote} onChange={(event) => setDraftNote(event.target.value)} autoFocus />
              <div>
                <button type="button" onClick={() => void saveNote(highlight)}>Guardar</button>
                <button type="button" onClick={() => setEditingId(null)}>Cancelar</button>
              </div>
            </div>
          ) : (
            <div className="note-actions">
              {highlight.note ? <p>{highlight.note}</p> : <p className="muted">Sin nota adjunta</p>}
              <button type="button" onClick={() => startEditing(highlight)}>Editar nota</button>
              <button type="button" onClick={() => void convertToFlashcard(highlight)}>{highlight.isFlashcard ? 'Flashcard creada' : 'Crear flashcard'}</button>
              <button type="button" onClick={() => void deleteHighlight(highlight.id)}>Eliminar</button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}
