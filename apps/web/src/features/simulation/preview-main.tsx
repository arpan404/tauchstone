import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import '@/index.css';
import { SimulationPreview } from './preview';

createRoot(document.getElementById('root')!).render(<StrictMode><SimulationPreview /></StrictMode>);
