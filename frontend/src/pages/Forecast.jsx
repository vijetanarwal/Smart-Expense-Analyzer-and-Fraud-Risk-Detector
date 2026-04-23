import { useEffect, useState } from 'react'
import {
  ComposedChart, Line, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine, Legend, ErrorBar
} from 'recharts'
import { getForecast } from '../api'

export default function Forecast() {
  const [data,  setData]  = useState(null)
  const [error, setError] = useState('')
  const user = JSON.parse(localStorage.getItem('user'))

  useEffect(() => {
    getForecast(user.id)
      .then(r => setData(r.data))
      .catch(() => setError('Could not load forecast data.'))
  }, [])

  if (error) return (
    <div className="page container fade-in">
      <div className="page-title">Forecast</div>
      <div className="card"><div className="empty-state"><div className="empty-icon">📈</div><p>{error}</p></div></div>
    </div>
  )

  if (!data) return (
    <div className="page container fade-in">
      <div className="page-title">Forecast</div>
      <p style={{color:'#6b7280'}}>Loading...</p>
    </div>
  )

  if (!data.forecast_next_month) return (
    <div className="page container fade-in">
      <div className="page-title">Forecast</div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon">📅</div>
          <p>{data.message || 'Need more data for LSTM forecast.'}</p>
          <p style={{fontSize:13, marginTop:8, color:'#9ca3af'}}>You have {data.months_available || 0} month(s) of data.</p>
        </div>
      </div>
    </div>
  )

  const history  = data.monthly_history || []
  const errorBar = data.forecast_upper != null
    ? [[data.forecast_next_month - data.forecast_lower, data.forecast_upper - data.forecast_next_month]]
    : undefined

  const chartData = [
    ...history.map(h => ({ month: h.month, actual: h.spend })),
    {
      month: 'Next Month',
      actual: null,
      forecast: data.forecast_next_month,
      error: errorBar ? [data.forecast_next_month - data.forecast_lower, data.forecast_upper - data.forecast_next_month] : undefined
    }
  ]

  const trend = history.length >= 2
    ? ((history[history.length-1].spend - history[0].spend) / history[0].spend * 100).toFixed(1)
    : null

  const confColor = data.confidence === 'high' ? '#10b981' : '#f59e0b'
  const improve   = data.naive_mae && data.test_mae
    ? ((1 - data.test_mae / data.naive_mae) * 100).toFixed(1)
    : null

  return (
    <div className="page container fade-in">
      <div className="page-title">Spending Forecast</div>

      {/* Model info bar */}
      <div style={{display:'flex', gap:10, marginBottom:16, flexWrap:'wrap', alignItems:'center'}}>
        <span className="chip">Model: <span style={{color:'#6366f1'}}>LSTM (PyTorch)</span></span>
        <span className="chip">Confidence: <span style={{color: confColor}}>{data.confidence?.toUpperCase()}</span>
          {' '}({data.months_available} months)
        </span>
        {data.test_mae != null && (
          <span className="chip">Test MAE: <span style={{color:'#6366f1'}}>R${data.test_mae?.toLocaleString()}</span></span>
        )}
        {data.test_rmse != null && (
          <span className="chip">Test RMSE: <span style={{color:'#6366f1'}}>R${data.test_rmse?.toLocaleString()}</span></span>
        )}
        {improve != null && (
          <span className="chip" style={{background:'#f0fdf4', color:'#16a34a'}}>
            +{improve}% vs naive baseline
          </span>
        )}
        {data.forecast_lower != null && (
          <span className="chip" style={{background:'#eff6ff', color:'#2563eb'}}>
            80% CI: R${data.forecast_lower?.toLocaleString()} – R${data.forecast_upper?.toLocaleString()}
          </span>
        )}
      </div>

      {/* Stats */}
      <div className="forecast-stats">
        <div className="forecast-stat slide-up">
          <div className="fs-label">Forecast Next Month</div>
          <div className="fs-value" style={{color:'#6366f1'}}>R${data.forecast_next_month?.toLocaleString()}</div>
          {data.forecast_lower != null && (
            <div style={{fontSize:11, color:'#9ca3af', marginTop:4}}>
              R${data.forecast_lower?.toLocaleString()} – R${data.forecast_upper?.toLocaleString()}
            </div>
          )}
        </div>
        <div className="forecast-stat slide-up" style={{animationDelay:'0.08s'}}>
          <div className="fs-label">Avg Last 3 Months</div>
          <div className="fs-value">R${data.avg_last_3_months?.toLocaleString()}</div>
        </div>
        <div className="forecast-stat slide-up" style={{animationDelay:'0.16s'}}>
          <div className="fs-label">Trend</div>
          <div className="fs-value" style={{color: trend > 0 ? '#ef4444' : '#10b981'}}>
            {trend ? `${trend > 0 ? '+' : ''}${trend}%` : 'N/A'}
          </div>
        </div>
      </div>

      <div className={`risk-bar risk-${data.overspending_risk}`}>
        <div className="risk-dot"></div>
        Overspending Risk: <strong>{data.overspending_risk?.toUpperCase()}</strong>
        {data.overspending_risk === 'high'   && ' — Forecast is 20%+ above your average'}
        {data.overspending_risk === 'medium' && ' — Forecast slightly above average'}
        {data.overspending_risk === 'low'    && ' — Spending within normal range'}
      </div>

      <div className="card">
        <div className="card-title">Spending Trend + LSTM Forecast</div>
        <p style={{fontSize:12, color:'#9ca3af', marginBottom:12}}>
          Error bars show 80% confidence interval on forecast
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <ComposedChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis dataKey="month" tick={{fontSize:11}} />
            <YAxis tick={{fontSize:11}} />
            <Tooltip formatter={(v, n) => v != null ? [`R$${Number(v).toLocaleString()}`, n === 'actual' ? 'Actual' : 'Forecast'] : ['-', n]} />
            <Legend />
            <ReferenceLine x="Next Month" stroke="#f59e0b" strokeDasharray="5 3"
              label={{value:'Forecast', fill:'#f59e0b', fontSize:11}} />
            <Line type="monotone" dataKey="actual" stroke="#6366f1" strokeWidth={2.5}
              dot={{ r:5, fill:'#6366f1' }} connectNulls={false} name="Actual" />
            <Bar dataKey="forecast" fill="#f59e0b" opacity={0.85} radius={[6,6,0,0]} name="Forecast" barSize={40}>
              {errorBar && <ErrorBar dataKey="error" width={6} strokeWidth={2} stroke="#d97706" />}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>
      </div>

      <div className="card">
        <div className="card-title">Monthly Breakdown</div>
        <div className="table-wrap">
          <table>
            <thead>
              <tr><th>Month</th><th>Spend</th><th>vs Previous</th></tr>
            </thead>
            <tbody>
              {history.map((r, i) => {
                const prev = i > 0 ? history[i-1].spend : null
                const diff = prev ? ((r.spend - prev) / prev * 100).toFixed(1) : null
                return (
                  <tr key={r.month}>
                    <td><strong>{r.month}</strong></td>
                    <td>R${r.spend?.toLocaleString()}</td>
                    <td>{diff
                      ? <span style={{color: diff > 0 ? '#ef4444' : '#10b981', fontWeight:600}}>
                          {diff > 0 ? '▲' : '▼'} {Math.abs(diff)}%
                        </span>
                      : <span style={{color:'#9ca3af'}}>—</span>}
                    </td>
                  </tr>
                )
              })}
              <tr style={{background:'#fefce8'}}>
                <td><strong style={{color:'#d97706'}}>Next Month (Forecast)</strong></td>
                <td>
                  <strong style={{color:'#d97706'}}>R${data.forecast_next_month?.toLocaleString()}</strong>
                  {data.forecast_lower != null && (
                    <span style={{fontSize:11, color:'#9ca3af', marginLeft:6}}>
                      ±R${Math.round((data.forecast_upper - data.forecast_lower) / 2).toLocaleString()}
                    </span>
                  )}
                </td>
                <td>
                  {history.length > 0 && (() => {
                    const last = history[history.length-1].spend
                    const d    = ((data.forecast_next_month - last) / last * 100).toFixed(1)
                    return <span style={{color: d > 0 ? '#ef4444' : '#10b981', fontWeight:600}}>
                      {d > 0 ? '▲' : '▼'} {Math.abs(d)}%
                    </span>
                  })()}
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}
