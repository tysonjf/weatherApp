import { useEffect, type ReactNode } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router'
import { Icon } from './Icon'
import { UpdatePrompt } from './UpdatePrompt'
import { useSettings } from '../state/store'

export function Layout() {
  const { theme } = useSettings()
  const location = useLocation()

  useEffect(() => {
    const root = document.documentElement
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'auto' && media.matches)
      root.dataset.theme = dark ? 'dark' : 'light'
      document.querySelector('meta[name="theme-color"]')?.setAttribute('content', dark ? '#0f141d' : '#f6efe2')
    }
    apply()
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  useEffect(() => {
    window.scrollTo({ top: 0 })
  }, [location.pathname])

  return (
    <div className="app">
      <Outlet />
      <BottomNav />
      <UpdatePrompt />
    </div>
  )
}

function BottomNav() {
  return (
    <nav className="bottomnav no-print" aria-label="Main">
      <NavLink to="/" end>
        <Icon name="home" size={22} />
        Doughs
      </NavLink>
      <NavLink to="/tools">
        <Icon name="calc" size={22} />
        Tools
      </NavLink>
      <NavLink to="/new" aria-label="New dough">
        <span className="new-dot">
          <Icon name="plus" size={24} strokeWidth={2.6} />
        </span>
      </NavLink>
      <NavLink to="/guides">
        <Icon name="book" size={22} />
        Guides
      </NavLink>
      <NavLink to="/settings">
        <Icon name="sliders" size={22} />
        Settings
      </NavLink>
    </nav>
  )
}

export function TopBar({
  title,
  back,
  actions,
  brand,
}: {
  title?: ReactNode
  /** true = history back, string = explicit path */
  back?: boolean | string
  actions?: ReactNode
  brand?: boolean
}) {
  const navigate = useNavigate()
  return (
    <header className="topbar">
      {back && (
        <button
          className="icon-btn"
          aria-label="Back"
          onClick={() => (typeof back === 'string' ? navigate(back) : navigate(-1))}
        >
          <Icon name="chevronLeft" size={22} />
        </button>
      )}
      {brand ? (
        <NavLink to="/" className="brand">
          <img src={`${import.meta.env.BASE_URL}pwa-64x64.png`} alt="" width={30} height={30} />
          <span>Pizza Weather</span>
        </NavLink>
      ) : (
        <div className="title">{title}</div>
      )}
      {brand && <div className="spacer" />}
      {actions}
    </header>
  )
}
