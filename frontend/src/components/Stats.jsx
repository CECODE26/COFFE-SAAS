import React from 'react';

export const money = (n) =>
  `$${Number(n || 0).toLocaleString('es-EC', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// Tarjeta de métrica; `featured` la pinta en espresso
export const StatTile = ({ icon: Icon, label, value, hint, featured = false, delay = 0 }) => (
  <div
    className={`animate-fade-in rounded-xl2 p-5 ${
      featured ? 'bg-espresso-800 text-cream shadow-lift' : 'border border-espresso-100/70 bg-paper shadow-soft'
    }`}
    style={{ animationDelay: `${delay}ms` }}
  >
    <div className="flex items-center justify-between">
      <p className={`text-xs font-medium uppercase tracking-wider ${featured ? 'text-espresso-200' : 'text-espresso-400'}`}>
        {label}
      </p>
      {Icon && <Icon className={`h-4 w-4 ${featured ? 'text-brass-300' : 'text-brass-500'}`} />}
    </div>
    <p className={`mt-4 font-serif text-4xl font-medium ${featured ? 'text-cream' : 'text-espresso-800'}`}>{value}</p>
    {hint && <p className={`mt-1 text-xs ${featured ? 'text-espresso-300' : 'text-espresso-400'}`}>{hint}</p>}
  </div>
);

// Barra de uso "x de max"; se tiñe de terracota cuando se acerca al límite
export const UsageBar = ({ value, max, className = '' }) => {
  const unlimited = max >= 999;
  const pct = unlimited ? Math.min(100, value * 2) : Math.min(100, (value / Math.max(max, 1)) * 100);
  const tone = !unlimited && pct >= 90 ? 'bg-terracotta-600' : !unlimited && pct >= 70 ? 'bg-honey-600' : 'bg-brass-400';
  return (
    <div className={className}>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-foam">
        <div className={`h-full rounded-full ${tone} transition-all duration-700`} style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-1 text-[11px] text-espresso-400">
        {value} {unlimited ? '· ilimitado' : `de ${max}`}
      </p>
    </div>
  );
};

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
      className={`flex shrink-0 items-center justify-center rounded-full font-serif font-semibold ${sizes[size]} ${
        dark ? 'bg-espresso-800 text-brass-300' : 'bg-foam text-espresso-600'
      }`}
    >
      {initials || '?'}
    </div>
  );
};
