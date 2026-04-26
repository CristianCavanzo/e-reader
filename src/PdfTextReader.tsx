import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { pdfjsLib } from './lib/pdfWorker';
import type { Theme, TocItem } from './db';
import { flattenPdfOutline } from './pdfOutline';


interface Props {
  bookId: string;
  fileBlob: Blob;
  initialPage?: number;
  fontSize: number;
  theme: Theme;
  goToTocItem?: TocItem | null;
  onTocReady?: (items: TocItem[]) => void;
  onTocItemChange?: (item?: TocItem) => void;
  onPageChange?: (page: number, total: number) => void;
}

interface PdfTextPage {
  page: number;
  paragraphs: string[];
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, ' ').trim();
}

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

function buildParagraphsFromTextContent(textContent: any): string[] {
  const rawItems = (textContent?.items || [])
    .map((item: any) => ({
      text: String(item.str || ''),
      x: Number(item.transform?.[4] || 0),
      y: Number(item.transform?.[5] || 0),
      height: Math.abs(Number(item.transform?.[3] || item.height || 10)),
    }))
    .filter((item: any) => item.text.trim().length > 0);

  if (rawItems.length === 0) return [];

  const sorted = [...rawItems].sort((a, b) => {
    if (Math.abs(b.y - a.y) > 3) return b.y - a.y;
    return a.x - b.x;
  });

  const lines: Array<{ y: number; text: string; x: number; height: number }> = [];

  for (const item of sorted) {
    const current = lines[lines.length - 1];
    if (current && Math.abs(current.y - item.y) <= Math.max(2.5, item.height * 0.35)) {
      const needsSpace = current.text.length > 0 && !/[\s\-/]$/.test(current.text) && !/^[,.;:!?)]/.test(item.text);
      current.text += `${needsSpace ? ' ' : ''}${item.text}`;
      current.x = Math.min(current.x, item.x);
      current.height = Math.max(current.height, item.height);
    } else {
      lines.push({ y: item.y, x: item.x, text: item.text, height: item.height });
    }
  }

  const paragraphs: string[] = [];
  let paragraph = '';
  let previousLine: (typeof lines)[number] | null = null;

  for (const line of lines) {
    const text = normalizeSpaces(line.text);
    if (!text) continue;

    const verticalGap = previousLine ? Math.abs(previousLine.y - line.y) : 0;
    const indentJump = previousLine ? line.x - previousLine.x : 0;
    const startsNewParagraph =
      !previousLine ||
      verticalGap > Math.max(previousLine.height * 1.75, 14) ||
      indentJump > 24 ||
      /^((chapter|appendix)\b|\d+(\.\d+)*\s+)/i.test(text);

    if (startsNewParagraph && paragraph) {
      paragraphs.push(paragraph.trim());
      paragraph = text;
    } else if (!paragraph) {
      paragraph = text;
    } else if (paragraph.endsWith('-')) {
      paragraph = `${paragraph.slice(0, -1)}${text}`;
    } else {
      paragraph = `${paragraph} ${text}`;
    }

    previousLine = line;
  }

  if (paragraph.trim()) paragraphs.push(paragraph.trim());

  return paragraphs.filter((p) => p.length > 0);
}

