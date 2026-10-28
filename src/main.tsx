import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Route, Routes } from 'react-router-dom';
import { SpoilerProvider } from './components/common';
import { DataProvider } from './core/store';
import './styles/app.css';
import { ControlRoom } from './views/ControlRoom';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DataProvider>
      <SpoilerProvider>
        <BrowserRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <Routes>
            <Route path="/" element={<ControlRoom />}>
              <Route path="p/:id" element={null} />
              <Route path="live" element={null} />
            </Route>
          </Routes>
        </BrowserRouter>
      </SpoilerProvider>
    </DataProvider>
  </StrictMode>,
);
