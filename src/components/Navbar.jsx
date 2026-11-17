import { Moon, Sun } from 'lucide-react'
import { Link, NavLink, useLocation, useNavigate } from 'react-router-dom'
import { useTheme } from '../context/ThemeContext.jsx'
import logoLight from '../assets/scdaid-logo.png'
import logoDark from '../assets/scdaid-logo-dark.png'

export function Navbar({ ctaLabel = 'Try Demo Cases', ctaTo = '/demo' }) {
  const { theme, toggleTheme } = useTheme()
  const navigate = useNavigate()
  const location = useLocation()

  const goToSection = (id) => {
    if (location.pathname !== '/') {
      navigate({ pathname: '/', hash: id })
      return
    }
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  return (
    <header className="nav">
      <div className="nav-inner">
        <Link className="nav-brand" to="/">
          <img
            src={theme === 'dark' ? logoDark : logoLight}
            alt="SCDAid"
            className="nav-logo"
          />
        </Link>

        <nav className="nav-links" aria-label="Primary">
          <NavLink className={({ isActive }) => (isActive ? 'is-active' : undefined)} to="/" end>
            Home
          </NavLink>
          <button type="button" className="nav-text-btn" onClick={() => goToSection('about')}>
            About
          </button>
          <button type="button" className="nav-text-btn" onClick={() => goToSection('team')}>
            Team
          </button>
          <NavLink
            className={({ isActive }) => (isActive ? 'is-active' : undefined)}
            to="/demo"
          >
            Demo Cases
          </NavLink>
        </nav>

        <div className="nav-actions">
          <button
            type="button"
            className="nav-icon"
            aria-label={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
            onClick={toggleTheme}
          >
            {theme === 'dark' ? <Sun size={18} /> : <Moon size={18} />}
          </button>
          <Link className="btn btn-primary" to={ctaTo}>
            {ctaLabel}
          </Link>
        </div>
      </div>
    </header>
  )
}
