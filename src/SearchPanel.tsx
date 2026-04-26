import { Fragment, useEffect, useMemo, useState } from 'react';
import { db } from './db';
import type { PdfReaderBlock } from './pdfHybrid/pdfCoordinates';

interface SearchPanelProps {
  bookId: string;
  blocksByPage: Record<number, PdfReaderBlock[]>;
  onResultSelect: (page: number, blockId?: string) => void;
}

interface SearchResult {
  page?: number;
  chapterId?: string;
  blockId?: string;
  text: string;
  before: string;
  match: string;
  after: string;
  source: 'index' | 'smart';
}

function normalizeQuery(value: string) {
  return value.trim().replace(/\s+/g, ' ').toLowerCase();
}

function buildContext(text: string, index: number, queryLength: number): Pick<SearchResult, 'before' | 'match' | 'after'> {
  const start = Math.max(0, index - 46);
  const end = Math.min(text.length, index + queryLength + 70);

  return {
    before: `${start > 0 ? '…' : ''}${text.slice(start, index)}`,
    match: text.slice(index, index + queryLength),
    after: `${text.slice(index + queryLength, end)}${end < text.length ? '…' : ''}`,
  };
}

export function SearchPanel({ bookId, blocksByPage, onResultSelect }: SearchPanelProps) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [indexedResults, setIndexedResults] = useState<SearchResult[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const [indexCount, setIndexCount] = useState(0);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => {
    let cancelled = false;
    const loadIndexCount = async () => {
      const count = await db.searchIndex.where('bookId').equals(bookId).count();
      if (!cancelled) setIndexCount(count);
    };
    void loadIndexCount();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  useEffect(() => {
    const q = normalizeQuery(debouncedQuery);
    if (q.length < 2) {
      setIndexedResults([]);
      return;
    }

    let cancelled = false;
    const search = async () => {
      setIsSearching(true);
      const rows = await db.searchIndex.where('bookId').equals(bookId).toArray();
      if (cancelled) return;

      const matches: SearchResult[] = [];
      for (const row of rows) {
        const normalizedText = row.text.toLowerCase();
        const index = normalizedText.indexOf(q);
        if (index === -1) continue;
        matches.push({
          page: row.page,
          chapterId: row.chapterId,
          text: row.text,
          source: 'index',
          ...buildContext(row.text, index, q.length),
        });
        if (matches.length >= 100) break;
      }
      setIndexedResults(matches);
      setIsSearching(false);
    };

    void search();
    return () => {
      cancelled = true;
    };
  }, [bookId, debouncedQuery]);

  const smartResults = useMemo<SearchResult[]>(() => {
    const q = normalizeQuery(debouncedQuery);
    if (q.length < 2 || indexedResults.length > 0) return [];

    const matches: SearchResult[] = [];

    Object.entries(blocksByPage)
      .sort(([a], [b]) => Number(a) - Number(b))
      .forEach(([page, blocks]) => {
        for (const block of blocks) {
          if (!block.text || block.type.includes('snapshot')) continue;

          const normalizedText = block.text.toLowerCase();
          const index = normalizedText.indexOf(q);
          if (index === -1) continue;

          matches.push({
            page: Number(page),
            blockId: block.id,
            text: block.text,
            source: 'smart',
            ...buildContext(block.text, index, q.length),
          });

          if (matches.length >= 80) break;
        }
      });

    return matches;
  }, [blocksByPage, debouncedQuery, indexedResults.length]);

  const results = indexedResults.length > 0 ? indexedResults : smartResults;

  return (
    <div className="search-panel">
      <label className="sidebar-field">
        <span>Buscar en el libro</span>
        <input
          id="reader-sidebar-search"
          type="search"
          placeholder="Ej. pandas, ndarray, missing data…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </label>

      <p className="search-index-hint">
        {indexCount > 0 ? `${indexCount} bloques indexados offline.` : 'Sin índice completo todavía; se usa Smart Reader como fallback.'}
      </p>

      {isSearching ? <p className="sidebar-empty">Buscando…</p> : null}

      {debouncedQuery.trim().length > 0 && !isSearching && results.length === 0 ? (
        <p className="sidebar-empty">No hay resultados para esa búsqueda.</p>
      ) : null}

      <div className="sidebar-list">
        {results.map((result, index) => (
          <button
            key={`${result.source}-${result.page || result.chapterId || index}-${result.blockId || index}`}
            type="button"
            className="sidebar-list-item search-result"
            onClick={() => result.page ? onResultSelect(result.page, result.blockId) : undefined}
          >
            <span className="sidebar-list-meta">
              {result.page ? `Página ${result.page}` : `Capítulo ${result.chapterId || 'EPUB'}`} · {result.source === 'index' ? 'índice' : 'smart'}
            </span>
            <span>
              <Fragment>{result.before}</Fragment>
              <mark>{result.match}</mark>
              <Fragment>{result.after}</Fragment>
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
