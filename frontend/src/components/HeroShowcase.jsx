import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Float, LiveNumber, EASE, useLayer } from './Motion';
import { Badge } from './StatusBadge';
import { money } from './Stats';
import { Coffee, Croissant, Sandwich, TrendingUp } from 'lucide-react';

const ITEMS = [
  ['Flat White', Coffee], ['Cappuccino', Coffee], ['Croissant', Croissant], ['Bolón mixto', Sandwich],
  ['Cold Brew', Coffee], ['Rol de canela', Croissant], ['Tostada de aguacate', Sandwich], ['V60 de origen', Coffee],
];
// Estado -> [etiqueta, tono del Badge] (mismos tonos que el panel real)
const STATUS = [
  ['Pendiente', 'honey'],
  ['Preparando', 'brass'],
  ['Listo', 'sage'],
];

// Antetítulo en mayúsculas espaciadas, oro viejo
const Etiqueta = ({ children }) => (
  <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-oro-600">{children}</p>
);

// Punto verde que "late" (indica datos en vivo)
const PuntoVivo = () => (
  <span className="relative flex h-2 w-2" aria-hidden="true">
    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pistacho-400 opacity-75 motion-reduce:animate-none" />
    <span className="relative inline-flex h-2 w-2 rounded-full bg-verde-500" />
  </span>
);

let uid = 100;
const mkOrder = () => {
  const [name, Icon] = ITEMS[Math.floor(Math.random() * ITEMS.length)];
  return { id: uid++, name, Icon, mesa: 1 + Math.floor(Math.random() * 12), qty: 1 + Math.floor(Math.random() * 3), status: 0 };
};

// Pedidos que entran, avanzan de estado y salen
const OrderStream = () => {
  const reduce = useReducedMotion();
  const [orders, setOrders] = useState(() => [mkOrder(), { ...mkOrder(), status: 1 }, { ...mkOrder(), status: 2 }]);

  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => {
      setOrders((prev) => {
        const next = prev.map((o) => (Math.random() < 0.5 && o.status < 2 ? { ...o, status: o.status + 1 } : o));
        const done = next.filter((o) => o.status === 2);
        let out = next;
        if (done.length > 1) out = next.filter((o) => o.id !== done[0].id);
        if (out.length < 4 && Math.random() < 0.8) out = [mkOrder(), ...out];
        return out.slice(0, 4);
      });
    }, 1700);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="card h-full p-5">
      <div className="mb-4 flex items-center justify-between border-b border-oro-200/80 pb-3">
        <Etiqueta>Cocina · en vivo</Etiqueta>
        <PuntoVivo />
      </div>
      {/* Altura FIJA (4 filas de 46px + separaciones): los pedidos entran y salen por dentro
          sin cambiar el tamaño de la tarjeta, así no empuja el resto de la página */}
      <ul className="h-[214px] space-y-2.5 overflow-hidden">
        <AnimatePresence initial={false}>
          {orders.map((o) => {
            const [label, tone] = STATUS[o.status];
            return (
              <motion.li
                key={o.id}
                layout
                initial={{ opacity: 0, x: -24, height: 0 }}
                animate={{ opacity: 1, x: 0, height: 'auto' }}
                exit={{ opacity: 0, x: 24, height: 0 }}
                transition={{ duration: 0.45, ease: EASE }}
                className="flex min-h-[46px] items-center gap-3 overflow-hidden"
              >
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-oro-200 bg-pistacho-100 text-verde-700">
                  <o.Icon className="h-4 w-4" aria-hidden="true" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-verde-800">
                    {o.name} <span className="font-normal text-verde-600">×{o.qty}</span>
                  </span>
                  <span className="text-[11px] text-verde-600">Mesa {o.mesa}</span>
                </span>
                <motion.span key={label} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="shrink-0">
                  <Badge tone={tone}>{label}</Badge>
                </motion.span>
              </motion.li>
            );
          })}
        </AnimatePresence>
      </ul>
    </div>
  );
};

// Ventas del día con mini gráfico que se va dibujando
const SalesCard = () => {
  const reduce = useReducedMotion();
  const [bars, setBars] = useState([30, 45, 38, 60, 75, 68, 90, 82, 100, 72]);
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setBars((b) => [...b.slice(1), 40 + Math.round(Math.random() * 60)]), 2400);
    return () => clearInterval(t);
  }, [reduce]);
  return (
    <div className="card p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Etiqueta>Ventas de hoy</Etiqueta>
          <p className="mt-1 font-serif text-3xl font-medium italic text-verde-700">
            <LiveNumber start={412.5} step={[1.8, 6.5]} every={2600} format={money} />
          </p>
        </div>
        <Badge tone="sage" dot={false}>
          <TrendingUp className="h-3 w-3" aria-hidden="true" /> +18%
        </Badge>
      </div>
      <div className="mt-4 flex h-14 items-end gap-1 border-b border-oro-200 pb-px" aria-hidden="true">
        {bars.map((h, i) => (
          <motion.div
            key={`${i}-${h}`}
            layout
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className={`flex-1 rounded-t-sm ${i === bars.length - 1 ? 'bg-cobalto-500' : 'bg-pistacho-300'}`}
          />
        ))}
      </div>
    </div>
  );
};

// Ocupación con anillo animado
const OccupancyCard = () => {
  const reduce = useReducedMotion();
  const [occ, setOcc] = useState(9);
  const total = 12;
  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => setOcc((v) => Math.max(5, Math.min(12, v + (Math.random() < 0.5 ? -1 : 1)))), 3100);
    return () => clearInterval(t);
  }, [reduce]);
  const pct = occ / total;
  const C = 97.4;
  return (
    <div className="card flex h-full items-center gap-4 p-5">
      <div className="relative h-14 w-14 shrink-0">
        <svg viewBox="0 0 36 36" className="h-14 w-14 -rotate-90" aria-hidden="true">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#E7DDBF" strokeWidth="3.5" />
          <motion.circle
            cx="18" cy="18" r="15.5" fill="none" stroke="#22409A" strokeWidth="3.5" strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 0.8, ease: EASE }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[11px] font-medium text-verde-700">{Math.round(pct * 100)}%</span>
      </div>
      <div>
        <Etiqueta>Ocupación ahora</Etiqueta>
        <p className="mt-0.5 font-serif text-xl font-medium italic text-verde-700">{occ} de {total} mesas</p>
      </div>
    </div>
  );
};

// Tarjetas "en vivo" (ventas, ocupación y cocina) con flotación suave y parallax del mouse.
// Se muestran como composición en la sección de demo: ventas y ocupación a un lado, cocina al otro.
export const HeroShowcase = ({ parallax }) => {
  const l1 = useLayer(parallax, 10);
  const l2 = useLayer(parallax, 6);
  const l3 = useLayer(parallax, 14);
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <div className="flex flex-col gap-4">
        <motion.div style={l1}>
          <Float amplitude={4} duration={5.5}><SalesCard /></Float>
        </motion.div>
        <motion.div style={l3} className="flex-1">
          <Float amplitude={3} duration={5} delay={1} className="h-full"><OccupancyCard /></Float>
        </motion.div>
      </div>
      <motion.div style={l2}>
        <Float amplitude={5} duration={6} delay={0.5} className="h-full"><OrderStream /></Float>
      </motion.div>
    </div>
  );
};
