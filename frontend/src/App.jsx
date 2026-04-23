import { useEffect, useState } from 'react'
import { BrowserRouter, Routes, Route, Navigate, NavLink, useNavigate } from 'react-router-dom'
import Login        from './pages/Login'
import Dashboard    from './pages/Dashboard'
import Expenses     from './pages/Expenses'
import Forecast     from './pages/Forecast'
import Transactions from './pages/Transactions'

function Nav() {
  const navigate = useNavigate()
  const user     = JSON.parse(localStorage.getItem('user') || 'null')
  const [theme, setTheme] = useState(localStorage.getItem('theme') || 'dark')

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])

  if (!user) return null
  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    navigate('/login')
  }
  const toggleTheme = () => setTheme((prev) => (prev === 'dark' ? 'light' : 'dark'))
  return (
    <nav>
      <div className="nav-inner">
        <span className="brand">Smart <span>Expense</span> Analyzer</span>
        <div className="nav-links">
          <NavLink to="/dashboard">Dashboard</NavLink>
          <NavLink to="/expenses">Expenses</NavLink>
          <NavLink to="/transactions">Transactions</NavLink>
          <NavLink to="/forecast">Forecast</NavLink>
          <button
            className={`btn-theme ${theme === 'light' ? 'is-light' : ''}`}
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
            title={`Switch to ${theme === 'dark' ? 'light' : 'dark'} mode`}
          >
            <span className="theme-icon">🌙</span>
            <span className="theme-thumb"></span>
            <span className="theme-icon">☀️</span>
          </button>
          <button className="btn-logout" onClick={logout}>Logout</button>
        </div>
      </div>
    </nav>
  )
}

function Guard({ children }) {
  return localStorage.getItem('token') ? children : <Navigate to="/login" />
}

export default function App() {
  useEffect(() => {
    const savedTheme = localStorage.getItem('theme') || 'dark'
    document.documentElement.setAttribute('data-theme', savedTheme)
  }, [])

  return (
    <BrowserRouter>
      <Nav />
      <Routes>
        <Route path="/login"        element={<Login />} />
        <Route path="/dashboard"    element={<Guard><Dashboard /></Guard>} />
        <Route path="/expenses"     element={<Guard><Expenses /></Guard>} />
        <Route path="/transactions" element={<Guard><Transactions /></Guard>} />
        <Route path="/forecast"     element={<Guard><Forecast /></Guard>} />
        <Route path="*"             element={<Navigate to="/dashboard" />} />
      </Routes>
    </BrowserRouter>
  )
}
