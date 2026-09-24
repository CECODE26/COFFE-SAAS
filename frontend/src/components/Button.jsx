import React from 'react';

export const Button = ({
  children,
  variant = 'primary',
  size = 'md',
  disabled = false,
  onClick,
  className = '',
  ...props
}) => {
  const baseClasses =
    'inline-flex items-center justify-center gap-2 font-medium rounded-full transition-all duration-200 focus:outline-none focus-visible:ring-4 active:scale-[0.98]';

  const variants = {
    primary: 'bg-espresso-800 text-cream hover:bg-espresso-700 focus-visible:ring-espresso-200 shadow-soft',
    accent: 'bg-brass-400 text-espresso-900 hover:bg-brass-300 focus-visible:ring-brass-100 shadow-soft',
    secondary: 'bg-paper text-espresso-700 border border-espresso-100 hover:border-espresso-200 hover:bg-foam/60 focus-visible:ring-espresso-100',
    ghost: 'text-espresso-500 hover:bg-foam hover:text-espresso-800 focus-visible:ring-espresso-100',
    danger: 'bg-paper text-terracotta-700 border border-terracotta-100 hover:bg-terracotta-100 focus-visible:ring-terracotta-100',
    success: 'bg-sage-600 text-white hover:bg-sage-700 focus-visible:ring-sage-100 shadow-soft',
  };

  const sizes = {
    sm: 'px-3.5 py-1.5 text-sm',
    md: 'px-5 py-2.5 text-sm',
    lg: 'px-6 py-3.5 text-base',
  };

  const variantClass = variants[variant] || variants.primary;
  const sizeClass = sizes[size] || sizes.md;

  return (
    <button
      className={`${baseClasses} ${variantClass} ${sizeClass} ${disabled ? 'opacity-50 cursor-not-allowed pointer-events-none' : ''} ${className}`}
      disabled={disabled}
      onClick={onClick}
      {...props}
    >
      {children}
    </button>
  );
};
