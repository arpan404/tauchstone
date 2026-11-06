import React from 'react'
import {createRoot} from 'react-dom/client'
import {QueryClient,QueryClientProvider} from '@tanstack/react-query'
import '@/index.css'
import {LabView} from './LabView'
createRoot(document.getElementById('root')!).render(<React.StrictMode><QueryClientProvider client={new QueryClient()}><LabView/></QueryClientProvider></React.StrictMode>)
