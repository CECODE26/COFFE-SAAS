// Reglas y textos del tablero de pedidos (CAJA → COCINA → ENTREGADO).
// Flujo acordado con el dueño:
//   pendiente (CAJA) --confirm--> confirmada (COCINA "En cola") --send_to_kitchen--> preparando
//   --mark_ready--> lista ("Preparado · por entregar") --complete--> entregada (ENTREGADO)
//   cancel: desde pendiente, confirmada o preparando.

export const COLUMNAS = [
  { id: 'caja', titulo: 'Caja', antetitulo: 'Por enviar a cocina', estados: ['pendiente'] },
  { id: 'cocina', titulo: 'Cocina', antetitulo: 'En cola y preparando', estados: ['confirmada', 'preparando', 'lista'] },
  { id: 'entregado', titulo: 'Entregado', antetitulo: 'Hoy', estados: ['entregada'] },
];

// Columna en la que va cada estado (los cancelados no se muestran)
export const columnaDe = (status) => {
  const columna = COLUMNAS.find((c) => c.estados.includes(status));
  return columna ? columna.id : null;
};

// Subestados visibles dentro de COCINA, en el orden en que se muestran (lo urgente arriba)
export const SUBESTADOS_COCINA = [
  { status: 'lista', titulo: 'Por entregar' },
  { status: 'preparando', titulo: 'Preparando' },
  { status: 'confirmada', titulo: 'En cola' },
];

// Etiqueta y tono de Badge de cada estado en el tablero
export const SUBESTADO = {
  pendiente: { tono: 'honey', etiqueta: 'En caja' },
  confirmada: { tono: 'slate', etiqueta: 'En cola' },
  preparando: { tono: 'brass', etiqueta: 'Preparando' },
  lista: { tono: 'sage', etiqueta: 'Preparado · por entregar' },
  entregada: { tono: 'neutral', etiqueta: 'Entregado' },
};

// Acciones del backend (POST /pedidos/orders/<id>/<accion>/): desde qué estados valen y a cuál llevan
export const ACCIONES = {
  confirm: { desde: ['pendiente'], hacia: 'confirmada', etiqueta: 'Enviar a cocina' },
  send_to_kitchen: { desde: ['confirmada'], hacia: 'preparando', etiqueta: 'En preparación' },
  mark_ready: { desde: ['preparando'], hacia: 'lista', etiqueta: 'Preparado' },
  complete: { desde: ['lista'], hacia: 'entregada', etiqueta: 'Entregado' },
  cancel: { desde: ['pendiente', 'confirmada', 'preparando'], hacia: 'cancelada', etiqueta: 'Cancelar' },
};

// Siguiente paso de cada estado (el botón principal de la tarjeta)
export const ACCION_PRINCIPAL = {
  pendiente: 'confirm',
  confirmada: 'send_to_kitchen',
  preparando: 'mark_ready',
  lista: 'complete',
};

const TIPO_PEDIDO = {
  mesa: 'En mesa',
  takeaway: 'Para llevar',
  delivery: 'A domicilio',
  escritorio: 'Mostrador',
};

// ¿Dónde va el pedido? { titulo: 'Mesa 7', detalle: 'Terraza' } o { titulo: 'Para llevar', detalle: 'Isabella' }
export const lugarDe = (p) => {
  if (p.mesa_numero !== undefined && p.mesa_numero !== null && p.mesa_numero !== '') {
    return { titulo: `Mesa ${p.mesa_numero}`, detalle: p.mesa_zona || '' };
  }
  if (p.order_type === 'mesa') {
    // Compatibilidad: sin mesa_numero el backend manda "Mesa 7" en customer_info
    return { titulo: p.customer_info || 'Mesa', detalle: '' };
  }
  const tipo = TIPO_PEDIDO[p.order_type] || 'Pedido';
  const cliente = p.customer_info && p.customer_info !== 'Cliente' ? p.customer_info : '';
  return { titulo: tipo, detalle: cliente };
};

// "Mesa 7" o "Para llevar · Isabella" (para avisos y títulos)
export const nombreCorto = (p) => {
  const { titulo, detalle } = lugarDe(p);
  if (titulo.startsWith('Mesa')) return titulo;
  return detalle ? `${titulo} · ${detalle}` : titulo;
};

