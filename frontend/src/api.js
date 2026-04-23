import axios from 'axios'

const api = axios.create({ baseURL: '/api' })

api.interceptors.request.use(cfg => {
  const token = localStorage.getItem('token')
  if (token) cfg.headers.Authorization = `Bearer ${token}`
  return cfg
})

export const signup       = (data)   => api.post('/auth/signup', data)
export const login        = (data)   => api.post('/auth/login', data)
export const classify     = (data)   => api.post('/classify', data)
export const fraudScore   = (data)   => api.post('/fraud-score', data)
export const batchUpload  = (rows)   => api.post('/expense/batch', rows)
export const getForecast  = (uid)    => api.get(`/forecast/${uid}`)
export const getDashboard = (uid)    => api.get(`/dashboard/${uid}`)
export const getTransactions = (uid, params) => api.get(`/transactions/${uid}`, { params })
export const getCategories   = (uid) => api.get(`/categories/${uid}`)

export default api
