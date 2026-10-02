import api, { fetchAll } from '../../services/api';

// Roles que pueden regenerar el QR de una mesa (el backend lo vuelve a validar)
export const ROLES_ADMIN_QR = ['cafe_admin', 'gerente', 'distribuidor_admin', 'super_admin'];

// Gestionan las mesas (crear, editar, desactivar, borrar): los mismos roles del QR
export const ROLES_GESTION_MESAS = ROLES_ADMIN_QR;

// Roles con un solo local: el backend usa siempre su cafetería
export const ROLES_UN_LOCAL = ['cafe_admin', 'gerente'];

export const METODOS_PAGO = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

export const METODO_LABEL = { efectivo: 'Efectivo', tarjeta: 'Tarjeta', transferencia: 'Transferencia' };

export const ESTADO_MESA_LABEL = {
  disponible: 'disponible',
  ocupada: 'ocupada',
  reservada: 'reservada',
  limpiando: 'en limpieza',
  mantenimiento: 'en mantenimiento',
};

// Primer texto que haya en un valor de error de DRF (string, lista u objeto anidado)
const primerTexto = (valor) => {
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor)) return valor.length ? primerTexto(valor[0]) : null;
  if (valor && typeof valor === 'object') return primerTexto(Object.values(valor)[0]);
  return null;
};

// Mensaje del backend tal cual ({ detail }, { error }, { campo: [msg] }...) o uno genérico
export const mensajeError = (error, fallback = 'No se pudo completar la acción. Inténtalo de nuevo.') => {
  if (!error?.response) return 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  const data = error.response.data;
  if (!data || typeof data !== 'object') return fallback;
  return (
    primerTexto(data.detail) ||
    primerTexto(data.error) ||
    primerTexto(data.non_field_errors) ||
    primerTexto(data.mensaje) ||
    primerTexto(data) ||
    fallback
  );
};

// URL pública a la que apunta el QR impreso de la mesa (nunca el id ni el número)
export const urlBase = () => (process.env.REACT_APP_PUBLIC_URL || window.location.origin).replace(/\/+$/, '');
export const urlQr = (qrCode) => `${urlBase()}/bienvenida?mesa=${encodeURIComponent(qrCode || '')}`;

// "Mesa 7 · Terraza"
export const nombreMesa = (numero, zona) => `Mesa ${numero ?? '?'}${zona ? ` · ${zona}` : ''}`;

export const plural = (n, singular, pluralTxt) => `${n} ${n === 1 ? singular : pluralTxt}`;

// Lista de nombres ("ANA, BETO") a partir de un arreglo o un texto
export const juntarNombres = (valor) => {
  if (Array.isArray(valor)) return valor.map((v) => (typeof v === 'object' ? v?.alias : v)).filter(Boolean).join(', ');
  if (valor && typeof valor === 'object') return valor.alias || '';
  return valor || '';
};

// "ahora", "hace 4 min", "hace 1 h 5 min"
export const haceCuanto = (iso, ahora = Date.now()) => {
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return '';
  const min = Math.max(0, Math.floor((ahora - t) / 60000));
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `hace ${h} h ${m} min` : `hace ${h} h`;
};

// Iniciales para el sello del local cuando no tiene logo
export const iniciales = (nombre = '') =>
  nombre
    .split(/\s+/)
    .filter((p) => p && /[A-Za-zÁÉÍÓÚÑáéíóúñ]/.test(p[0]))
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('') || 'CS';

// Llamadas del personal a las sesiones QR (contrato /api/v1/comensales/)
export const comensalesApi = {
  resumen: () => api.get('/comensales/resumen/').then((r) => r.data),
  detalle: (mesaId) => api.get(`/comensales/mesas/${mesaId}/`).then((r) => r.data),
  cobrar: (mesaId, body) => api.post(`/comensales/mesas/${mesaId}/cobrar/`, body).then((r) => r.data),
  cerrar: (mesaId) => api.post(`/comensales/mesas/${mesaId}/cerrar/`).then((r) => r.data),
  codigo: (sesionId) => api.post(`/comensales/sesiones/${sesionId}/codigo/`).then((r) => r.data),
  atenderAlerta: (alertaId) => api.post(`/comensales/alertas/${alertaId}/atender/`).then((r) => r.data),
  mesa: (mesaId) => api.get(`/mesas/mesas/${mesaId}/`).then((r) => r.data),
  regenerarQr: (mesaId) => api.post(`/mesas/mesas/${mesaId}/regenerar_qr/`).then((r) => r.data),
};

