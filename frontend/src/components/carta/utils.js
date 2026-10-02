// Utilidades de la carta del panel (productos, categorías y fotos)

// Quién puede hacer qué (igual que apps/menu/permissions.py)
export const ROLES_GESTION = ['super_admin', 'distribuidor_admin', 'cafe_admin'];
export const ROLES_DISPONIBILIDAD = [...ROLES_GESTION, 'gerente'];
export const gestionaCarta = (role) => ROLES_GESTION.includes(role);
export const cambiaDisponibilidad = (role) => ROLES_DISPONIBILIDAD.includes(role);

// Íconos sugeridos para las categorías
export const EMOJIS = ['☕', '🥐', '🍰', '🥪', '🧃', '🍳', '🥗', '🍫', '🧊', '🍵', '🥤', '🍪', '🥞', '🍩', '🍹', '🍝'];

// ---------- Fotos: mismas reglas que apps/menu/imagenes.py ----------
export const FOTO_MAX_MB = 5;
const FOTO_MAX_BYTES = FOTO_MAX_MB * 1024 * 1024;
const FOTO_TIPOS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const FOTO_EXTENSIONES = /\.(jpe?g|png|webp|gif)$/i;

// Devuelve el mensaje de error de la foto, o null si se puede subir
export const validarFoto = (archivo) => {
  if (!archivo) return 'No se pudo leer el archivo.';
  const tipo = (archivo.type || '').toLowerCase();
  const nombre = archivo.name || '';
  if (/hei[cf]/.test(tipo) || /\.hei[cf]$/i.test(nombre)) {
    return 'Las fotos HEIC del iPhone no se admiten. Expórtala como JPG o tómala desde aquí con «Tomar foto».';
  }
  // Algunos navegadores no informan el tipo: se revisa la extensión
  const admitido = tipo ? FOTO_TIPOS.includes(tipo) : FOTO_EXTENSIONES.test(nombre);
  if (!admitido) {
    return tipo.startsWith('image/')
      ? 'Ese formato de imagen no se admite. Sube una foto en JPG, PNG, WebP o GIF.'
      : 'El archivo no es una imagen. Sube una foto en JPG, PNG o WebP.';
  }
  if (archivo.size === 0) return 'El archivo está vacío.';
  if (archivo.size > FOTO_MAX_BYTES) {
    return `La imagen pesa ${(archivo.size / 1024 / 1024).toFixed(1)} MB; el máximo es ${FOTO_MAX_MB} MB.`;
  }
  return null;
};

// Petición con archivo. api.js fija Content-Type JSON por defecto y axios convertiría el FormData a JSON
// (el archivo se perdería); con 'multipart/form-data' axios lo deja pasar y el navegador pone el boundary.
export const configMultipart = (onProgreso) => ({
  headers: { 'Content-Type': 'multipart/form-data' },
  onUploadProgress: (e) => {
    if (onProgreso && e.total) onProgreso(Math.min(100, Math.round((e.loaded * 100) / e.total)));
  },
});

// Objeto plano -> FormData (null = "", booleanos como "true"/"false")
export const aFormData = (datos) => {
  const fd = new FormData();
  Object.entries(datos).forEach(([clave, valor]) => {
    if (valor === undefined) return;
    if (valor === null) fd.append(clave, '');
    else if (typeof valor === 'boolean') fd.append(clave, valor ? 'true' : 'false');
    else fd.append(clave, valor);
  });
  return fd;
};

// ---------- Números ----------
// "2,5" -> "2.5" (se acepta coma decimal)
export const normalizarDecimal = (valor) => String(valor ?? '').trim().replace(',', '.');

// Margen de ganancia en % (null si no se puede calcular)
export const margen = (precio, costo) => {
  const p = Number(normalizarDecimal(precio));
  const c = Number(normalizarDecimal(costo));
  if (!Number.isFinite(p) || p <= 0 || !Number.isFinite(c) || String(costo ?? '').trim() === '') return null;
  return ((p - c) / p) * 100;
};

// ---------- Textos ----------
// Para buscar sin tildes ni mayúsculas
export const normalizar = (texto) =>
  String(texto || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();

// Mensaje legible de un error de la API (detail o el primer error de campo)
export const mensajeError = (error, respaldo = 'No se pudo completar. Revisa tu conexión e inténtalo de nuevo.') => {
  const data = error?.response?.data;
  if (data && typeof data === 'object') {
    if (data.detail) return data.detail;
    const primero = Object.values(data)[0];
    if (Array.isArray(primero) && typeof primero[0] === 'string') return primero[0];
    if (typeof primero === 'string') return primero;
  }
  return respaldo;
};

// Categorías en el orden de la carta
export const ordenarCategorias = (lista) =>
  [...lista].sort((a, b) => (a.order ?? 0) - (b.order ?? 0) || a.name.localeCompare(b.name, 'es'));
