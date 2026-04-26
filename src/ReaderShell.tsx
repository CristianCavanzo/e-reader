import { type PointerEvent, type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
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

type MiniPosition = { x: number; y: number };

type DragState = {
  active: boolean;
  moved: boolean;
  pointerId: number | null;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
};

function clampMiniPosition(next: MiniPosition): MiniPosition {
  const width = window.innerWidth || 1024;
  const height = window.innerHeight || 768;
  const handleWidth = 76;
  const handleHeight = 76;
  const padding = 10;

  return {
    x: Math.min(Math.max(next.x, padding), Math.max(padding, width - handleWidth - padding)),
    y: Math.min(Math.max(next.y, padding), Math.max(padding, height - handleHeight - padding)),
  };
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
  const [miniPosition, setMiniPosition] = useState<MiniPosition>({ x: 18, y: 96 });
  const dragRef = useRef<DragState>({
    active: false,
    moved: false,
    pointerId: null,
    startX: 0,
    startY: 0,
    offsetX: 0,
    offsetY: 0,
  });

  const locationText = useMemo(() => {
    const pageText = book.format === 'pdf' ? `Pág. ${currentPage}` : '';

    if (currentLabel) {
      return [
        currentLabel,
        pageText,
        currentIndex && totalItems ? `${currentIndex} de ${totalItems}` : null,
      ]
        .filter(Boolean)
        .join(' · ');
    }

    return book.format === 'pdf' ? pageText : 'Leyendo';
  }, [book.format, currentIndex, currentLabel, currentPage, totalItems]);

  useEffect(() => {
    const updateViewportHeight = () => {
      const candidates = [
        window.visualViewport?.height,
        document.documentElement.clientHeight,
        window.innerHeight,
      ].filter((value): value is number => Number.isFinite(value) && value > 0);

      const height = Math.round(Math.min(...candidates));
      document.documentElement.style.setProperty('--reader-viewport-height', `${height}px`);
      shellRef.current?.style.setProperty('--reader-viewport-height', `${height}px`);
      setMiniPosition((current) => clampMiniPosition(current));
    };

    updateViewportHeight();
    window.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('resize', updateViewportHeight);
    window.visualViewport?.addEventListener('scroll', updateViewportHeight);

    return () => {
      window.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('resize', updateViewportHeight);
      window.visualViewport?.removeEventListener('scroll', updateViewportHeight);
    };
  }, []);

  useEffect(() => {
    const onFsChange = () => {
      const shell = shellRef.current;
      setIsFullscreen(!!shell && document.fullscreenElement === shell);
    };

    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const openSidebar = () => {
    setSidebarOpen(true);
  };

  const closeSidebar = () => {
    setShowSettings(false);
    setSidebarOpen(false);
  };

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
        if (showSettings) {
          setShowSettings(false);
          return;
        }
        if (sidebarOpen) {
          closeSidebar();
          return;
        }
        setFocusMode(false);
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
    showSettings,
    sidebarOpen,
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

  const handleMiniPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      active: true,
      moved: false,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handleMiniPointerMove = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    const deltaX = Math.abs(event.clientX - drag.startX);
    const deltaY = Math.abs(event.clientY - drag.startY);
    if (deltaX > 4 || deltaY > 4) drag.moved = true;

    setMiniPosition(clampMiniPosition({
      x: event.clientX - drag.offsetX,
      y: event.clientY - drag.offsetY,
    }));
  };

  const handleMiniPointerUp = (event: PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag.active || drag.pointerId !== event.pointerId) return;

    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}

    dragRef.current = {
      active: false,
      moved: false,
      pointerId: null,
      startX: 0,
      startY: 0,
      offsetX: 0,
      offsetY: 0,
    };

    if (!drag.moved) openSidebar();
  };

  return (
    <div
      ref={shellRef}
      className={`reader-page reader-shell-v14 ${focusMode ? 'focus-mode' : ''} chrome-visible ${sidebarOpen ? 'has-sidebar' : 'drawer-collapsed'}`}
      data-reader-theme={theme}
    >
      <div className="reader-ambient-glow" aria-hidden="true" />

      {!sidebarOpen ? (
        <button
          className="reader-floating-menu-handle"
          type="button"
          style={{ left: miniPosition.x, top: miniPosition.y }}
          onPointerDown={handleMiniPointerDown}
          onPointerMove={handleMiniPointerMove}
          onPointerUp={handleMiniPointerUp}
          aria-label="Abrir controles del lector"
          title="Arrastra para mover · Click para abrir controles"
        >
          <span aria-hidden="true">☰</span>
          <small>{book.format === 'pdf' ? `Pág. ${currentPage}` : `${progress.toFixed(0)}%`}</small>
        </button>
      ) : null}

      <div className="reader-shell-body">
        {sidebarOpen ? (
          <aside className="reader-control-drawer reader-sidebar open chrome-visible" aria-label="Controles del lector">
            <header className="reader-header reader-drawer-header chrome-layer">
              <div className="reader-drawer-header-row">
                <button
                  className="reader-icon-btn"
                  onClick={closeSidebar}
                  aria-label="Contraer controles"
                  type="button"
                  title="Contraer a icono flotante"
                >
                  ×
                </button>
                <button className="reader-btn ghost reader-back-btn" onClick={onBack} aria-label="Volver a biblioteca" type="button">
                  ← Biblioteca
                </button>
                <span className="reader-progress">{progress.toFixed(0)}%</span>
              </div>

              <div className="reader-title reader-drawer-title">
                <span className="title">{book.title}</span>
                <span className="author">{book.author}</span>
                <span className="reader-location">{locationText}</span>
              </div>

              <div className="reader-actions reader-drawer-actions">
                {readingTimeRemaining ? (
                  <span className="reader-time-left">{readingTimeRemaining}</span>
                ) : null}
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
                <button
                  className="reader-icon-btn"
                  onClick={onToggleBookmark}
                  type="button"
                  title="Bookmark (B)"
                  aria-label="Añadir o quitar marcador"
                >
                  ⌑
                </button>
              </div>
            </header>

            {showSettings ? <div className="reader-drawer-settings-panel">{settings}</div> : null}

            <ReaderSidebar
              open
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
              chromeVisible
            />
          </aside>
        ) : null}

        <main className="reader-content">{children}</main>
      </div>

      <div className="reader-bottom-progress chrome-layer" aria-hidden="true">
        <span style={{ width: `${Math.min(100, Math.max(0, progress))}%` }} />
      </div>
    </div>
  );
}
