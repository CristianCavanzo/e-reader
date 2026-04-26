import { Fragment, type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pdfjsLib } from './lib/pdfWorker';
import { db, type Bookmark, type Highlight, type Theme, type TocItem, uuid } from './db';
import { CodeBlock } from './CodeBlock';
import { SelectionPopup, type HighlightColor } from './SelectionPopup';
import { useToast } from './components/ToastProvider';
import { flattenPdfOutline } from './pdfOutline';
import { extractPdfBlocks } from './pdfHybrid/extractPdfBlocks';
import type { PdfReaderBlock, PdfSourceRect } from './pdfHybrid/pdfCoordinates';


interface Props {
  bookId: string;
  fileBlob: Blob;
  initialPage?: number;
  initialBlockId?: string;
  fontSize: number;
  preferredLineHeight?: number;
  theme: Theme;
  goToTocItem?: TocItem | null;
  goToBlockTarget?: { page: number; blockId?: string; token: number } | null;
  onTocReady?: (items: TocItem[]) => void;
  onTocItemChange?: (item?: TocItem) => void;
  onPageChange?: (page: number, total: number) => void;
  onBlocksReady?: (page: number, blocks: PdfReaderBlock[]) => void;
  onOpenOriginal?: (page: number, rect?: PdfSourceRect) => void;
}

interface PdfHybridPage {
  page: number;
  blocks: PdfReaderBlock[];
  status: 'loading' | 'ready' | 'error';
  error?: string;
}

interface SelectionPopupState {
  text: string;
  blockId?: string;
  page: number;
  x: number;
  y: number;
}

const PAGE_BATCH_SIZE = 3;

function linkify(text: string) {
  const parts = text.split(/(https?:\/\/[^\s)]+|www\.[^\s)]+)/gi);

  return parts.map((part, index) => {
    if (/^(https?:\/\/|www\.)/i.test(part)) {
      const href = part.startsWith('http') ? part : `https://${part}`;
      return (
        <a key={`${part}-${index}`} href={href} target="_blank" rel="noopener noreferrer">
          {part}
        </a>
      );
    }

    return <Fragment key={`${part}-${index}`}>{part}</Fragment>;
  });
}

function getSnapshotLabel(type: PdfReaderBlock['type']) {
  if (type === 'table-snapshot') return 'Tabla preservada del PDF original';
  if (type === 'figure-snapshot' || type === 'image') return 'Figura preservada del PDF original';
  return 'Bloque preservado del PDF original';
}

function getElementFromRange(range: Range): Element | null {
  const node = range.commonAncestorContainer;
  if (node.nodeType === Node.ELEMENT_NODE) return node as Element;
  return node.parentElement;
}

function getMostVisibleBlockId(root: HTMLElement | null): string | undefined {
  if (!root) return undefined;

  const viewportMiddle = window.innerHeight / 2;
  const blocks = Array.from(root.querySelectorAll<HTMLElement>('[data-block-id]'));
  let best: { id: string; distance: number } | undefined;

  for (const block of blocks) {
    const rect = block.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > window.innerHeight) continue;

    const blockMiddle = rect.top + rect.height / 2;
    const distance = Math.abs(blockMiddle - viewportMiddle);
    const id = block.dataset.blockId;
    if (!id) continue;

    if (!best || distance < best.distance) best = { id, distance };
  }

  return best?.id;
}

function findBlockElement(pageEl: HTMLElement | null, blockId?: string): HTMLElement | null {
  if (!pageEl || !blockId) return null;

  return Array.from(pageEl.querySelectorAll<HTMLElement>('[data-block-id]'))
    .find((element) => element.dataset.blockId === blockId) || null;
}

