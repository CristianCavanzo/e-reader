import Dexie, { Table } from 'dexie';

export type BookFormat = 'epub' | 'pdf';
export type Theme = 'light' | 'dark' | 'sepia';
export type BookStatus = 'unread' | 'reading' | 'paused' | 'finished';
export type HighlightColor = 'yellow' | 'green' | 'blue' | 'pink';
export type HighlightCategory = 'concept' | 'important' | 'question' | 'action';

export interface Book {
  id: string;
  title: string;
  author: string;
  publisher?: string;
  description?: string;
  isbn?: string;
  language?: string;
  format: BookFormat;
  hash: string;
  fileSize: number;
  pageCount?: number;
  status?: BookStatus;
  difficulty?: 1 | 2 | 3 | 4 | 5;
  tags?: string[];
  collectionIds?: string[];
  addedAt: number;
  lastOpenedAt?: number;
  finishedAt?: number;
}

export interface BookFile {
  id: string; // = book.id
  data: Blob;
}

export interface BookCover {
  id: string; // = book.id
  data: Blob;
}

export interface Progress {
  bookId: string;
  // Para EPUB: CFI. Para PDF: número de página como string.
  // Smart Reader puede guardar "page:blockId" para restaurar el bloque visible.
  position: string;
  percentage: number;
  chapterProgress?: Record<string, number>;
  updatedAt: number;
}

export interface TocItem {
  id: string;
  bookId: string;
  label: string;
  format: BookFormat;
  order: number;
  level: number;
  href?: string;
  cfi?: string;
  page?: number;
  parentId?: string;
}

export interface ReadingSession {
  bookId: string;
  currentLabel?: string;
  currentIndex?: number;
  totalItems?: number;
  updatedAt: number;
}

export interface Highlight {
  id: string;
  bookId: string;
  page?: number;
  cfi?: string;
  blockId?: string;
  text: string;
  color: HighlightColor;
  category?: HighlightCategory;
  tags?: string[];
  isFlashcard?: boolean;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface Bookmark {
  id: string;
  bookId: string;
  page?: number;
  cfi?: string;
  label: string;
  note?: string;
  createdAt: number;
}

export interface Flashcard {
  id: string;
  bookId: string;
  highlightId?: string;
  front: string;
  back: string;
  interval: number;
  easeFactor: number;
  repetitions: number;
  nextReviewAt: number;
  lastReviewedAt?: number;
  createdAt: number;
}

export interface StudyGoal {
  id: string;
  bookId: string;
  type: 'finish_by_date' | 'pages_per_day' | 'minutes_per_day';
  targetDate?: number;
  pagesPerDay?: number;
  minutesPerDay?: number;
  createdAt: number;
}

export interface Collection {
  id: string;
  name: string;
  color: string;
  icon?: string;
  createdAt: number;
}

export interface SearchIndexEntry {
  id: string;
  bookId: string;
  page?: number;
  chapterId?: string;
  text: string;
}

export interface ReadingStat {
  id: string;
  bookId: string;
  date: string;
  minutesRead: number;
  pagesRead: number;
  wordsRead?: number;
  sessionsCount?: number;
}

export interface ExportRecord {
  id: string;
  bookId: string;
  format: 'markdown' | 'csv' | 'anki' | 'notion' | 'json';
  highlightCount: number;
  exportedAt: number;
}

export interface Setting {
  key: string;
  value: any;
}

class ReaderDB extends Dexie {
  books!: Table<Book, string>;
  files!: Table<BookFile, string>;
  covers!: Table<BookCover, string>;
  progress!: Table<Progress, string>;
  settings!: Table<Setting, string>;
  tocItems!: Table<TocItem, string>;
  readingSessions!: Table<ReadingSession, string>;
  highlights!: Table<Highlight, string>;
  bookmarks!: Table<Bookmark, string>;
  readingStats!: Table<ReadingStat, string>;
  flashcards!: Table<Flashcard, string>;
  studyGoals!: Table<StudyGoal, string>;
  collections!: Table<Collection, string>;
  searchIndex!: Table<SearchIndexEntry, string>;
  exportRecords!: Table<ExportRecord, string>;

  constructor() {
    super('reader');
    this.version(1).stores({
      books: 'id, hash, addedAt, lastOpenedAt',
      files: 'id',
      covers: 'id',
      progress: 'bookId, updatedAt',
      settings: 'key',
    });

    this.version(2).stores({
      books: 'id, hash, format, addedAt, lastOpenedAt',
      files: 'id',
      covers: 'id',
      progress: 'bookId, updatedAt',
      settings: 'key',
      tocItems: 'id, bookId, format, order, parentId, page',
      readingSessions: 'bookId, updatedAt',
    });

    this.version(3).stores({
      books: 'id, hash, format, addedAt, lastOpenedAt',
      files: 'id',
      covers: 'id',
      progress: 'bookId, updatedAt',
      settings: 'key',
      tocItems: 'id, bookId, format, order, parentId, page',
      readingSessions: 'bookId, updatedAt',
      highlights: 'id, bookId, page, createdAt',
      bookmarks: 'id, bookId, page, createdAt',
    });

    this.version(4).stores({
      books: 'id, hash, format, addedAt, lastOpenedAt',
      files: 'id',
      covers: 'id',
      progress: 'bookId, updatedAt',
      settings: 'key',
      tocItems: 'id, bookId, format, order, parentId, page',
      readingSessions: 'bookId, updatedAt',
      highlights: 'id, bookId, page, createdAt',
      bookmarks: 'id, bookId, page, createdAt',
      readingStats: 'id, bookId, date',
    });

    this.version(5).stores({
      books: 'id, hash, format, status, addedAt, lastOpenedAt, *tags',
      files: 'id',
      covers: 'id',
      progress: 'bookId, updatedAt',
      settings: 'key',
      tocItems: 'id, bookId, format, order, parentId, page',
      readingSessions: 'bookId, updatedAt',
      highlights: 'id, bookId, page, cfi, createdAt, isFlashcard, category, *tags',
      bookmarks: 'id, bookId, page, cfi, createdAt',
      readingStats: 'id, bookId, date',
      flashcards: 'id, bookId, highlightId, nextReviewAt',
      studyGoals: 'id, bookId',
      collections: 'id',
      searchIndex: 'id, bookId, page, chapterId',
      exportRecords: 'id, bookId, exportedAt',
    }).upgrade(async (tx) => {
      const books = tx.table<Book, string>('books');
      await books.toCollection().modify((book) => {
        book.status = book.status || 'unread';
        book.tags = book.tags || [];
        book.collectionIds = book.collectionIds || [];
      });
    });
  }
}

export const db = new ReaderDB();

export function uuid(): string {
  return crypto.randomUUID();
}

export async function sha256(blob: Blob): Promise<string> {
  const buf = await blob.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}
