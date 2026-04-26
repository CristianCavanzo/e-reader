import type { BookFormat, Theme } from '../db';

interface ReaderSettingsPanelProps {
  bookFormat: BookFormat;
  theme: Theme;
  onThemeChange: (theme: Theme) => void;
  fontSize: number;
  onFontSizeChange: (value: number) => void;
  fontFamily: string;
  onFontFamilyChange: (value: string) => void;
  lineHeight: number;
  onLineHeightChange: (value: number) => void;
  columnWidth: string;
  onColumnWidthChange: (value: string) => void;
  pdfReadingMode: 'page' | 'text' | 'smart';
  onPdfReadingModeChange: (mode: 'page' | 'text' | 'smart') => void;
  onOpenReview: () => void;
  onOpenFlashcards: () => void;
  onOpenExport: () => void;
  onOpenSpeedReading: () => void;
  speedReadingDisabled?: boolean;
}

export function ReaderSettingsPanel({
  bookFormat,
  theme,
  onThemeChange,
  fontSize,
  onFontSizeChange,
  fontFamily,
  onFontFamilyChange,
  lineHeight,
  onLineHeightChange,
  columnWidth,
  onColumnWidthChange,
  pdfReadingMode,
  onPdfReadingModeChange,
  onOpenReview,
  onOpenFlashcards,
  onOpenExport,
  onOpenSpeedReading,
  speedReadingDisabled,
}: ReaderSettingsPanelProps) {
  return (
    <div className="reader-settings premium-settings">
      <label>
        Tamaño de fuente
        <strong>{fontSize}px</strong>
        <input type="range" min={12} max={32} value={fontSize} onChange={(e) => onFontSizeChange(Number(e.target.value))} />
      </label>

      <label>
        Fuente
        <select value={fontFamily} onChange={(e) => onFontFamilyChange(e.target.value)}>
          <option value="system">System</option>
          <option value="Inter, system-ui, sans-serif">Inter</option>
          <option value="Merriweather, Georgia, serif">Merriweather</option>
          <option value="Georgia, serif">Georgia</option>
          <option value="Source Serif Pro, Georgia, serif">Source Serif</option>
        </select>
      </label>

      <label>
        Interlineado
        <strong>{lineHeight.toFixed(1)}</strong>
        <input type="range" min={1.4} max={2.2} step={0.1} value={lineHeight} onChange={(e) => onLineHeightChange(Number(e.target.value))} />
      </label>

      <label>
        Ancho de columna
        <select value={columnWidth} onChange={(e) => onColumnWidthChange(e.target.value)}>
          <option value="narrow">Estrecho</option>
          <option value="medium">Medio</option>
          <option value="wide">Amplio</option>
          <option value="full">Completo</option>
        </select>
      </label>

      <label>
        Tema
        <select value={theme} onChange={(e) => onThemeChange(e.target.value as Theme)}>
          <option value="light">Claro</option>
          <option value="dark">Oscuro</option>
          <option value="sepia">Sepia</option>
        </select>
      </label>

      {bookFormat === 'pdf' ? (
        <label>
          Modo PDF
          <select value={pdfReadingMode} onChange={(e) => onPdfReadingModeChange(e.target.value as 'page' | 'text' | 'smart')}>
            <option value="page">Página original</option>
            <option value="text">Texto tipo ebook</option>
            <option value="smart">Smart Reader</option>
          </select>
        </label>
      ) : null}

      <div className="reader-settings-actions">
        <button type="button" onClick={onOpenReview}>Modo repaso</button>
        <button type="button" onClick={onOpenFlashcards}>Flashcards</button>
        <button type="button" onClick={onOpenExport}>Exportar</button>
        <button type="button" onClick={onOpenSpeedReading} disabled={speedReadingDisabled}>Lectura rápida</button>
      </div>

      <div className="reader-shortcuts-card">
        <span className="reader-shortcuts-title">Atajos</span>
        <span>F pantalla completa · M enfoque · N/H notas · B bookmark · / buscar · Ctrl+F buscar · [ ] fuente · ← → pasar página · + − zoom</span>
      </div>
    </div>
  );
}