// Gestión de mesas (contrato /api/v1/mesas/mesas/)
export const mesasApi = {
  // { numero, cafeteria, cafeteria_name, mesas_activas } (sin tope: las mesas que quiera el negocio)
  siguienteNumero: (cafeteria) =>
    api.get('/mesas/mesas/siguiente_numero/', { params: cafeteria ? { cafeteria } : {} }).then((r) => r.data),
  crear: (body) => api.post('/mesas/mesas/', body).then((r) => r.data),
  editar: (mesaId, body) => api.patch(`/mesas/mesas/${mesaId}/`, body).then((r) => r.data),
  desactivar: (mesaId) => api.post(`/mesas/mesas/${mesaId}/desactivar/`).then((r) => r.data),
  reactivar: (mesaId) => api.post(`/mesas/mesas/${mesaId}/reactivar/`).then((r) => r.data),
  borrar: (mesaId) => api.delete(`/mesas/mesas/${mesaId}/`),
  // Solo las desactivadas (?solo_inactivas=1: el backend ya filtra, no se descargan todas las mesas)
  inactivas: () =>
    fetchAll('/mesas/mesas/?solo_inactivas=1').then((lista) => lista.filter((m) => m.is_active === false)),
  // Locales abiertos que ve el usuario (distribuidor: su cadena; super_admin: todos), por nombre
  locales: () =>
    fetchAll('/cafeterias/').then((lista) =>
      lista.filter((c) => c.is_active !== false).sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es'))
    ),
};

// Zonas sugeridas cuando el local aún no tiene muchas
export const ZONAS_BASE = ['Salón', 'Terraza', 'Ventanal', 'Jardín', 'Barra'];

// Zonas usadas por local, de la más a la menos usada: { <cafeteria_id>: ['Ventanal', 'Jardín', ...] }
export const zonasPorLocal = (mesas) => {
  const cuentas = {};
  mesas.forEach((m) => {
    const zona = (m.location || '').trim();
    if (!zona || !m.cafeteria) return;
    const id = String(m.cafeteria);
    if (!cuentas[id]) cuentas[id] = {};
    cuentas[id][zona] = (cuentas[id][zona] || 0) + 1;
  });
  return Object.fromEntries(
    Object.entries(cuentas).map(([id, zonas]) => [
      id,
      Object.keys(zonas).sort((a, b) => zonas[b] - zonas[a] || a.localeCompare(b, 'es')),
    ])
  );
};

// Logos de los locales: se piden una sola vez por local y se guardan mientras dure la página
const cacheLogos = new Map();
export const obtenerLogos = async (ids) => {
  const unicos = [...new Set(ids.filter(Boolean).map(String))];
  const pares = await Promise.all(
    unicos.map((id) => {
      if (!cacheLogos.has(id)) {
        cacheLogos.set(
          id,
          api
            .get(`/cafeterias/${id}/`)
            .then((r) => r.data?.logo || null)
            .catch(() => null)
        );
      }
      return cacheLogos.get(id).then((logo) => [id, logo]);
    })
  );
  return Object.fromEntries(pares);
};

// Garantiza que cada mesa traiga su qr_code (si la lista aún no lo incluye, se pide el detalle)
export const conQrCode = async (mesas) =>
  Promise.all(
    mesas.map(async (m) => {
      if (m.qr_code) return m;
      try {
        const detalle = await comensalesApi.mesa(m.id);
        return { ...m, qr_code: detalle.qr_code };
      } catch (e) {
        return m;
      }
    })
  );
