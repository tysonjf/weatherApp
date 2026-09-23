import { useEffect } from 'react'
import { useRegisterSW } from 'virtual:pwa-register/react'

/** Shows a toast when a new version of the app is ready or when it became available offline. */
export function UpdatePrompt() {
  const {
    offlineReady: [offlineReady, setOfflineReady],
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      // Check for updates every hour while the app stays open.
      if (registration) setInterval(() => void registration.update(), 60 * 60 * 1000)
    },
  })

  // "Works offline" is good news, not a decision — let it fade away on its own.
  useEffect(() => {
    if (!offlineReady || needRefresh) return
    const t = setTimeout(() => setOfflineReady(false), 5000)
    return () => clearTimeout(t)
  }, [offlineReady, needRefresh, setOfflineReady])

  if (!offlineReady && !needRefresh) return null

  return (
    <div className="toast" role="status">
      <span className="grow">
        {needRefresh ? 'A fresh batch of Pizza Weather is ready.' : 'Pizza Weather now works offline.'}
      </span>
      {needRefresh && (
        <button className="btn primary sm" onClick={() => void updateServiceWorker(true)}>
          Reload
        </button>
      )}
      <button
        className="btn ghost sm"
        style={{ color: 'inherit' }}
        onClick={() => {
          setOfflineReady(false)
          setNeedRefresh(false)
        }}
      >
        Dismiss
      </button>
    </div>
  )
}
