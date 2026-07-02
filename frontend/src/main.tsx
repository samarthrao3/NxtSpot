import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClientProvider } from '@tanstack/react-query'
import 'mapbox-gl/dist/mapbox-gl.css'
import './index.css'
import { queryClient } from './lib/queryClient'
import { ThemeProvider } from './lib/theme'
import { AppRouter } from './router'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <AppRouter />
      </QueryClientProvider>
    </ThemeProvider>
  </StrictMode>,
)
