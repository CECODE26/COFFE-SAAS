import React, { useEffect, useMemo, useState } from 'react';
import { KeyRound, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { ModalToldo } from './ModalToldo';

const CINCO_MIN = 5 * 60 * 1000;

// Momento de vencimiento: el del backend si es razonable; si no (o el reloj difiere), 5 min desde que llegó
const vencimiento = (expiraAt, recibidoEn) => {
  const t = Date.parse(expiraAt);
  const tope = recibidoEn + CINCO_MIN;
  if (!Number.isFinite(t) || t > tope + 5000 || t < recibidoEn) return tope;
  return t;
};

// Código de 4 dígitos para que una persona recupere su sesión QR, con cuenta regresiva de 5 minutos
export const CodigoReconexion = ({ mesaNumero, datos, onRegenerar, onClose }) => {
  const { alias, codigo, expira_at: expiraAt, recibidoEn } = datos;
  const fin = useMemo(() => vencimiento(expiraAt, recibidoEn), [expiraAt, recibidoEn]);
  const [ahora, setAhora] = useState(Date.now());
  const [generando, setGenerando] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const restante = Math.max(0, Math.ceil((fin - ahora) / 1000));
  const vencido = restante === 0;
  const mm = Math.floor(restante / 60);
  const ss = String(restante % 60).padStart(2, '0');

  const regenerar = async () => {
    setGenerando(true);
    try {
      await onRegenerar();
    } finally {
      setGenerando(false);
    }
  };

  return (
    <ModalToldo
      onClose={onClose}
      eyebrow={`Mesa ${mesaNumero}`}
      titulo="Código para reconectar"
      ancho="sm"
      pie={
        vencido ? (
          <>
            <Button variant="ghost" size="sm" onClick={onClose}>
              Cerrar
            </Button>
            <Button size="sm" onClick={regenerar} disabled={generando}>
              <RefreshCw className={`h-3.5 w-3.5 ${generando ? 'animate-spin' : ''}`} aria-hidden="true" />
              Generar otro
            </Button>
          </>
        ) : (
          <Button size="sm" onClick={onClose}>
            Listo
          </Button>
        )
      }
    >
      <div className="text-center">
        <p className="text-sm text-verde-700">
          Díctale este código a <span className="font-serif text-base italic font-medium">{alias}</span>
        </p>
        <div
          className={`mt-3 flex justify-center gap-2 ${vencido ? 'opacity-40' : ''}`}
          aria-label={`Código ${String(codigo).split('').join(' ')}`}
          role="img"
        >
          {String(codigo)
            .split('')
            .map((d, i) => (
              <span
                key={i}
                className="flex h-16 w-12 items-center justify-center rounded-2xl border border-oro-300 bg-crema font-serif text-[2.6rem] font-medium leading-none text-verde-700 shadow-soft"
              >
                {d}
              </span>
            ))}
        </div>
        <p className="sr-only" aria-live="polite">
          {vencido ? 'El código venció.' : ''}
        </p>
        <p className={`mt-3 text-xs font-medium ${vencido ? 'text-terracotta-700' : 'text-verde-600'}`}>
          {vencido ? (
            'El código venció. Genera otro si todavía lo necesita.'
          ) : (
            <>
              Vence en <span className="tabular-nums">{mm}:{ss}</span>
            </>
          )}
        </p>
        <p className="mx-auto mt-3 flex max-w-[16rem] items-start gap-1.5 text-left text-[11px] leading-snug text-verde-600">
          <KeyRound className="mt-px h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />
          Que escanee el QR de la mesa, escriba su nombre y este código. Su sesión anterior dejará de valer.
        </p>
      </div>
    </ModalToldo>
  );
};
