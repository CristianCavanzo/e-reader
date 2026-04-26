import { Dispatch, SetStateAction, useEffect, useState } from 'react';
import { db } from '../db';

export function usePersistentSetting<T>(key: string, defaultValue: T): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(defaultValue);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    let cancelled = false;
    db.settings.get(key).then((setting) => {
      if (cancelled) return;
      if (setting) setValue(setting.value as T);
      setHydrated(true);
    });
    return () => {
      cancelled = true;
    };
  }, [key]);

  useEffect(() => {
    if (!hydrated) return;
    void db.settings.put({ key, value });
  }, [hydrated, key, value]);

  return [value, setValue];
}
