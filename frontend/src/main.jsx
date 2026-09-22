import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FxProvider } from './lib/currency'
import { ThemeProvider } from './lib/theme'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <FxProvider>
        <App />
      </FxProvider>
    </ThemeProvider>
  </StrictMode>,
)
