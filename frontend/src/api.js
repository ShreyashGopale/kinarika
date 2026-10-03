import axios from 'axios';

// Single axios instance – every component imports this
const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL || `http://${window.location.hostname}:8000/api/`,
  withCredentials: true,            // send session cookie
  xsrfCookieName: 'csrftoken',     // Django CSRF cookie name
  xsrfHeaderName: 'X-CSRFToken',   // Django CSRF header name
});

export default api;
