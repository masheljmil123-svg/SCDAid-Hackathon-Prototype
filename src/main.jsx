import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { ThemeProvider } from './context/ThemeContext.jsx'
import { InsightsAuthProvider } from './context/InsightsAuthContext.jsx'
import './index.css'
import App from './App.jsx'

const routerBasename =
  import.meta.env.BASE_URL === '/' ? '/' : import.meta.env.BASE_URL.replace(/\/$/, '')

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ThemeProvider>
      <BrowserRouter basename={routerBasename}>
        <InsightsAuthProvider>
          <App />
        </InsightsAuthProvider>
      </BrowserRouter>
    </ThemeProvider>
  </StrictMode>,
)
