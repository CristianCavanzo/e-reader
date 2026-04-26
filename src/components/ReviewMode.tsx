import { useEffect, useState } from 'react';
import { db, type Highlight, type TocItem } from '../db';

interface ReviewModeProps {
  bookId: string;
  tocItems: TocItem[];
  onSelect: (page: number, blockId?: string) => void;
  onClose: () => void;
}

function getChapterLabel(highlight: Highlight, tocItems: TocItem[]) {
  if (!highlight.page) return 'EPUB / sin página';
  const item = [...tocItems]
    .filter((toc) => toc.page && toc.page <= highlight.page!)
    .sort((a, b) => (b.page || 0) - (a.page || 0))[0];
  return item?.label || `Página ${highlight.page}`;
}

export function ReviewMode({ bookId, tocItems, onSelect, onClose }: ReviewModeProps) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);

  useEffect(() => {
    let cancelled = false;
    db.highlights.where('bookId').equals(bookId).sortBy('createdAt').then((rows) => {
      if (!cancelled) setHighlights(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const groups = highlights.reduce<Record<string, Highlight[]>>((acc, highlight) => {
    const label = getChapterLabel(highlight, tocItems);
    acc[label] = [...(acc[label] || []), highlight];
    return acc;
  }, {});

  return (
    <div className="review-mode">
      <header className="review-header">
        <div>
          <h2>Modo repaso</h2>
          <p>Repasa solo lo que ya decidiste que era importante.</p>
        </div>
        <button type="button" className="reader-btn ghost" onClick={onClose}>Volver al libro</button>
      </header>

      {highlights.length === 0 ? (
        <div className="empty-state compact">
          <p>No hay highlights todavía.</p>
          <p className="muted">Selecciona texto en Smart Reader o EPUB para empezar a construir tu material de repaso.</p>
        </div>
      ) : (
        <div className="review-groups">
          {Object.entries(groups).map(([label, rows]) => (
            <section key={label} className="review-group">
              <h3>{label}</h3>
              {rows.map((highlight) => (
                <button
                  key={highlight.id}
                  type="button"
                  className="review-highlight"
                  onClick={() => highlight.page ? onSelect(highlight.page, highlight.blockId) : undefined}
                >
                  <span className={`note-color-dot highlight-${highlight.color}`} />
                  <span>{highlight.text}</span>
                  {highlight.note ? <small>{highlight.note}</small> : null}
                </button>
              ))}
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
