import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { App } from './App'
import { I18nProvider } from './i18n'
import { ProfilProvider } from './profil/useProfil'
import './styles.css'

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <I18nProvider>
      <ProfilProvider>
        <App />
      </ProfilProvider>
    </I18nProvider>
  </StrictMode>
)
