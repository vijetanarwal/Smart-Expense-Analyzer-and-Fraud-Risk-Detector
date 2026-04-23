import { useState } from 'react'
import { classify, fraudScore, batchUpload } from '../api'

const PAYMENT_TYPES = ['credit_card','debit_card','boleto','voucher']
const empty = { amount: '', freight: '', payment_type: 'credit_card', installments: '1', description: '' }

export default function Expenses() {
  const [tab,        setTab]        = useState('manual')
  const [form,       setForm]       = useState(empty)
  const [result,     setResult]     = useState(null)
  const [fraud,      setFraud]      = useState(null)
  const [error,      setError]      = useState('')
  const [loading,    setLoading]    = useState(false)
  const [csvResults, setCsvResults] = useState([])
  const [csvFile,    setCsvFile]    = useState(null)
  const [csvLoading, setCsvLoading] = useState(false)
  const [csvError,   setCsvError]   = useState('')

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value })

  const submit = async () => {
    if (!form.amount) { setError('Amount is required'); return }
    setError(''); setLoading(true); setResult(null); setFraud(null)
    try {
      const payload = { ...form, amount: +form.amount, freight: +(form.freight||0), installments: +form.installments }
      const [c, f]  = await Promise.all([classify(payload), fraudScore(payload)])
      setResult(c.data); setFraud(f.data)
      setForm(empty)
    } catch (e) { setError(e.response?.data?.detail || 'Error analyzing expense') }
    finally { setLoading(false) }
  }

  const handleFileChange = (e) => {
    setCsvFile(e.target.files[0])
    setCsvResults([])
    setCsvError('')
  }

  const handleCSVUpload = async () => {
    if (!csvFile) { setCsvError('Please select a CSV file'); return }
    setCsvLoading(true); setCsvError('')
    try {
      const parseCsvLine = (line) => (
        line
          .split(/,(?=(?:(?:[^\"]*\"){2})*[^\"]*$)/)
          .map((v) => v.trim().replace(/^\"|\"$/g, ''))
      )

      const text    = await csvFile.text()
      const lines   = text.trim().split(/\r?\n/).filter(Boolean)
      if (lines.length < 2) throw new Error('CSV must include header + at least one row')

      const headers = parseCsvLine(lines[0])
      const rows    = lines.slice(1).map(line => {
        const vals = parseCsvLine(line)
        const obj  = {}
        headers.forEach((h, i) => { obj[h] = vals[i]?.trim() })
        return {
          amount:       +obj.amount || 0,
          freight:      +obj.freight || 0,
          payment_type: obj.payment_type || 'credit_card',
          installments: +obj.installments || 1,
          description:  obj.description || '',
          created_at:   obj.created_at || null
        }
      })
      const { data } = await batchUpload(rows)
      setCsvResults(data.results)
    } catch (e) { setCsvError(e.response?.data?.detail || e.message || 'CSV upload failed. Check file format.') }
    finally { setCsvLoading(false) }
  }

  return (
    <div className="page container fade-in">
      <div className="page-title">Expenses</div>

      <div className="tabs">
        <div className={`tab ${tab==='manual'?'active':''}`} onClick={() => setTab('manual')}>Manual Entry</div>
        <div className={`tab ${tab==='csv'?'active':''}`} onClick={() => setTab('csv')}>CSV Upload</div>
      </div>

      {tab === 'manual' && (
        <div className="grid-2" style={{alignItems:'start'}}>
          <div className="card">
            <div className="card-title">Add New Expense</div>
            {error && <div className="alert alert-error">⚠ {error}</div>}

            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Amount (R$)</label>
                <input className="form-input" type="number" placeholder="e.g. 250.00" value={form.amount} onChange={set('amount')} />
              </div>
              <div className="form-group">
                <label className="form-label">Freight / Shipping (R$)</label>
                <input className="form-input" type="number" placeholder="e.g. 15.00" value={form.freight} onChange={set('freight')} />
              </div>
            </div>
            <div className="grid-2">
              <div className="form-group">
                <label className="form-label">Payment Type</label>
                <select className="form-select" value={form.payment_type} onChange={set('payment_type')}>
                  {PAYMENT_TYPES.map(p => <option key={p} value={p}>{p.replace(/_/g,' ')}</option>)}
                </select>
              </div>
              <div className="form-group">
                <label className="form-label">Installments</label>
                <input className="form-input" type="number" min="1" value={form.installments} onChange={set('installments')} />
              </div>
            </div>
            <div className="form-group">
              <label className="form-label">Description (optional)</label>
              <input className="form-input" placeholder="e.g. grocery shopping" value={form.description} onChange={set('description')} />
            </div>
            <button className="btn" style={{width:'100%', justifyContent:'center'}} onClick={submit} disabled={loading}>
              {loading ? '⏳ Analyzing...' : '🔍 Analyze & Save'}
            </button>
          </div>

          <div>
            {result && fraud && (
              <div className="card">
                <div className="card-title">Analysis Result</div>
                <div className="result-card">
                  <div className="result-row">
                    <span className="result-label">Category</span>
                    <span className="result-value">{result.category?.replace(/_/g,' ')}</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Confidence</span>
                    <span className="result-value">{(result.confidence*100).toFixed(1)}%</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Fraud Risk Score</span>
                    <span className="result-value">{(fraud.risk_score*100).toFixed(1)}%</span>
                  </div>
                  <div className="result-row">
                    <span className="result-label">Risk Level</span>
                    <span className={`badge badge-${fraud.risk_label}`}>{fraud.risk_label?.toUpperCase()}</span>
                  </div>
                </div>
                <div className={`risk-bar risk-${fraud.risk_label}`}>
                  <div className="risk-dot"></div>
                  {fraud.flagged ? '⚠ Transaction Flagged as Suspicious' : '✓ Transaction looks normal'}
                </div>
                {fraud?.explanation && Object.entries(fraud.explanation).some(([,v]) => v==='high') && (
                  <div style={{marginTop:12}}>
                    <div style={{fontSize:12, color:'#6b7280', marginBottom:6}}>Risk signals detected:</div>
                    <div style={{display:'flex', gap:6, flexWrap:'wrap'}}>
                      {Object.entries(fraud.explanation).filter(([,v]) => v==='high').map(([k]) => (
                        <span key={k} className="badge badge-high">{k.replace(/_/g,' ')}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
            {!result && (
              <div className="card">
                <div className="empty-state">
                  <div className="empty-icon">💡</div>
                  <p>Fill in the form and click Analyze to get AI-powered category prediction and fraud risk score.</p>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'csv' && (
        <div className="card">
          <div className="card-title">Bulk Upload via CSV</div>
          <div className="alert alert-info">
            📋 CSV columns: <strong>amount, freight, payment_type, installments, description, created_at</strong>
          </div>
          {csvError && <div className="alert alert-error">⚠ {csvError}</div>}

          <div className="file-upload-area" onClick={() => document.getElementById('csvInput').click()}>
            <input id="csvInput" type="file" accept=".csv" onChange={handleFileChange} />
            <div className="upload-icon">📂</div>
            <div className="upload-text">{csvFile ? csvFile.name : 'Click to choose CSV file'}</div>
            <div className="upload-hint">or drag and drop your file here</div>
          </div>

          {csvFile && (
            <button className="btn" style={{marginTop:16}} onClick={handleCSVUpload} disabled={csvLoading}>
              {csvLoading ? '⏳ Processing...' : '⬆ Upload & Analyze'}
            </button>
          )}

          {csvResults.length > 0 && (
            <div style={{marginTop:20}}>
              <div className="alert alert-success">✓ {csvResults.length} transactions processed successfully</div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>Amount</th><th>Category</th><th>Risk Score</th><th>Risk Level</th></tr>
                  </thead>
                  <tbody>
                    {csvResults.map((r, i) => (
                      <tr key={i}>
                        <td><strong>R${r.amount}</strong></td>
                        <td>{r.category?.replace(/_/g,' ')}</td>
                        <td>{(r.risk_score*100).toFixed(1)}%</td>
                        <td><span className={`badge badge-${r.risk_label}`}>{r.risk_label?.toUpperCase()}</span></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}