import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
// Fontes servidas pelo próprio site (nenhuma requisição ao Google Fonts).
import '@fontsource-variable/plus-jakarta-sans/wght.css'
import '@fontsource-variable/fraunces/opsz.css'
import './styles/base.css'
import App from './App.jsx'

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <App />
  </StrictMode>,
)
