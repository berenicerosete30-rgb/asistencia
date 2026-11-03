import React from 'react';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './store.jsx';
import App from './App.jsx';
import '@fontsource/poppins/500.css';
import '@fontsource/poppins/600.css';
import '@fontsource/inter/400.css';
import '@fontsource/inter/500.css';
import '@fontsource/inter/600.css';
import './styles.css';

createRoot(document.getElementById('root')).render(
  <StoreProvider>
    <App />
  </StoreProvider>
);
