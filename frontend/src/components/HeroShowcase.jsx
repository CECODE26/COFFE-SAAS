import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Float, LiveNumber, EASE, useLayer } from './Motion';
import { Coffee, Croissant, Sandwich, TrendingUp } from 'lucide-react';

const ITEMS = [
  ['Flat White', Coffee], ['Cappuccino', Coffee], ['Croissant', Croissant], ['Bolón mixto', Sandwich],
  ['Cold Brew', Coffee], ['Rol de canela', Croissant], ['Tostada de aguacate', Sandwich], ['V60 de origen', Coffee],
];
const STATUS = [
  ['Pendiente', 'bg-amber-50 text-amber-700'],
  ['Preparando', 'bg-caramel-300/30 text-clay-600'],
  ['Listo', 'bg-emerald-50 text-emerald-700'],
];

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
    <div className="card w-64 p-4">
      <div className="mb-3 flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-clay-500">Cocina · en vivo</p>
        <span className="relative flex h-2 w-2">
          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-emerald-500" />
        </span>
      </div>
      <ul className="space-y-2">
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
                className="flex items-center gap-3 overflow-hidden"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-sheet text-clay-600">
                  <o.Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-ink">{o.name} <span className="text-muted">×{o.qty}</span></span>
                  <span className="text-[11px] text-muted">Mesa {o.mesa}</span>
                </span>
                <motion.span key={label} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
                  {label}
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
    <div className="card w-56 p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wider text-clay-500">Ventas de hoy</p>
          <p className="font-display text-2xl font-extrabold text-ink">
            <LiveNumber start={412.5} step={[1.8, 6.5]} every={2600} prefix="$" decimals={2} />
          </p>
        </div>
        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700">
          <TrendingUp className="h-3 w-3" /> +18%
        </span>
      </div>
      <div className="mt-3 flex h-12 items-end gap-1">
        {bars.map((h, i) => (
          <motion.div
            key={`${i}-${h}`}
            layout
            initial={{ height: 0 }}
            animate={{ height: `${h}%` }}
            transition={{ duration: 0.6, ease: EASE }}
            className={`flex-1 rounded-t ${i === bars.length - 1 ? 'bg-clay-600' : 'bg-caramel-300/70'}`}
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
    <div className="card flex items-center gap-3 !rounded-2xl px-4 py-3">
      <div className="relative h-11 w-11">
        <svg viewBox="0 0 36 36" className="h-11 w-11 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="#e4dcd1" strokeWidth="4" />
          <motion.circle
            cx="18" cy="18" r="15.5" fill="none" stroke="#5c2b26" strokeWidth="4" strokeLinecap="round"
            strokeDasharray={C}
            animate={{ strokeDashoffset: C * (1 - pct) }}
            transition={{ duration: 0.8, ease: EASE }}
          />
        </svg>
        <span className="absolute inset-0 flex items-center justify-center text-[10px] font-bold text-ink">{Math.round(pct * 100)}%</span>
      </div>
      <div>
        <p className="text-xs text-muted">Ocupación ahora</p>
        <p className="font-display text-sm font-bold text-ink">{occ} de {total} mesas</p>
      </div>
    </div>
  );
};

// Tarjetas flotantes en las esquinas del hero, alrededor de la tarjeta central (con parallax)
export const HeroShowcase = ({ parallax }) => {
  const l1 = useLayer(parallax, 26);
  const l2 = useLayer(parallax, 16);
  const l3 = useLayer(parallax, 32);
  return (
    <div className="pointer-events-none absolute inset-0 hidden lg:block">
      <motion.div style={l1} className="absolute right-2 top-[10%] xl:right-0">
        <Float amplitude={7} duration={5.5}><SalesCard /></Float>
      </motion.div>
      <motion.div style={l2} className="absolute bottom-[12%] left-2 xl:left-0">
        <Float amplitude={9} duration={6} delay={0.5}><OrderStream /></Float>
      </motion.div>
      <motion.div style={l3} className="absolute bottom-[16%] right-4 xl:right-2">
        <Float amplitude={6} duration={5} delay={1}><OccupancyCard /></Float>
      </motion.div>
    </div>
  );
};
