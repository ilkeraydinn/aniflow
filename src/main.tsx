import React from 'react';
import ReactDOM from 'react-dom/client';
import { ThemeProvider } from './context/ThemeContext';
import { AuthProvider } from './context/AuthContext';
import { UIProvider } from './context/UIContext';
import { AnimeProvider } from './context/AnimeContext';
import { AppContent } from './App';
import './styles/global.css';

const rootElement = document.getElementById('root');

if (rootElement) {
  ReactDOM.createRoot(rootElement).render(
    <React.StrictMode>
      <ThemeProvider>
        <AuthProvider>
          <UIProvider>
            <AnimeProvider>
              <AppContent />
            </AnimeProvider>
          </UIProvider>
        </AuthProvider>
      </ThemeProvider>
    </React.StrictMode>
  );
}
