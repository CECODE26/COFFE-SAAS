import React, { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '../Button';
import { ModalToldo } from './ModalToldo';
import { plural } from './utils';

const hojas = (n) => plural(Math.ceil(n / 6), 'hoja A4', 'hojas A4');

// Elige de qué local imprimir la hoja de QR (solo aparece cuando el usuario ve varios locales)
export const ImprimirQrDialog = ({ locales, preparando, onImprimir, onClose }) => {
  const [elegido, setElegido] = useState(locales[0]?.id ?? 'todos');
  const total = locales.reduce((acc, l) => acc + l.cantidad, 0);
  const opciones = [...locales, { id: 'todos', nombre: 'Todos los locales', cantidad: total }];
  const actual = opciones.find((o) => String(o.id) === String(elegido)) || opciones[0];

  return (
    <ModalToldo
      onClose={onClose}
      eyebrow="Salón"
      titulo="Imprimir códigos QR"
      subtitulo="Tarjetas para recortar, 6 por hoja A4."
      ancho="sm"
      pie={
        <>
          <Button variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button size="sm" onClick={() => onImprimir(elegido)} disabled={preparando || !actual?.cantidad}>
            <Printer className="h-3.5 w-3.5" aria-hidden="true" />
            {preparando ? 'Preparando…' : 'Imprimir'}
          </Button>
        </>
      }
    >
      <fieldset>
        <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-oro-600">Local</legend>
        <div className="space-y-1.5">
          {opciones.map((o) => {
            const activo = String(o.id) === String(elegido);
            return (
              <label
                key={o.id}
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl border px-3 py-2 transition-colors focus-within:ring-2 focus-within:ring-cobalto-500 focus-within:ring-offset-1 ${
                  activo ? 'border-verde-700 bg-pistacho-100' : 'border-oro-200 bg-marfil hover:border-cobalto-500'
                }`}
              >
                <span className="flex min-w-0 items-center gap-2">
                  <input
                    type="radio"
                    name="local-qr"
                    value={o.id}
                    checked={activo}
                    onChange={() => setElegido(o.id)}
                    className="h-3.5 w-3.5 accent-verde-700"
                  />
                  <span className="truncate font-serif text-[15px] italic font-medium text-verde-700">{o.nombre}</span>
                </span>
                <span className="shrink-0 text-[11px] text-verde-600">
                  {plural(o.cantidad, 'mesa', 'mesas')} · {hojas(o.cantidad)}
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
    </ModalToldo>
  );
};
