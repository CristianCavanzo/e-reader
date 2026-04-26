import { useEffect, useState } from 'react';
import { HashRouter, Routes, Route } from 'react-router-dom';
import { Library } from './Library';
import { ReaderPage } from './Reader';
import { db, Theme } from './db';
import { ToastProvider } from './components/ToastProvider';
import { ConfirmProvider } from './components/ConfirmProvider';
import { ErrorBoundary } from './components/ErrorBoundary';

export function App() {
  const [theme, setThemeState] = useState<Theme>('light');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    db.settings.get('theme').then((s) => {
      if (s) setThemeState(s.value as Theme);
      setHydrated(true);
    });
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    document.documentElement.dataset.theme = theme;
    db.settings.put({ key: 'theme', value: theme });
  }, [theme, hydrated]);

  const setTheme = (t: Theme) => setThemeState(t);

  return (
    <ToastProvider>
      <ConfirmProvider>
        <ErrorBoundary>
          <HashRouter>
            <Routes>
              <Route path="/" element={<Library theme={theme} setTheme={setTheme} />} />
              <Route path="/read/:bookId" element={<ReaderPage theme={theme} setTheme={setTheme} />} />
            </Routes>
          </HashRouter>
        </ErrorBoundary>
      </ConfirmProvider>
    </ToastProvider>
  );
}
