import { useEffect, useMemo, useState } from 'react';
import { db, type ExportRecord, type Flashcard, type Highlight, uuid } from '../db';
import { useToast } from './ToastProvider';

type ExportFormat = 'markdown' | 'csv' | 'json' | 'notion';

interface ExportKnowledgeModalProps {
  bookId: string;
  bookTitle: string;
  onClose: () => void;
}

function downloadText(filename: string, text: string, mime = 'text/plain;charset=utf-8') {
  const blob = new Blob([text], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function csvEscape(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function toMarkdown(bookTitle: string, highlights: Highlight[], includeNotes: boolean) {
  const lines = [`# Highlights — ${bookTitle}`, ''];
  highlights.forEach((highlight) => {
    const location = highlight.page ? `Página ${highlight.page}` : highlight.cfi ? 'EPUB CFI' : 'Sin ubicación';
    lines.push(`## ${location}`);
    lines.push('');
    lines.push(`> ${highlight.text}`);
    if (includeNotes && highlight.note) {
      lines.push('');
      lines.push(`**Nota:** ${highlight.note}`);
    }
    if (highlight.category) lines.push(`\n**Categoría:** ${highlight.category}`);
    lines.push('');
  });
  return lines.join('\n');
}

function toCsv(highlights: Highlight[], flashcards: Flashcard[]) {
  const rows = [
    ['type', 'front_or_text', 'back_or_note', 'page', 'cfi', 'category', 'createdAt'],
    ...highlights.map((highlight) => [
      'highlight',
      highlight.text,
      highlight.note || '',
      highlight.page ? String(highlight.page) : '',
      highlight.cfi || '',
      highlight.category || '',
      new Date(highlight.createdAt).toISOString(),
    ]),
    ...flashcards.map((card) => [
      'flashcard',
      card.front,
      card.back,
      '',
      '',
      '',
      new Date(card.createdAt).toISOString(),
    ]),
  ];

  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

export function ExportKnowledgeModal({ bookId, bookTitle, onClose }: ExportKnowledgeModalProps) {
  const { toast } = useToast();
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [flashcards, setFlashcards] = useState<Flashcard[]>([]);
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [includeNotes, setIncludeNotes] = useState(true);
  const [colorFilter, setColorFilter] = useState<'all' | Highlight['color']>('all');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      const [highlightRows, cardRows] = await Promise.all([
        db.highlights.where('bookId').equals(bookId).sortBy('createdAt'),
        db.flashcards.where('bookId').equals(bookId).sortBy('createdAt'),
      ]);
      if (!cancelled) {
        setHighlights(highlightRows);
        setFlashcards(cardRows);
      }
    };
    void load();
    return () => {
      cancelled = true;
    };
  }, [bookId]);

  const filteredHighlights = useMemo(() => {
    return colorFilter === 'all' ? highlights : highlights.filter((highlight) => highlight.color === colorFilter);
  }, [colorFilter, highlights]);

  const preview = useMemo(() => {
    if (format === 'markdown' || format === 'notion') return toMarkdown(bookTitle, filteredHighlights.slice(0, 5), includeNotes);
    if (format === 'csv') return toCsv(filteredHighlights.slice(0, 5), flashcards.slice(0, 5));
    return JSON.stringify({ highlights: filteredHighlights.slice(0, 3), flashcards: flashcards.slice(0, 3) }, null, 2);
  }, [bookTitle, filteredHighlights, flashcards, format, includeNotes]);

  const buildPayload = () => {
    if (format === 'markdown' || format === 'notion') return toMarkdown(bookTitle, filteredHighlights, includeNotes);
    if (format === 'csv') return toCsv(filteredHighlights, flashcards);
    return JSON.stringify({ highlights: filteredHighlights, flashcards }, null, 2);
  };

  const registerExport = async () => {
    const record: ExportRecord = {
      id: uuid(),
      bookId,
      format: format === 'notion' ? 'notion' : format,
      highlightCount: filteredHighlights.length,
      exportedAt: Date.now(),
    };
    await db.exportRecords.add(record);
  };

  const handleExport = async () => {
    const payload = buildPayload();
    if (format === 'notion') {
      await navigator.clipboard.writeText(payload);
      await registerExport();
      toast('Contenido copiado para Notion', 'success');
      return;
    }

    const extension = format === 'markdown' ? 'md' : format;
    downloadText(`${bookTitle.replace(/[^a-z0-9áéíóúñ_-]+/gi, '-').slice(0, 70)}.${extension}`, payload, format === 'csv' ? 'text/csv;charset=utf-8' : 'text/plain;charset=utf-8');
    await registerExport();
    toast('Export generado', 'success');
  };

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="knowledge-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <header>
          <div>
            <h2>Exportar conocimiento</h2>
            <p>{filteredHighlights.length} highlights · {flashcards.length} flashcards</p>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>×</button>
        </header>

        <div className="export-grid">
          <label>
            Formato
            <select value={format} onChange={(event) => setFormat(event.target.value as ExportFormat)}>
              <option value="markdown">Markdown</option>
              <option value="csv">CSV / Anki</option>
              <option value="notion">Copiar para Notion</option>
              <option value="json">JSON backup</option>
            </select>
          </label>
          <label>
            Color
            <select value={colorFilter} onChange={(event) => setColorFilter(event.target.value as 'all' | Highlight['color'])}>
              <option value="all">Todos</option>
              <option value="yellow">Amarillo</option>
              <option value="green">Verde</option>
              <option value="blue">Azul</option>
              <option value="pink">Rosa</option>
            </select>
          </label>
          <label className="checkbox-row">
            <input type="checkbox" checked={includeNotes} onChange={(event) => setIncludeNotes(event.target.checked)} />
            Incluir notas
          </label>
        </div>

        <pre className="export-preview">{preview || 'No hay contenido para exportar.'}</pre>

        <footer>
          <button type="button" className="reader-btn ghost" onClick={onClose}>Cancelar</button>
          <button type="button" className="reader-btn" onClick={() => void handleExport()} disabled={filteredHighlights.length === 0 && flashcards.length === 0}>
            Exportar
          </button>
        </footer>
      </section>
    </div>
  );
}
