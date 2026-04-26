import { useMemo, useState } from 'react';
import { db, type Book, type Collection, uuid } from '../db';
import { useToast } from './ToastProvider';

interface CollectionsPanelProps {
  books: Book[];
  collections: Collection[];
  selectedCollectionId: string | 'all';
  onSelect: (collectionId: string | 'all') => void;
  onRefresh: () => void;
}

const palette = ['#8b5cf6', '#06b6d4', '#10b981', '#f59e0b', '#ef4444', '#64748b'];

export function CollectionsPanel({ books, collections, selectedCollectionId, onSelect, onRefresh }: CollectionsPanelProps) {
  const { toast } = useToast();
  const [draftName, setDraftName] = useState('');

  const counts = useMemo(() => {
    const map = new Map<string, number>();
    books.forEach((book) => (book.collectionIds || []).forEach((id) => map.set(id, (map.get(id) || 0) + 1)));
    return map;
  }, [books]);

  const create = async () => {
    const name = draftName.trim();
    if (!name) return;
    await db.collections.add({
      id: uuid(),
      name,
      color: palette[collections.length % palette.length],
      createdAt: Date.now(),
    });
    setDraftName('');
    toast('Colección creada', 'success');
    onRefresh();
  };

  return (
    <section className="collections-panel" aria-label="Colecciones">
      <div className="collections-header">
        <strong>Colecciones</strong>
        <span>{collections.length}</span>
      </div>
      <div className="collection-list">
        <button type="button" className={selectedCollectionId === 'all' ? 'active' : ''} onClick={() => onSelect('all')}>
          <span className="collection-dot" style={{ background: 'currentColor' }} />
          Todas
          <small>{books.length}</small>
        </button>
        {collections.map((collection) => (
          <button key={collection.id} type="button" className={selectedCollectionId === collection.id ? 'active' : ''} onClick={() => onSelect(collection.id)}>
            <span className="collection-dot" style={{ background: collection.color }} />
            {collection.name}
            <small>{counts.get(collection.id) || 0}</small>
          </button>
        ))}
      </div>
      <form className="collection-create" onSubmit={(event) => { event.preventDefault(); void create(); }}>
        <input value={draftName} onChange={(event) => setDraftName(event.target.value)} placeholder="Nueva colección…" />
        <button type="submit">+</button>
      </form>
    </section>
  );
}
