import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import App from './App'
import { StoreProvider } from './hooks/useStore'
import './styles.css'
import { platform } from './utils/platform'

document.documentElement.classList.add(`platform-${platform}`)

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <App />
    </StoreProvider>
  </StrictMode>
)
