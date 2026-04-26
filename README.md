# Reader

Lector personal de **EPUB** y **PDF** en el navegador. Todo se guarda localmente en IndexedDB; no hay backend ni telemetría.

## Requisitos

- Node.js 18 o superior
- npm (o pnpm / yarn)

## Cómo arrancarlo

```bash
npm install
npm run dev
```

Se abrirá automáticamente en http://localhost:5173

Para construir versión de producción:

```bash
npm run build
npm run preview
```

## Cómo usarlo

1. Pulsa **+ Importar libros** o **arrastra y suelta** archivos `.epub` / `.pdf` sobre la ventana.
2. Se extrae automáticamente título, autor y portada cuando es posible.
3. Haz clic en una portada para empezar a leer.
4. El progreso se guarda al cambiar de página.
5. Cambia el tema desde la biblioteca o desde el botón ⚙ del lector.

## Atajos de teclado

| Tecla | Acción |
|---|---|
| ← / → | Página anterior / siguiente |
| + / − | Zoom (solo PDF) |

## Limitaciones importantes

- **Solo archivos sin DRM**. Libros de Kindle, Apple Books, Google Play Books o con Adobe ADEPT no se pueden abrir y no es legal saltarse esa protección.
- Los datos se guardan **solo en este navegador**. Si limpias datos del sitio o usas modo incógnito, perderás los libros importados.
- Esta versión es un **MVP**: no tiene resaltados, notas ni búsqueda dentro del libro todavía.

## Resolución de problemas

**El EPUB se ve sin estilos o con tipografía rara**
Algunos EPUBs usan CSS muy específico que choca con el tema. Puedes alternar entre temas en ⚙ para forzar la actualización.

**El PDF tarda mucho en cargar**
PDFs de más de 100 MB requieren bastante memoria. Considera dividirlo o usar un PDF optimizado.

**Error "DRM" o "Encrypted"**
El archivo está protegido. No se puede abrir desde aquí.

**No me funciona el worker de PDF.js**
El proyecto usa el worker de PDF.js desde un CDN (`cdn.jsdelivr.net`). Asegúrate de tener conexión a internet la primera vez. Si quieres bundlear el worker, sustituye en `src/PdfReader.tsx`:

```ts
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
```

## Stack

- **React 18 + TypeScript + Vite**
- **epubjs** para EPUB
- **pdfjs-dist** para PDF
- **Dexie** sobre IndexedDB para almacenamiento local
- **React Router** (HashRouter) para navegación

## Estructura

```
src/
├── App.tsx           Router + estado de tema
├── Library.tsx       Biblioteca + importación
├── Reader.tsx        Página de lectura (header + ajustes)
├── EpubReader.tsx    Motor de lectura EPUB
├── PdfReader.tsx     Motor de lectura PDF
├── db.ts             Dexie + tipos + utilidades
├── styles.css        Estilos
└── main.tsx          Entry point
```

## Roadmap sugerido

Próximos pasos lógicos a partir de esta base:

- Tabla de contenidos navegable.
- Resaltados y notas (CFI en EPUB, rectángulos en PDF).
- Búsqueda dentro del libro (FlexSearch).
- Marcadores manuales.
- Modo PWA con `vite-plugin-pwa`.
- Sincronización opcional con backend.

## Licencia

Para uso personal con tus propios archivos.

## Cambios incluidos en esta versión

Esta entrega agrega la primera capa real de app de lectura:

- `ReaderShell`: layout reutilizable para EPUB y PDF.
- Sidebar lateral con panel de **Contenido**.
- Tabla de contenidos persistida en IndexedDB.
- Migración de Dexie a `version(2)` con:
  - `tocItems`
  - `readingSessions`
- EPUB:
  - extracción de índice desde la navegación del libro;
  - salto directo a capítulos;
  - detección aproximada del capítulo actual.
- PDF:
  - extracción de outline con PDF.js;
  - navegación por outline;
  - fallback automático a páginas cuando el PDF no trae índice.
- Barra inferior discreta de progreso.
- Progreso visible en la biblioteca debajo de cada libro.
- Preparación visual de los paneles futuros: Buscar, Notas y Marcadores.

Pendientes recomendados para la siguiente fase:

1. Búsqueda interna con FlexSearch.
2. Marcadores manuales.
3. Text layer en PDF para selección real de texto.
4. Resaltados y notas.
