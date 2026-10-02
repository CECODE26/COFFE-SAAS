import React from 'react';

// Piezas pequeñas de la carta del panel (compactas, "Pistacho y oro")

// Interruptor (role="switch"): verde encendido, terracota apagado.
// `etiqueta` es el nombre accesible; `textoSi`/`textoNo`, el texto visible según el estado.
export const Interruptor = ({
  activo,
  onChange,
  etiqueta,
  textoSi,
  textoNo,
  disabled = false,
  textoSoloEscritorio = false,
  className = '',
}) => (
  <button
    type="button"
    role="switch"
    aria-checked={activo}
    aria-label={etiqueta}
    disabled={disabled}
    onClick={() => onChange(!activo)}
    className={`inline-flex min-h-[32px] shrink-0 items-center gap-1.5 rounded-full py-1 pr-1 text-left transition-opacity disabled:cursor-wait disabled:opacity-60 ${className}`}
  >
    <span
      className={`relative inline-flex h-[18px] w-8 shrink-0 items-center rounded-full ring-1 transition-colors ${
        activo ? 'bg-verde-500 ring-verde-600/40' : 'bg-terracotta-100 ring-terracotta-600/30'
      }`}
      aria-hidden="true"
    >
      <span
        className={`absolute h-3.5 w-3.5 rounded-full bg-marfil shadow-sm ring-1 ring-oro-300/70 transition-transform ${
          activo ? 'translate-x-[15px]' : 'translate-x-0.5'
        }`}
      />
    </span>
    {(textoSi || textoNo) && (
      <span
        className={`text-[10.5px] font-medium uppercase tracking-[0.12em] ${activo ? 'text-verde-600' : 'text-terracotta-700'} ${
          textoSoloEscritorio ? 'hidden sm:inline' : ''
        }`}
        aria-hidden="true"
      >
        {activo ? textoSi : textoNo}
      </span>
    )}
  </button>
);

// Botón redondo de solo ícono (siempre con aria-label)
export const BotonIcono = ({ icon: Icon, etiqueta, onClick, tono = 'normal', disabled = false, className = '' }) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    aria-label={etiqueta}
    title={etiqueta}
    className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
      tono === 'peligro'
        ? 'text-terracotta-700 hover:bg-terracotta-100'
        : 'text-verde-600 hover:bg-pistacho-100 hover:text-cobalto-500'
    } ${className}`}
  >
    <Icon className="h-4 w-4" aria-hidden="true" />
  </button>
);

// Etiqueta mínima para las tarjetas (más chica que Badge)
const TONOS = {
  verde: 'bg-pistacho-100 text-verde-700 ring-pistacho-400/50',
  oro: 'bg-oro-50 text-oro-700 ring-oro-300/60',
  terracota: 'bg-terracotta-100 text-terracotta-700 ring-terracotta-600/25',
  neutro: 'bg-verde-50 text-verde-600 ring-verde-100',
  cobalto: 'bg-cobalto-50 text-cobalto-600 ring-cobalto-200',
};

export const Etiqueta = ({ tono = 'neutro', children, className = '' }) => (
  <span
    className={`inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[9.5px] font-medium uppercase leading-[1.5] tracking-[0.1em] ring-1 ${
      TONOS[tono] || TONOS.neutro
    } ${className}`}
  >
    {children}
  </span>
);

// Casilla con forma de píldora (checkbox real, oculto a la vista)
export const ChipCasilla = ({ checked, onChange, children, disabled = false }) => (
  <label
    className={`inline-flex min-h-[32px] cursor-pointer select-none items-center gap-1.5 rounded-full px-3 text-[11px] font-medium uppercase tracking-[0.12em] ring-1 transition-colors focus-within:ring-2 focus-within:ring-cobalto-500 ${
      checked ? 'bg-verde-700 text-marfil ring-oro-400' : 'bg-marfil text-verde-600 ring-oro-200 hover:bg-pistacho-50'
    } ${disabled ? 'pointer-events-none opacity-60' : ''}`}
  >
    <input type="checkbox" className="sr-only" checked={checked} disabled={disabled} onChange={(e) => onChange(e.target.checked)} />
    <span
      className={`h-1.5 w-1.5 rotate-45 ${checked ? 'bg-oro-300' : 'bg-oro-200'}`}
      aria-hidden="true"
    />
    {children}
  </label>
);
