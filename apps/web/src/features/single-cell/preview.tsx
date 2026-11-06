import { createRoot } from 'react-dom/client';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@/index.css';
import { SingleCellPanel } from './SingleCellPanel';

createRoot(document.getElementById('root')!).render(<QueryClientProvider client={new QueryClient()}><SingleCellPanel /></QueryClientProvider>);
