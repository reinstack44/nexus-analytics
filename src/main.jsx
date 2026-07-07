import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import './i18n'
import { AuthProvider } from './context/AuthContext.jsx'
import { ThemeProvider } from './context/ThemeContext.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    {/* AuthProvider app ko wrap kar raha hai */}
    <ThemeProvider>
      <AuthProvider>
      <App />
    </AuthProvider>
    </ThemeProvider>
  </StrictMode>,
)