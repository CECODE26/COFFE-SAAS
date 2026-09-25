import React from 'react';

// Formato único de dinero en toda la app: "$1,234.56" (USD, en-US, 2 decimales)
const MONEY_FORMAT = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const money = (n) => {
  const value = Number(n);
  const safe = Number.isFinite(value) ? value : 0;
  // El signo va delante del símbolo: "-$12.50"
  return `${safe < 0 ? '-' : ''}$${MONEY_FORMAT.format(Math.abs(safe))}`;
};

// Aro dorado interior + sombra elevada para la tarjeta destacada
const FEATURED_SHADOW =
  'inset 0 0 0 4px #2A4520, inset 0 0 0 5px rgba(216, 180, 92, 0.75), 0 2px 4px rgba(42, 69, 32, 0.06), 0 16px 36px -12px rgba(42, 69, 32, 0.22)';

// Tarjeta de métrica "Pistacho y oro": marfil con borde dorado; `featured` la pinta en verde bosque con aro de oro
export const StatTile = ({ icon: Icon, label, value, hint, featured = false, delay = 0 }) => (
  <div
    className={`animate-fade-in relative rounded-2xl px-4 py-3 ${
      featured ? 'bg-verde-700 text-marfil' : 'border border-oro-200/80 bg-marfil shadow-soft'
    }`}
    style={{ animationDelay: `${delay}ms`, ...(featured ? { boxShadow: FEATURED_SHADOW } : {}) }}
  >
    <div className="flex items-center justify-between gap-2">
      <p
        className={`text-[10px] font-medium uppercase tracking-[0.16em] ${featured ? 'text-pistacho-200' : 'text-verde-600'}`}
      >
        {label}
      </p>
      {Icon && (
        <span
          className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${
            featured ? 'text-oro-300 ring-oro-300/60' : 'bg-pistacho-50 text-oro-600 ring-oro-300/70'
          }`}
          aria-hidden="true"
        >
          <Icon className="h-3 w-3" aria-hidden="true" />
        </span>
      )}
    </div>
    <p
      className={`mt-2 font-serif text-[1.6rem] italic font-medium leading-none [overflow-wrap:anywhere] ${
        featured ? 'text-marfil' : 'text-verde-700'
      }`}
    >
      {value}
    </p>
    <span className={`mt-1.5 block h-px w-6 ${featured ? 'bg-oro-300/70' : 'bg-oro-300'}`} aria-hidden="true" />
    {hint && <p className={`mt-1 text-[11px] ${featured ? 'text-verde-100' : 'text-verde-600'}`}>{hint}</p>}
  </div>
);

// Barra de uso "x de max": verde con holgura, oro cerca del límite y terracota al tope
export const UsageBar = ({ value, max, className = '' }) => {
  const unlimited = max >= 999;
  const pct = unlimited ? Math.min(100, value * 2) : Math.min(100, (value / Math.max(max, 1)) * 100);
  const tone = !unlimited && pct >= 90 ? 'bg-terracotta-600' : !unlimited && pct >= 70 ? 'bg-oro-400' : 'bg-verde-500';
  return (
    <div className={className}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-pistacho-100 ring-1 ring-inset ring-oro-200/60">
        <div className={`h-full rounded-full ${tone} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-verde-600">
        {value} {unlimited ? '· ilimitado' : `de ${max}`}
      </p>
    </div>
  );
};

// Avatar con aro de oro e iniciales en Playfair cursiva; `dark` (admins) lo pinta en cobalto
export const Avatar = ({ name = '?', dark = false, size = 'md' }) => {
  const initials = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();
  const sizes = { sm: 'h-8 w-8 text-xs', md: 'h-10 w-10 text-sm', lg: 'h-12 w-12 text-base' };
  return (
    <div
      className={`flex shrink-0 items-center justify-center rounded-full font-serif italic font-medium ring-1 ring-oro-400 ring-offset-1 ring-offset-marfil ${
        sizes[size] || sizes.md
      } ${dark ? 'bg-cobalto-500 text-marfil' : 'bg-pistacho-200 text-verde-800'}`}
      aria-hidden="true"
    >
      {initials || '?'}
    </div>
  );
};