function getMostVisiblePage(root: HTMLElement | null, pageElements: Map<number, HTMLElement>): number | undefined {
  if (!root || pageElements.size === 0) return undefined;

  const rootRect = root.getBoundingClientRect();
  const rootMiddle = rootRect.top + rootRect.height * 0.42;
  let best: { page: number; score: number; distance: number } | undefined;

  for (const [page, element] of pageElements) {
    const rect = element.getBoundingClientRect();
    const visibleTop = Math.max(rect.top, rootRect.top);
    const visibleBottom = Math.min(rect.bottom, rootRect.bottom);
    const visiblePx = Math.max(0, visibleBottom - visibleTop);

    if (visiblePx <= 0) continue;

    const visibleRatio = visiblePx / Math.max(rect.height, 1);
    const distance = Math.abs((rect.top + rect.height / 2) - rootMiddle);
    const score = visibleRatio * 1000 - distance * 0.2;

    if (!best || score > best.score || (score === best.score && distance < best.distance)) {
      best = { page, score, distance };
    }
  }

  return best?.page;
}

function renderTextWithHighlights(text: string, highlights: Highlight[]): ReactNode {
  const activeHighlights = highlights
    .filter((highlight) => highlight.text.trim().length > 0)
    .sort((a, b) => a.createdAt - b.createdAt);

  if (activeHighlights.length === 0) return linkify(text);

  const lowerText = text.toLowerCase();
  const ranges: Array<{ start: number; end: number; highlight: Highlight }> = [];

  for (const highlight of activeHighlights) {
    const needle = highlight.text.trim();
    const start = lowerText.indexOf(needle.toLowerCase());
    if (start < 0) continue;

    const end = start + needle.length;
    const overlaps = ranges.some((range) => start < range.end && end > range.start);
    if (!overlaps) ranges.push({ start, end, highlight });
  }

  if (ranges.length === 0) return linkify(text);

  ranges.sort((a, b) => a.start - b.start);

  const nodes: ReactNode[] = [];
  let cursor = 0;

  ranges.forEach((range, index) => {
    if (range.start > cursor) {
      nodes.push(<Fragment key={`text-${index}-${cursor}`}>{text.slice(cursor, range.start)}</Fragment>);
    }

    nodes.push(
      <mark
        key={`highlight-${range.highlight.id}`}
        className={`highlight-${range.highlight.color}`}
        title={range.highlight.note}
      >
        {text.slice(range.start, range.end)}
      </mark>
    );

    cursor = range.end;
  });

  if (cursor < text.length) {
    nodes.push(<Fragment key={`text-tail-${cursor}`}>{text.slice(cursor)}</Fragment>);
  }

  return nodes;
}

