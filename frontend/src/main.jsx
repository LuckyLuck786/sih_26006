import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { FxProvider } from './lib/currency'
import './index.css'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <FxProvider>
      <App />
    </FxProvider>
  </StrictMode>,
)
