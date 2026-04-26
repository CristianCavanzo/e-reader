import { useEffect, useRef, useState } from 'react';
import { pdfjsLib } from './lib/pdfWorker';
import type { TocItem } from './db';
import type { PdfSourceRect } from './pdfHybrid/pdfCoordinates';
import { flattenPdfOutline } from './pdfOutline';


interface Props {
  bookId: string;
  fileBlob: Blob;
  initialPage?: number;
  goToTocItem?: TocItem | null;
  onTocReady?: (items: TocItem[]) => void;
  onTocItemChange?: (item?: TocItem) => void;
  onPageChange?: (page: number, total: number) => void;
  focusPage?: number | null;
  focusRect?: PdfSourceRect | null;
  focusToken?: number;
}

export function PdfReader({
  bookId,
  fileBlob,
  initialPage = 1,
  goToTocItem,
  onTocReady,
  onTocItemChange,
  onPageChange,
  focusPage,
  focusRect,
  focusToken,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const pageStageRef = useRef<HTMLDivElement>(null);
  const textLayerRef = useRef<HTMLDivElement>(null);
  const linkLayerRef = useRef<HTMLDivElement>(null);
  const docRef = useRef<pdfjsLib.PDFDocumentProxy | null>(null);
  const renderTaskRef = useRef<any>(null);
  const lastTocJumpRef = useRef<string | undefined>(undefined);
  const tocItemsRef = useRef<TocItem[]>([]);
  const onPageChangeRef = useRef(onPageChange);
  const onTocItemChangeRef = useRef(onTocItemChange);
  const onTocReadyRef = useRef(onTocReady);
  const [page, setPage] = useState(initialPage);
  const [totalPages, setTotalPages] = useState(0);
  const [scale, setScale] = useState(1.35);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [turnDirection, setTurnDirection] = useState<'next' | 'prev' | null>(null);
  const [activeFocusRect, setActiveFocusRect] = useState<PdfSourceRect | null>(null);

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

    const load = async () => {
      try {
        const arrayBuffer = await fileBlob.arrayBuffer();
        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        if (cancelled) {
          pdf.destroy();
          return;
        }

        docRef.current = pdf;
        setTotalPages(pdf.numPages);
        setPage((p) => Math.min(Math.max(p || initialPage, 1), pdf.numPages));

        const outlineItems = await flattenPdfOutline(bookId, pdf);
        if (!cancelled) {
          tocItemsRef.current = outlineItems;
          onTocReadyRef.current?.(outlineItems);
        }

        setLoading(false);
      } catch (e: any) {
        console.error('PDF error:', e);
        if (!cancelled) {
          setError(e?.message || 'No se pudo abrir el PDF');
          setLoading(false);
        }
      }
    };

    load();

    return () => {
      cancelled = true;
      try {
        renderTaskRef.current?.cancel();
      } catch {}
      try {
        docRef.current?.destroy();
      } catch {}
      docRef.current = null;
    };
  }, [bookId, fileBlob, initialPage]);


  useEffect(() => {
    if (!focusPage) return;
    setTurnDirection(focusPage >= page ? 'next' : 'prev');
    setPage((currentPage) => {
      const nextPage = Math.max(1, Math.min(totalPages || focusPage, focusPage));
      return currentPage === nextPage ? currentPage : nextPage;
    });
    if (focusRect) {
      setActiveFocusRect(focusRect);
      window.setTimeout(() => setActiveFocusRect(null), 2200);
    }
  }, [focusPage, focusRect, focusToken, page, totalPages]);

  useEffect(() => {
    if (!goToTocItem?.page) return;
    const target = `${goToTocItem.id}-${goToTocItem.page}`;
    if (lastTocJumpRef.current === target) return;
    lastTocJumpRef.current = target;
    setTurnDirection(goToTocItem.page >= page ? 'next' : 'prev');
    setPage((currentPage) => {
      const nextPage = Math.max(1, Math.min(totalPages || goToTocItem.page!, goToTocItem.page!));
      return currentPage === nextPage ? currentPage : nextPage;
    });
  }, [goToTocItem, page, totalPages]);

  const triggerTurn = (direction: 'next' | 'prev') => {
    setTurnDirection(direction);
    window.setTimeout(() => setTurnDirection(null), 420);
  };

  const renderFallbackTextLayer = (viewport: any, textContent: any) => {
    const textLayer = textLayerRef.current;
    if (!textLayer) return;
    textLayer.innerHTML = '';

    const items = textContent?.items || [];
    for (const item of items) {
      if (!item?.str) continue;
      const tx = (pdfjsLib as any).Util.transform(viewport.transform, item.transform);
      const angle = Math.atan2(tx[1], tx[0]);
      const fontHeight = Math.sqrt(tx[2] * tx[2] + tx[3] * tx[3]);

      const span = document.createElement('span');
      span.textContent = item.str;
      span.style.position = 'absolute';
      span.style.left = `${tx[4]}px`;
      span.style.top = `${tx[5] - fontHeight}px`;
      span.style.fontSize = `${fontHeight}px`;
      span.style.fontFamily = item.fontName || 'sans-serif';
      span.style.transform = `rotate(${angle}rad)`;
      span.style.transformOrigin = '0% 0%';
      span.style.whiteSpace = 'pre';
      span.style.color = 'transparent';
      span.style.userSelect = 'text';
      textLayer.appendChild(span);
    }
  };

  const renderLinkLayer = async (pdfPage: any, viewport: any) => {
    const linkLayer = linkLayerRef.current;
    const pdf = docRef.current;
    if (!linkLayer || !pdf) return;

    linkLayer.innerHTML = '';
    const annotations = await pdfPage.getAnnotations();

    for (const annotation of annotations) {
      if (annotation.subtype !== 'Link') continue;

      const rect = viewport.convertToViewportRectangle(annotation.rect);
      const left = Math.min(rect[0], rect[2]);
      const top = Math.min(rect[1], rect[3]);
      const width = Math.abs(rect[0] - rect[2]);
      const height = Math.abs(rect[1] - rect[3]);

      const anchor = document.createElement('a');
      anchor.className = 'pdf-link-hotspot';
      anchor.style.left = `${left}px`;
      anchor.style.top = `${top}px`;
      anchor.style.width = `${width}px`;
      anchor.style.height = `${height}px`;

      const url = annotation.url || annotation.unsafeUrl;
      if (url) {
        anchor.href = url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        anchor.title = url;
      } else if (annotation.dest) {
        anchor.href = '#';
        anchor.title = 'Ir al destino enlazado';
        anchor.addEventListener('click', async (event) => {
          event.preventDefault();
          try {
            const destination = Array.isArray(annotation.dest)
              ? annotation.dest
              : await pdf.getDestination(annotation.dest);
            if (!destination) return;
            const ref = destination[0];
            const pageIndex = await pdf.getPageIndex(ref);
            const nextPage = pageIndex + 1;
            triggerTurn(nextPage >= page ? 'next' : 'prev');
            setPage(nextPage);
          } catch (linkError) {
            console.warn('No se pudo resolver el destino del link del PDF', linkError);
          }
        });
      } else {
        continue;
      }

      linkLayer.appendChild(anchor);
    }
  };

  useEffect(() => {
    const doc = docRef.current;
    if (!doc || loading || !canvasRef.current || !pageStageRef.current) return;

    let cancelled = false;

    const render = async () => {
      try {
        renderTaskRef.current?.cancel();

        const pdfPage = await doc.getPage(page);
        if (cancelled) return;

        const viewport = pdfPage.getViewport({ scale });
        const canvas = canvasRef.current!;
        const pageStage = pageStageRef.current!;
        const textLayer = textLayerRef.current!;
        const linkLayer = linkLayerRef.current!;
        const context = canvas.getContext('2d')!;
        const outputScale = Math.min(Math.max(window.devicePixelRatio || 1, 2), 3);

        pageStage.style.width = `${viewport.width}px`;
        pageStage.style.height = `${viewport.height}px`;
        textLayer.style.width = `${viewport.width}px`;
        textLayer.style.height = `${viewport.height}px`;
        linkLayer.style.width = `${viewport.width}px`;
        linkLayer.style.height = `${viewport.height}px`;

        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : undefined;

        const task = pdfPage.render({
          canvasContext: context,
          viewport,
          canvas,
          transform,
        } as any);
        renderTaskRef.current = task;
        await task.promise;

        if (cancelled) return;

        const textContent = await pdfPage.getTextContent();
        textLayer.innerHTML = '';

        try {
          const textTask = (pdfjsLib as any).renderTextLayer({
            textContentSource: textContent,
            container: textLayer,
            viewport,
          });
          if (textTask?.promise) await textTask.promise;
          else if (textTask) await textTask;
        } catch (textError) {
          console.warn('renderTextLayer falló, usando fallback manual', textError);
          renderFallbackTextLayer(viewport, textContent);
        }

        await renderLinkLayer(pdfPage, viewport);

        if (!cancelled) {
          const currentSection = [...tocItemsRef.current]
            .filter((item) => item.page && item.page <= page)
            .sort((a, b) => (b.page || 0) - (a.page || 0))[0];
          onTocItemChangeRef.current?.(currentSection);
          onPageChangeRef.current?.(page, doc.numPages);
        }
      } catch (e: any) {
        if (e?.name !== 'RenderingCancelledException') {
          console.error('Render error:', e);
        }
      }
    };

    render();

    return () => {
      cancelled = true;
    };
  }, [page, scale, loading]);


  useEffect(() => {
    if (!activeFocusRect || !containerRef.current) return;
    const top = Math.max(0, activeFocusRect.y * scale - 140);
    window.requestAnimationFrame(() => {
      containerRef.current?.scrollTo({ top, behavior: 'smooth' });
    });
  }, [activeFocusRect, page, scale]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return;

      if (e.key === 'ArrowRight') goNext();
      if (e.key === 'ArrowLeft') goPrev();
      if (e.key === '+' || e.key === '=') setScale((s) => Math.min(s + 0.15, 3));
      if (e.key === '-') setScale((s) => Math.max(s - 0.15, 0.75));
      if (e.key === '0') setScale(1.35);
    };
    window.addEventListener('keyup', handler);
    return () => window.removeEventListener('keyup', handler);
  }, [page, totalPages]);

  const goNext = () => {
    if (page >= totalPages) return;
    triggerTurn('next');
    setPage((p) => Math.min(p + 1, totalPages || 1));
  };

  const goPrev = () => {
    if (page <= 1) return;
    triggerTurn('prev');
    setPage((p) => Math.max(p - 1, 1));
  };

  if (error) {
    return (
      <div className="reader-error">
        <p>Error al abrir el PDF:</p>
        <p>{error}</p>
        <p style={{ marginTop: '1rem', fontSize: '0.85rem', opacity: 0.7 }}>
          Si el PDF está protegido con contraseña o DRM, no podrá abrirse.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="reader-loading">Cargando PDF…</div>;
  }

  return (
    <div className="pdf-reader">
      <div className="pdf-container" ref={containerRef}>
        <div className={`pdf-page-stage ${turnDirection ? `turn-${turnDirection}` : ''}`} ref={pageStageRef}>
          <canvas ref={canvasRef} />
          <div ref={textLayerRef} className="pdf-text-layer" />
          <div ref={linkLayerRef} className="pdf-link-layer" />
          {activeFocusRect ? (
            <div
              className="pdf-focus-highlight"
              style={{
                left: `${activeFocusRect.x * scale}px`,
                top: `${activeFocusRect.y * scale}px`,
                width: `${activeFocusRect.width * scale}px`,
                height: `${activeFocusRect.height * scale}px`,
              }}
            />
          ) : null}
        </div>
      </div>
      <div className="pdf-toolbar">
        <button onClick={goPrev} disabled={page <= 1}>
          ‹ Anterior
        </button>
        <span>
          Página
          <input
            type="number"
            min={1}
            max={totalPages}
            value={page}
            onChange={(e) => {
              const value = Number(e.target.value);
              if (!Number.isNaN(value)) {
                setTurnDirection(value >= page ? 'next' : 'prev');
                setPage(Math.max(1, Math.min(totalPages, value)));
              }
            }}
          />
          / {totalPages}
        </span>
        <button onClick={goNext} disabled={page >= totalPages}>
          Siguiente ›
        </button>
        <span className="separator">|</span>
        <button onClick={() => setScale((s) => Math.max(s - 0.15, 0.75))}>−</button>
        <span style={{ minWidth: '3.5rem', textAlign: 'center' }}>{Math.round(scale * 100)}%</span>
        <button onClick={() => setScale((s) => Math.min(s + 0.15, 3))}>+</button>
        <button onClick={() => setScale(1.35)}>Fit</button>
      </div>
    </div>
  );
}
