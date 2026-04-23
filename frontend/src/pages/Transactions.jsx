import { useEffect, useState, useCallback } from 'react'
import { getTransactions, getCategories } from '../api'

const RISK_OPTIONS = ['', 'low', 'medium', 'high']

export default function Transactions() {
  const user = JSON.parse(localStorage.getItem('user'))

  const [txns,       setTxns]       = useState([])
  const [categories, setCategories] = useState([])
  const [total,      setTotal]      = useState(0)
  const [pages,      setPages]      = useState(1)
  const [loading,    setLoading]    = useState(false)

  const [search,    setSearch]    = useState('')
  const [category,  setCategory]  = useState('')
  const [riskLabel, setRiskLabel] = useState('')
  const [dateFrom,  setDateFrom]  = useState('')
  const [dateTo,    setDateTo]    = useState('')
  const [page,      setPage]      = useState(1)

  const load = useCallback(async (p = 1) => {
    setLoading(true)
    try {
      const params = { page: p, limit: 20 }
      if (search)    params.search     = search
      if (category)  params.category   = category
      if (riskLabel) params.risk_label = riskLabel
      if (dateFrom)  params.date_from  = dateFrom
      if (dateTo)    params.date_to    = dateTo
      const { data } = await getTransactions(user.id, params)
      setTxns(data.transactions)
      setTotal(data.total)
      setPages(data.pages)
      setPage(p)
    } catch {
      setTxns([])
    } finally {
      setLoading(false)
    }
  }, [search, category, riskLabel, dateFrom, dateTo, user.id])

  useEffect(() => {
    getCategories(user.id).then(r => setCategories(r.data)).catch(() => {})
    load(1)
  }, []) // eslint-disable-line

  const handleFilter = (e) => { e.preventDefault(); load(1) }
  const clearFilters = () => {
    setSearch(''); setCategory(''); setRiskLabel(''); setDateFrom(''); setDateTo('')
    setTimeout(() => load(1), 0)
  }

  const hasFilters = search || category || riskLabel || dateFrom || dateTo

  return (
    <div className="page container fade-in">
      <div className="page-title">Transactions</div>

      {/* Filter bar */}
      <form onSubmit={handleFilter} className="card" style={{marginBottom:20}}>
        <div className="card-title" style={{marginBottom:12}}>Search & Filter</div>
        <div style={{display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr', gap:12, alignItems:'end', flexWrap:'wrap'}}>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Search description</label>
            <input className="form-input" placeholder="e.g. grocery, amazon..."
              value={search} onChange={e => setSearch(e.target.value)} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Category</label>
            <select className="form-select" value={category} onChange={e => setCategory(e.target.value)}>
              <option value="">All Categories</option>
              {categories.map(c => (
                <option key={c} value={c}>{c.replace(/_/g,' ')}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">Risk Level</label>
            <select className="form-select" value={riskLabel} onChange={e => setRiskLabel(e.target.value)}>
              {RISK_OPTIONS.map(r => (
                <option key={r} value={r}>{r ? r.charAt(0).toUpperCase()+r.slice(1) : 'All Risks'}</option>
              ))}
            </select>
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">From</label>
            <input className="form-input" type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          </div>
          <div className="form-group" style={{marginBottom:0}}>
            <label className="form-label">To</label>
            <input className="form-input" type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
        <div style={{display:'flex', gap:10, marginTop:14}}>
          <button type="submit" className="btn" disabled={loading}>
            {loading ? '⏳ Loading...' : '🔍 Apply Filters'}
          </button>
          {hasFilters && (
            <button type="button" className="btn" style={{background:'#f3f4f6', color:'#374151'}} onClick={clearFilters}>
              ✕ Clear
            </button>
          )}
        </div>
      </form>

      {/* Results */}
      <div className="card">
        <div style={{display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16}}>
          <div className="card-title" style={{marginBottom:0}}>
            Results
            <span style={{fontSize:13, color:'#6b7280', fontWeight:400, marginLeft:8}}>
              ({total} transaction{total !== 1 ? 's' : ''})
            </span>
          </div>
          {pages > 1 && (
            <div style={{display:'flex', gap:6, alignItems:'center', fontSize:13}}>
              <button className="btn" style={{padding:'5px 12px', fontSize:12, background: page<=1?'#f3f4f6':'#6366f1', color: page<=1?'#9ca3af':'#fff'}}
                onClick={() => load(page-1)} disabled={page <= 1}>← Prev</button>
              <span style={{color:'#6b7280'}}>Page {page} of {pages}</span>
              <button className="btn" style={{padding:'5px 12px', fontSize:12, background: page>=pages?'#f3f4f6':'#6366f1', color: page>=pages?'#9ca3af':'#fff'}}
                onClick={() => load(page+1)} disabled={page >= pages}>Next →</button>
            </div>
          )}
        </div>

        {loading ? (
          <div style={{padding:'40px', textAlign:'center', color:'#9ca3af'}}>Loading transactions...</div>
        ) : txns.length === 0 ? (
          <div className="empty-state">
            <div className="empty-icon">🔍</div>
            <p>{hasFilters ? 'No transactions match your filters.' : 'No transactions yet. Add expenses to see them here.'}</p>
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Amount</th>
                  <th>Category</th>
                  <th>Payment</th>
                  <th>Risk Score</th>
                  <th>Risk</th>
                  <th>Description</th>
                </tr>
              </thead>
              <tbody>
                {txns.map(t => (
                  <tr key={t.id}>
                    <td style={{color:'#6b7280', whiteSpace:'nowrap'}}>{t.date}</td>
                    <td><strong>R${t.amount?.toLocaleString()}</strong></td>
                    <td>{t.category?.replace(/_/g,' ') || <span style={{color:'#9ca3af'}}>—</span>}</td>
                    <td style={{fontSize:12}}>{t.payment_type?.replace(/_/g,' ')}</td>
                    <td>
                      {t.risk_score != null ? (
                        <div style={{display:'flex', alignItems:'center', gap:6}}>
                          <div style={{width:48, height:5, borderRadius:3, background:'#f3f4f6', overflow:'hidden'}}>
                            <div style={{
                              height:'100%', borderRadius:3,
                              width:`${(t.risk_score*100).toFixed(0)}%`,
                              background: t.risk_label==='high'?'#ef4444':t.risk_label==='medium'?'#f59e0b':'#10b981'
                            }}/>
                          </div>
                          <span style={{fontSize:12, color:'#6b7280'}}>{(t.risk_score*100).toFixed(0)}%</span>
                        </div>
                      ) : <span style={{color:'#9ca3af'}}>—</span>}
                    </td>
                    <td>
                      {t.risk_label
                        ? <span className={`badge badge-${t.risk_label}`}>{t.risk_label.toUpperCase()}</span>
                        : <span style={{color:'#9ca3af'}}>—</span>}
                    </td>
                    <td style={{color:'#6b7280', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>
                      {t.description || <span style={{color:'#d1d5db'}}>—</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  )
}
