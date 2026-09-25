import React, { useState } from 'react';
import { Coffee } from 'lucide-react';
import { LogoSello } from '../Decor';
import { emojiCategoria, iniciales } from './utils';

// Piezas visuales pequeñas de la app del comensal (diseño "Pistacho y oro", versión compacta)

// Logo del local; si no tiene (o la imagen falla), el sello con sus iniciales
export const MarcaLocal = ({ local, size = 40, className = '' }) => {
  const [fallo, setFallo] = useState(false);
  if (local?.logo && !fallo) {
    return (
      <img
        src={local.logo}
        alt=""
        width={size}
        height={size}
        onError={() => setFallo(true)}
        className={`shrink-0 rounded-full bg-marfil object-cover ring-1 ring-oro-300 ${className}`}
        style={{ width: size, height: size }}
      />
    );
  }
  return <LogoSello size={size} iniciales={iniciales(local?.nombre)} className={`shrink-0 ${className}`} />;
};

// Insignia "◆ Mesa 7 · Terraza ◆"
export const InsigniaMesa = ({ children, className = '' }) => (
  <span
    className={`inline-flex items-center gap-2 rounded-full border border-oro-300/80 bg-marfil px-3.5 py-1 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-700 ${className}`}
  >
    <span className="h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
    {children}
    <span className="h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
  </span>
);

// Filete dorado con rombo
export const Filete = ({ className = '' }) => (
  <div className={`flex items-center gap-2.5 ${className}`} aria-hidden="true">
    <span className="h-px flex-1 bg-oro-300/70" />
    <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" />
    <span className="h-px flex-1 bg-oro-300/70" />
  </div>
);

// Cargando compacto
export const Cargando = ({ texto = 'Preparando…', className = '' }) => (
  <div className={`flex flex-col items-center justify-center gap-3 py-14 ${className}`} role="status" aria-live="polite">
    <div className="h-8 w-8 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500 motion-reduce:animate-none" />
    <p className="font-script text-xl text-oro-600">{texto}</p>
  </div>
);

// Estado vacío o de error compacto, con acción opcional
export const Aviso = ({ icon: Icon = Coffee, titulo, children, accion, className = '' }) => (
  <div className={`flex flex-col items-center rounded-3xl border border-oro-200/80 bg-marfil px-5 py-9 text-center shadow-soft ${className}`}>
    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pistacho-100 text-cobalto-500 ring-1 ring-oro-300">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <p className="font-serif text-xl italic text-verde-700">{titulo}</p>
    {children && <div className="mt-1 max-w-xs text-sm text-verde-600">{children}</div>}
    {accion && <div className="mt-4 flex flex-wrap justify-center gap-2">{accion}</div>}
  </div>
);

// Etiquetas vegano / vegetariano / sin gluten
export const EtiquetasDieta = ({ item, className = '' }) => {
  const etiquetas = [];
  if (item?.vegano) etiquetas.push(['Vegano', 'bg-pistacho-200 text-verde-800 ring-pistacho-400/60']);
  else if (item?.vegetariano) etiquetas.push(['Vegetariano', 'bg-pistacho-100 text-verde-700 ring-pistacho-300']);
  if (item?.sin_gluten === true || item?.gluten === false) etiquetas.push(['Sin gluten', 'bg-oro-50 text-oro-700 ring-oro-200']);
  if (!etiquetas.length) return null;
  return (
    <span className={`flex flex-wrap gap-1 ${className}`}>
      {etiquetas.map(([texto, tono]) => (
        <span key={texto} className={`rounded-full px-1.5 py-px text-[9.5px] font-medium uppercase tracking-[0.12em] ring-1 ${tono}`}>
          {texto}
        </span>
      ))}
    </span>
  );
};

// Placeholder elegante cuando el producto no tiene foto: emoji de la categoría o un rombo
export const FotoVacia = ({ icono, grande = false, className = '' }) => {
  const emoji = emojiCategoria(icono);
  return (
    <div
      className={`relative flex items-center justify-center overflow-hidden bg-gradient-to-br from-pistacho-100 via-marfil to-oro-50 ${className}`}
      aria-hidden="true"
    >
      <span className="absolute inset-1 rounded-[inherit] border border-oro-300/60" />
      <span
        className="absolute inset-0 opacity-50"
        style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgba(191,216,165,.35) 0 1px, transparent 1px 12px)' }}
      />
      {emoji ? (
        <span className={`relative ${grande ? 'text-6xl' : 'text-[1.7rem]'} opacity-90`}>{emoji}</span>
      ) : (
        <span className={`relative rotate-45 bg-oro-300 ${grande ? 'h-6 w-6' : 'h-3 w-3'}`} />
      )}
    </div>
  );
};

// Foto del producto con carga diferida y respaldo si falla
export const FotoItem = ({ src, alt = '', icono, grande = false, className = '' }) => {
  const [fallo, setFallo] = useState(false);
  if (!src || fallo) return <FotoVacia icono={icono} grande={grande} className={className} />;
  return (
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFallo(true)}
      className={`bg-pistacho-50 object-cover ${className}`}
    />
  );
};

// Selector de cantidad accesible (− n +)
export const Cantidad = ({ valor, onChange, min = 1, max = 20, nombre = '', compacto = false }) => {
  const btn = compacto ? 'h-8 w-8' : 'h-10 w-10';
  return (
    <div className="inline-flex items-center gap-1 rounded-full border border-oro-300/70 bg-marfil p-0.5" role="group" aria-label={`Cantidad${nombre ? ` de ${nombre}` : ''}`}>
      <button
        type="button"
        onClick={() => onChange(Math.max(min, valor - 1))}
        disabled={valor <= min}
        aria-label="Quitar uno"
        className={`${btn} flex items-center justify-center rounded-full text-lg leading-none text-verde-700 transition-colors hover:bg-pistacho-100 disabled:opacity-35`}
      >
        −
      </button>
      <span className={`min-w-[1.75rem] text-center font-serif italic text-verde-800 ${compacto ? 'text-base' : 'text-lg'}`} aria-live="polite">
        {valor}
      </span>
      <button
        type="button"
        onClick={() => onChange(Math.min(max, valor + 1))}
        disabled={valor >= max}
        aria-label="Agregar uno"
        className={`${btn} flex items-center justify-center rounded-full bg-verde-700 text-lg leading-none text-marfil transition-colors hover:bg-cobalto-500 disabled:opacity-35`}
      >
        +
      </button>
    </div>
  );
};

// Fila "Subtotal ........ $12.40"
export const FilaTotal = ({ etiqueta, valor, fuerte = false, className = '' }) => (
  <div className={`flex items-baseline justify-between gap-3 ${className}`}>
    <span className={fuerte ? 'text-[11px] font-medium uppercase tracking-[0.18em] text-verde-700' : 'text-[13px] text-verde-600'}>
      {etiqueta}
    </span>
    <span className={fuerte ? 'font-serif text-2xl italic font-medium text-verde-800' : 'text-[13px] font-medium text-verde-800'}>
      {valor}
    </span>
  </div>
);
