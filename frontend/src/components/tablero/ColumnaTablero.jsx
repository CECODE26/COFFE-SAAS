import React from 'react';
import { Receipt, ChefHat, CheckCheck } from 'lucide-react';

const ICONOS = { caja: Receipt, cocina: ChefHat, entregado: CheckCheck };

// Fondo propio de cada columna
const FONDO = {
  caja: 'border-oro-200/80 bg-oro-50/70',
  cocina: 'border-pistacho-300/70 bg-pistacho-50',
  entregado: 'border-verde-100 bg-verde-50/70',
};

// Aspecto mientras se arrastra una tarjeta:
//   valido: la columna acepta el pedido · sobre-valido: la tarjeta está encima y se puede soltar
//   sobre-invalido: encima, pero falta un paso (al soltar se explica cuál)
const DROP = {
  valido: 'ring-2 ring-cobalto-200 ring-offset-2 ring-offset-crema',
  'sobre-valido': 'border-cobalto-400 bg-cobalto-50 ring-2 ring-cobalto-400 ring-offset-2 ring-offset-crema',
  'sobre-invalido': 'ring-2 ring-terracotta-600/40 ring-offset-2 ring-offset-crema',
};

const VACIO = {
  caja: { titulo: 'Sin pedidos en caja', texto: 'Los pedidos del QR y del personal llegan aquí.' },
  cocina: { titulo: 'Cocina despejada', texto: 'Aquí aparecen los pedidos que caja envía a cocina.' },
  entregado: { titulo: 'Aún no hay entregas hoy', texto: 'Los pedidos entregados hoy se listan aquí.' },
};

export const ColumnaVacia = ({ columnaId }) => {
  const Icono = ICONOS[columnaId];
  const { titulo, texto } = VACIO[columnaId];
  return (
    <div className="flex h-full min-h-[10rem] flex-col items-center justify-center px-4 py-8 text-center">
      <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-marfil text-oro-600 ring-1 ring-oro-300/70">
        <Icono className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="font-serif text-base italic text-verde-700">{titulo}</p>
      <p className="mt-0.5 max-w-[16rem] text-[12px] text-verde-600">{texto}</p>
    </div>
  );
};

export const EsqueletoColumna = () => (
  <div className="space-y-2" role="status">
    <span className="sr-only">Cargando pedidos…</span>
    {[0, 1, 2].map((i) => (
      <div key={i} className="animate-pulse rounded-2xl border border-oro-200/60 bg-marfil/80 px-3 py-3" aria-hidden="true">
        <div className="h-3.5 w-1/2 rounded-full bg-pistacho-100" />
        <div className="mt-2 h-2.5 w-1/3 rounded-full bg-pistacho-100" />
        <div className="mt-3 h-2.5 w-3/4 rounded-full bg-oro-100" />
        <div className="mt-1.5 h-2.5 w-2/3 rounded-full bg-oro-100" />
      </div>
    ))}
  </div>
);

export const ColumnaTablero = ({
  columna,
  total,
  visibleEnMovil,
  estadoDrop,
  onDragOver,
  onDragLeave,
  onDrop,
  children,
}) => {
  const Icono = ICONOS[columna.id];
  return (
    <section
      id={`columna-${columna.id}`}
      aria-labelledby={`titulo-columna-${columna.id}`}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
      className={`${visibleEnMovil ? 'flex' : 'hidden'} h-[calc(100dvh-23rem)] min-h-[22rem] flex-col overflow-hidden rounded-3xl border transition-[background-color,box-shadow,border-color] duration-200 lg:flex lg:h-[calc(100dvh-13rem)] lg:min-h-[26rem] ${
        estadoDrop === 'sobre-valido' ? DROP['sobre-valido'] : `${FONDO[columna.id]} ${estadoDrop ? DROP[estadoDrop] : ''}`
      }`}
    >
      <header className="flex items-center gap-2.5 border-b border-oro-200/80 px-3.5 py-2.5">
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-marfil text-oro-600 ring-1 ring-oro-300/70">
          <Icono className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
        <div className="min-w-0 flex-1 leading-tight">
          <h2 id={`titulo-columna-${columna.id}`} className="font-serif text-lg italic font-medium leading-tight text-verde-700">
            {columna.titulo}
          </h2>
          <p className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.2em] text-oro-600">
            <span className="h-1 w-1 rotate-45 bg-oro-400" aria-hidden="true" />
            {columna.antetitulo}
          </p>
        </div>
        <span className="min-w-[1.75rem] rounded-full bg-verde-700 px-2 py-0.5 text-center text-[12px] font-medium text-marfil ring-1 ring-oro-300">
          <span aria-hidden="true">{total}</span>
          <span className="sr-only">{`${total} ${total === 1 ? 'pedido' : 'pedidos'}`}</span>
        </span>
      </header>
      <div className="flex-1 overflow-y-auto overscroll-contain px-2.5 py-3">{children}</div>
    </section>
  );
};
