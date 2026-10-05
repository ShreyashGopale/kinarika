
import axios from 'axios';

// Backend API URL - safely fall back to deployed backend if VITE_API_URL is unset
const PROD_BASE = import.meta.env.VITE_API_URL || 'https://kinarika.vercel.app';
const API_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000/api/`
  : (PROD_BASE.endsWith('/') ? `${PROD_BASE}api/` : `${PROD_BASE}/api/`);

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

export default api;