import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@fontsource/ibm-plex-sans/latin-400.css';
import '@fontsource/ibm-plex-sans/latin-600.css';
import '@fontsource/ibm-plex-mono/latin-400.css';
import '@fontsource/bricolage-grotesque/latin-700.css';
import '@fontsource/vazirmatn/arabic-400.css';
import '@fontsource/vazirmatn/arabic-700.css';
import '@fontsource/atkinson-hyperlegible/latin-400.css';
import './styles/tokens.css';
import './styles/base.css';
import './styles/components.css';
import { App } from './App';
import { initPrefs } from './prefs/store';

initPrefs();
createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
