import React, { useState } from 'react';
import { AlertTriangle, ArrowLeftRight, Banknote, CreditCard } from 'lucide-react';
import { Button } from '../Button';
import { money } from '../Stats';
import { ModalToldo, Aviso } from './ModalToldo';
import { METODOS_PAGO, mensajeError } from './utils';

const ICONOS = { efectivo: Banknote, tarjeta: CreditCard, transferencia: ArrowLeftRight };

// Diálogo para confirmar un cobro: qué se cobra, total y método (preseleccionado el preferido del cliente).
// `onCobrar(metodo)` hace la petición; si falla se muestra el mensaje del backend tal cual.
export const PanelCobro = ({ mesaNumero, titulo, detalle, total, metodoInicial, onCobrar, onClose }) => {
  const [metodo, setMetodo] = useState(
    METODOS_PAGO.some((m) => m.value === metodoInicial) ? metodoInicial : 'efectivo'
  );
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      await onCobrar(metodo);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo registrar el cobro.'));
      setEnviando(false);
    }
  };

  return (
    <ModalToldo
      onClose={enviando ? () => {} : onClose}
      eyebrow={`Mesa ${mesaNumero}`}
      titulo={titulo}
      ancho="sm"
      pie={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={enviando}>
            Cancelar
          </Button>
          <Button size="sm" onClick={confirmar} disabled={enviando}>
            {enviando ? 'Cobrando…' : `Cobrar ${money(total)}`}
          </Button>
        </>
      }
    >
      {error && (
        <Aviso icono={AlertTriangle} className="mb-3">
          {error}
        </Aviso>
      )}

      <div className="text-center">
        <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-verde-600">Total a cobrar</p>
        <p className="mt-0.5 font-serif text-[2.2rem] italic font-medium leading-none text-verde-700">{money(total)}</p>
        {detalle && <p className="mt-1.5 text-xs text-verde-600">{detalle}</p>}
      </div>

      <fieldset className="mt-4">
        <legend className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.2em] text-oro-600">Método de pago</legend>
        <div className="grid grid-cols-3 gap-1.5">
          {METODOS_PAGO.map((m) => {
            const Icono = ICONOS[m.value];
            const activo = metodo === m.value;
            return (
              <label
                key={m.value}
                className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-1 py-2 text-[10px] font-medium uppercase tracking-[0.1em] transition-colors focus-within:ring-2 focus-within:ring-cobalto-500 focus-within:ring-offset-1 ${
                  activo
                    ? 'border-verde-700 bg-verde-700 text-marfil'
                    : 'border-oro-200 bg-marfil text-verde-700 hover:border-cobalto-500 hover:text-cobalto-500'
                }`}
              >
                <input
                  type="radio"
                  name="metodo-pago"
                  value={m.value}
                  checked={activo}
                  onChange={() => setMetodo(m.value)}
                  className="sr-only"
                />
                <Icono className={`h-4 w-4 ${activo ? 'text-oro-300' : 'text-oro-600'}`} aria-hidden="true" />
                {m.label}
                {metodoInicial === m.value && (
                  <span className={`text-[8px] normal-case tracking-normal ${activo ? 'text-pistacho-200' : 'text-verde-600'}`}>
                    preferido
                  </span>
                )}
              </label>
            );
          })}
        </div>
      </fieldset>
    </ModalToldo>
  );
};
