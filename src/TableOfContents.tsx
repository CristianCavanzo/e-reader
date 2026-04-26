import type { TocItem } from './db';

interface Props {
  items: TocItem[];
  activeItemId?: string;
  onSelect: (item: TocItem) => void;
}

export function TableOfContents({ items, activeItemId, onSelect }: Props) {
  if (items.length === 0) {
    return (
      <div className="toc-empty">
        <p>El índice aparecerá cuando el libro termine de cargar.</p>
      </div>
    );
  }

  return (
    <nav className="toc-list" aria-label="Tabla de contenidos">
      {items.map((item) => (
        <button
          key={item.id}
          className={`toc-item ${activeItemId === item.id ? 'active' : ''}`}
          style={{ paddingLeft: `${0.85 + item.level * 1.1}rem` }}
          onClick={() => onSelect(item)}
          title={item.label}
        >
          <span className="toc-label">{item.label}</span>
          {item.page ? <span className="toc-page">{item.page}</span> : null}
        </button>
      ))}
    </nav>
  );
}
