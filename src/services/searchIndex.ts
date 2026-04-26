import JSZip from 'jszip';
import { db, type BookFormat } from '../db';
import { pdfjsLib } from '../lib/pdfWorker';

function stripHtml(html: string) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function dirname(path: string) {
  const clean = path.replace(/\\/g, '/');
  const index = clean.lastIndexOf('/');
  return index >= 0 ? clean.slice(0, index + 1) : '';
}

function joinPath(base: string, href: string) {
  if (!base) return href;
  return `${base}${href}`.replace(/\/\.\//g, '/');
}

export async function clearSearchIndex(bookId: string) {
  await db.searchIndex.where('bookId').equals(bookId).delete();
}

export async function indexPdfText(bookId: string, file: Blob) {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const rows = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
      const page = await pdf.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item: any) => ('str' in item ? item.str : ''))
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();

      if (text.length > 0) {
        rows.push({
          id: `${bookId}-page-${pageNumber}`,
          bookId,
          page: pageNumber,
          text,
        });
      }
    }

    await db.transaction('rw', db.searchIndex, async () => {
      await clearSearchIndex(bookId);
      if (rows.length > 0) await db.searchIndex.bulkPut(rows);
    });
  } finally {
    await pdf.destroy();
  }
}

export async function indexEpubText(bookId: string, file: Blob) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer());
  const containerXml = await zip.file('META-INF/container.xml')?.async('text');
  if (!containerXml) return;

  const parser = new DOMParser();
  const containerDoc = parser.parseFromString(containerXml, 'application/xml');
  const opfPath = containerDoc.querySelector('rootfile')?.getAttribute('full-path');
  if (!opfPath) return;

  const opfXml = await zip.file(opfPath)?.async('text');
  if (!opfXml) return;

  const opfDoc = parser.parseFromString(opfXml, 'application/xml');
  const opfBase = dirname(opfPath);
  const manifest = new Map<string, string>();

  opfDoc.querySelectorAll('manifest item').forEach((item) => {
    const id = item.getAttribute('id');
    const href = item.getAttribute('href');
    if (id && href) manifest.set(id, joinPath(opfBase, href));
  });

  const rows = [];
  const spineItems = Array.from(opfDoc.querySelectorAll('spine itemref'));
  for (let index = 0; index < spineItems.length; index += 1) {
    const idref = spineItems[index].getAttribute('idref');
    const href = idref ? manifest.get(idref) : undefined;
    if (!href) continue;

    const html = await zip.file(href)?.async('text');
    if (!html) continue;

    const text = stripHtml(html);
    if (text.length < 20) continue;

    rows.push({
      id: `${bookId}-chapter-${index + 1}`,
      bookId,
      chapterId: String(index + 1),
      text,
    });
  }

  await db.transaction('rw', db.searchIndex, async () => {
    await clearSearchIndex(bookId);
    if (rows.length > 0) await db.searchIndex.bulkPut(rows);
  });
}

export async function buildSearchIndexForFile(bookId: string, format: BookFormat, file: Blob) {
  if (format === 'pdf') return indexPdfText(bookId, file);
  return indexEpubText(bookId, file);
}
