
import axios from 'axios';

// Backend API URL - safely fall back to deployed backend if VITE_API_URL is unset.
// Accepts values with or without protocol/trailing slash, e.g.
// "https://kinarika.vercel.app", "kinarika.vercel.app", "http://localhost:8000"
const rawBase = (import.meta.env.VITE_API_URL || 'https://kinarika.vercel.app').trim();
const withProtocol = /^https?:\/\//i.test(rawBase) ? rawBase : `https://${rawBase}`;
const PROD_BASE = withProtocol.replace(/\/+$/, '');
const API_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000/api/`
  : `${PROD_BASE}/api/`;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

export default api;