export const esQR = (p) => p.origen === 'qr' || (!p.origen && !!p.comensal_alias);

// Se puede cancelar según su estado, salvo un pedido por QR ya cobrado en la cuenta de la mesa
// (el backend responde 400: el ticket del cliente dejaría de cuadrar con lo cobrado)
export const esCancelable = (p) => ACCIONES.cancel.desde.includes(p.status) && !(p.is_paid && esQR(p));

// "QR · ANA" o "Personal"
export const origenDe = (p) => {
  if (!esQR(p)) return 'Personal';
  return p.comensal_alias ? `QR · ${p.comensal_alias}` : 'QR';
};

// "Mesa 7 (QR · ANA)"
export const descripcionAviso = (p) => `${nombreCorto(p)} (${origenDe(p)})`;

// Ítems con nombres de campo tolerantes (lista del backend o serializador del tablero)
export const itemsDe = (p) =>
  (p.items || []).map((item, i) => ({
    clave: item.id || `${i}-${item.menu_item_name || item.nombre || ''}`,
    nombre: item.menu_item_name || item.nombre || item.name || 'Producto',
    cantidad: item.quantity ?? item.cantidad ?? 1,
    nota: item.notes || item.nota || '',
  }));

export const cantidadProductos = (p) => {
  const items = itemsDe(p);
  if (!items.length) return p.items_count || 0;
  return items.reduce((suma, it) => suma + (Number(it.cantidad) || 0), 0);
};

export const horaCorta = (fecha) => {
  if (!fecha) return '';
  const d = new Date(fecha);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', hour12: false });
};

export const minutosDesde = (fecha, ahora = Date.now()) => {
  const d = new Date(fecha).getTime();
  if (!Number.isFinite(d)) return 0;
  return Math.max(0, Math.floor((ahora - d) / 60000));
};

// "ahora", "hace 3 min", "hace 1 h 5 min"
export const haceCuanto = (fecha, ahora = Date.now()) => {
  if (!fecha) return '';
  const min = minutosDesde(fecha, ahora);
  if (min < 1) return 'ahora';
  if (min < 60) return `hace ${min} min`;
  const h = Math.floor(min / 60);
  const resto = min % 60;
  return resto ? `hace ${h} h ${resto} min` : `hace ${h} h`;
};

// Arrastrar una tarjeta a otra columna: solo valen Caja→Cocina y Cocina(lista)→Entregado.
// Devuelve { accion } si el paso es válido, { aviso } si falta un paso, o {} si no hay nada que hacer.
export const accionPorArrastre = (pedido, destino) => {
  const origen = columnaDe(pedido.status);
  if (!origen || origen === destino) return {};
  if (origen === 'caja' && destino === 'cocina') return { accion: 'confirm' };
  if (origen === 'caja' && destino === 'entregado') {
    return { aviso: 'Primero envía el pedido a cocina: se entrega cuando cocina lo marca como «Preparado».' };
  }
  if (origen === 'cocina' && destino === 'entregado') {
    if (pedido.status === 'lista') return { accion: 'complete' };
    if (pedido.status === 'preparando') {
      return { aviso: 'Falta un paso: cocina debe marcarlo como «Preparado» antes de entregarlo.' };
    }
    return { aviso: 'Faltan dos pasos: ponlo «En preparación» y luego márcalo como «Preparado».' };
  }
  if (origen === 'cocina' && destino === 'caja') {
    return { aviso: 'Un pedido que ya está en cocina no vuelve a caja. Si hace falta, cancélalo.' };
  }
  if (origen === 'entregado') return { aviso: 'Este pedido ya fue entregado: no se puede mover.' };
  return {};
};

// Mensaje del backend ({ error }, { detail } o errores de campo) o uno de respaldo
export const mensajeError = (error, respaldo = 'No se pudo completar la acción.') => {
  if (error && !error.response) return 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  const data = error?.response?.data;
  if (data && typeof data === 'object') {
    const directo = data.error || data.detail || data.message;
    if (typeof directo === 'string') return directo;
    const primero = Object.values(data)
      .flat()
      .find((v) => typeof v === 'string');
    if (primero) return primero;
  }
  return respaldo;
};