export function PdfHybridReader({
  bookId,
  fileBlob,
  initialPage = 1,
  initialBlockId,
  fontSize,
  preferredLineHeight,
  theme,
  goToTocItem,
  goToBlockTarget,
  onTocReady,
  onTocItemChange,
  onPageChange,
  onBlocksReady,
  onOpenOriginal,
}: Props) {
  const { toast } = useToast();
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const pdfRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const cacheRef = useRef<Map<number, PdfReaderBlock[]>>(new Map());
  const objectUrlsRef = useRef<Set<string>>(new Set());
  const loadingPagesRef = useRef<Set<number>>(new Set());
  const tocItemsRef = useRef<TocItem[]>([]);
  const onPageChangeRef = useRef(onPageChange);
  const onTocItemChangeRef = useRef(onTocItemChange);
  const onTocReadyRef = useRef(onTocReady);
  const onBlocksReadyRef = useRef(onBlocksReady);
  const lastJumpRef = useRef<string | undefined>(undefined);
  const pendingScrollPageRef = useRef<number | null>(initialPage);
  const pendingScrollBlockRef = useRef<string | null>(initialBlockId || null);
  const currentPageRef = useRef(initialPage);
  const totalPagesRef = useRef(0);
  const maxRequestedPageRef = useRef(Math.max(initialPage, PAGE_BATCH_SIZE));
  const observerRef = useRef<IntersectionObserver | null>(null);
  const observedPageElementsRef = useRef<Map<number, HTMLElement>>(new Map());
  const suppressObserverUntilRef = useRef(0);
  const scrollRetryTimersRef = useRef<number[]>([]);

  const [pages, setPages] = useState<Record<number, PdfHybridPage>>({});
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [maxRequestedPage, setMaxRequestedPage] = useState(Math.max(initialPage, PAGE_BATCH_SIZE));
  const [loadingDocument, setLoadingDocument] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectionPopup, setSelectionPopup] = useState<SelectionPopupState | null>(null);
  const [highlightsByBlock, setHighlightsByBlock] = useState<Record<string, Highlight[]>>({});
  const [highlightRefreshNonce, setHighlightRefreshNonce] = useState(0);
  const [pendingScrollTarget, setPendingScrollTarget] = useState<{ page: number; blockId?: string | null; token: number } | null>(() => ({
    page: initialPage,
    blockId: initialBlockId || null,
    token: Date.now(),
  }));

  useEffect(() => {
    onPageChangeRef.current = onPageChange;
  }, [onPageChange]);

  useEffect(() => {
    onTocItemChangeRef.current = onTocItemChange;
  }, [onTocItemChange]);

  useEffect(() => {
    onTocReadyRef.current = onTocReady;
  }, [onTocReady]);

  useEffect(() => {
    onBlocksReadyRef.current = onBlocksReady;
  }, [onBlocksReady]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    totalPagesRef.current = totalPages;
  }, [totalPages]);

  useEffect(() => {
    maxRequestedPageRef.current = maxRequestedPage;
  }, [maxRequestedPage]);

  const clearScrollRetryTimers = useCallback(() => {
    scrollRetryTimersRef.current.forEach((timerId) => window.clearTimeout(timerId));
    scrollRetryTimersRef.current = [];
  }, []);

  const commitVisiblePage = useCallback((nextPage: number, options?: { persist?: boolean }) => {
    if (!Number.isFinite(nextPage) || nextPage <= 0) return;

    currentPageRef.current = nextPage;
    setCurrentPage((current) => (current === nextPage ? current : nextPage));

    const total = totalPagesRef.current || 1;
    if (options?.persist !== false) {
      onPageChangeRef.current?.(nextPage, total);
    }

    const currentSection = [...tocItemsRef.current]
      .filter((item) => item.page && item.page <= nextPage)
      .sort((a, b) => (b.page || 0) - (a.page || 0))[0];
    onTocItemChangeRef.current?.(currentSection);

    const maxPage = maxRequestedPageRef.current;
    if (nextPage >= maxPage - 1 && totalPagesRef.current > maxPage) {
      setMaxRequestedPage((current) => Math.min(totalPagesRef.current, current + PAGE_BATCH_SIZE));
    }
  }, []);

  const persistExactPosition = useCallback(() => {
    const page = currentPageRef.current;
    const total = totalPagesRef.current || 1;
    const blockId = getMostVisibleBlockId(containerRef.current);
    const position = blockId ? `${page}:${blockId}` : String(page);

    void db.progress.put({
      bookId,
      position,
      percentage: total > 0 ? (page / total) * 100 : 0,
      updatedAt: Date.now(),
    });
  }, [bookId]);

  const mergePage = useCallback((page: PdfHybridPage) => {
    setPages((current) => ({ ...current, [page.page]: page }));
  }, []);

  const registerObjectUrls = useCallback((blocks: PdfReaderBlock[]) => {
    for (const block of blocks) {
      if (block.imageUrl?.startsWith('blob:')) {
        objectUrlsRef.current.add(block.imageUrl);
      }
    }
  }, []);

  const loadPage = useCallback(async (pageNumber: number) => {
    const pdf = pdfRef.current;
    if (!pdf) return;
    if (pageNumber < 1 || pageNumber > pdf.numPages) return;

    if (cacheRef.current.has(pageNumber)) {
      const blocks = cacheRef.current.get(pageNumber) || [];
      mergePage({ page: pageNumber, blocks, status: 'ready' });
      onBlocksReadyRef.current?.(pageNumber, blocks);
      return;
    }

    if (loadingPagesRef.current.has(pageNumber)) return;
    loadingPagesRef.current.add(pageNumber);
    mergePage({ page: pageNumber, blocks: [], status: 'loading' });

    try {
      const page = await pdf.getPage(pageNumber);
      const blocks = await extractPdfBlocks({ bookId, pdfPage: page, pageNumber });
      cacheRef.current.set(pageNumber, blocks);
      registerObjectUrls(blocks);
      onBlocksReadyRef.current?.(pageNumber, blocks);
      mergePage({ page: pageNumber, blocks, status: 'ready' });
    } catch (pageError: any) {
      console.error('Hybrid PDF page extraction error:', pageError);
      mergePage({
        page: pageNumber,
        blocks: [],
        status: 'error',
        error: pageError?.message || 'No se pudo procesar esta página',
      });
    } finally {
      loadingPagesRef.current.delete(pageNumber);
    }
  }, [bookId, mergePage, registerObjectUrls]);

  const loadRange = useCallback((from: number, to: number) => {
    for (let pageNumber = from; pageNumber <= to; pageNumber += 1) {
      void loadPage(pageNumber);
    }
  }, [loadPage]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDocument(true);
    setError(null);
    setPages({});
    setTotalPages(0);
    cacheRef.current.clear();
    loadingPagesRef.current.clear();
    pendingScrollPageRef.current = initialPage;
    pendingScrollBlockRef.current = initialBlockId || null;
    suppressObserverUntilRef.current = Date.now() + 1500;
    clearScrollRetryTimers();
    setPendingScrollTarget({ page: initialPage, blockId: initialBlockId || null, token: Date.now() });

    const loadDocument = async () => {
      try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }

        pdfRef.current = pdf;
        setTotalPages(pdf.numPages);
        setMaxRequestedPage(Math.min(pdf.numPages, Math.max(initialPage, PAGE_BATCH_SIZE)));

        const outlineItems = await flattenPdfOutline(bookId, pdf);
        if (!cancelled) {
          tocItemsRef.current = outlineItems;
          onTocReadyRef.current?.(outlineItems);
        }

        setLoadingDocument(false);
        loadRange(Math.max(1, initialPage - 1), Math.min(pdf.numPages, initialPage + PAGE_BATCH_SIZE));
      } catch (documentError: any) {
        console.error('Hybrid PDF document error:', documentError);
        if (!cancelled) {
          setError(documentError?.message || 'No se pudo abrir el PDF en modo Smart');
          setLoadingDocument(false);
        }
      }
    };

    loadDocument();

    return () => {
      cancelled = true;
      persistExactPosition();
      for (const url of objectUrlsRef.current) URL.revokeObjectURL(url);
      objectUrlsRef.current.clear();
      clearScrollRetryTimers();
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedPageElementsRef.current.clear();
      try {
        pdfRef.current?.destroy();
      } catch {}
      pdfRef.current = null;
    };
  }, [bookId, clearScrollRetryTimers, fileBlob, initialBlockId, initialPage, loadRange, persistExactPosition]);

  useEffect(() => {
    if (!totalPages || loadingDocument) return;
    loadRange(1, Math.min(totalPages, maxRequestedPage));
  }, [loadRange, loadingDocument, maxRequestedPage, totalPages]);

  useEffect(() => {
    const loadedPageNumbers = Object.values(pages)
      .filter((page) => page.status === 'ready')
      .map((page) => page.page);

    if (loadedPageNumbers.length === 0) {
      setHighlightsByBlock({});
      return;
    }

    let cancelled = false;

    const loadHighlights = async () => {
      const rows = await db.highlights.where('bookId').equals(bookId).toArray();
      if (cancelled) return;

      const loadedPages = new Set(loadedPageNumbers);
      const grouped: Record<string, Highlight[]> = {};

      rows
        .filter((highlight) => highlight.blockId && (!highlight.page || loadedPages.has(highlight.page)))
        .forEach((highlight) => {
          grouped[highlight.blockId!] = [...(grouped[highlight.blockId!] || []), highlight];
        });

      setHighlightsByBlock(grouped);
    };

    void loadHighlights();

    return () => {
      cancelled = true;
    };
  }, [bookId, pages, highlightRefreshNonce]);

  const sortedPages = useMemo(() => {
    return Object.values(pages).sort((a, b) => a.page - b.page);
  }, [pages]);

  const pendingTargetStatus = pendingScrollTarget ? pages[pendingScrollTarget.page]?.status : undefined;
  const renderedPageNumbersKey = useMemo(() => sortedPages.map((page) => page.page).join('|'), [sortedPages]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || loadingDocument) return;

    observerRef.current?.disconnect();
    observedPageElementsRef.current.clear();

    observerRef.current = new IntersectionObserver(
      () => {
        if (Date.now() < suppressObserverUntilRef.current || pendingScrollPageRef.current) return;

        const visiblePage = getMostVisiblePage(root, observedPageElementsRef.current);
        if (!visiblePage) return;

        commitVisiblePage(visiblePage);
      },
      { root, threshold: [0, 0.25, 0.5, 0.75, 1] }
    );

    return () => {
      observerRef.current?.disconnect();
      observerRef.current = null;
      observedPageElementsRef.current.clear();
    };
  }, [commitVisiblePage, loadingDocument]);

  useEffect(() => {
    const observer = observerRef.current;
    if (!observer) return;

    const renderedPageNumbers = renderedPageNumbersKey
      ? renderedPageNumbersKey.split('|').map((page) => Number(page)).filter(Number.isFinite)
      : [];
    const renderedPages = new Set(renderedPageNumbers);

    for (const [pageNumber, element] of observedPageElementsRef.current) {
      if (!renderedPages.has(pageNumber)) {
        observer.unobserve(element);
        observedPageElementsRef.current.delete(pageNumber);
      }
    }

    for (const pageNumber of renderedPageNumbers) {
      const element = pageRefs.current[pageNumber];
      if (!element || observedPageElementsRef.current.get(pageNumber) === element) continue;

      const previousElement = observedPageElementsRef.current.get(pageNumber);
      if (previousElement) observer.unobserve(previousElement);

      observedPageElementsRef.current.set(pageNumber, element);
      observer.observe(element);
    }
  }, [renderedPageNumbersKey]);

  useEffect(() => {
    if (!pendingScrollTarget || pendingTargetStatus !== 'ready') return;

    const targetPage = pendingScrollTarget.page;
    const targetBlockId = pendingScrollTarget.blockId || undefined;
    clearScrollRetryTimers();
    suppressObserverUntilRef.current = Date.now() + 1800;

    const scrollToTarget = (attempt: number) => {
      const pageElement = pageRefs.current[targetPage];
      const blockElement = findBlockElement(pageElement, targetBlockId);
      const targetElement = blockElement || pageElement;
      if (!targetElement) return;

      targetElement.scrollIntoView({ behavior: 'auto', block: 'start' });
      commitVisiblePage(targetPage);

      if (attempt < 5) {
        const timerId = window.setTimeout(() => scrollToTarget(attempt + 1), 120 + attempt * 80);
        scrollRetryTimersRef.current.push(timerId);
        return;
      }

      pendingScrollPageRef.current = null;
      pendingScrollBlockRef.current = null;
      setPendingScrollTarget(null);
      suppressObserverUntilRef.current = Date.now() + 250;
    };

    const frameOne = window.requestAnimationFrame(() => {
      window.requestAnimationFrame(() => scrollToTarget(0));
    });

    return () => {
      window.cancelAnimationFrame(frameOne);
      clearScrollRetryTimers();
    };
  }, [clearScrollRetryTimers, commitVisiblePage, pendingScrollTarget, pendingTargetStatus]);

  useEffect(() => {
    if (!goToTocItem?.page) return;
    const target = `${goToTocItem.id}-${goToTocItem.page}`;
    if (lastJumpRef.current === target) return;
    lastJumpRef.current = target;
    pendingScrollPageRef.current = goToTocItem.page;
    pendingScrollBlockRef.current = null;
    suppressObserverUntilRef.current = Date.now() + 1500;
    setPendingScrollTarget({ page: goToTocItem.page, blockId: null, token: Date.now() });
    setMaxRequestedPage((current) => Math.max(current, Math.min(totalPages || goToTocItem.page!, goToTocItem.page! + 1)));
    void loadPage(goToTocItem.page);
  }, [goToTocItem, loadPage, totalPages]);

  useEffect(() => {
    if (!goToBlockTarget?.page) return;
    pendingScrollPageRef.current = goToBlockTarget.page;
    pendingScrollBlockRef.current = goToBlockTarget.blockId || null;
    suppressObserverUntilRef.current = Date.now() + 1500;
    setPendingScrollTarget({ page: goToBlockTarget.page, blockId: goToBlockTarget.blockId || null, token: goToBlockTarget.token });
    setMaxRequestedPage((current) => Math.max(current, Math.min(totalPages || goToBlockTarget.page, goToBlockTarget.page + 1)));
    void loadPage(goToBlockTarget.page);
  }, [goToBlockTarget, loadPage, totalPages]);

  const lineHeight = useMemo(() => preferredLineHeight || Math.max(1.55, Math.min(1.95, 1.86 - (fontSize - 18) * 0.01)), [fontSize, preferredLineHeight]);

  const handleTextSelection = useCallback(() => {
    const selection = window.getSelection();

    if (!selection || selection.isCollapsed || selection.toString().trim().length < 3) {
      setSelectionPopup(null);
      return;
    }

    const selectedText = selection.toString().trim();
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const rangeElement = getElementFromRange(range);
    const blockEl = rangeElement?.closest<HTMLElement>('[data-block-id]');
    const pageEl = rangeElement?.closest<HTMLElement>('[data-page]');

    if (!blockEl || !pageEl) {
      setSelectionPopup(null);
      return;
    }

    setSelectionPopup({
      text: selectedText,
      blockId: blockEl.dataset.blockId,
      page: Number(pageEl.dataset.page || currentPage),
      x: rect.left + rect.width / 2,
      y: rect.top - 8,
    });
  }, [currentPage]);

  const createHighlight = useCallback(async (color: HighlightColor, note?: string) => {
    if (!selectionPopup) return;

    const now = Date.now();

    await db.highlights.add({
      id: uuid(),
      bookId,
      page: selectionPopup.page,
      blockId: selectionPopup.blockId,
      text: selectionPopup.text,
      color,
      category: color === 'yellow' ? 'concept' : color === 'pink' ? 'important' : color === 'blue' ? 'question' : 'action',
      tags: [],
      isFlashcard: false,
      note,
      createdAt: now,
      updatedAt: now,
    });

    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
    setHighlightRefreshNonce((value) => value + 1);
    toast('Highlight guardado', 'success');
  }, [bookId, selectionPopup, toast]);

  const createBookmarkFromSelection = useCallback(async () => {
    if (!selectionPopup) return;

    const bookmark: Bookmark = {
      id: uuid(),
      bookId,
      page: selectionPopup.page,
      label: `Página ${selectionPopup.page} · ${selectionPopup.text.slice(0, 48)}`,
      createdAt: Date.now(),
    };

    await db.bookmarks.add(bookmark);
    window.getSelection()?.removeAllRanges();
    setSelectionPopup(null);
  }, [bookId, selectionPopup]);

  const renderBlock = (block: PdfReaderBlock) => {
    const blockHighlights = highlightsByBlock[block.id] || [];
    const textContent = renderTextWithHighlights(block.text || '', blockHighlights);

    if (block.type === 'heading') {
      const Tag = block.headingLevel === 1 ? 'h1' : block.headingLevel === 3 ? 'h3' : 'h2';
      return (
        <Tag key={block.id} className="hybrid-heading" data-block-id={block.id}>
          {textContent}
        </Tag>
      );
    }

    if (block.type === 'code') {
      return <CodeBlock key={block.id} blockId={block.id} code={block.text || ''} />;
    }

    if (block.type === 'quote') {
      return (
        <blockquote key={block.id} data-block-id={block.id}>
          {textContent}
        </blockquote>
      );
    }

    if (block.type === 'paragraph') {
      return (
        <p key={block.id} data-block-id={block.id}>
          {textContent}
        </p>
      );
    }

    return (
      <figure key={block.id} className={`pdf-hybrid-snapshot ${block.type}`} data-block-id={block.id}>
        <div className="pdf-hybrid-snapshot-header">
          <span>{getSnapshotLabel(block.type)}</span>
          <button type="button" onClick={() => onOpenOriginal?.(block.page, block.sourceRect)}>
            Ver en PDF original
          </button>
        </div>
        {block.imageUrl ? <img src={block.imageUrl} alt={getSnapshotLabel(block.type)} /> : null}
      </figure>
    );
  };

  if (error) {
    return (
      <div className="reader-error">
        <p>Error al abrir Smart Reader:</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="pdf-hybrid-reader" data-reader-theme={theme} ref={containerRef}>
      <div
        className="pdf-hybrid-reader-inner"
        style={{ fontSize: `${fontSize}px`, lineHeight }}
        onMouseUp={handleTextSelection}
      >
        <div className="pdf-hybrid-reader-hud">
          <div className="pdf-text-mode-note pdf-hybrid-note">
            <strong>Smart Reader</strong>
            <span>
              Texto refluido para leer cómodo. Las tablas, figuras o bloques complejos se preservan como recortes del PDF original.
            </span>
          </div>
          {totalPages > 0 ? (
            <div className="pdf-hybrid-page-indicator" aria-live="polite">
              Página {currentPage} / {totalPages}
            </div>
          ) : null}
        </div>

        {loadingDocument ? <div className="pdf-text-loading">Preparando Smart Reader…</div> : null}

        {sortedPages.map((page) => (
          <section
            key={page.page}
            ref={(node) => {
              pageRefs.current[page.page] = node;
            }}
            data-page={page.page}
            className="pdf-hybrid-page"
          >
            <div className="pdf-text-page-label">Página {page.page}</div>

            {page.status === 'loading' ? (
              <div className="pdf-hybrid-skeleton">
                <div className="skeleton-line w-60" />
                <div className="skeleton-line w-90" />
                <div className="skeleton-line w-80" />
                <div className="skeleton-line w-70" />
                <div className="skeleton-line w-85" />
              </div>
            ) : null}

            {page.status === 'error' ? (
              <div className="pdf-hybrid-page-error">
                <span>{page.error}</span>
                <button type="button" onClick={() => onOpenOriginal?.(page.page)}>
                  Ver página original
                </button>
              </div>
            ) : null}

            {page.status === 'ready' && page.blocks.length === 0 ? (
              <p className="pdf-text-empty-page">Esta página no contiene contenido extraíble.</p>
            ) : null}

            {page.status === 'ready' ? page.blocks.map(renderBlock) : null}
          </section>
        ))}

        {!loadingDocument && maxRequestedPage < totalPages ? (
          <div className="pdf-hybrid-load-more">
            <button
              type="button"
              onClick={() => setMaxRequestedPage((current) => Math.min(totalPages, current + PAGE_BATCH_SIZE))}
            >
              Cargar más páginas
            </button>
            <span>
              Página {currentPage} de {totalPages} · procesadas hasta {maxRequestedPage}
            </span>
          </div>
        ) : null}

        {!loadingDocument && sortedPages.length > 0 && maxRequestedPage >= totalPages ? (
          <div className="pdf-text-end">Fin del documento · página {currentPage} de {totalPages}</div>
        ) : null}
      </div>

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
