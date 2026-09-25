import React from 'react';
import QRCode from 'qrcode.react';
import { LogoSello, ToldoFino } from '../Decor';
import { iniciales, urlQr } from './utils';

// Medidas por uso: en pantalla (modal), impresa sola y en la hoja de 6 por A4 (celda de ~95 × 91 mm)
const VARIANTES = {
  pantalla: {
    caja: 'w-full max-w-[16.5rem] rounded-2xl',
    cuerpo: 'px-5 pb-4 pt-2.5',
    qr: 168,
    margen: 'p-2.5',
    logo: 34,
    local: 'text-[15px]',
    mesa: 'text-[26px]',
    zona: 'text-[13px]',
    lema: 'text-[9px]',
    url: 'text-[8px]',
  },
  impresion: {
    caja: 'w-[112mm] rounded-3xl',
    cuerpo: 'px-8 pb-7 pt-4',
    qr: 280,
    margen: 'p-4',
    logo: 52,
    local: 'text-[22px]',
    mesa: 'text-[40px]',
    zona: 'text-[20px]',
    lema: 'text-[12px]',
    url: 'text-[9px]',
  },
  hoja: {
    caja: 'w-[84mm] rounded-2xl',
    cuerpo: 'px-4 pb-2 pt-1',
    qr: 150,
    margen: 'p-2.5',
    logo: 28,
    local: 'text-[13px]',
    mesa: 'text-[24px]',
    zona: 'text-[13px]',
    lema: 'text-[8.5px]',
    url: 'text-[7px]',
  },
};

// Tarjeta del QR de una mesa con la marca del local: "Mesa 7 · Terraza" y "Escanea para ver la carta y pedir"
export const TarjetaQr = ({ mesa, qrCode, logo, variante = 'pantalla' }) => {
  const v = VARIANTES[variante] || VARIANTES.pantalla;
  const url = urlQr(qrCode || mesa.qr_code);
  const local = mesa.cafeteria_name || '';

  return (
    <div className={`tarjeta-qr overflow-hidden border border-oro-300 bg-marfil text-center text-verde-700 ${v.caja}`}>
      <ToldoFino />
      <div className={v.cuerpo}>
        <div className="flex items-center justify-center gap-2">
          {logo ? (
            <img
              src={logo}
              alt=""
              width={v.logo}
              height={v.logo}
              className="shrink-0 rounded-full object-cover ring-1 ring-oro-300"
              style={{ width: v.logo, height: v.logo }}
            />
          ) : (
            <LogoSello size={v.logo} iniciales={iniciales(local)} className="shrink-0" />
          )}
          {local && (
            <span className={`min-w-0 truncate font-serif italic font-medium leading-tight text-verde-700 ${v.local}`}>
              {local}
            </span>
          )}
        </div>

        <p className="mt-1.5 font-serif italic font-medium leading-none">
          <span className={v.mesa}>Mesa {mesa.number}</span>
          {mesa.location && <span className={`text-verde-600 ${v.zona}`}> · {mesa.location}</span>}
        </p>

        {/* Margen blanco de ~2 módulos alrededor del código para que se lea bien */}
        <div className={`mx-auto mt-2 w-fit rounded-xl border border-oro-200 bg-white ${v.margen}`}>
          <QRCode value={url} renderAs="svg" size={v.qr} level="M" includeMargin={false} fgColor="#1F3517" bgColor="#FFFFFF" />
        </div>

        <div className="mt-2 flex items-center justify-center gap-2" aria-hidden="true">
          <span className="h-px w-6 bg-oro-300" />
          <span className="inline-block h-1.5 w-1.5 rotate-45 bg-oro-300" />
          <span className="h-px w-6 bg-oro-300" />
        </div>
        <p className={`mt-1.5 font-medium uppercase tracking-[0.18em] text-verde-700 ${v.lema}`}>
          Escanea para ver la carta y pedir
        </p>
        <p className={`mt-1 break-all leading-tight text-verde-600 ${v.url}`}>{url}</p>
      </div>
    </div>
  );
};

// Hoja para recortar: grilla de 2 × 3 tarjetas por A4, con líneas de corte
export const HojaQr = ({ mesas, logos = {} }) => {
  const paginas = [];
  for (let i = 0; i < mesas.length; i += 6) paginas.push(mesas.slice(i, i + 6));
  return (
    <div className="hoja-qr">
      {paginas.map((pagina, n) => (
        <div key={n} className="hoja-qr-pagina">
          {pagina.map((m) => (
            <div key={m.id} className="hoja-qr-celda">
              <TarjetaQr mesa={m} logo={logos[String(m.cafeteria)]} variante="hoja" />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
};
