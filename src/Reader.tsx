import { CSSProperties, useCallback, useMemo, useRef, useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { db, Book, Theme, TocItem, uuid } from './db';
import { EpubReader } from './EpubReader';
import { PdfReader } from './PdfReader';
import { PdfTextReader } from './PdfTextReader';
import { PdfHybridReader } from './PdfHybridReader';
import type { PdfReaderBlock, PdfSourceRect } from './pdfHybrid/pdfCoordinates';
import { ReaderShell } from './ReaderShell';
import type { ReaderPanel } from './ReaderSidebar';
import { ReaderSettingsPanel } from './components/ReaderSettingsPanel';
import { ReviewMode } from './components/ReviewMode';
import { SpeedReadingMode } from './components/SpeedReadingMode';
import { ExportKnowledgeModal } from './components/ExportKnowledgeModal';
import { FlashcardReviewPanel } from './components/FlashcardReviewPanel';
import { SkeletonReader } from './components/Skeletons';
import { useToast } from './components/ToastProvider';
import { usePersistentSetting } from './hooks/usePersistentSetting';

interface Props {
  theme: Theme;
  setTheme: (t: Theme) => void;
}

function parsePdfPage(position?: string) {
  if (!position) return 1;
  const page = parseInt(position, 10);
  return Number.isFinite(page) && page > 0 ? page : 1;
}

function parsePdfBlockId(position?: string) {
  if (!position?.includes(':')) return undefined;
  return position.split(':').slice(1).join(':') || undefined;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

export function ReaderPage({ theme, setTheme }: Props) {
  const { bookId } = useParams<{ bookId: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [book, setBook] = useState<Book | null>(null);
  const [fileBlob, setFileBlob] = useState<Blob | null>(null);
  const [initialPosition, setInitialPosition] = useState<string | undefined>(undefined);
  const [fontSize, setFontSize] = usePersistentSetting<number>('fontSize', 18);
  const [fontFamily, setFontFamily] = usePersistentSetting<string>('fontFamily', 'system');
  const [lineHeight, setLineHeight] = usePersistentSetting<number>('lineHeight', 1.8);
  const [columnWidth, setColumnWidth] = usePersistentSetting<string>('columnWidth', 'medium');
  const [showSettings, setShowSettings] = useState(false);
  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [tocItems, setTocItems] = useState<TocItem[]>([]);
  const [activeTocItem, setActiveTocItem] = useState<TocItem | undefined>(undefined);
  const [goToTocItem, setGoToTocItem] = useState<TocItem | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activePanel, setActivePanel] = useState<ReaderPanel>('contents');
  const [pdfReadingMode, setPdfReadingMode] = usePersistentSetting<'page' | 'text' | 'smart'>('pdfDefaultMode', 'smart');
  const [pdfOriginalFocus, setPdfOriginalFocus] = useState<{ page: number; rect?: PdfSourceRect; token: number } | null>(null);
  const [showReturnToSmart, setShowReturnToSmart] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [smartBlocksByPage, setSmartBlocksByPage] = useState<Record<number, PdfReaderBlock[]>>({});
  const [smartJumpTarget, setSmartJumpTarget] = useState<{ page: number; blockId?: string; token: number } | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [speedMode, setSpeedMode] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [showFlashcards, setShowFlashcards] = useState(false);
  const currentPageRef = useRef(1);
  const sessionStartRef = useRef(Date.now());
  const sessionStartPageRef = useRef(1);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    if (!bookId) {
      navigate('/');
      return;
    }

    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        const [b, file, prog, storedToc] = await Promise.all([
          db.books.get(bookId),
          db.files.get(bookId),
          db.progress.get(bookId),
          db.tocItems.where('bookId').equals(bookId).sortBy('order'),
        ]);

        if (cancelled) return;

        if (!b) {
          setLoadError('No se encontró el libro en la base local.');
          return;
        }

        if (!file) {
          setLoadError('Archivo no encontrado en el almacenamiento local.');
          return;
        }

        await db.books.update(bookId, { lastOpenedAt: Date.now(), status: b.status === 'finished' ? 'finished' : 'reading' });
        const initialPage = parsePdfPage(prog?.position);

        setBook({ ...b, status: b.status || 'reading', tags: b.tags || [], collectionIds: b.collectionIds || [] });
        setFileBlob(file.data);
        setInitialPosition(prog?.position);
        setCurrentPage(initialPage);
        currentPageRef.current = initialPage;
        sessionStartPageRef.current = initialPage;
        sessionStartRef.current = Date.now();
        setProgress(prog?.percentage || 0);
        setTocItems(storedToc);
      } catch (error: any) {
        if (!cancelled) setLoadError(error?.message || 'No se pudo cargar el libro.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [bookId, navigate]);

  useEffect(() => {
    if (!bookId || loading) return;

    sessionStartRef.current = Date.now();
    sessionStartPageRef.current = currentPageRef.current;

    return () => {
      const elapsedMs = Date.now() - sessionStartRef.current;
      const minutesRead = Math.floor(elapsedMs / 60000);
      if (minutesRead <= 0) return;

      const pagesRead = Math.max(0, currentPageRef.current - sessionStartPageRef.current);
      const date = todayKey();
      const id = `${bookId}-${date}`;

      void db.transaction('rw', db.readingStats, async () => {
        const existing = await db.readingStats.get(id);
        await db.readingStats.put({
          id,
          bookId,
          date,
          minutesRead: (existing?.minutesRead || 0) + minutesRead,
          pagesRead: (existing?.pagesRead || 0) + pagesRead,
          sessionsCount: (existing?.sessionsCount || 0) + 1,
        });
      });
    };
  }, [bookId, loading]);

  const initialPdfPage = useMemo(() => parsePdfPage(initialPosition), [initialPosition]);
  const initialPdfBlockId = useMemo(() => parsePdfBlockId(initialPosition), [initialPosition]);

  const activeIndex = useMemo(() => {
    if (!activeTocItem) return undefined;
    const index = tocItems.findIndex((item) => item.id === activeTocItem.id);
    return index >= 0 ? index + 1 : undefined;
  }, [activeTocItem, tocItems]);

  const speedReadingText = useMemo(() => {
    return Object.values(smartBlocksByPage)
      .flat()
      .filter((block) => block.text && !block.type.includes('snapshot'))
      .map((block) => block.text)
      .join('\n\n');
  }, [smartBlocksByPage]);

  const readingTimeRemaining = useMemo(() => {
    const pages = Object.keys(smartBlocksByPage);
    const loadedWords = speedReadingText.trim().split(/\s+/).filter(Boolean).length;

    if (loadedWords < 80 || progress <= 0 || pages.length === 0) return undefined;

    const estimatedTotalPages = currentPage / Math.max(progress / 100, 0.01);
    const estimatedTotalWords = loadedWords / Math.max(pages.length / estimatedTotalPages, 0.01);
    const remainingWords = Math.max(0, estimatedTotalWords * (1 - progress / 100));
    const minutes = Math.max(1, Math.ceil(remainingWords / 250));

    return `~${minutes} min restantes`;
  }, [currentPage, progress, smartBlocksByPage, speedReadingText]);

  const persistTocItems = useCallback(async (items: TocItem[]) => {
    if (!bookId || items.length === 0) return;

    setTocItems((currentItems) => {
      const currentSignature = currentItems.map((item) => `${item.id}:${item.page || item.href || ''}`).join('|');
      const nextSignature = items.map((item) => `${item.id}:${item.page || item.href || ''}`).join('|');
      return currentSignature === nextSignature ? currentItems : items;
    });

    const existing = await db.tocItems.where('bookId').equals(bookId).toArray();
    const existingSignature = existing.map((item) => `${item.id}:${item.page || item.href || ''}`).join('|');
    const nextSignature = items.map((item) => `${item.id}:${item.page || item.href || ''}`).join('|');
    if (existingSignature === nextSignature) return;

    await db.transaction('rw', db.tocItems, async () => {
      await db.tocItems.where('bookId').equals(bookId).delete();
      await db.tocItems.bulkPut(items);
    });
  }, [bookId]);

  const persistSession = useCallback(async (item?: TocItem) => {
    if (!bookId || !item) return;
    await db.readingSessions.put({
      bookId,
      currentLabel: item.label,
      currentIndex: tocItems.findIndex((tocItem) => tocItem.id === item.id) + 1,
      totalItems: tocItems.length,
      updatedAt: Date.now(),
    });
  }, [bookId, tocItems]);

  const handleTocItemChange = useCallback((item?: TocItem) => {
    if (!item) return;
    setActiveTocItem((current) => (current?.id === item.id ? current : item));
    void persistSession(item);
  }, [persistSession]);

  const handleProgressChange = useCallback(async (position: string, percentage: number) => {
    if (!bookId) return;
    setProgress((current) => (Math.abs(current - percentage) < 0.25 ? current : percentage));
    await db.progress.put({ bookId, position, percentage, updatedAt: Date.now() });
  }, [bookId]);

  const handleTocSelect = useCallback((item: TocItem) => {
    setReviewMode(false);
    setSpeedMode(false);
    setActiveTocItem(item);
    setGoToTocItem(item);
    if (item.page) setCurrentPage(item.page);
  }, []);

  const handlePdfPageChange = useCallback((page: number, total: number) => {
    const pct = total > 0 ? (page / total) * 100 : 0;
    setCurrentPage(page);
    void handleProgressChange(String(page), pct);
  }, [handleProgressChange]);

  const handleOpenOriginalFromSmart = useCallback((page: number, rect?: PdfSourceRect) => {
    setPdfOriginalFocus({ page, rect, token: Date.now() });
    setCurrentPage(page);
    setShowReturnToSmart(true);
    setPdfReadingMode('page');
  }, [setPdfReadingMode]);

  const handleSmartBlocksReady = useCallback((page: number, blocks: PdfReaderBlock[]) => {
    setSmartBlocksByPage((current) => {
      const currentSignature = (current[page] || []).map((block) => block.id).join('|');
      const nextSignature = blocks.map((block) => block.id).join('|');
      if (currentSignature === nextSignature) return current;
      return { ...current, [page]: blocks };
    });
  }, []);

  const handleSidebarPageSelect = useCallback((page: number, blockId?: string) => {
    setReviewMode(false);
    setSpeedMode(false);
    setPdfReadingMode('smart');
    setShowReturnToSmart(false);
    setCurrentPage(page);
    setSmartJumpTarget({ page, blockId, token: Date.now() });
  }, [setPdfReadingMode]);

  const handleToggleBookmark = useCallback(async () => {
    if (!bookId) return;
    const existing = (await db.bookmarks.where('bookId').equals(bookId).toArray())
      .find((bookmark) => bookmark.page === currentPageRef.current);

    if (existing) {
      await db.bookmarks.delete(existing.id);
      toast('Bookmark eliminado', 'info');
      return;
    }

    await db.bookmarks.add({
      id: uuid(),
      bookId,
      page: currentPageRef.current,
      label: activeTocItem?.label || `Página ${currentPageRef.current}`,
      createdAt: Date.now(),
    });
    toast('Bookmark añadido', 'success');
  }, [activeTocItem?.label, bookId, toast]);

  const decreaseFont = useCallback(() => {
    setFontSize((value) => Math.max(12, value - 1));
  }, [setFontSize]);

  const increaseFont = useCallback(() => {
    setFontSize((value) => Math.min(32, value + 1));
  }, [setFontSize]);

  const readerStyle = useMemo(() => ({
    fontFamily: fontFamily === 'system' ? undefined : fontFamily,
    lineHeight,
    '--reader-column-max': columnWidth === 'narrow' ? '680px' : columnWidth === 'wide' ? '1040px' : columnWidth === 'full' ? '100%' : '840px',
  } as CSSProperties), [columnWidth, fontFamily, lineHeight]);

  const openSpeedReading = () => {
    if (!speedReadingText.trim()) {
      if (book?.format === 'pdf') setPdfReadingMode('smart');
      toast('Carga Smart Reader primero para usar lectura rápida', 'info');
      return;
    }
    setReviewMode(false);
    setSpeedMode(true);
  };

  if (loading || !bookId) return <div className="reader-loading"><SkeletonReader /></div>;

  if (loadError || !book || !fileBlob) {
    return (
      <div className="reader-error standalone-error">
        <h2>No se pudo abrir el libro</h2>
        <p>{loadError || 'Error desconocido'}</p>
        <button type="button" className="reader-btn" onClick={() => navigate('/')}>Volver a biblioteca</button>
      </div>
    );
  }

  const settings = (
    <ReaderSettingsPanel
      bookFormat={book.format}
      theme={theme}
      onThemeChange={setTheme}
      fontSize={fontSize}
      onFontSizeChange={setFontSize}
      fontFamily={fontFamily}
      onFontFamilyChange={setFontFamily}
      lineHeight={lineHeight}
      onLineHeightChange={setLineHeight}
      columnWidth={columnWidth}
      onColumnWidthChange={setColumnWidth}
      pdfReadingMode={pdfReadingMode}
      onPdfReadingModeChange={setPdfReadingMode}
      onOpenReview={() => { setSpeedMode(false); setReviewMode(true); setShowSettings(false); }}
      onOpenFlashcards={() => setShowFlashcards(true)}
      onOpenExport={() => setShowExport(true)}
      onOpenSpeedReading={openSpeedReading}
      speedReadingDisabled={book.format === 'epub' && !speedReadingText.trim()}
    />
  );

  const readerContent = reviewMode ? (
    <ReviewMode bookId={bookId} tocItems={tocItems} onSelect={handleSidebarPageSelect} onClose={() => setReviewMode(false)} />
  ) : speedMode ? (
    <SpeedReadingMode text={speedReadingText} onClose={() => setSpeedMode(false)} />
  ) : book.format === 'epub' ? (
    <EpubReader
      bookId={bookId}
      fileBlob={fileBlob}
      initialCfi={initialPosition}
      fontSize={fontSize}
      fontFamily={fontFamily}
      lineHeight={lineHeight}
      theme={theme}
      tocItems={tocItems}
      goToTocItem={goToTocItem}
      onTocReady={persistTocItems}
      onTocItemChange={handleTocItemChange}
      onLocationChange={handleProgressChange}
    />
  ) : pdfReadingMode === 'text' ? (
    <PdfTextReader
      bookId={bookId}
      fileBlob={fileBlob}
      initialPage={initialPdfPage}
      fontSize={fontSize}
      theme={theme}
      goToTocItem={goToTocItem}
      onTocReady={persistTocItems}
      onTocItemChange={handleTocItemChange}
      onPageChange={handlePdfPageChange}
    />
  ) : pdfReadingMode === 'smart' ? (
    <PdfHybridReader
      bookId={bookId}
      fileBlob={fileBlob}
      initialPage={initialPdfPage}
      initialBlockId={initialPdfBlockId}
      fontSize={fontSize}
      preferredLineHeight={lineHeight}
      theme={theme}
      goToTocItem={goToTocItem}
      goToBlockTarget={smartJumpTarget}
      onTocReady={persistTocItems}
      onTocItemChange={handleTocItemChange}
      onPageChange={handlePdfPageChange}
      onBlocksReady={handleSmartBlocksReady}
      onOpenOriginal={handleOpenOriginalFromSmart}
    />
  ) : (
    <div className="pdf-original-host">
      {showReturnToSmart ? (
        <button className="pdf-return-smart" type="button" onClick={() => { setShowReturnToSmart(false); setPdfReadingMode('smart'); }}>
          ← Volver a Smart Reader
        </button>
      ) : null}
      <PdfReader
        bookId={bookId}
        fileBlob={fileBlob}
        initialPage={initialPdfPage}
        goToTocItem={goToTocItem}
        onTocReady={persistTocItems}
        onTocItemChange={handleTocItemChange}
        onPageChange={handlePdfPageChange}
        focusPage={pdfOriginalFocus?.page}
        focusRect={pdfOriginalFocus?.rect}
        focusToken={pdfOriginalFocus?.token}
      />
    </div>
  );

  return (
    <>
      <ReaderShell
        book={book}
        theme={theme}
        progress={progress}
        readingTimeRemaining={readingTimeRemaining}
        sidebarOpen={sidebarOpen}
        setSidebarOpen={setSidebarOpen}
        activePanel={activePanel}
        setActivePanel={setActivePanel}
        tocItems={tocItems}
        activeTocItem={activeTocItem}
        activeTocItemId={activeTocItem?.id}
        currentPage={currentPage}
        smartBlocksByPage={smartBlocksByPage}
        currentLabel={activeTocItem?.label}
        currentIndex={activeIndex}
        totalItems={tocItems.length || undefined}
        onBack={() => navigate('/')}
        onTocSelect={handleTocSelect}
        onPageSelect={handleSidebarPageSelect}
        onToggleBookmark={handleToggleBookmark}
        onDecreaseFont={decreaseFont}
        onIncreaseFont={increaseFont}
        settings={settings}
        showSettings={showSettings}
        setShowSettings={setShowSettings}
      >
        <div className={`reader-typography column-${columnWidth}`} style={readerStyle}>{readerContent}</div>
      </ReaderShell>

      {showExport ? <ExportKnowledgeModal bookId={bookId} bookTitle={book.title} onClose={() => setShowExport(false)} /> : null}
      {showFlashcards ? <FlashcardReviewPanel bookId={bookId} onClose={() => setShowFlashcards(false)} /> : null}
    </>
  );
}
