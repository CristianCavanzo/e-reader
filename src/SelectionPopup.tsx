import { useEffect, useRef, useState } from 'react';

export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';

interface SelectionPopupState {
  text: string;
  blockId?: string;
  page?: number;
  x: number;
  y: number;
}

interface Props {
  selection: SelectionPopupState;
  onHighlight: (color: HighlightColor, note?: string) => void;
  onBookmark: () => void;
  onClose: () => void;
}

const colors: Array<{ color: HighlightColor; label: string }> = [
  { color: 'yellow', label: 'Amarillo' },
  { color: 'green', label: 'Verde' },
  { color: 'blue', label: 'Azul' },
  { color: 'pink', label: 'Rosa' },
];

export function SelectionPopup({ selection, onHighlight, onBookmark, onClose }: Props) {
  const popupRef = useRef<HTMLDivElement>(null);
  const [showNote, setShowNote] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };

    const onPointerDown = (event: MouseEvent) => {
      if (!popupRef.current) return;
      if (!popupRef.current.contains(event.target as Node)) onClose();
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('mousedown', onPointerDown);

    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('mousedown', onPointerDown);
    };
  }, [onClose]);

  return (
    <div
      ref={popupRef}
      className={`selection-popup ${showNote ? 'with-note' : ''}`}
      style={{ left: selection.x, top: selection.y }}
      role="dialog"
      aria-label="Acciones de selección"
    >
      {showNote ? (
        <div className="selection-note-form">
          <textarea
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder="Nota rápida…"
            autoFocus
          />
          <div className="selection-note-actions">
            {colors.map(({ color, label }) => (
              <button
                key={color}
                type="button"
                className={`color-${color}`}
                title={`Guardar highlight ${label.toLowerCase()}`}
                aria-label={`Guardar highlight ${label}`}
                onClick={() => onHighlight(color, note.trim() || undefined)}
              />
            ))}
          </div>
        </div>
      ) : (
        <>
          {colors.map(({ color, label }) => (
            <button
              key={color}
              type="button"
              className={`color-${color}`}
              title={`Highlight ${label.toLowerCase()}`}
              aria-label={`Highlight ${label}`}
              onClick={() => onHighlight(color)}
            />
          ))}
          <button type="button" className="action-btn" onClick={() => setShowNote(true)}>
            Nota
          </button>
          <button type="button" className="action-btn" onClick={onBookmark}>
            Marcar
          </button>
        </>
      )}
    </div>
  );
}
