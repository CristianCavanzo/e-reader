import { useCallback, useEffect, useRef, useState } from 'react';
import ePub from 'epubjs';
import type { Book, Rendition } from 'epubjs';
import { db, type Theme, type TocItem, uuid } from './db';
import { findCurrentEpubTocItem, flattenEpubNavigation } from './epubNavigation';
import { SelectionPopup, type HighlightColor } from './SelectionPopup';
import { useToast } from './components/ToastProvider';

interface Props {
  bookId: string;
  fileBlob: Blob;
  initialCfi?: string;
  fontSize: number;
  fontFamily?: string;
  lineHeight?: number;
  theme: Theme;
  tocItems: TocItem[];
  goToTocItem?: TocItem | null;
  onTocReady?: (items: TocItem[]) => void;
  onTocItemChange?: (item?: TocItem) => void;
  onLocationChange?: (cfi: string, percentage: number) => void;
}

interface EpubSelectionState {
  text: string;
  cfi: string;
  page?: number;
  x: number;
  y: number;
}

const themes: Record<Theme, Record<string, Record<string, string>>> = {
  light: {
    body: {
      'background-color': '#fffdf9 !important',
      color: '#231f18 !important',
      'line-height': '1.85 !important',
      'letter-spacing': '0.01em !important',
      'user-select': 'text !important',
      'padding-inline': '1rem !important',
    },
    p: { color: '#231f18 !important' },
    a: {
      color: '#8b5e34 !important',
      'text-decoration': 'underline !important',
      'text-underline-offset': '0.16em !important',
      cursor: 'pointer !important',
    },
    '::selection': { 'background-color': 'rgba(185, 147, 95, 0.28) !important' },
  },
  dark: {
    body: {
      'background-color': '#17120f !important',
      color: '#f3ebdd !important',
      'line-height': '1.85 !important',
      'letter-spacing': '0.01em !important',
      'user-select': 'text !important',
      'padding-inline': '1rem !important',
    },
    p: { color: '#f3ebdd !important' },
    a: {
      color: '#f7c27d !important',
      'text-decoration': 'underline !important',
      'text-underline-offset': '0.16em !important',
      cursor: 'pointer !important',
    },
    '::selection': { 'background-color': 'rgba(247, 194, 125, 0.28) !important' },
  },
  sepia: {
    body: {
      'background-color': '#f4ebde !important',
      color: '#3f2e20 !important',
      'line-height': '1.85 !important',
      'letter-spacing': '0.01em !important',
      'user-select': 'text !important',
      'padding-inline': '1rem !important',
    },
    p: { color: '#3f2e20 !important' },
    a: {
      color: '#8f5b2e !important',
      'text-decoration': 'underline !important',
      'text-underline-offset': '0.16em !important',
      cursor: 'pointer !important',
    },
    '::selection': { 'background-color': 'rgba(182, 134, 78, 0.25) !important' },
  },
};

function applyReaderTypography(rendition: Rendition | null, fontFamily?: string, lineHeight?: number) {
  if (!rendition) return;
  const themesApi = rendition.themes as any;
  if (fontFamily && fontFamily !== 'system') themesApi.override?.('font-family', fontFamily, true);
  if (lineHeight) themesApi.override?.('line-height', String(lineHeight), true);
}

function categoryFromColor(color: HighlightColor) {
  if (color === 'yellow') return 'concept' as const;
  if (color === 'pink') return 'important' as const;
  if (color === 'blue') return 'question' as const;
  return 'action' as const;
}

