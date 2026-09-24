import React from 'react';

export const Card = ({ children, className = '', padded = true, ...props }) => {
  return (
    <div
      className={`bg-paper rounded-xl2 border border-espresso-100/70 shadow-soft transition-shadow duration-300 ${padded ? 'p-6' : ''} ${className}`}
      {...props}
    >
      {children}
    </div>
  );
};
