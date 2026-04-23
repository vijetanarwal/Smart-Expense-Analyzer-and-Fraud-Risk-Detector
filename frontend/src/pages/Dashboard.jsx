import { useEffect, useState } from 'react'
import {
  PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  LineChart, Line, Area, AreaChart
} from 'recharts'
import { getDashboard } from '../api'

const COLORS = ['#6366f1','#10b981','#f59e0b','#ef4444','#8b5cf6','#06b6d4','#ec4899','#84cc16']

export default function Dashboard() {
  const [data,  setData]  = useState(null)
  const [error, setError] = useState('')
  const user = JSON.parse(localStorage.getItem('user'))

  useEffect(() => {
    getDashboard(user.id)
      .then(r => setData(r.data))
      .catch(() => setError('No data yet. Add some expenses first.'))
  }, [])

  if (error) return (
    <div className="page container fade-in">
      <div className="page-title">Dashboard</div>
      <div className="card">
        <div className="empty-state">
          <div className="empty-icon">📊</div>
          <p>{error}</p>
        </div>
      </div>
    </div>
  )

  if (!data?.summary) return (
    <div className="page container fade-in">
      <div className="page-title">Dashboard</div>
      <p style={{color:'#6b7280'}}>Loading...</p>
    </div>
  )

  const { summary, category_breakdown, monthly_trend, risk_distribution, flagged_transactions } = data

  const riskData = Object.entries(risk_distribution || {}).map(([k, v]) => ({
    name: k.charAt(0).toUpperCase() + k.slice(1), value: v,
    fill: k === 'high' ? '#ef4444' : k === 'medium' ? '#f59e0b' : '#10b981'
  }))

  return (
    <div className="page container fade-in">
      <div className="page-title">Dashboard</div>

      <div className="stats-grid">
        {[
          { label: 'Total Transactions', value: summary.total_transactions },
          { label: 'Total Spend',        value: `R$${summary.total_spend?.toLocaleString()}` },
          { label: 'Flagged',            value: summary.flagged_count },
          { label: 'Avg Transaction',    value: `R$${summary.avg_transaction}` },
        ].map((s, i) => (
          <div className="stat-card slide-up" key={s.label} style={{animationDelay: `${i*0.07}s`}}>
            <div className="stat-label">{s.label}</div>
            <div className="stat-value">{s.value}</div>
          </div>
        ))}
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Spend by Category</div>
          <ResponsiveContainer width="100%" height={260}>
            <PieChart>
              <Pie data={category_breakdown?.slice(0,8)} dataKey="amount" nameKey="category"
                cx="50%" cy="50%" outerRadius={95} innerRadius={40}>
                {category_breakdown?.slice(0,8).map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Pie>
              <Tooltip formatter={(v) => [`R$${v.toLocaleString()}`, 'Amount']} />
              <Legend formatter={(v) => v.replace(/_/g,' ')} iconType="circle" iconSize={8} />
            </PieChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Monthly Spend Trend</div>
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={monthly_trend}>
              <defs>
                <linearGradient id="spendGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#6366f1" stopOpacity={0.15}/>
                  <stop offset="95%" stopColor="#6366f1" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="month" tick={{fontSize:11}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip formatter={(v) => [`R$${v.toLocaleString()}`, 'Spend']} />
              <Area type="monotone" dataKey="spend" stroke="#6366f1" strokeWidth={2.5}
                fill="url(#spendGrad)" dot={{ r:4, fill:'#6366f1' }} />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid-2">
        <div className="card">
          <div className="card-title">Risk Distribution</div>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={riskData} barSize={48}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
              <XAxis dataKey="name" tick={{fontSize:12}} />
              <YAxis tick={{fontSize:11}} />
              <Tooltip />
              <Bar dataKey="value" radius={[6,6,0,0]}>
                {riskData.map((d, i) => <Cell key={i} fill={d.fill} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="card">
          <div className="card-title">Flagged Transactions</div>
          {flagged_transactions?.length === 0
            ? <div className="empty-state"><div className="empty-icon">✅</div><p>No flagged transactions</p></div>
            : <div className="table-wrap">
                <table>
                  <thead><tr><th>Amount</th><th>Category</th><th>Risk</th><th>Date</th></tr></thead>
                  <tbody>
                    {flagged_transactions?.slice(0,6).map(t => (
                      <tr key={t.id}>
                        <td><strong>R${t.amount}</strong></td>
                        <td>{t.category?.replace(/_/g,' ')}</td>
                        <td><span className="badge badge-high">High</span></td>
                        <td style={{color:'#6b7280'}}>{t.date}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
          }
        </div>
      </div>

      <div className="card">
        <div className="card-title">Top Categories by Spend</div>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={category_breakdown?.slice(0,8).map(c => ({...c, category: c.category.replace(/_/g,' ')}))} layout="vertical" barSize={18}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" horizontal={false} />
            <XAxis type="number" tick={{fontSize:11}} />
            <YAxis type="category" dataKey="category" tick={{fontSize:11}} width={130} />
            <Tooltip formatter={(v) => [`R$${v.toLocaleString()}`, 'Amount']} />
            <Bar dataKey="amount" fill="#6366f1" radius={[0,6,6,0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}