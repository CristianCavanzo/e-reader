import { useCallback, useEffect, useState } from 'react';
import { db, Highlight, HighlightCategory, HighlightColor, uuid } from '../db';

interface AddHighlightInput {
  page?: number;
  cfi?: string;
  blockId?: string;
  text: string;
  color: HighlightColor;
  category?: HighlightCategory;
  note?: string;
  tags?: string[];
}

export function useAnnotations(bookId: string) {
  const [highlights, setHighlights] = useState<Highlight[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    const rows = await db.highlights.where('bookId').equals(bookId).sortBy('createdAt');
    setHighlights(rows.reverse());
    setLoading(false);
  }, [bookId]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const addHighlight = useCallback(async (input: AddHighlightInput) => {
    const now = Date.now();
    const row: Highlight = {
      id: uuid(),
      bookId,
      page: input.page,
      cfi: input.cfi,
      blockId: input.blockId,
      text: input.text,
      color: input.color,
      category: input.category,
      note: input.note,
      tags: input.tags || [],
      isFlashcard: false,
      createdAt: now,
      updatedAt: now,
    };
    await db.highlights.add(row);
    await reload();
    return row;
  }, [bookId, reload]);

  const updateNote = useCallback(async (id: string, note?: string) => {
    await db.highlights.update(id, { note: note?.trim() || undefined, updatedAt: Date.now() });
    await reload();
  }, [reload]);

  const deleteHighlight = useCallback(async (id: string) => {
    await db.highlights.delete(id);
    await db.flashcards.where('highlightId').equals(id).delete();
    await reload();
  }, [reload]);

  const getHighlightsForPage = useCallback((page: number) => {
    return highlights.filter((highlight) => highlight.page === page);
  }, [highlights]);

  return { highlights, loading, reload, addHighlight, updateNote, deleteHighlight, getHighlightsForPage };
}
