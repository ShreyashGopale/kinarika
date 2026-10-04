
import axios from 'axios';

// Backend API URL
const API_URL = import.meta.env.DEV
  ? `http://${window.location.hostname}:8000/api/`
  : `${import.meta.env.VITE_API_URL}/api/`;

const api = axios.create({
  baseURL: API_URL,
  withCredentials: true,
  xsrfCookieName: 'csrftoken',
  xsrfHeaderName: 'X-CSRFToken',
});

export default api;