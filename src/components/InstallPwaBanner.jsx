import { useEffect, useState } from 'react'
import { X, Download, Share, ChevronDown } from 'lucide-react'

const DISMISS_KEY_ANDROID = 'mp_pwa_install_dismissed'
const DISMISS_KEY_IOS = 'mp_pwa_install_dismissed_ios'

// Safari en iOS no soporta beforeinstallprompt (Apple no expone ninguna API
// para disparar la instalación desde código) — es el único navegador que
// permite instalar de verdad ("Añadir a pantalla de inicio"), así que hay
// que distinguirlo tanto de Chrome/Android como de otros navegadores en
// iOS (Chrome/Firefox/Edge para iOS son WebKit por debajo pero no ofrecen
// instalación completa).
function isIosSafari() {
  const ua = navigator.userAgent
  const isIosDevice = /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)
  const isOtherIosBrowser = /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua)
  return isIosDevice && !isOtherIosBrowser
}

function isStandalone() {
  return window.navigator.standalone === true || window.matchMedia('(display-mode: standalone)').matches
}

export function InstallPwaBanner() {
  const [installEvent, setInstallEvent] = useState(null)
  const [platform, setPlatform] = useState(null) // 'android' | 'ios' | null
  const [dismissed, setDismissed] = useState(false)

  useEffect(() => {
    if (isStandalone()) return

    if (isIosSafari()) {
      setPlatform('ios')
      setDismissed(localStorage.getItem(DISMISS_KEY_IOS) === '1')
      return
    }

    setPlatform('android')
    setDismissed(localStorage.getItem(DISMISS_KEY_ANDROID) === '1')
    function onBeforeInstallPrompt(e) {
      e.preventDefault()
      setInstallEvent(e)
    }
    window.addEventListener('beforeinstallprompt', onBeforeInstallPrompt)
    return () => window.removeEventListener('beforeinstallprompt', onBeforeInstallPrompt)
  }, [])

  const showIos = platform === 'ios'
  if (dismissed) return null
  if (!showIos && !installEvent) return null

  async function handleInstall() {
    installEvent.prompt()
    await installEvent.userChoice
    setInstallEvent(null)
  }

  function handleDismiss() {
    localStorage.setItem(showIos ? DISMISS_KEY_IOS : DISMISS_KEY_ANDROID, '1')
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
      {showIos ? (
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.4 }}>
          <strong>Instala HoMenu</strong>
          <div style={{ opacity: 0.9, marginTop: 4, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: '4px 6px' }}>
            <span>Toca</span>
            <Share size={16} style={{ flexShrink: 0 }} />
            <span>y luego <strong>"Añadir a pantalla de inicio"</strong></span>
          </div>
        </div>
      ) : (
        <div style={{ flex: 1, fontSize: 14, lineHeight: 1.35 }}>
          <strong>Instala HoMenu</strong>
          <div style={{ opacity: 0.8, marginTop: 2 }}>Acceso directo desde tu pantalla de inicio, sin buscarlo en el navegador.</div>
        </div>
      )}
      {showIos ? (
        <ChevronDown
          size={20}
          style={{ flexShrink: 0, opacity: 0.7, animation: 'mp-install-bounce 1.4s ease-in-out infinite' }}
        />
      ) : (
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
      )}
      <button
        onClick={handleDismiss}
        aria-label="Cerrar"
        style={{ background: 'none', border: 'none', color: '#fff', opacity: 0.6, cursor: 'pointer', padding: 4, flexShrink: 0 }}
      >
        <X size={18} />
      </button>
      {showIos && (
        <style>{`
          @keyframes mp-install-bounce {
            0%, 100% { transform: translateY(0); }
            50% { transform: translateY(4px); }
          }
        `}</style>
      )}
    </div>
  )
}
