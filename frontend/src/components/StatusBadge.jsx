import React from 'react';

const TONES = {
  sage: 'bg-sage-100 text-sage-700',
  terracotta: 'bg-terracotta-100 text-terracotta-700',
  honey: 'bg-honey-100 text-honey-700',
  slate: 'bg-slate-100 text-slate-700',
  brass: 'bg-brass-100 text-brass-700',
  neutral: 'bg-foam text-espresso-500',
};

const DOTS = {
  sage: 'bg-sage-600',
  terracotta: 'bg-terracotta-600',
  honey: 'bg-honey-600',
  slate: 'bg-slate-600',
  brass: 'bg-brass-500',
  neutral: 'bg-espresso-300',
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
    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium ${TONES[tone] || TONES.neutral} ${className}`}
  >
    {dot && <span className={`h-1.5 w-1.5 rounded-full ${DOTS[tone] || DOTS.neutral}`} />}
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
