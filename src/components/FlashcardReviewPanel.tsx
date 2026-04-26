import { useEffect, useMemo, useState } from 'react';
import { db, type Flashcard, type Highlight, uuid } from '../db';
import { useToast } from './ToastProvider';

interface FlashcardReviewPanelProps {
  bookId: string;
  onClose: () => void;
}

function nextInterval(card: Flashcard, quality: 'again' | 'hard' | 'good' | 'easy') {
  if (quality === 'again') return { interval: 1, repetitions: 0, easeFactor: Math.max(1.3, card.easeFactor - 0.2) };
  if (quality === 'hard') return { interval: Math.max(1, Math.ceil(card.interval * 1.2)), repetitions: card.repetitions + 1, easeFactor: Math.max(1.3, card.easeFactor - 0.05) };
  if (quality === 'easy') return { interval: Math.max(3, Math.ceil(card.interval * card.easeFactor * 1.35)), repetitions: card.repetitions + 1, easeFactor: card.easeFactor + 0.15 };
  const next = card.repetitions === 0 ? 1 : card.repetitions === 1 ? 3 : Math.ceil(card.interval * card.easeFactor);
  return { interval: next, repetitions: card.repetitions + 1, easeFactor: card.easeFactor };
}

export function FlashcardReviewPanel({ bookId, onClose }: FlashcardReviewPanelProps) {
  const { toast } = useToast();
  const [cards, setCards] = useState<Flashcard[]>([]);
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [index, setIndex] = useState(0);
  const [showBack, setShowBack] = useState(false);

  const load = async () => {
    const [cardRows, highlightRows] = await Promise.all([
      db.flashcards.where('bookId').equals(bookId).sortBy('nextReviewAt'),
      db.highlights.where('bookId').equals(bookId).toArray(),
    ]);
    setCards(cardRows);
    setHighlights(highlightRows);
    setIndex(0);
    setShowBack(false);
  };

  useEffect(() => {
    void load();
  }, [bookId]);

  const dueCards = useMemo(() => {
    const now = Date.now();
    return cards.filter((card) => card.nextReviewAt <= now).concat(cards.filter((card) => card.nextReviewAt > now));
  }, [cards]);

  const current = dueCards[index];

  const createCardsFromHighlights = async () => {
    const existingHighlightIds = new Set(cards.map((card) => card.highlightId).filter(Boolean));
    const source = highlights.filter((highlight) => !existingHighlightIds.has(highlight.id) && (highlight.note || highlight.text.length > 12));
    const now = Date.now();
    const rows: Flashcard[] = source.map((highlight) => ({
      id: uuid(),
      bookId,
      highlightId: highlight.id,
      front: highlight.text,
      back: highlight.note || 'Explica este concepto con tus propias palabras.',
      interval: 1,
      easeFactor: 2.5,
      repetitions: 0,
      nextReviewAt: now,
      createdAt: now,
    }));

    if (rows.length === 0) {
      toast('No hay highlights nuevos para convertir', 'info');
      return;
    }

    await db.transaction('rw', db.flashcards, db.highlights, async () => {
      await db.flashcards.bulkAdd(rows);
      await Promise.all(rows.map((row) => row.highlightId ? db.highlights.update(row.highlightId, { isFlashcard: true, updatedAt: now }) : undefined));
    });
    toast(`${rows.length} flashcards creadas`, 'success');
    await load();
  };

  const rate = async (quality: 'again' | 'hard' | 'good' | 'easy') => {
    if (!current) return;
    const next = nextInterval(current, quality);
    await db.flashcards.update(current.id, {
      ...next,
      lastReviewedAt: Date.now(),
      nextReviewAt: Date.now() + next.interval * 24 * 60 * 60 * 1000,
    });
    setShowBack(false);
    if (index + 1 >= dueCards.length) {
      toast('Sesión de repaso completada', 'success');
      await load();
      return;
    }
    setIndex((value) => value + 1);
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="flashcard-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>Repaso con flashcards</h2>
            <p>{cards.length} tarjetas · {Math.min(index + 1, Math.max(1, dueCards.length))} / {dueCards.length || 0}</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </header>

        {!current ? (
          <div className="flashcard-empty">
            <p>No hay flashcards todavía.</p>
            <button type="button" className="reader-btn" onClick={() => void createCardsFromHighlights()}>
              Crear desde highlights
            </button>
          </div>
        ) : (
          <>
            <article className="flashcard-card" onClick={() => setShowBack(true)}>
              <span>{showBack ? 'Respuesta' : 'Pregunta'}</span>
              <p>{showBack ? current.back : current.front}</p>
            </article>

            {!showBack ? (
              <button type="button" className="reader-btn" onClick={() => setShowBack(true)}>
                Mostrar respuesta
              </button>
            ) : (
              <div className="flashcard-rating">
                <button type="button" onClick={() => void rate('again')}>No sé</button>
                <button type="button" onClick={() => void rate('hard')}>Difícil</button>
                <button type="button" onClick={() => void rate('good')}>Bien</button>
                <button type="button" onClick={() => void rate('easy')}>Fácil</button>
              </div>
            )}
          </>
        )}

        <footer>
          <button type="button" className="reader-btn ghost" onClick={() => void createCardsFromHighlights()}>
            Convertir highlights
          </button>
        </footer>
      </section>
    </div>
  );
}
