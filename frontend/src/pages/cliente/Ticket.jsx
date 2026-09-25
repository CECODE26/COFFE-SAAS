import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowLeft, Printer, Receipt, RefreshCw, WifiOff } from 'lucide-react';
import { cliente, mensajeError } from '../../services/clienteApi';
import { useComensal } from '../../components/cliente/ComensalContext';
import { TicketDetalle } from '../../components/cliente/TicketDetalle';
import { Aviso, Cargando } from '../../components/cliente/ui';

// Comprobante imprimible del consumo propio (el navegador permite "Guardar como PDF")
export const Ticket = () => {
  const { sesion } = useComensal();
  const [ticket, setTicket] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [noDisponible, setNoDisponible] = useState(false);
  const [error, setError] = useState(null);

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await cliente.ticket();
      setTicket(data);
      setNoDisponible(false);
    } catch (e) {
      if (e?.response?.status === 404) setNoDisponible(true);
      else setError(mensajeError(e, 'No pudimos cargar tu comprobante.'));
    } finally {
      setCargando(false);
    }
  }, []);

  // Se vuelve a pedir cuando la sesión pasa a pagada
  const estado = sesion?.estado;
  useEffect(() => {
    cargar();
  }, [cargar, estado]);

  return (
    <div>
      <div className="mb-3 flex items-center justify-between gap-2 print:hidden">
        <Link
          to="/mesa/cuenta"
          className="inline-flex min-h-[40px] items-center gap-1.5 text-[11.5px] font-medium uppercase tracking-[0.16em] text-verde-700 hover:text-cobalto-500"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Cuenta
        </Link>
        {ticket && (
          <button type="button" onClick={() => window.print()} className="btn-primary min-h-[40px] px-4 text-[11px]">
            <Printer className="h-4 w-4" aria-hidden="true" />
            Imprimir o guardar PDF
          </button>
        )}
      </div>

      {cargando && !ticket ? (
        <Cargando texto="Preparando tu comprobante…" />
      ) : noDisponible ? (
        <Aviso
          icon={Receipt}
          titulo="Aún no hay comprobante"
          accion={
            <Link to="/mesa/cuenta" className="btn-primary min-h-[44px] px-6 text-[12px]">
              Ir a la cuenta
            </Link>
          }
        >
          Estará disponible cuando el personal registre el pago de tu consumo.
        </Aviso>
      ) : error && !ticket ? (
        <Aviso
          icon={WifiOff}
          titulo="No pudimos cargar tu comprobante"
          accion={
            <button type="button" onClick={cargar} className="btn-primary min-h-[44px] px-6 text-[12px]">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        >
          {error}
        </Aviso>
      ) : (
        <article aria-label="Comprobante de consumo" className="mx-auto max-w-sm print:max-w-none">
          <TicketDetalle ticket={ticket} />
        </article>
      )}
    </div>
  );
};
