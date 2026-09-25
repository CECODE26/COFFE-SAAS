import React from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { BellRing, Check, ChefHat, Flame, Send, XCircle } from 'lucide-react';

// Seguimiento en vivo de un pedido: Enviado → En cocina → Preparando → ¡Pronto llegará! → Entregado
export const PASOS = [
  { clave: 'enviado', etiqueta: 'Enviado', icono: Send, frase: 'Recibimos tu pedido' },
  { clave: 'en_cocina', etiqueta: 'En cocina', icono: ChefHat, frase: 'Tu pedido está en la cola de cocina' },
  { clave: 'preparando', etiqueta: 'Preparando', icono: Flame, frase: 'Estamos preparando tu pedido' },
  { clave: 'listo', etiqueta: '¡Pronto llegará!', icono: BellRing, frase: '¡Pronto llegará tu pedido!' },
  { clave: 'entregado', etiqueta: 'Entregado', icono: Check, frase: 'Entregado. ¡Buen provecho!' },
];

export const Seguimiento = ({ estado }) => {
  const reduce = useReducedMotion();

  if (estado === 'cancelado') {
    return (
      <div className="mt-3 flex items-start gap-2 rounded-2xl bg-terracotta-100/70 px-3 py-2.5 text-terracotta-700 ring-1 ring-terracotta-600/20">
        <XCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
        <p className="text-[13px]">
          <span className="font-medium">Pedido cancelado.</span> Si tienes dudas, llama al mesero.
        </p>
      </div>
    );
  }

  const indice = Math.max(0, PASOS.findIndex((p) => p.clave === estado));
  const terminado = indice === PASOS.length - 1;
  const progreso = indice / (PASOS.length - 1);

  return (
    <div className="mt-3">
      <p className="font-serif text-[15px] italic text-verde-700" aria-live="polite">
        {PASOS[indice].frase}
      </p>
      <ol className="relative mt-2.5 grid grid-cols-5" aria-label="Seguimiento del pedido">
        {/* Riel y avance */}
        <span className="absolute left-[10%] right-[10%] top-[13px] h-0.5 rounded-full bg-oro-200" aria-hidden="true" />
        <motion.span
          className="absolute left-[10%] top-[13px] h-0.5 w-[80%] origin-left rounded-full bg-verde-500"
          initial={false}
          animate={{ scaleX: progreso }}
          transition={reduce ? { duration: 0 } : { duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          aria-hidden="true"
        />
        {PASOS.map((paso, i) => {
          const hecho = i < indice || terminado;
          const actual = i === indice && !terminado;
          const Icono = hecho && i < indice ? Check : paso.icono;
          return (
            <li key={paso.clave} className="relative flex min-w-0 flex-col items-center text-center" aria-current={i === indice ? 'step' : undefined}>
              <span
                className={`relative z-10 flex h-7 w-7 items-center justify-center rounded-full ring-1 transition-colors duration-300 ${
                  hecho
                    ? 'bg-verde-600 text-marfil ring-verde-600'
                    : actual
                      ? 'bg-oro-300 text-verde-800 ring-oro-500'
                      : 'bg-marfil text-verde-600/45 ring-oro-200'
                }`}
              >
                {actual && !reduce && (
                  <motion.span
                    className="absolute inset-0 rounded-full bg-oro-300"
                    initial={{ scale: 1, opacity: 0.55 }}
                    animate={{ scale: 1.9, opacity: 0 }}
                    transition={{ duration: 1.5, repeat: Infinity, ease: 'easeOut' }}
                    aria-hidden="true"
                  />
                )}
                {actual && !reduce ? (
                  <motion.span
                    className="relative"
                    animate={{ y: [0, -1.5, 0] }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                  >
                    <Icono className="h-3.5 w-3.5" aria-hidden="true" />
                  </motion.span>
                ) : (
                  <Icono className="relative h-3.5 w-3.5" aria-hidden="true" />
                )}
              </span>
              <span
                className={`mt-1 max-w-full px-0.5 text-[8.5px] font-medium uppercase leading-tight tracking-[0.02em] [overflow-wrap:anywhere] min-[400px]:text-[9.5px] min-[400px]:tracking-[0.06em] ${
                  actual ? 'text-verde-800' : hecho ? 'text-verde-700' : 'text-verde-600/55'
                }`}
              >
                {paso.etiqueta}
              </span>
              <span className="sr-only">{hecho ? ' (listo)' : actual ? ' (paso actual)' : ' (pendiente)'}</span>
            </li>
          );
        })}
      </ol>
    </div>
  );
};
