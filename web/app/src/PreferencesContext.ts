import { createContext } from 'react';
import type { Preferences } from './preferences';
export const PreferencesContext = createContext<Preferences | null>(null);
