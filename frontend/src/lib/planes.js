import { PLANS, SITE } from '../config/site';

// Planes de cada cafetería (el distribuidor no tiene plan). Son los mismos de la landing (config/site.js),
// espejo de apps/cafeterias/planes.py. Las fichas de cafetería traen además `plan_info` desde la API.
// ESPEJO: PLAN_POR_DEFECTO de planes.py (la prueba CatalogoSincronizadoTests avisa si difieren)
export const PLAN_POR_DEFECTO = 'mensual';

// Qué incluye cada plan, en una línea para tarjetas y selectores (resumen de las ventajas de la landing)
const INCLUYE = {
  mensual: 'Mesas con QR, pedidos, menú, reservas y usuarios ilimitados',
  pro: 'Todo Mensual + soporte prioritario, capacitación y facturación SRI (próximamente)',
};

export const PLANES = PLANS.map((p) => ({ id: p.id, name: p.name, price: p.price, incluye: INCLUYE[p.id] }));

// Paleta "Pistacho y oro": Mensual en cobalto, Mensual Pro en oro
export const PLAN_TONE = { mensual: 'slate', pro: 'brass' };
export const PLAN_COLOR = { mensual: '#22409A', pro: '#C39B45' };

export const NOTA_IVA = SITE.taxNote;

// "$70" (sin decimales si es entero, como en la landing) o "$70.50"
export const precio = (n) => {
  const v = Number(n);
  if (!Number.isFinite(v)) return '$0';
  return Number.isInteger(v) ? `$${v}` : `$${v.toFixed(2)}`;
};

// "$70 / mes + IVA"
export const precioMensual = (n) => `${precio(n)} / mes + IVA`;
