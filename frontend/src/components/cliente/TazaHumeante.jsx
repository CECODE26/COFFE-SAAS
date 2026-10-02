// Taza de café en vista 3/4 (porcelana blanca con filete dorado) con vapor que sube.
// El vapor es HumoParticulas: un <canvas> encima de la taza con hilos sedosos que nacen en el café,
// suben despacio, se ondulan, se enroscan y se deshacen (bucle propio, sin re-render de React).
// La taza es un SVG estático: el vapor se anima en su propia capa sin repintarla.
import React, { useId } from 'react';
import { HumoParticulas } from './HumoParticulas';

const useSvgId = () => useId().replace(/:/g, '');

// Cuerpo de la taza (debajo del borde)
const CUERPO = 'M40 62C40 106 64 140 100 142C136 140 160 106 160 62Z';

export const TazaHumeante = ({ className = '' }) => {
  const id = useSvgId();
  return (
    // Caja 200 x 280: arriba el espacio del humo, abajo la taza (200 x 170)
    <div className={`relative aspect-[5/7] ${className}`} aria-hidden="true">
      <svg viewBox="0 0 200 170" className="absolute inset-x-0 bottom-0 block h-auto w-full overflow-visible">
        <defs>
          <linearGradient id={`${id}porc`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#D6D3CA" />
            <stop offset=".3" stopColor="#FFFFFF" />
            <stop offset=".62" stopColor="#FBF9F4" />
            <stop offset="1" stopColor="#C9C5BA" />
          </linearGradient>
          <linearGradient id={`${id}oro`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#EAD39A" />
            <stop offset=".45" stopColor="#B38A36" />
            <stop offset=".7" stopColor="#E6CB85" />
            <stop offset="1" stopColor="#9C7429" />
          </linearGradient>
          <radialGradient id={`${id}cafe`} cx=".42" cy=".38" r=".7">
            <stop offset="0" stopColor="#7A4B2A" />
            <stop offset=".55" stopColor="#54311B" />
            <stop offset="1" stopColor="#2E1A0E" />
          </radialGradient>
          <clipPath id={`${id}cuerpo`}>
            <path d={CUERPO} />
          </clipPath>
        </defs>

        {/* sombra sobre la mesa */}
        <ellipse cx="100" cy="159" rx="84" ry="9" fill="#0E1A0A" opacity=".35" />
        {/* plato */}
        <ellipse cx="100" cy="150" rx="88" ry="16" fill={`url(#${id}porc)`} stroke={`url(#${id}oro)`} strokeWidth="1.8" />
        <ellipse cx="100" cy="149" rx="74" ry="12" fill="none" stroke="#22409A" strokeWidth="1" opacity=".7" />
        <ellipse cx="100" cy="147.5" rx="40" ry="6.5" fill="#E9E5DC" />
        {/* asa (va detrás del cuerpo) */}
        <path d="M154 80C184 72 188 116 138 120" fill="none" stroke={`url(#${id}oro)`} strokeWidth="11" strokeLinecap="round" />
        <path d="M154 80C184 72 188 116 138 120" fill="none" stroke="#F6F3EC" strokeWidth="6.5" strokeLinecap="round" />
        {/* cuerpo */}
        <path d={CUERPO} fill={`url(#${id}porc)`} />
        <g clipPath={`url(#${id}cuerpo)`} fill="none">
          <path d="M41 72A59 13 0 0 0 159 72" stroke={`url(#${id}oro)`} strokeWidth="2.2" />
          <path d="M42 80A58 13 0 0 0 158 80" stroke="#22409A" strokeWidth="1.3" strokeDasharray="0 5" strokeLinecap="round" />
          <path d="M55 86C58 107 68 124 84 134" stroke="#FFFFFF" strokeWidth="6" strokeLinecap="round" opacity=".75" />
        </g>
        <path d="M100 103l5 6.5l-5 6.5l-5-6.5Z" fill={`url(#${id}oro)`} />
        <path d="M80 139.5C88 143.5 112 143.5 120 139.5" fill="none" stroke={`url(#${id}oro)`} strokeWidth="1.2" />
        {/* borde con filete dorado y el café */}
        <ellipse cx="100" cy="62" rx="60" ry="13" fill="#FFFFFF" stroke={`url(#${id}oro)`} strokeWidth="2.4" />
        <ellipse cx="100" cy="63.5" rx="53" ry="10" fill={`url(#${id}cafe)`} />
        <ellipse cx="100" cy="63.5" rx="53" ry="10" fill="none" stroke="#B98556" strokeWidth="1.4" opacity=".55" />
        <path d="M78 63C88 57.5 110 57.5 120 62C111 66.5 91 67.5 82 65.5Z" fill="#C8955F" opacity=".32" />
        <ellipse cx="82" cy="60" rx="10" ry="2.2" fill="#FFFFFF" opacity=".25" />
      </svg>

      {/* Vapor: su base coincide con la superficie del café (62 % desde arriba) */}
      <div className="absolute inset-x-0 bottom-[38%] top-0">
        <HumoParticulas />
      </div>
    </div>
  );
};
