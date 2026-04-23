import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { login, signup } from '../api'

export default function Login() {
  const [mode, setMode]     = useState('login')
  const [form, setForm]     = useState({ name: '', email: '', password: '' })
  const [error, setError]   = useState('')
  const [loading, setLoading] = useState(false)
  const navigate = useNavigate()

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    setError(''); setLoading(true)
    try {
      const { data } = await (mode === 'login' ? login(form) : signup(form))
      localStorage.setItem('token', data.token)
      localStorage.setItem('user', JSON.stringify(data.user))
      navigate('/dashboard')
    } catch (e) {
      setError(e.response?.data?.detail || 'Something went wrong')
    } finally { setLoading(false) }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-box">
        <div className="auth-logo">💳</div>
        <div className="auth-title">Smart Expense Analyzer</div>
        <div className="auth-subtitle">
          {mode === 'login' ? 'Sign in to your account' : 'Create a new account'}
        </div>

        {error && <div className="alert alert-error">⚠ {error}</div>}

        {mode === 'signup' && (
          <div className="form-group">
            <label className="form-label">Full Name</label>
            <input className="form-input" placeholder="Your name" value={form.name} onChange={set('name')} />
          </div>
        )}
        <div className="form-group">
          <label className="form-label">Email Address</label>
          <input className="form-input" placeholder="email@example.com" value={form.email} onChange={set('email')} />
        </div>
        <div className="form-group">
          <label className="form-label">Password</label>
          <input className="form-input" type="password" placeholder="Enter your password"
            value={form.password} onChange={set('password')}
            onKeyDown={(e) => e.key === 'Enter' && submit()} />
        </div>

        <button className="btn-primary" onClick={submit} disabled={loading}>
          {loading ? 'Please wait...' : mode === 'login' ? 'Sign In' : 'Create Account'}
        </button>

        <div className="auth-toggle">
          {mode === 'login'
            ? <>Don't have an account? <span onClick={() => { setMode('signup'); setError('') }}>Sign up free</span></>
            : <>Already have an account? <span onClick={() => { setMode('login'); setError('') }}>Sign in</span></>}
        </div>
      </div>
    </div>
  )
}