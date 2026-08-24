import { useEffect, useState } from 'react'
import { X, Download } from 'lucide-react'

const DISMISS_KEY = 'mp_pwa_install_dismissed'

// Chrome/Android dispara `beforeinstallprompt` cuando la PWA cumple los
// criterios de instalación (manifest + service worker + HTTPS). Lo
// capturamos para mostrar un CTA propio en vez de depender de que el
// usuario encuentre la opción en el menú del navegador — importante para
// un piloto con gente a la que estamos guiando nosotros mismos.
export function InstallPwaBanner() {
  const [installEvent, setInstallEvent] = useState(null)
  const [dismissed, setDismissed] = useState(() => localStorage.getItem(DISMISS_KEY) === '1')

  useEffect(() => {
    function onBeforeInstallPrompt(e) {
      e.preventDefault()
      setInstallEvent(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  if (!installEvent || dismissed) return null

  async function handleInstall() {
    installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, '1')
    setDismissed(true)
  }

  return (
    <div
      style={{
        position: 'fixed',
        left: '50%',
        bottom: 'calc(16px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        zIndex: 9999,
        width: 'calc(100% - 32px)',
        maxWidth: 420,
        background: '#1a1025',
        color: '#fff',
        borderRadius: 16,
        padding: '14px 14px 14px 18px',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        boxShadow: '0 8px 24px rgba(0,0,0,0.28)',
      }}
    >
      <div style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
        <strong>Instala MenúPlan</strong>
        <div style={{ opacity: 0.8, marginTop: 2 }}>Acceso directo desde tu pantalla de inicio, sin buscarlo en el navegador.</div>
      </div>
      <button
        onClick={handleInstall}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          background: '#7e14ff',
          color: '#fff',
          border: 'none',
          borderRadius: 10,
          padding: '10px 14px',
          fontSize: 14,
          fontWeight: 600,
          whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        <Download size={16} />
        Instalar
      </button>
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer', padding: 4 }}
      >
        <X size={18} />
      </button>
    </div>
  )
}
