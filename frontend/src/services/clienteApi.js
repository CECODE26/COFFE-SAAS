import axios from 'axios';
import toast from 'react-hot-toast';

// Cliente HTTP de la app del comensal (pedidos por QR).
// No usa JWT: la sesión viaja en la cookie httpOnly "coffe_comensal" que pone el backend,
// por eso todas las peticiones van con withCredentials. El header X-Requested-With es la
// protección anti-CSRF que exige el backend en los métodos que escriben.

const API_BASE_URL = process.env.REACT_APP_API_URL || 'http://localhost:8000/api/v1';

export const CLAVE_MESA = 'coffe_mesa';
const PREFIJO_CARRITO = 'coffe_carrito_';

const clienteApi = axios.create({
  baseURL: API_BASE_URL,
  withCredentials: true,
  headers: {
    'Content-Type': 'application/json',
    'X-Requested-With': 'XMLHttpRequest',
  },
});

// ---------- Almacenamiento local (siempre protegido: modo privado, bloqueos, etc.) ----------
export const leerLocal = (clave, porDefecto = null) => {
  try {
    const valor = localStorage.getItem(clave);
    return valor === null ? porDefecto : valor;
  } catch (e) {
    return porDefecto;
  }
};

export const escribirLocal = (clave, valor) => {
  try {
    if (valor === null || valor === undefined) localStorage.removeItem(clave);
    else localStorage.setItem(clave, valor);
  } catch (e) {
    /* sin almacenamiento */
  }
};

export const mesaGuardada = () => leerLocal(CLAVE_MESA, '') || '';
export const guardarMesa = (qr) => {
  if (qr) escribirLocal(CLAVE_MESA, qr);
};

export const claveCarrito = (sesionId) => `${PREFIJO_CARRITO}${sesionId}`;

// Borra los carritos de todas las sesiones de este navegador
export const vaciarCarritos = () => {
  try {
    const claves = [];
    for (let i = 0; i < localStorage.length; i += 1) {
      const k = localStorage.key(i);
      if (k && k.startsWith(PREFIJO_CARRITO)) claves.push(k);
    }
    claves.forEach((k) => localStorage.removeItem(k));
  } catch (e) {
    /* sin almacenamiento */
  }
};

export const urlBienvenida = (qr = mesaGuardada()) =>
  qr ? `/bienvenida?mesa=${encodeURIComponent(qr)}` : '/bienvenida';

// ---------- Mensajes de error ----------
export const codigoError = (error) => error?.response?.data?.codigo || null;

export const mensajeError = (error, porDefecto = 'No pudimos completar la acción. Inténtalo de nuevo.') => {
  if (!error?.response) return 'No hay conexión con el local. Revisa tu internet e inténtalo de nuevo.';
  const data = error.response.data;
  if (data && typeof data === 'object') {
    if (typeof data.detail === 'string') return data.detail;
    if (typeof data.mensaje === 'string') return data.mensaje;
    const primero = Object.values(data).find((v) => typeof v === 'string' || Array.isArray(v));
    if (typeof primero === 'string') return primero;
    if (Array.isArray(primero) && typeof primero[0] === 'string') return primero[0];
  }
  return porDefecto;
};

// Segundos de espera de una respuesta 429 (JSON o header Retry-After)
export const segundosEspera = (error) => {
  const r = error?.response;
  if (!r || r.status !== 429) return 0;
  const n = Number(r.data?.retry_after ?? r.headers?.['retry-after']);
  return Number.isFinite(n) && n > 0 ? Math.ceil(n) : 30;
};

// ---------- Sesión perdida ----------
// Por defecto se recarga la página; el ComensalProvider registra la navegación del router.
let manejadorSinSesion = (url) => window.location.replace(url);
export const setManejadorSinSesion = (fn) => {
  manejadorSinSesion = fn || ((url) => window.location.replace(url));
};

// Rutas que no requieren cookie: un 401 aquí no significa "sesión perdida"
const RUTAS_PUBLICAS = ['/cliente/bienvenida/', '/cliente/entrar/', '/cliente/reconectar/'];

clienteApi.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    const data = error?.response?.data || {};
    const url = error?.config?.url || '';

    if (status === 401 && !RUTAS_PUBLICAS.some((p) => url.includes(p))) {
      // La sesión terminó (inactividad, cierre del personal) o la cookie ya no existe
      const qr = data.mesa || mesaGuardada();
      guardarMesa(qr);
      vaciarCarritos();
      if (!window.location.pathname.startsWith('/bienvenida')) {
        if (data.codigo === 'sesion_cerrada') {
          toast(data.detail || 'Tu sesión en la mesa terminó. Vuelve a entrar para seguir pidiendo.', {
            id: 'sesion-cerrada',
            position: 'top-center',
          });
        }
        manejadorSinSesion(urlBienvenida(qr));
        // No se resuelve: la pantalla no debe mostrar su propio error mientras cambia de página
        return new Promise(() => {});
      }
    }

    if (status === 429) {
      const s = segundosEspera(error);
      toast(`Espera ${s} s antes de volver a intentarlo.`, { id: 'espera-429', position: 'top-center', icon: '⏳' });
    }

    if (status === 409 && data.codigo === 'sesion_pagada') {
      // Avisar al contexto del comensal para que pase a solo lectura sin esperar al polling
      window.dispatchEvent(new CustomEvent('coffe:sesion-pagada'));
    }

    return Promise.reject(error);
  }
);

// ---------- Endpoints del cliente (contrato /api/v1/cliente/) ----------
export const cliente = {
  bienvenida: (mesa) => clienteApi.get('/cliente/bienvenida/', { params: mesa ? { mesa } : {} }),
  entrar: ({ mesa, nombre, grupo }) =>
    clienteApi.post('/cliente/entrar/', grupo ? { mesa, nombre, grupo } : { mesa, nombre }),
  reconectar: ({ mesa, nombre, codigo }) => clienteApi.post('/cliente/reconectar/', { mesa, nombre, codigo }),
  sesion: () => clienteApi.get('/cliente/sesion/'),
  aceptarUnion: (id) => clienteApi.post(`/cliente/union/${id}/aceptar/`),
  rechazarUnion: (id) => clienteApi.post(`/cliente/union/${id}/rechazar/`),
  menu: () => clienteApi.get('/cliente/menu/'),
  pedidos: (alcance = 'mio') => clienteApi.get('/cliente/pedidos/', { params: { alcance } }),
  crearPedido: ({ items, nota }) => clienteApi.post('/cliente/pedidos/', nota ? { items, nota } : { items }),
  llamarMesero: ({ tipo = 'ayuda', mensaje }) =>
    clienteApi.post('/cliente/alertas/', mensaje ? { tipo, mensaje } : { tipo }),
  cuenta: (tipo = 'individual') => clienteApi.get('/cliente/cuenta/', { params: { tipo } }),
  pedirCuenta: ({ tipo, metodo_preferido, confirmar }) =>
    clienteApi.post('/cliente/cuenta/', {
      tipo,
      ...(metodo_preferido ? { metodo_preferido } : {}),
      ...(confirmar ? { confirmar: true } : {}),
    }),
  salir: () => clienteApi.post('/cliente/salir/'),
  ticket: () => clienteApi.get('/cliente/ticket/'),
};

export default clienteApi;
