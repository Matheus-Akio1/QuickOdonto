import '@fontsource-variable/bricolage-grotesque';
import '@fontsource-variable/figtree';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import { z } from 'zod';
import { App } from './App';
import { AuthProvider } from './auth/AuthProvider';
import { ToastProvider } from './toast/ToastProvider';
import './styles/tokens.css';
import './styles/base.css';
import './styles/ui.css';
import './styles/layout.css';
import './styles/agenda.css';

// Mensagens de validação dos formulários em português.
z.config(z.locales.ptBR());

// Cache apenas em memória (sem persistência): é descartado no logout e ao fechar a aba.
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (tentativas, erro) => {
        const status = (erro as { status?: number }).status;
        return (status === undefined || status >= 500 || status === 0) && tentativas < 2;
      },
      refetchOnWindowFocus: false,
    },
  },
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <ToastProvider>
          <AuthProvider>
            <App />
          </AuthProvider>
        </ToastProvider>
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
);
