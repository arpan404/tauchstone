import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { About } from './About';
import '@/index.css';

createRoot(document.getElementById('root')!).render(
  <QueryClientProvider client={new QueryClient()}>
    <main style={{ height: '100vh' }}><About /></main>
  </QueryClientProvider>,
);
