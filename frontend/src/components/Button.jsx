import React from 'react';

// Botones del diseño "Pistacho y oro": píldora, mayúsculas espaciadas y aro dorado en las variantes llenas.
export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  type = 'button',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 rounded-full font-medium uppercase tracking-[0.16em] transition-all duration-200 focus:outline-none focus-visible:ring-4 focus-visible:ring-cobalto-100 active:scale-[0.98]';

  const ring = (bg) => ({ boxShadow: `inset 0 0 0 3px ${bg}, inset 0 0 0 4px #C9A64F` });

  const variants = {
    primary: { cls: 'bg-verde-700 text-marfil hover:bg-verde-800', style: ring('#2A4520') },
    accent: { cls: 'bg-cobalto-500 text-marfil hover:bg-cobalto-600', style: ring('#22409A') },
    secondary: { cls: 'border border-oro-400/70 bg-marfil text-verde-700 hover:border-cobalto-500 hover:text-cobalto-500' },
    ghost: { cls: 'text-verde-600 hover:bg-pistacho-100 hover:text-verde-800' },
    danger: { cls: 'border border-terracotta-100 bg-marfil text-terracotta-700 hover:bg-terracotta-100' },
    success: { cls: 'bg-verde-500 text-marfil hover:bg-verde-600', style: ring('#5C7B43') },
  };

  const sizes = {
    sm: 'min-h-[36px] px-4 text-[11px]',
    md: 'min-h-[44px] px-6 text-[12px]',
    lg: 'min-h-[52px] px-8 text-[13px]',
  };

  const v = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return (
    <button
      type={type}
      className={`${baseClasses} ${v.cls} ${sizeClass} ${disabled ? 'pointer-events-none cursor-not-allowed opacity-50' : ''} ${className}`}
      style={v.style}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};
