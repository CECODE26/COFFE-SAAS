// Piezas decorativas del diseño "Pistacho y oro".
// Todas son SVG en línea; los ids internos se generan por instancia para no chocar.
import React, { useId } from 'react';

const useSvgId = () => useId().replace(/:/g, '');

// ---------- Toldo a rayas con faldón festoneado ----------
export const Toldo = ({ className = '' }) => {
  const id = useSvgId();
  const Variante = ({ w, h, bar, line, fh, suffix, visible }) => (
    <div className={`absolute inset-0 ${visible}`}>
      <svg className="absolute left-0 top-0" width="100%" height={h}>
        <defs>
          <pattern id={`${id}r${suffix}`} width={w * 2} height={h} patternUnits="userSpaceOnUse">
            <rect width={w} height={h} fill="#BFD8A5" />
            <rect x={w} width={w} height={h} fill="#FFFBF1" />
          </pattern>
          <linearGradient id={`${id}p${suffix}`} x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#1D3316" stopOpacity=".05" />
            <stop offset=".5" stopColor="#FFFFFF" stopOpacity=".12" />
            <stop offset="1" stopColor="#1D3316" stopOpacity=".05" />
          </linearGradient>
          <pattern id={`${id}ps${suffix}`} width={w} height={h} patternUnits="userSpaceOnUse">
            <rect width={w} height={h} fill={`url(#${id}p${suffix})`} />
          </pattern>
          <linearGradient id={`${id}s${suffix}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#1D3316" stopOpacity=".22" />
            <stop offset=".45" stopColor="#1D3316" stopOpacity="0" />
            <stop offset="1" stopColor="#1D3316" stopOpacity=".06" />
          </linearGradient>
        </defs>
        <rect width="100%" height={h} fill={`url(#${id}r${suffix})`} />
        <rect width="100%" height={h} fill={`url(#${id}ps${suffix})`} />
        <rect width="100%" height={h} fill={`url(#${id}s${suffix})`} />
        <rect width="100%" height={bar} fill="#2A4520" />
        <rect y={bar} width="100%" height={line} fill="#C39B45" />
      </svg>
      <svg className="toldo-faldon absolute left-0" width="100%" height={fh} style={{ top: h - 1, filter: 'drop-shadow(0 6px 5px rgba(42,69,32,.16))' }}>
        <defs>
          <pattern id={`${id}f${suffix}`} width={w * 2} height={fh} patternUnits="userSpaceOnUse">
            <path d={`M0 0H${w}V2A${w / 2} ${w / 2} 0 0 1 0 2Z`} fill="#BFD8A5" />
            <path d={`M${w} 0H${w * 2}V2A${w / 2} ${w / 2} 0 0 1 ${w} 2Z`} fill="#FFFBF1" />
            <path d={`M${w} 2A${w / 2} ${w / 2} 0 0 1 0 2`} fill="none" stroke="#C39B45" strokeWidth="1.4" />
            <path d={`M${w * 2} 2A${w / 2} ${w / 2} 0 0 1 ${w} 2`} fill="none" stroke="#C39B45" strokeWidth="1.4" />
          </pattern>
        </defs>
        <rect width="100%" height={fh} fill={`url(#${id}f${suffix})`} />
      </svg>
    </div>
  );
  return (
    <div className={`relative h-[59px] min-[1100px]:h-[93px] ${className}`} aria-hidden="true">
      <Variante w={48} h={66} bar={10} line={2} fh={28} suffix="d" visible="hidden min-[1100px]:block" />
      <Variante w={26} h={44} bar={7} line={1.5} fh={16} suffix="m" visible="min-[1100px]:hidden" />
    </div>
  );
};

// Versión fina del toldo para cabeceras compactas (panel)
export const ToldoFino = ({ className = '' }) => {
  const id = useSvgId();
  return (
    <svg className={`block ${className}`} width="100%" height="22" aria-hidden="true">
      <defs>
        <pattern id={`${id}r`} width="40" height="14" patternUnits="userSpaceOnUse">
          <rect width="20" height="14" fill="#BFD8A5" />
          <rect x="20" width="20" height="14" fill="#FFFBF1" />
        </pattern>
        <pattern id={`${id}f`} width="40" height="8" patternUnits="userSpaceOnUse">
          <path d="M0 0H20V1A10 10 0 0 1 0 1Z" fill="#BFD8A5" />
          <path d="M20 0H40V1A10 10 0 0 1 20 1Z" fill="#FFFBF1" />
          <path d="M20 1A10 10 0 0 1 0 1" fill="none" stroke="#C39B45" strokeWidth="1" />
          <path d="M40 1A10 10 0 0 1 20 1" fill="none" stroke="#C39B45" strokeWidth="1" />
        </pattern>
      </defs>
      <rect width="100%" height="14" fill={`url(#${id}r)`} />
      <rect width="100%" height="4" fill="#2A4520" />
      <rect y="4" width="100%" height="1" fill="#C39B45" />
      <rect y="14" width="100%" height="8" fill={`url(#${id}f)`} />
    </svg>
  );
};

// ---------- Logo: sello festoneado con iniciales ----------
export const LogoSello = ({ size = 48, iniciales = 'CS', className = '' }) => (
  <svg viewBox="0 0 48 48" width={size} height={size} className={className} aria-hidden="true">
    <path
      d="M44.00 24.00A4.54 4.54 0 0 1 42.02 32.68A4.54 4.54 0 0 1 36.47 39.64A4.54 4.54 0 0 1 28.45 43.50A4.54 4.54 0 0 1 19.55 43.50A4.54 4.54 0 0 1 11.53 39.64A4.54 4.54 0 0 1 5.98 32.68A4.54 4.54 0 0 1 4.00 24.00A4.54 4.54 0 0 1 5.98 15.32A4.54 4.54 0 0 1 11.53 8.36A4.54 4.54 0 0 1 19.55 4.50A4.54 4.54 0 0 1 28.45 4.50A4.54 4.54 0 0 1 36.47 8.36A4.54 4.54 0 0 1 42.02 15.32A4.54 4.54 0 0 1 44.00 24.00Z"
      fill="#FFFDF7"
      stroke="#C39B45"
      strokeWidth="1.2"
    />
    <circle cx="24" cy="24" r="15.5" fill="none" stroke="#22409A" strokeWidth="1.1" />
    <circle cx="24" cy="24" r="17.6" fill="none" stroke="#22409A" strokeWidth="1.6" strokeDasharray="0 4.6" strokeLinecap="round" />
    <text x="24" y="29.2" textAnchor="middle" fontFamily="'Playfair Display', serif" fontStyle="italic" fontSize="15" fill="#22409A">
      {iniciales}
    </text>
  </svg>
);

// Marca completa: sello + nombre
export const Marca = ({ light = false, subtitulo = 'Gestión de cafeterías', className = '' }) => (
  <span className={`flex items-center gap-3 ${className}`}>
    <LogoSello size={44} />
    <span className="leading-none">
      <span className={`block font-serif text-xl italic font-medium ${light ? 'text-marfil' : 'text-verde-700'}`}>COFFE-SAAS</span>
      {subtitulo && (
        <span className={`mt-1 block font-script text-[15px] ${light ? 'text-oro-300' : 'text-oro-600'}`}>{subtitulo}</span>
      )}
    </span>
  </span>
);

const posicion = (className) => (/\b(absolute|fixed|sticky)\b/.test(className) ? '' : 'relative');

// ---------- Sello azul giratorio con texto circular ----------
// El texto circular admite ~33 caracteres con este tamaño; más largo, se superpone.
export const SelloGiratorio = ({ texto = 'HECHO PARA CAFETERÍAS · ECUADOR ·', className = '', children }) => {
  const id = useSvgId();
  return (
    <div className={`${posicion(className)} aspect-square ${className}`} aria-hidden="true">
      <svg className="giro-lento absolute inset-0 h-full w-full" viewBox="0 0 148 148">
        <defs>
          <path id={`${id}ring`} d="M74 74m-54 0a54 54 0 1 1 108 0a54 54 0 1 1 -108 0" />
        </defs>
        <circle cx="74" cy="74" r="72" fill="#22409A" />
        <circle cx="74" cy="74" r="67" fill="none" stroke="#D8B45C" strokeWidth="1" />
        <circle cx="74" cy="74" r="40" fill="none" stroke="#D8B45C" strokeWidth="1" />
        <text fontFamily="'Jost', sans-serif" fontSize="11" fontWeight="500" letterSpacing="3.6" fill="#FFFBF1">
          <textPath href={`#${id}ring`}>{texto}</textPath>
        </text>
      </svg>
      <div className="absolute inset-0 flex items-center justify-center text-oro-300">
        {children || (
          <svg viewBox="0 0 148 148" className="h-full w-full">
            <g transform="translate(74 78)">
              <path d="M-25 9C-24 -5 -13 -13 0 -13C13 -13 24 -5 25 9C19 4 12 1.5 0 1.5C-12 1.5 -19 4 -25 9Z" fill="#D8B45C" />
              <g fill="none" stroke="#22409A" strokeWidth="1.5" strokeLinecap="round">
                <path d="M-6.5 -12.2C-4.5 -6 -4.5 -2 -5.5 1.8" />
                <path d="M6.5 -12.2C4.5 -6 4.5 -2 5.5 1.8" />
                <path d="M-16.5 -8C-13 -4 -12.5 0 -13.5 3" />
                <path d="M16.5 -8C13 -4 12.5 0 13.5 3" />
              </g>
            </g>
          </svg>
        )}
      </div>
    </div>
  );
};

// ---------- Taza de porcelana con latte de pistacho y vapor ----------
export const TazaPorcelana = ({ className = '', detallada = true }) => {
  const id = useSvgId();
  const sw = detallada ? 1 : 1.6;
  return (
    <svg viewBox="0 0 260 300" className={`overflow-visible ${className}`} aria-hidden="true">
      <defs>
        <linearGradient id={`${id}porc`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#E4E8EC" />
          <stop offset=".38" stopColor="#FFFFFF" />
          <stop offset=".75" stopColor="#FBFAF6" />
          <stop offset="1" stopColor="#DDE2E6" />
        </linearGradient>
        <linearGradient id={`${id}gold`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#EAD39A" />
          <stop offset=".45" stopColor="#B38A36" />
          <stop offset=".7" stopColor="#E6CB85" />
          <stop offset="1" stopColor="#9C7429" />
        </linearGradient>
        <radialGradient id={`${id}pist`} cx=".45" cy=".4" r=".7">
          <stop offset="0" stopColor="#CFE3B4" />
          <stop offset="1" stopColor="#9DBE7C" />
        </radialGradient>
        <clipPath id={`${id}body`}>
          <path d="M66 176C66 214 92 240 130 240C168 240 194 214 194 176Z" />
        </clipPath>
        <g id={`${id}flor`}>
          <circle cx="0" cy="-4.6" r="3.6" />
          <circle cx="4.4" cy="-1.4" r="3.6" />
          <circle cx="2.7" cy="3.7" r="3.6" />
          <circle cx="-2.7" cy="3.7" r="3.6" />
          <circle cx="-4.4" cy="-1.4" r="3.6" />
        </g>
      </defs>
      {/* plato festoneado */}
      <path
        d="M242.00 120.00A14.91 14.91 0 0 1 238.18 148.99A14.91 14.91 0 0 1 226.99 176.00A14.91 14.91 0 0 1 209.20 199.20A14.91 14.91 0 0 1 186.00 216.99A14.91 14.91 0 0 1 158.99 228.18A14.91 14.91 0 0 1 130.00 232.00A14.91 14.91 0 0 1 101.01 228.18A14.91 14.91 0 0 1 74.00 216.99A14.91 14.91 0 0 1 50.80 199.20A14.91 14.91 0 0 1 33.01 176.00A14.91 14.91 0 0 1 21.82 148.99A14.91 14.91 0 0 1 18.00 120.00A14.91 14.91 0 0 1 21.82 91.01A14.91 14.91 0 0 1 33.01 64.00A14.91 14.91 0 0 1 50.80 40.80A14.91 14.91 0 0 1 74.00 23.01A14.91 14.91 0 0 1 101.01 11.82A14.91 14.91 0 0 1 130.00 8.00A14.91 14.91 0 0 1 158.99 11.82A14.91 14.91 0 0 1 186.00 23.01A14.91 14.91 0 0 1 209.20 40.80A14.91 14.91 0 0 1 226.99 64.00A14.91 14.91 0 0 1 238.18 91.01A14.91 14.91 0 0 1 242.00 120.00Z"
        fill="#FFFDF7"
        stroke={`url(#${id}gold)`}
        strokeWidth={detallada ? 2.4 : 3.4}
        style={{ filter: 'drop-shadow(0 6px 10px rgba(42,69,32,.14))' }}
      />
      <circle cx="130" cy="120" r="101" fill="none" stroke="#22409A" strokeWidth={detallada ? 3.6 : 5} strokeDasharray="0 26.44" strokeLinecap="round" />
      <circle cx="130" cy="120" r="94" fill="none" stroke="#22409A" strokeWidth={detallada ? 1.8 : 2.6} />
      {detallada && <circle cx="130" cy="120" r="89" fill="none" stroke="#22409A" strokeWidth=".8" />}
      <circle cx="130" cy="120" r="62" fill="#F1F6EA" stroke="#C39B45" strokeWidth={sw} />
      {/* vapor */}
      <g fill="none" stroke="#7FA35E" strokeWidth={detallada ? 4 : 5.5} strokeLinecap="round" strokeOpacity=".85">
        <path className="vapor vapor-1" d="M110 142C104 128 116 120 110 106C105 95 112 87 110 76" />
        <path className="vapor vapor-2" d="M130 136C124 120 137 111 130 95C125 83 133 74 130 60" />
        <path className="vapor vapor-3" d="M150 142C144 128 156 120 150 106C145 95 152 87 150 76" />
      </g>
      <g transform="translate(130 252) scale(1.16) translate(-130 -252)">
        <ellipse cx="130" cy="252" rx="98" ry="20" fill="#1D3316" opacity=".12" />
        <ellipse cx="130" cy="246" rx="96" ry="21" fill={`url(#${id}porc)`} stroke={`url(#${id}gold)`} strokeWidth="2.2" />
        <ellipse cx="130" cy="245" rx="70" ry="14" fill="none" stroke="#22409A" strokeWidth="1.4" />
        <path d="M186 188C226 176 230 226 178 222" fill="none" stroke={`url(#${id}gold)`} strokeWidth="8" strokeLinecap="round" />
        <ellipse cx="130" cy="242" rx="32" ry="6.5" fill="#F4F2EC" stroke="#C39B45" strokeWidth="1.2" />
        <path d="M66 176C66 214 92 240 130 240C168 240 194 214 194 176Z" fill={`url(#${id}porc)`} />
        <g clipPath={`url(#${id}body)`}>
          <path d="M66 188A64 16 0 0 0 194 188" fill="none" stroke="#22409A" strokeWidth="2.4" />
          <path d="M66 194A64 16 0 0 0 194 194" fill="none" stroke="#22409A" strokeWidth="1" strokeDasharray="0 6" strokeLinecap="round" />
          <g fill="#22409A">
            <use href={`#${id}flor`} x="104" y="214" />
            <use href={`#${id}flor`} x="156" y="216" />
            <ellipse cx="116" cy="220" rx="6" ry="2.2" transform="rotate(30 116 220)" />
            <ellipse cx="92" cy="222" rx="6" ry="2.2" transform="rotate(-35 92 222)" />
            <ellipse cx="144" cy="222" rx="6" ry="2.2" transform="rotate(-30 144 222)" />
            <ellipse cx="168" cy="224" rx="6" ry="2.2" transform="rotate(35 168 224)" />
          </g>
          <g fill="#D8B45C">
            <circle cx="104" cy="214" r="1.8" />
            <circle cx="156" cy="216" r="1.8" />
          </g>
          <path d="M66 176C66 214 92 240 130 240C168 240 194 214 194 176" fill="none" stroke="#C39B45" strokeWidth="1" />
        </g>
        <ellipse cx="130" cy="176" rx="64" ry="16" fill="#EEF0EE" stroke={`url(#${id}gold)`} strokeWidth="2.6" />
        <ellipse cx="130" cy="179" rx="57" ry="12" fill={`url(#${id}pist)`} />
        <path d="M130 175C123 168 110 172 118 179C122 183 128 185 130 188C132 185 138 183 142 179C150 172 137 168 130 175Z" fill="#F7F3E2" opacity=".92" />
      </g>
    </svg>
  );
};

// ---------- Vitrina en arco con foto, marco dorado y abanico ----------
export const Vitrina = ({ src, alt = '', className = '', imgClassName = '', children, objectPosition = '53% 50%' }) => (
  <div className={`relative aspect-[412/720] ${className}`}>
    <div className="absolute inset-0 rounded-arco border border-b-0 border-oro-400/70" aria-hidden="true" />
    <div
      className="absolute inset-x-[4%] bottom-0 top-[2.3%] rounded-arco shadow-[inset_0_0_0_1px_rgba(42,69,32,.18)]"
      style={{ background: 'linear-gradient(180deg,#C9DEB2 0%,#BFD8A5 60%,#B3CF96 100%)' }}
    >
      <div
        className="absolute inset-x-[4%] bottom-0 top-[2.2%] rounded-arco p-[3px] pb-0"
        style={{ background: 'linear-gradient(135deg,#E6CB85,#B38A36 45%,#EAD39A 70%,#A67F2E)' }}
      >
        <div className="relative h-full w-full overflow-hidden rounded-arco bg-verde-500">
          {src && (
            <img
              src={src}
              alt={alt}
              className={`h-full w-full object-cover ${imgClassName}`}
              style={{ objectPosition, filter: 'saturate(1.1) brightness(1.07) contrast(1.03) sepia(.06)' }}
            />
          )}
          <div
            className="pointer-events-none absolute inset-0 mix-blend-soft-light"
            style={{ background: 'radial-gradient(120% 70% at 30% 10%, rgba(255,244,214,.35), rgba(255,244,214,0) 60%)' }}
          />
          {/* abanico de la ventana */}
          <svg className="absolute left-0 top-0 w-full" viewBox="0 0 344 176" aria-hidden="true">
            <g stroke="#FFFBF1" strokeWidth="5" fill="none" style={{ filter: 'drop-shadow(0 2px 2px rgba(29,51,22,.35))' }}>
              <line x1="0" y1="172" x2="344" y2="172" strokeWidth="7" />
              <path d="M126 172A46 46 0 0 1 218 172" />
              <line x1="172" y1="126" x2="172" y2="0" />
              <line x1="139.5" y1="139.5" x2="50.4" y2="50.4" />
              <line x1="204.5" y1="139.5" x2="293.6" y2="50.4" />
              <line x1="129.5" y1="154" x2="12" y2="104" />
              <line x1="214.5" y1="154" x2="332" y2="104" />
            </g>
          </svg>
          {children}
        </div>
      </div>
    </div>
  </div>
);

// ---------- Cinta de etiqueta (tipo "La firma de la casa") ----------
export const CintaFirma = ({ etiqueta, nombre, className = '' }) => (
  <div className={`${posicion(className)} inline-flex ${className}`}>
    <span className="absolute -left-[18px] top-[6px] h-[30px] w-8 bg-pistacho-400" style={{ clipPath: 'polygon(0 0,100% 0,100% 100%,0 100%,10px 50%)' }} aria-hidden="true" />
    <span className="absolute -right-[18px] top-[6px] h-[30px] w-8 bg-pistacho-400" style={{ clipPath: 'polygon(0 0,100% 0,calc(100% - 10px) 50%,100% 100%,0 100%)' }} aria-hidden="true" />
    <span className="absolute left-0 top-[30px] h-1.5 w-3.5 bg-pistacho-500" style={{ clipPath: 'polygon(0 0,100% 0,100% 100%)' }} aria-hidden="true" />
    <span className="absolute right-0 top-[30px] h-1.5 w-3.5 bg-pistacho-500" style={{ clipPath: 'polygon(0 0,100% 0,0 100%)' }} aria-hidden="true" />
    <p className="relative m-0 flex h-[30px] items-center gap-2 bg-pistacho-300 px-6 text-verde-800">
      {etiqueta && <span className="text-[11px] font-medium uppercase tracking-[0.24em]">{etiqueta}</span>}
      {nombre && <span className="font-serif text-lg italic">{nombre}</span>}
    </p>
  </div>
);

// ---------- Cinta cobalto con texto que desfila ----------
export const CintaCarta = ({ items, speed = 46, className = '' }) => {
  // Se repite para llenar el ancho; los lectores de pantalla solo leen la primera vuelta.
  const group = (visibleGroup) => (
    <ul className="m-0 flex list-none items-center gap-8 pr-8" aria-hidden={visibleGroup ? undefined : true} aria-label={visibleGroup ? 'Funciones' : undefined}>
      {[...items, ...items, ...items].map((t, i) => (
        <li key={i} className="flex items-center gap-8 whitespace-nowrap" aria-hidden={visibleGroup && i >= items.length ? true : undefined}>
          {t}
          <span className="inline-block h-2 w-2 rotate-45 scale-75 bg-oro-300" aria-hidden="true" />
        </li>
      ))}
    </ul>
  );
  return (
    <div
      className={`marquee relative flex h-11 items-center border-t-2 border-oro-300 bg-cobalto-500 font-serif text-lg italic text-marfil sm:h-[50px] sm:text-[21px] ${className}`}
      style={{ '--marquee-duration': `${speed}s` }}
    >
      <div className="marquee-track">
        <div className="marquee-group">{group(true)}</div>
        <div className="marquee-group">{group(false)}</div>
      </div>
    </div>
  );
};

// ---------- Separador con rombos ----------
export const Separador = ({ className = '' }) => (
  <div className={`flex items-center justify-center gap-3 ${className}`} aria-hidden="true">
    <span className="h-px w-12 bg-oro-300" />
    <span className="rombo" />
    <span className="h-px w-12 bg-oro-300" />
  </div>
);
