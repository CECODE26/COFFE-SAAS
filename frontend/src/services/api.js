import axios from 'axios';

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

// Create axios instance
const api = axios.create({
  baseURL: API_BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
});

// Add token to requests
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('access_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Endpoints de autenticación: un 401 aquí es un error del formulario, no una sesión vencida
const AUTH_ENDPOINTS = ['/auth/login/', '/auth/refresh/', '/auth/register/'];

// Sesión perdida o vencida: limpiamos y mandamos al login con aviso.
// Devolvemos una promesa que no se resuelve para que la pantalla no muestre
// su propio error mientras el navegador ya está cambiando de página.
const sesionExpirada = () => {
  localStorage.removeItem('access_token');
  localStorage.removeItem('refresh_token');
  localStorage.removeItem('user');
  if (window.location.pathname !== '/login') {
    window.location.replace('/login?sesion=expirada');
  }
  return new Promise(() => {});
};

// Una sola renovación a la vez: si varias peticiones vencen juntas, todas esperan la misma
let renovando = null;
const renovarAcceso = () => {
  if (!renovando) {
    const refresh = localStorage.getItem('refresh_token');
    renovando = axios
      .post(`${API_BASE_URL}/auth/refresh/`, { refresh })
      .then(({ data }) => {
        localStorage.setItem('access_token', data.access);
        // Con ROTATE_REFRESH_TOKENS el backend entrega también una llave de renovación nueva
        if (data.refresh) localStorage.setItem('refresh_token', data.refresh);
        return data.access;
      })
      .finally(() => {
        renovando = null;
      });
  }
  return renovando;
};

// Renovar el acceso cuando vence (401) y reintentar la petición una vez
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config || {};
    const esAuth = AUTH_ENDPOINTS.some((p) => (originalRequest.url || '').includes(p));

    if (error.response?.status !== 401 || esAuth) {
      return Promise.reject(error);
    }

    // Ya se reintentó con un acceso nuevo y sigue sin autorización, o no hay cómo renovar
    if (originalRequest._retry || !localStorage.getItem('refresh_token')) {
      return sesionExpirada();
    }

    originalRequest._retry = true;
    try {
      // Si otra petición ya renovó el acceso mientras esta viajaba, basta con reintentar con el nuevo
      const actual = localStorage.getItem('access_token');
      const enviado = (originalRequest.headers?.Authorization || '').replace('Bearer ', '');
      const access = actual && actual !== enviado && !renovando ? actual : await renovarAcceso();
      originalRequest.headers = { ...originalRequest.headers, Authorization: `Bearer ${access}` };
      return api(originalRequest);
    } catch (refreshError) {
      return sesionExpirada();
    }
  }
);

// Tamaño de página que se pide al backend (máx. permitido: 500)
const PAGE_SIZE = 200;

// Añade page_size a la URL si aún no lo trae, respetando la query existente
const withPageSize = (url) => {
  if (/[?&]page_size=/.test(url)) return url;
  return `${url}${url.includes('?') ? '&' : '?'}page_size=${PAGE_SIZE}`;
};

// Recorre todas las páginas de un endpoint paginado y devuelve la lista completa.
// La primera petición pide page_size=200; las siguientes siguen el "next" del backend.
export const fetchAll = async (url) => {
  const results = [];
  let next = withPageSize(url);
  while (next) {
    const { data } = await api.get(next);
    if (Array.isArray(data)) return data;
    results.push(...data.results);
    next = data.next;
  }
  return results;
};

export default api;
