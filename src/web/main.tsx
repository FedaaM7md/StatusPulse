/* Copyright (c) 2026 Fedaa Mohamed. All rights reserved. Proprietary source; see LICENSE. */
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles.css';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
