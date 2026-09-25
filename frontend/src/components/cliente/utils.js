import { useEffect, useRef } from 'react';

// ---------- Textos ----------
const capital = (s) => (s ? String(s).charAt(0).toUpperCase() + String(s).slice(1) : '');

// "Mesa 7 · Terraza"
export const etiquetaMesa = (mesa) => {
  if (!mesa) return '';
  if (typeof mesa !== 'object') return `Mesa ${mesa}`;
  return [mesa.numero !== undefined && mesa.numero !== null ? `Mesa ${mesa.numero}` : null, capital(mesa.zona)]
    .filter(Boolean)
    .join(' · ');
};

// "ANA", "ANA y BETO", "ANA, BETO y CARLOS" (con `o` para "que ANA o BETO te acepten")
export const unirNombres = (nombres = [], conector = 'y') => {
  const lista = (nombres || []).filter(Boolean);
  if (lista.length <= 1) return lista[0] || '';
  return `${lista.slice(0, -1).join(', ')} ${conector} ${lista[lista.length - 1]}`;
};

export const iniciales = (nombre = '') =>
  String(nombre)
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0])
    .join('')
    .toUpperCase() || 'CS';

// "PED-20260925-0012" -> "0012"
export const numeroCorto = (numero) => {
  if (!numero) return '';
  const m = String(numero).match(/(\d+)$/);
  return m ? m[1] : String(numero);
};

export const hora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', timeZone: 'America/Guayaquil' });
};

export const fechaHora = (iso) => {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso);
  return d.toLocaleString('es-EC', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZone: 'America/Guayaquil',
  });
};

export const METODOS_PAGO = {
  efectivo: 'Efectivo',
  tarjeta: 'Tarjeta',
  transferencia: 'Transferencia',
};

// El emoji de la categoría (el menú guarda "emoji o nombre de icono"); si no es emoji, nada
export const emojiCategoria = (icono) => {
  if (!icono) return '';
  const t = String(icono).trim();
  return /^[\x20-\x7E]+$/.test(t) ? '' : t;
};

// ---------- Estados del pedido para el cliente ----------
const ESTADO_A_CLIENTE = {
  pendiente: 'enviado',
  confirmada: 'en_cocina',
  preparando: 'preparando',
  lista: 'listo',
  entregada: 'entregado',
  cancelada: 'cancelado',
};

export const estadoCliente = (pedido) => pedido?.estado_cliente || ESTADO_A_CLIENTE[pedido?.estado] || 'enviado';

export const pedidoActivo = (pedido) => !['entregado', 'cancelado'].includes(estadoCliente(pedido));

// ---------- Dinero en centavos (evita errores de coma flotante) ----------
export const aCentavos = (valor) => {
  const n = Number(valor);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
};

// IVA 15 % redondeado a centavos, mitad hacia arriba (igual que el backend)
export const ivaDe = (subtotalCentavos) => Math.floor((subtotalCentavos * 15 + 50) / 100);

// ---------- Polling que se pausa con la pestaña oculta ----------
// Llama a `fn` cada `ms` mientras la pestaña esté visible; al volver a la pestaña
// consulta en el acto y reanuda. No encadena llamadas si la anterior sigue en curso.
export const usePolling = (fn, ms, activo = true) => {
  const fnRef = useRef(fn);
  useEffect(() => {
    fnRef.current = fn;
  }, [fn]);

  useEffect(() => {
    if (!activo || !ms) return undefined;
    let timer = null;
    let cancelado = false;
    let enCurso = false;

    const programar = () => {
      clearTimeout(timer);
      if (!cancelado && document.visibilityState !== 'hidden') timer = setTimeout(tick, ms);
    };

    async function tick() {
      if (cancelado || document.visibilityState === 'hidden') return;
      if (!enCurso) {
        enCurso = true;
        try {
          await fnRef.current();
        } catch (e) {
          /* el siguiente intento lo reintenta */
        } finally {
          enCurso = false;
        }
      }
      programar();
    }

    const alCambiarVisibilidad = () => {
      clearTimeout(timer);
      if (document.visibilityState === 'visible') tick();
    };

    programar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      cancelado = true;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [ms, activo]);
};

// Segundos que faltan hasta `hasta` (ms epoch), actualizados cada segundo
export const segundosRestantes = (hasta) => Math.max(0, Math.ceil(((hasta || 0) - Date.now()) / 1000));
