import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { AuthProvider } from './shared/state/AuthContext';
import { App } from './App';
import { applyThemeChoice, readThemeChoice } from './shared/state/theme';
import './styles.css';

// Light or dark as last chosen, before anything is drawn.
applyThemeChoice(readThemeChoice());

const container = document.getElementById('root');
if (!container) throw new Error('Missing #root');

createRoot(container).render(
  <StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </StrictMode>,
);
