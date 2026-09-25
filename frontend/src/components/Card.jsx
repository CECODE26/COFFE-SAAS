import React from 'react';

// Tarjeta de marfil con borde dorado suave
export const Card = ({ children, className = '', padded = true, ...props }) => {
  return (
    <div
      className={`rounded-3xl border border-oro-200/80 bg-marfil shadow-soft transition-shadow duration-300 ${padded ? 'p-6' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