export function PdfTextReader({
  bookId,
  fileBlob,
  initialPage = 1,
  fontSize,
  theme,
  goToTocItem,
  onTocReady,
  onTocItemChange,
  onPageChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Record<number, HTMLElement | null>>({});
  const tocItemsRef = useRef<TocItem[]>([]);
  const onPageChangeRef = useRef(onPageChange);
  const onTocItemChangeRef = useRef(onTocItemChange);
  const onTocReadyRef = useRef(onTocReady);
  const lastJumpRef = useRef<string | undefined>(undefined);
  const [pages, setPages] = useState<PdfTextPage[]>([]);
  const [totalPages, setTotalPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
    let cancelled = false;
    setLoading(true);
    setError(null);
    setPages([]);

    const load = async () => {
      try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }

        setTotalPages(pdf.numPages);
        const outlineItems = await flattenPdfOutline(bookId, pdf);
        if (!cancelled) {
          tocItemsRef.current = outlineItems;
          onTocReadyRef.current?.(outlineItems);
        }

        const extractedPages: PdfTextPage[] = [];
        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          if (cancelled) break;
          const page = await pdf.getPage(pageNumber);
          const textContent = await page.getTextContent();
          extractedPages.push({
            page: pageNumber,
            paragraphs: buildParagraphsFromTextContent(textContent),
          });
          // Mostrar avance sin esperar a que termine todo el libro.
          if (!cancelled && (pageNumber === 1 || pageNumber % 8 === 0)) {
            setPages([...extractedPages]);
          }
        }

        if (!cancelled) {
          setPages(extractedPages);
          setLoading(false);
          window.setTimeout(() => {
            pageRefs.current[initialPage]?.scrollIntoView({ block: 'start' });
          }, 80);
        }

        await pdf.destroy();
      } catch (e: any) {
        console.error('PDF text extraction error:', e);
        if (!cancelled) {
          setError(e?.message || 'No se pudo extraer el texto del PDF');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
    };
  }, [bookId, fileBlob, initialPage]);

  useEffect(() => {
    const root = containerRef.current;
    if (!root || pages.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];

        if (!visible) return;
        const nextPage = Number((visible.target as HTMLElement).dataset.page || 1);
        setCurrentPage(nextPage);
        onPageChangeRef.current?.(nextPage, totalPages || pages.length);

        const currentSection = [...tocItemsRef.current]
          .filter((item) => item.page && item.page <= nextPage)
          .sort((a, b) => (b.page || 0) - (a.page || 0))[0];
        onTocItemChangeRef.current?.(currentSection);
      },
      { root, threshold: [0.25, 0.5, 0.75] }
    );

    Object.values(pageRefs.current).forEach((element) => {
      if (element) observer.observe(element);
    });

    return () => observer.disconnect();
  }, [pages, totalPages]);

  useEffect(() => {
    if (!goToTocItem?.page) return;
    const target = `${goToTocItem.id}-${goToTocItem.page}`;
    if (lastJumpRef.current === target) return;
    lastJumpRef.current = target;
    pageRefs.current[goToTocItem.page]?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [goToTocItem]);

  const lineHeight = useMemo(() => Math.max(1.55, Math.min(1.9, 1.82 - (fontSize - 18) * 0.01)), [fontSize]);

  if (error) {
    return (
      <div className="reader-error">
        <p>Error al extraer texto:</p>
        <p>{error}</p>
      </div>
    );
  }

  return (
    <div className="pdf-text-reader" data-reader-theme={theme} ref={containerRef}>
      <div className="pdf-text-reader-inner" style={{ fontSize: `${fontSize}px`, lineHeight }}>
        <div className="pdf-text-mode-note">
          <strong>Modo lectura de PDF</strong>
          <span>
            Texto extraído del PDF. Sirve para leer con fuente configurable; algunas tablas, columnas o bloques de código pueden perder formato.
          </span>
        </div>

        {pages.map((page) => (
          <section
            key={page.page}
            ref={(node) => {
              pageRefs.current[page.page] = node;
            }}
            data-page={page.page}
            className="pdf-text-page"
          >
            <div className="pdf-text-page-label">Página {page.page}</div>
            {page.paragraphs.length > 0 ? (
              page.paragraphs.map((paragraph, index) => (
                <p key={`${page.page}-${index}`}>{linkify(paragraph)}</p>
              ))
            ) : (
              <p className="pdf-text-empty-page">Esta página no contiene texto extraíble.</p>
            )}
          </section>
        ))}

        {loading ? (
          <div className="pdf-text-loading">
            Extrayendo texto… {pages.length > 0 && totalPages > 0 ? `${pages.length}/${totalPages}` : ''}
          </div>
        ) : null}

        {!loading && pages.length > 0 ? (
          <div className="pdf-text-end">Fin del documento · página {currentPage} de {totalPages}</div>
        ) : null}
      </div>
    </div>
  );
}
