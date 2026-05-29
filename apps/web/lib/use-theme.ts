'use client';

import * as React from 'react';
import { safeLocalStorage } from '@med/utils';
import { STORAGE_KEYS } from '@med/config';

type Theme = 'light' | 'dark' | 'system';

export function useTheme(): [Theme, (t: Theme) => void] {
  const [theme, setThemeState] = React.useState<Theme>('system');

  React.useEffect(() => {
    setThemeState(safeLocalStorage.get<Theme>(STORAGE_KEYS.theme, 'system'));
  }, []);

  React.useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const effective = theme === 'system' ? (mql.matches ? 'dark' : 'light') : theme;
      document.documentElement.classList.toggle('dark', effective === 'dark');
    };
    apply();
    mql.addEventListener('change', apply);
    return () => mql.removeEventListener('change', apply);
  }, [theme]);

  const setTheme = React.useCallback((t: Theme) => {
    safeLocalStorage.set(STORAGE_KEYS.theme, t);
    setThemeState(t);
  }, []);

  return [theme, setTheme];
}
