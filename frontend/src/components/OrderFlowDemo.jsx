import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { EASE } from './Motion';
import { Badge } from './StatusBadge';
import { Coffee, Croissant, Sandwich, Check } from 'lucide-react';

const MENU = [
  ['Flat White', Coffee, 3.1], ['Cappuccino', Coffee, 2.8], ['Croissant', Croissant, 2.2], ['Bolón mixto', Sandwich, 5.8],
  ['Cold Brew', Coffee, 3.2], ['Rol de canela', Croissant, 2.6], ['Tostada de aguacate', Sandwich, 6.5],
];
// `rombo`: color del rombo que marca cada columna
const COLS = [
  { key: 0, title: 'Pendiente', hint: 'El camarero toma el pedido', rombo: 'bg-oro-400' },
  { key: 1, title: 'Preparando', hint: 'Cocina y barra lo ven al instante', rombo: 'bg-cobalto-500' },
  { key: 2, title: 'Listo', hint: 'Aviso para entregar', rombo: 'bg-verde-500' },
  { key: 3, title: 'Cobrado', hint: 'Caja registra el pago', rombo: 'bg-pistacho-400' },
];

let uid = 1;
const mk = (status = 0) => {
  const n = 1 + Math.floor(Math.random() * 2);
  const items = Array.from({ length: n }, () => MENU[Math.floor(Math.random() * MENU.length)]);
  return {
    id: uid++,
    mesa: 1 + Math.floor(Math.random() * 12),
    items,
    total: items.reduce((a, [, , p]) => a + p, 0) * 1.15,
    status,
  };
};

// Tablero que mueve pedidos solo, de columna en columna
export const OrderFlowDemo = () => {
  const reduce = useReducedMotion();
  const [orders, setOrders] = useState(() => [mk(0), mk(0), mk(1), mk(2), mk(3)]);

  useEffect(() => {
    if (reduce) return undefined;
    const t = setInterval(() => {
      setOrders((prev) => {
        // Avanza el pedido más antiguo de la columna más adelantada que tenga algo (no el último estado)
        const movable = [...prev].filter((o) => o.status < 3);
        let next = prev;
        if (movable.length) {
          const pick = movable[Math.floor(Math.random() * Math.min(2, movable.length))];
          next = prev.map((o) => (o.id === pick.id ? { ...o, status: o.status + 1 } : o));
        }
        // Limpia cobrados viejos y mete nuevos pendientes
        const cobrados = next.filter((o) => o.status === 3);
        if (cobrados.length > 2) next = next.filter((o) => o.id !== cobrados[0].id);
        if (next.filter((o) => o.status === 0).length < 2) next = [...next, mk(0)];
        return next;
      });
    }, 1500);
    return () => clearInterval(t);
  }, [reduce]);

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {COLS.map((col) => {
        const list = orders.filter((o) => o.status === col.key);
        return (
          <div key={col.key} className="flex min-h-[260px] flex-col rounded-3xl border border-oro-200/80 bg-crema p-3">
            <div className="mb-3 flex items-start justify-between gap-2 border-b border-oro-200/80 px-1 pb-3">
              <div>
                <p className="flex items-center gap-2 font-serif text-lg font-medium italic leading-tight text-verde-700">
                  <span className={`h-2 w-2 shrink-0 rotate-45 ${col.rombo}`} aria-hidden="true" />
                  {col.title}
                </p>
                <p className="mt-0.5 text-[11px] leading-snug text-verde-600">{col.hint}</p>
              </div>
              <motion.span
                key={list.length}
                initial={{ scale: 1.3 }}
                animate={{ scale: 1 }}
                className="flex h-7 min-w-[28px] shrink-0 items-center justify-center rounded-full border border-oro-300 bg-marfil px-2 text-xs font-medium text-verde-700"
              >
                {list.length}
              </motion.span>
            </div>
            <div className="flex flex-col gap-2">
              <AnimatePresence initial={false}>
                {list.map((o) => (
                  <motion.div
                    key={o.id}
                    layoutId={`order-${o.id}`}
                    layout
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    transition={{ layout: { duration: 0.55, ease: EASE }, duration: 0.3 }}
                    className={`rounded-2xl border border-oro-200/80 p-3 shadow-soft ${o.status === 3 ? 'bg-pistacho-50' : 'bg-marfil'}`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-cobalto-500">Mesa {o.mesa}</span>
                      {o.status === 3 ? (
                        <Badge tone="sage" dot={false}>
                          <Check className="h-3 w-3" aria-hidden="true" /> Pagado
                        </Badge>
                      ) : (
                        <span className="text-[11px] text-verde-600">#{String(o.id).padStart(3, '0')}</span>
                      )}
                    </div>
                    <ul className="mt-2 space-y-1">
                      {o.items.map(([name, Icon], i) => (
                        <li key={i} className="flex items-center gap-2 text-xs text-verde-800">
                          <Icon className="h-3.5 w-3.5 shrink-0 text-cobalto-500" aria-hidden="true" /> {name}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-between border-t border-oro-200/80 pt-1.5">
                      <span className="text-[11px] uppercase tracking-[0.14em] text-verde-600">Total</span>
                      <span className="font-serif text-sm font-medium italic text-verde-700">${o.total.toFixed(2)}</span>
                    </div>
                    {o.status === 1 && (
                      <div className="mt-2 h-1 overflow-hidden rounded-full bg-pistacho-100" aria-hidden="true">
                        <motion.div className="h-full bg-oro-400" initial={{ width: '10%' }} animate={{ width: '90%' }} transition={{ duration: 3, ease: 'linear' }} />
                      </div>
                    )}
                  </motion.div>
                ))}
              </AnimatePresence>
            </div>
          </div>
        );
      })}
    </div>
  );
};
