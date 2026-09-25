import React from 'react';

// Tonos en la paleta "Pistacho y oro"
const TONES = {
  sage: 'bg-pistacho-200 text-verde-800 ring-1 ring-pistacho-400/60',
  terracotta: 'bg-terracotta-100 text-terracotta-700 ring-1 ring-terracotta-600/20',
  honey: 'bg-oro-100 text-oro-700 ring-1 ring-oro-300/60',
  slate: 'bg-cobalto-50 text-cobalto-600 ring-1 ring-cobalto-200',
  brass: 'bg-oro-50 text-oro-600 ring-1 ring-oro-200',
  neutral: 'bg-verde-50 text-verde-600 ring-1 ring-verde-100',
};

const DOTS = {
  sage: 'bg-verde-500',
  terracotta: 'bg-terracotta-600',
  honey: 'bg-oro-400',
  slate: 'bg-cobalto-500',
  brass: 'bg-oro-500',
  neutral: 'bg-verde-300',
};

// Estado del backend -> tono y etiqueta legible
const STATUS = {
  // Mesas
  disponible: ['sage', 'Disponible'],
  ocupada: ['terracotta', 'Ocupada'],
  reservada: ['honey', 'Reservada'],
  limpiando: ['slate', 'Limpiando'],
  mantenimiento: ['neutral', 'Mantenimiento'],
  // Pedidos
  pendiente: ['honey', 'Pendiente'],
  confirmada: ['slate', 'Confirmada'],
  preparando: ['brass', 'Preparando'],
  lista: ['sage', 'Lista'],
  entregada: ['neutral', 'Entregada'],
  cancelada: ['terracotta', 'Cancelada'],
  // Reservas
  completada: ['neutral', 'Completada'],
};

export const Badge = ({ tone = 'neutral', children, dot = true, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] ${TONES[tone] || TONES.neutral} ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 rotate-45 ${DOTS[tone] || DOTS.neutral}`} />}
    {children}
  </span>
);

export const statusTone = (status) => (STATUS[status] || ['neutral'])[0];

export const StatusBadge = ({ status, className = '' }) => {
  const [tone, label] = STATUS[status] || ['neutral', status];
  return (
    <Badge tone={tone} className={className}>
      {label}
    </Badge>
  );
};