export function EpubReader({
  bookId,
  fileBlob,
  initialCfi,
  fontSize,
  fontFamily,
  lineHeight,
  theme,
  tocItems,
  goToTocItem,
  onTocReady,
  onTocItemChange,
  onLocationChange,
}: Props) {
  const { toast } = useToast();
  const viewerRef = useRef<HTMLDivElement>(null);
  const renditionRef = useRef<Rendition | null>(null);
  const bookRef = useRef<Book | null>(null);
  const onLocationChangeRef = useRef(onLocationChange);
  const onTocItemChangeRef = useRef(onTocItemChange);
  const onTocReadyRef = useRef(onTocReady);
  const tocItemsRef = useRef<TocItem[]>(tocItems);
  const lastTocJumpRef = useRef<string | undefined>(undefined);
  const currentCfiRef = useRef<string | undefined>(initialCfi);
  const [error, setError] = useState<string | null>(null);
  const [turnDirection, setTurnDirection] = useState<'next' | 'prev' | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<EpubSelectionState | null>(null);

  const applyStoredHighlights = useCallback(async () => {
    const rendition = renditionRef.current as any;
    if (!rendition?.annotations) return;
    const rows = await db.highlights.where('bookId').equals(bookId).toArray();
    rows.filter((highlight) => highlight.cfi).forEach((highlight) => {
      try {
        rendition.annotations.highlight(highlight.cfi, {}, undefined, `epub-highlight-${highlight.color}`, { title: highlight.note || highlight.text });
      } catch (annotationError) {
        console.warn('No se pudo restaurar highlight EPUB:', annotationError);
      }
    });
  }, [bookId]);

  useEffect(() => { onLocationChangeRef.current = onLocationChange; }, [onLocationChange]);
  useEffect(() => { onTocItemChangeRef.current = onTocItemChange; }, [onTocItemChange]);
  useEffect(() => { onTocReadyRef.current = onTocReady; }, [onTocReady]);
  useEffect(() => { tocItemsRef.current = tocItems; }, [tocItems]);

  useEffect(() => {
    if (!viewerRef.current) return;

    let cancelled = false;
    const container = viewerRef.current;
    setError(null);

    const init = async () => {
      try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        if (cancelled) return;

        const book = ePub(arrayBuffer);
        bookRef.current = book;

        await book.ready;
        const navigation = await book.loaded.navigation;
        const navItems = flattenEpubNavigation(bookId, navigation);
        tocItemsRef.current = navItems;
        onTocReadyRef.current?.(navItems);

        const rendition = book.renderTo(container, {
          width: '100%',
          height: '100%',
          flow: 'paginated',
          spread: 'none',
          allowScriptedContent: true,
          snap: true,
        });
        renditionRef.current = rendition;

        rendition.themes.register('light', themes.light);
        rendition.themes.register('dark', themes.dark);
        rendition.themes.register('sepia', themes.sepia);
        rendition.themes.select(theme);
        rendition.themes.fontSize(`${fontSize}px`);
        applyReaderTypography(rendition, fontFamily, lineHeight);

        rendition.hooks.content.register((contents: any) => {
          const doc = contents.document as Document;
          const style = doc.createElement('style');
          style.textContent = `
            html, body { user-select: text !important; }
            body { -webkit-font-smoothing: antialiased; }
            a { cursor: pointer !important; }
            img, svg, video { max-width: 100% !important; height: auto !important; }
            .epub-highlight-yellow { background: rgba(255, 213, 79, .42) !important; }
            .epub-highlight-green { background: rgba(70, 210, 150, .34) !important; }
            .epub-highlight-blue { background: rgba(90, 160, 255, .32) !important; }
            .epub-highlight-pink { background: rgba(255, 105, 180, .30) !important; }
          `;
          doc.head.appendChild(style);

          doc.addEventListener('click', (event) => {
            const target = event.target as HTMLElement | null;
            const anchor = target?.closest('a') as HTMLAnchorElement | null;
            if (!anchor) return;
            const href = anchor.getAttribute('href') || '';
            if (!href) return;

            if (/^https?:\/\//i.test(href)) {
              event.preventDefault();
              window.open(href, '_blank', 'noopener,noreferrer');
            }
          });
        });

        rendition.on('selected', (cfiRange: string, contents: any) => {
          const selection = contents.window.getSelection();
          const text = selection?.toString().trim();
          if (!text || text.length < 3) return;
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();
          const frameRect = contents.window.frameElement?.getBoundingClientRect?.() || { left: 0, top: 0 };
          setSelectionPopup({
            text,
            cfi: cfiRange,
            page: undefined,
            x: frameRect.left + rect.left + rect.width / 2,
            y: frameRect.top + rect.top - 8,
          });
        });

        rendition.on('relocated', (location: any) => {
          const startCfi = location?.start?.cfi;
          if (startCfi) {
            currentCfiRef.current = startCfi;
            const percentage = book.locations?.percentageFromCfi(startCfi) || 0;
            onLocationChangeRef.current?.(startCfi, percentage * 100);

            const currentItem = findCurrentEpubTocItem(tocItemsRef.current, location.start?.href);
            onTocItemChangeRef.current?.(currentItem);
          }
        });

        await rendition.display(initialCfi || undefined);
        await book.locations.generate(1200);
        await applyStoredHighlights();
      } catch (e: any) {
        console.error('EPUB error:', e);
        if (!cancelled) setError(e?.message || 'No se pudo abrir el EPUB');
      }
    };

    void init();

    return () => {
      cancelled = true;
      try { renditionRef.current?.destroy(); } catch {}
      try { bookRef.current?.destroy(); } catch {}
      renditionRef.current = null;
      bookRef.current = null;
    };
  }, [applyStoredHighlights, bookId, fileBlob, initialCfi]);

  useEffect(() => {
    if (!renditionRef.current) return;
    renditionRef.current.themes.select(theme);
    applyReaderTypography(renditionRef.current, fontFamily, lineHeight);
  }, [fontFamily, lineHeight, theme]);

  useEffect(() => {
    if (!renditionRef.current) return;
    renditionRef.current.themes.fontSize(`${fontSize}px`);
  }, [fontSize]);

  useEffect(() => {
    if (!goToTocItem || !renditionRef.current) return;
    const target = goToTocItem.id;
    if (lastTocJumpRef.current === target) return;
    lastTocJumpRef.current = target;

    const destination = goToTocItem.cfi || goToTocItem.href;
    if (destination) {
      setTurnDirection('next');
      void renditionRef.current.display(destination);
    }
  }, [goToTocItem]);

  const triggerTurn = (direction: 'next' | 'prev') => {
    setTurnDirection(direction);
    window.setTimeout(() => setTurnDirection(null), 420);
  };

  useEffect(() => {
    const onKeyUp = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') {
        triggerTurn('next');
        renditionRef.current?.next();
      }
      if (e.key === 'ArrowLeft') {
        triggerTurn('prev');
        renditionRef.current?.prev();
      }
    };

    window.addEventListener('keyup', onKeyUp);
    return () => window.removeEventListener('keyup', onKeyUp);
  }, []);

  const createHighlight = async (color: HighlightColor, note?: string) => {
    if (!selectionPopup) return;
    const now = Date.now();
    await db.highlights.add({
      id: uuid(),
      bookId,
      cfi: selectionPopup.cfi,
      text: selectionPopup.text,
      color,
      category: categoryFromColor(color),
      note,
      tags: [],
      isFlashcard: false,
      createdAt: now,
      updatedAt: now,
    });
    try {
      (renditionRef.current as any)?.annotations?.highlight(selectionPopup.cfi, {}, undefined, `epub-highlight-${color}`, { title: note || selectionPopup.text });
    } catch (annotationError) {
      console.warn('No se pudo dibujar el highlight EPUB:', annotationError);
    }
    setSelectionPopup(null);
    toast('Highlight guardado', 'success');
  };

  const createBookmarkFromSelection = async () => {
    const cfi = selectionPopup?.cfi || currentCfiRef.current;
    if (!cfi) return;
    await db.bookmarks.add({
      id: uuid(),
      bookId,
      cfi,
      label: selectionPopup ? selectionPopup.text.slice(0, 64) : 'Marcador EPUB',
      createdAt: Date.now(),
    });
    setSelectionPopup(null);
    toast('Bookmark EPUB añadido', 'success');
  };

  if (error) {
    return (
      <div className="reader-error">
        <p>Error al abrir el EPUB:</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className={`epub-reader ${turnDirection ? `turn-${turnDirection}` : ''}`}>
      <div className="epub-page-turn-shadow" aria-hidden="true" />
      <button className="page-nav page-nav-prev" onClick={() => { triggerTurn('prev'); renditionRef.current?.prev(); }} aria-label="Página anterior">‹</button>
      <div ref={viewerRef} className="epub-viewer" />
      <button className="page-nav page-nav-next" onClick={() => { triggerTurn('next'); renditionRef.current?.next(); }} aria-label="Página siguiente">›</button>

      {selectionPopup ? (
        <SelectionPopup
          selection={selectionPopup}
          onHighlight={(color, note) => void createHighlight(color, note)}
          onBookmark={() => void createBookmarkFromSelection()}
          onClose={() => setSelectionPopup(null)}
        />
      ) : null}
    </div>
  );
}
