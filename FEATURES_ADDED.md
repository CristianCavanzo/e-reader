# Academic Reader — Feature Pack v5

Este ZIP incluye una implementación práctica de la hoja de ruta solicitada, sin agregar dependencias nuevas más allá de las que ya tenía el proyecto.

## Cambios principales

- Dexie v5 con nuevas tablas: `flashcards`, `studyGoals`, `collections`, `searchIndex`, `exportRecords`.
- Campos nuevos en `books`: `status`, `difficulty`, `tags`, `collectionIds`, `pageCount`.
- Campos nuevos en `highlights`: `category`, `tags`, `isFlashcard`, `cfi` para EPUB.
- Worker de PDF.js centralizado en `src/lib/pdfWorker.ts`.
- `ToastProvider` global para feedback visual.
- `ConfirmProvider` global para reemplazar `confirm()` nativo.
- `ErrorBoundary` global.
- Skeleton loaders para Library y Reader.
- Biblioteca con búsqueda, filtros por estado/formato/colección, tags editables, vista grid/lista y colecciones.
- Dashboard básico de lectura semanal.
- Search offline indexado en Dexie para PDF y EPUB durante importación.
- SearchPanel actualizado para usar `searchIndex` y fallback con Smart Reader.
- EPUB highlights mediante evento `selected` de epub.js y persistencia por CFI.
- NotesPanel unificado para PDF/EPUB con conversión de highlights a flashcards.
- Flashcard review panel con SRS básico.
- ExportKnowledgeModal: Markdown, CSV/Anki, JSON y copia para Notion.
- ReaderSettingsPanel extraído con font family, line-height, column width, tema, modo PDF y acciones académicas.
- Modo repaso agrupado por capítulo/página.
- Modo lectura rápida RSVP para texto cargado en Smart Reader.
- CSS premium adicional: tokens, modales, toasts, skeleton shimmer, book card hover, stats y paneles académicos.

## Notas técnicas

- La indexación completa de libros se ejecuta al importar. Para libros muy pesados puede tardar; está aislada para no romper la importación si falla.
- La lectura rápida usa el texto cargado en Smart Reader. En PDF, abre primero Smart Reader para poblar bloques. En EPUB no se fuerza extracción completa en runtime.
- EPUB highlights se guardan con CFI. La navegación directa desde NotesPanel para EPUB queda como siguiente mejora: se muestra el highlight, pero el salto automático por CFI todavía no está conectado al sidebar.
- El proyecto no fue validado con `npm run build` dentro del entorno porque no había `node_modules` y la instalación de dependencias no completó. Sí se hizo verificación sintáctica de TS/TSX con TypeScript `transpileModule`.

## Archivos nuevos importantes

- `src/lib/pdfWorker.ts`
- `src/services/searchIndex.ts`
- `src/components/ToastProvider.tsx`
- `src/components/ConfirmProvider.tsx`
- `src/components/ErrorBoundary.tsx`
- `src/components/ReaderSettingsPanel.tsx`
- `src/components/ExportKnowledgeModal.tsx`
- `src/components/FlashcardReviewPanel.tsx`
- `src/components/ReviewMode.tsx`
- `src/components/SpeedReadingMode.tsx`
- `src/components/ReadingStatsDashboard.tsx`
- `src/components/CollectionsPanel.tsx`
- `src/hooks/useAnnotations.ts`
- `src/hooks/usePersistentSetting.ts`
