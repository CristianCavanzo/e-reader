import { ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import type { Book, Theme, TocItem } from './db';
import { ReaderPanel, ReaderSidebar } from './ReaderSidebar';
import type { PdfReaderBlock } from './pdfHybrid/pdfCoordinates';

interface Props {
  book: Book;
  theme: Theme;
  progress: number;
  readingTimeRemaining?: string;
  sidebarOpen: boolean;
  setSidebarOpen: (open: boolean) => void;
  activePanel: ReaderPanel;
  setActivePanel: (panel: ReaderPanel) => void;
  tocItems: TocItem[];
  activeTocItem?: TocItem;
  activeTocItemId?: string;
  currentPage: number;
  smartBlocksByPage: Record<number, PdfReaderBlock[]>;
  currentLabel?: string;
  currentIndex?: number;
  totalItems?: number;
  onBack: () => void;
  onTocSelect: (item: TocItem) => void;
  onPageSelect: (page: number, blockId?: string) => void;
  onToggleBookmark: () => void;
  onDecreaseFont: () => void;
  onIncreaseFont: () => void;
  settings: ReactNode;
  showSettings: boolean;
  setShowSettings: (show: boolean) => void;
  children: ReactNode;
}

export function ReaderShell({
  book,
  theme,
  progress,
  readingTimeRemaining,
  sidebarOpen,
  setSidebarOpen,
  activePanel,
  setActivePanel,
  tocItems,
  activeTocItem,
  activeTocItemId,
  currentPage,
  smartBlocksByPage,
  currentLabel,
  currentIndex,
  totalItems,
  onBack,
  onTocSelect,
  onPageSelect,
  onToggleBookmark,
  onDecreaseFont,
  onIncreaseFont,
  settings,
  showSettings,
  setShowSettings,
  children,
}: Props) {
  const shellRef = useRef<HTMLDivElement>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showChrome, setShowChrome] = useState(true);
  const hideTimerRef = useRef<number | null>(null);

  const locationText = useMemo(() => {
    if (currentLabel) {
      return `${currentLabel}${currentIndex && totalItems ? ` · ${currentIndex} de ${totalItems}` : ''}`;
    }
    return book.format === 'pdf' ? `Página ${currentPage}` : 'Leyendo';
  }, [book.format, currentIndex, currentLabel, currentPage, totalItems]);

  const clearHideTimer = () => {
    if (hideTimerRef.current) {
      window.clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }
  };

  const scheduleChromeHide = () => {
    clearHideTimer();
    if (!focusMode) {
      setShowChrome(true);
      return;
    }
    hideTimerRef.current = window.setTimeout(() => {
      setShowChrome(false);
    }, 1800);
  };

  const revealChrome = () => {
    setShowChrome(true);
    scheduleChromeHide();
  };

  useEffect(() => {
    if (!focusMode) {
      clearHideTimer();
      setShowChrome(true);
      return;
    }
    scheduleChromeHide();
    return clearHideTimer;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focusMode]);

  useEffect(() => {
    const onFsChange = () => {
      const shell = shellRef.current;
      setIsFullscreen(!!shell && document.fullscreenElement === shell);
    };

    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const focusSearch = () => {
    setSidebarOpen(true);
    setActivePanel('search');
    window.setTimeout(() => {
      document.getElementById('reader-sidebar-search')?.focus();
    }, 60);
  };

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const isEditable =
        target?.tagName === 'INPUT' ||
        target?.tagName === 'TEXTAREA' ||
        target?.isContentEditable;

      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'f') {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (isEditable) return;

      if (e.key === '/') {
        e.preventDefault();
        focusSearch();
        return;
      }

      if (e.key.toLowerCase() === 'f') {
        e.preventDefault();
        void toggleFullscreen();
      }
      if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        setFocusMode((prev) => !prev);
      }
      if (e.key.toLowerCase() === 'n' || e.key.toLowerCase() === 'h') {
        e.preventDefault();
        setSidebarOpen(true);
        setActivePanel('notes');
      }
      if (e.key.toLowerCase() === 'b') {
        e.preventDefault();
        onToggleBookmark();
      }
      if (e.key === '[') {
        e.preventDefault();
        onDecreaseFont();
      }
      if (e.key === ']') {
        e.preventDefault();
        onIncreaseFont();
      }
      if (e.key === 'Escape') {
        setFocusMode(false);
        setShowSettings(false);
        setSidebarOpen(false);
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    onDecreaseFont,
    onIncreaseFont,
    onToggleBookmark,
    setActivePanel,
    setShowSettings,
    setSidebarOpen,
  ]);

  const toggleFullscreen = async () => {
    const shell = shellRef.current;
    if (!shell) return;

    try {
      if (document.fullscreenElement === shell) {
        await document.exitFullscreen();
      } else if (!document.fullscreenElement) {
        await shell.requestFullscreen();
      }
    } catch (error) {
      console.warn('Fullscreen no disponible', error);
    }
  };

  return (
    <div
      ref={shellRef}
      className={`reader-page ${focusMode ? 'focus-mode' : ''} ${showChrome ? 'chrome-visible' : 'chrome-hidden'} ${sidebarOpen ? 'has-sidebar' : ''}`}
      data-reader-theme={theme}
      onMouseMove={revealChrome}
      onTouchStart={revealChrome}
    >
      <div className="reader-ambient-glow" aria-hidden="true" />

      <header className="reader-header chrome-layer">
        <div className="reader-left-actions">
          <button
            className="reader-icon-btn"
            onClick={() => setSidebarOpen(!sidebarOpen)}
            aria-label="Abrir tabla de contenidos"
            aria-expanded={sidebarOpen}
            type="button"
            title="Contenido"
          >
            ☰
          </button>
          <button className="reader-btn ghost" onClick={onBack} aria-label="Volver a biblioteca">
            ← Biblioteca
          </button>
        </div>

        <div className="reader-title">
          <span className="title">{book.title}</span>
          <span className="author">{book.author}</span>
          <span className="reader-location">{locationText}</span>
        </div>

        <div className="reader-actions">
          {readingTimeRemaining ? (
            <span className="reader-time-left">{readingTimeRemaining}</span>
          ) : null}
          <span className="reader-progress">{progress.toFixed(0)}%</span>
          <button
            className={`reader-icon-btn ${focusMode ? 'active' : ''}`}
            onClick={() => setFocusMode((prev) => !prev)}
            type="button"
            title="Modo enfoque (M)"
            aria-pressed={focusMode}
          >
            ◱
          </button>
          <button
            className={`reader-icon-btn ${isFullscreen ? 'active' : ''}`}
            onClick={toggleFullscreen}
            type="button"
            title="Pantalla completa (F)"
            aria-pressed={isFullscreen}
          >
            ⛶
          </button>
          <button
            className={`reader-icon-btn ${showSettings ? 'active' : ''}`}
            onClick={() => setShowSettings(!showSettings)}
            aria-label="Ajustes"
            aria-expanded={showSettings}
            type="button"
            title="Ajustes"
          >
            ⚙
          </button>
        </div>
      </header>

      {showSettings ? <div className="chrome-layer">{settings}</div> : null}

      <div className="reader-shell-body">
        <ReaderSidebar
          open={sidebarOpen}
          activePanel={activePanel}
          setActivePanel={setActivePanel}
          bookId={book.id}
          tocItems={tocItems}
          activeTocItem={activeTocItem}
          activeTocItemId={activeTocItemId}
          currentPage={currentPage}
          smartBlocksByPage={smartBlocksByPage}
          onTocSelect={onTocSelect}
          onPageSelect={onPageSelect}
          chromeVisible={showChrome || !focusMode}
        />
        <main className="reader-content">{children}</main>
      </div>

      <div className="reader-bottom-progress chrome-layer" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>

      {focusMode ? (
        <button
          className={`focus-pill ${showChrome ? 'visible' : ''}`}
          type="button"
          onClick={() => setFocusMode(false)}
          title="Salir de modo enfoque"
        >
          Modo enfoque · mueve el mouse para mostrar controles
        </button>
      ) : null}
    </div>
  );
}
