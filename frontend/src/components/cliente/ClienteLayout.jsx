import React, { useEffect, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BookOpen, ClipboardList, Hourglass, Receipt, RefreshCw, UserPlus, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { useAvisos, useTituloConContador } from '../../lib/avisos';
import { cliente, codigoError, mensajeError } from '../../services/clienteApi';
import { ToldoFino } from '../Decor';
import { money } from '../Stats';
import { BottomSheet } from './BottomSheet';
import { useComensal } from './ComensalContext';
import { TicketDetalle } from './TicketDetalle';
import { Aviso, Cargando, MarcaLocal } from './ui';
import { estadoCliente, etiquetaMesa, pedidoActivo, unirNombres } from './utils';

const aviso = { position: 'top-center' };

// Botón pequeño para las acciones de los avisos
const BotonAviso = ({ children, variante = 'primario', ...props }) => (
  <button
    type="button"
    className={`inline-flex min-h-[34px] items-center justify-center rounded-full px-3.5 text-[11px] font-medium uppercase tracking-[0.14em] transition-colors disabled:opacity-50 ${
      variante === 'primario'
        ? 'bg-verde-700 text-marfil hover:bg-cobalto-500'
        : 'border border-oro-400/70 bg-marfil text-verde-700 hover:border-cobalto-500 hover:text-cobalto-500'
    }`}
    {...props}
  >
    {children}
  </button>
);

// Solicitud de alguien que quiere unirse a mi grupo
const SolicitudUnion = ({ solicitud, onResuelta }) => {
  const [procesando, setProcesando] = useState(null);

  const responder = async (aceptar) => {
    setProcesando(aceptar ? 'aceptar' : 'rechazar');
    try {
      if (aceptar) await cliente.aceptarUnion(solicitud.id);
      else await cliente.rechazarUnion(solicitud.id);
      toast.success(aceptar ? `${solicitud.alias} ya es parte de tu grupo` : 'Solicitud rechazada', aviso);
    } catch (e) {
      const status = e?.response?.status;
      if (status === 404 || status === 409) toast(mensajeError(e, 'Esta solicitud ya no está vigente.'), { ...aviso, icon: 'ℹ️' });
      else if (codigoError(e) !== 'sesion_pagada') toast.error(mensajeError(e), aviso);
    } finally {
      setProcesando(null);
      onResuelta();
    }
  };

  return (
    <div className="flex items-center gap-3 rounded-2xl border border-cobalto-200 bg-cobalto-50 px-3 py-2.5" role="alert">
      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-cobalto-500 text-marfil ring-1 ring-oro-300">
        <UserPlus className="h-4 w-4" aria-hidden="true" />
      </span>
      <p className="min-w-0 flex-1 text-[13px] leading-snug text-verde-800">
        <span className="font-semibold">{solicitud.alias}</span> quiere unirse a tu grupo
      </p>
      <div className="flex shrink-0 gap-1.5">
        <BotonAviso
          variante="secundario"
          onClick={() => responder(false)}
          disabled={!!procesando}
          aria-label={`Rechazar a ${solicitud.alias}`}
        >
          {procesando === 'rechazar' ? '…' : 'Rechazar'}
        </BotonAviso>
        <BotonAviso onClick={() => responder(true)} disabled={!!procesando} aria-label={`Aceptar a ${solicitud.alias}`}>
          {procesando === 'aceptar' ? '…' : 'Aceptar'}
        </BotonAviso>
      </div>
    </div>
  );
};

// Avisos de la sesión debajo de la cabecera
const AvisosSesion = () => {
  const { sesion, pagada, recargar, abrirTicket } = useComensal();
  const { pathname } = useLocation();
  const reduce = useReducedMotion();
  if (!sesion) return null;

  const solicitudes = sesion.solicitudes_union || [];
  const union = sesion.union_pendiente;
  const cuenta = sesion.cuenta_pendiente;
  const anim = reduce
    ? { initial: false, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, y: -8 }, animate: { opacity: 1, y: 0 }, exit: { opacity: 0, y: -8 } };

  return (
    <div className="space-y-2 px-4 print:hidden" aria-live="polite">
      <AnimatePresence initial={false}>
        {pagada && (
          <motion.div key="pagada" {...anim} className="flex items-center gap-3 rounded-2xl border border-pistacho-300 bg-pistacho-100 px-3 py-2.5">
            <Receipt className="h-4 w-4 shrink-0 text-verde-600" aria-hidden="true" />
            <p className="min-w-0 flex-1 text-[13px] text-verde-800">
              <span className="font-semibold">Tu cuenta ya fue pagada.</span> Solo puedes ver tu consumo.
            </p>
            <BotonAviso variante="secundario" onClick={abrirTicket}>
              Ticket
            </BotonAviso>
          </motion.div>
        )}

        {solicitudes.map((s) => (
          <motion.div key={s.id} {...anim}>
            <SolicitudUnion solicitud={s} onResuelta={recargar} />
          </motion.div>
        ))}

        {union && (
          <motion.div key="union" {...anim} className="flex items-start gap-3 rounded-2xl border border-oro-200 bg-oro-50 px-3 py-2.5">
            <Hourglass className="mt-0.5 h-4 w-4 shrink-0 text-oro-600 motion-safe:animate-pulse" aria-hidden="true" />
            <p className="text-[13px] leading-snug text-verde-800">
              Esperando que <span className="font-semibold">{unirNombres(union.nombres, 'o')}</span> te acepte
              {(union.nombres || []).length > 1 ? 'n' : ''}…
              <span className="block text-[11.5px] text-verde-600">Mientras tanto ya puedes pedir; tu cuenta va aparte.</span>
            </p>
          </motion.div>
        )}

        {cuenta && !pagada && pathname !== '/mesa/cuenta' && (
          <motion.div key="cuenta" {...anim}>
            <Link
              to="/mesa/cuenta"
              className="flex items-center gap-3 rounded-2xl border border-oro-200 bg-marfil px-3 py-2.5 transition-colors hover:border-cobalto-200"
            >
              <Receipt className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
              <p className="min-w-0 flex-1 text-[13px] text-verde-800">
                <span className="font-semibold">La cuenta va en camino</span>
                {cuenta.total !== undefined && <span className="text-verde-600"> · {money(cuenta.total)}</span>}
              </p>
            </Link>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};

// Modal que aparece cuando el personal cobra la cuenta
const TicketPagado = () => {
  const { sesion, ticketAbierto, cerrarTicket, salir } = useComensal();
  const [saliendo, setSaliendo] = useState(false);

  const alSalir = async () => {
    setSaliendo(true);
    try {
      cerrarTicket();
      await salir();
    } catch (e) {
      toast.error(mensajeError(e, 'No pudimos cerrar tu sesión.'), aviso);
      setSaliendo(false);
    }
  };

  return (
    <BottomSheet
      open={ticketAbierto && !!sesion}
      onClose={cerrarTicket}
      eyebrow="Cuenta pagada"
      title={`¡Gracias, ${sesion?.alias || ''}!`}
      footer={
        <div className="flex gap-2">
          <Link
            to="/mesa/ticket"
            onClick={cerrarTicket}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full border border-oro-400/70 bg-marfil px-4 text-[11.5px] font-medium uppercase tracking-[0.16em] text-verde-700 hover:border-cobalto-500 hover:text-cobalto-500"
          >
            Ver comprobante
          </Link>
          <button
            type="button"
            onClick={alSalir}
            disabled={saliendo}
            className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-full bg-verde-700 px-4 text-[11.5px] font-medium uppercase tracking-[0.16em] text-marfil transition-colors hover:bg-cobalto-500 disabled:opacity-60"
            style={{ boxShadow: 'inset 0 0 0 3px #2A4520, inset 0 0 0 4px #C9A64F' }}
          >
            {saliendo ? 'Saliendo…' : 'Salir'}
          </button>
        </div>
      }
    >
      {sesion?.ticket ? (
        <TicketDetalle ticket={sesion.ticket} compacto />
      ) : (
        <p className="text-sm text-verde-600">Tu consumo quedó pagado. Puedes ver el comprobante completo cuando quieras.</p>
      )}
    </BottomSheet>
  );
};

// Barra inferior: Menú / Mis pedidos / Cuenta
const Pestana = ({ to, end, icon: Icon, children, contador, punto }) => (
  <NavLink
    to={to}
    end={end}
    className={({ isActive }) =>
      `relative flex min-h-[56px] flex-1 flex-col items-center justify-center gap-0.5 text-[10.5px] font-medium uppercase tracking-[0.14em] transition-colors ${
        isActive ? 'text-verde-800' : 'text-verde-600/75 hover:text-cobalto-500'
      }`
    }
  >
    {({ isActive }) => (
      <>
        {isActive && <span className="absolute top-0 h-1.5 w-1.5 -translate-y-1/2 rotate-45 bg-oro-400" aria-hidden="true" />}
        <span className="relative">
          <Icon className={`h-5 w-5 ${isActive ? 'text-cobalto-500' : ''}`} aria-hidden="true" />
          {contador > 0 && (
            <span className="absolute -right-2.5 -top-1.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-cobalto-500 px-1 text-[9.5px] font-semibold tracking-normal text-marfil ring-2 ring-marfil">
              {contador > 99 ? '99+' : contador}
            </span>
          )}
          {!contador && punto && (
            <span className="absolute -right-1 -top-0.5 h-2 w-2 rotate-45 bg-oro-400 ring-2 ring-marfil" aria-hidden="true" />
          )}
        </span>
        <span>
          {children}
          {contador > 0 && <span className="sr-only"> ({contador})</span>}
        </span>
      </>
    )}
  </NavLink>
);

export const ClienteLayout = ({ children }) => {
  const { sesion, cargando, errorCarga, recargar, carrito, pedidos, mesa, local } = useComensal();
  const { sonido, setSonido } = useAvisos();
  const { pathname } = useLocation();

  const activos = (pedidos || []).filter(pedidoActivo).length;
  const listos = (pedidos || []).filter((p) => estadoCliente(p) === 'listo').length;
  useTituloConContador(listos, mesa ? `${etiquetaMesa(mesa)} · ${local?.nombre || 'COFFE-SAAS'}` : 'Tu mesa · COFFE-SAAS');

  // Cada pestaña empieza arriba
  useEffect(() => {
    window.scrollTo(0, 0);
  }, [pathname]);

  const cambiarSonido = () => {
    setSonido(!sonido);
    toast(sonido ? 'Avisos en silencio' : 'Sonido activado', { ...aviso, id: 'sonido', icon: sonido ? '🔕' : '🔔' });
  };

  let contenido = children;
  if (cargando && !sesion) contenido = <Cargando texto="Preparando tu mesa…" className="min-h-[60vh]" />;
  else if (!sesion) {
    contenido = (
      <Aviso
        icon={WifiOff}
        titulo="No pudimos cargar tu mesa"
        className="mt-6"
        accion={
          <button type="button" onClick={recargar} className="btn-primary min-h-[44px] px-6 text-[12px]">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        }
      >
        {errorCarga || 'Revisa tu conexión e inténtalo de nuevo.'}
      </Aviso>
    );
  }

  return (
    <div className="min-h-screen print:min-h-0">
      <div className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-crema sm:border-x sm:border-oro-200/80 sm:shadow-lift print:min-h-0 print:max-w-none print:border-0 print:bg-white print:shadow-none">
        <a
          href="#contenido-mesa"
          className="sr-only z-50 rounded-full bg-marfil px-4 py-2 text-sm text-verde-800 focus:not-sr-only focus:absolute focus:left-3 focus:top-3"
        >
          Saltar al contenido
        </a>

        <header className="print:hidden">
          <ToldoFino />
          <div className="flex items-center gap-2.5 px-4 pb-2.5 pt-2">
            <MarcaLocal local={local} size={38} />
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate font-serif text-[16px] italic font-medium text-verde-700">{local?.nombre || 'Tu mesa'}</p>
              {mesa && (
                <p className="truncate text-[10px] font-medium uppercase tracking-[0.2em] text-oro-600">{etiquetaMesa(mesa)}</p>
              )}
            </div>
            {sesion?.alias && (
              <span
                className="max-w-[34%] truncate rounded-full border border-oro-300/80 bg-marfil px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.12em] text-verde-700"
                title={sesion.alias}
              >
                <span className="sr-only">Tu nombre: </span>
                {sesion.alias}
              </span>
            )}
            <button
              type="button"
              onClick={cambiarSonido}
              aria-pressed={sonido}
              aria-label={sonido ? 'Silenciar avisos' : 'Activar sonido de avisos'}
              title={sonido ? 'Silenciar avisos' : 'Activar sonido'}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-verde-700 ring-1 ring-oro-200 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
            >
              {sonido ? <Volume2 className="h-4 w-4" aria-hidden="true" /> : <VolumeX className="h-4 w-4" aria-hidden="true" />}
            </button>
          </div>
        </header>

        <AvisosSesion />

        <main id="contenido-mesa" className="flex-1 px-4 pb-32 pt-3 print:px-0 print:pb-0 print:pt-0">
          {contenido}
        </main>

        {sesion && (
          <nav
            aria-label="Secciones de tu mesa"
            className="fixed inset-x-0 bottom-0 z-30 mx-auto max-w-[480px] border-t border-oro-300/80 bg-marfil/95 pb-[env(safe-area-inset-bottom)] backdrop-blur print:hidden"
          >
            <div className="flex">
              <Pestana to="/mesa" end icon={BookOpen} contador={carrito.cantidad}>
                Menú
              </Pestana>
              <Pestana to="/mesa/pedidos" icon={ClipboardList} contador={activos}>
                Mis pedidos
              </Pestana>
              <Pestana to="/mesa/cuenta" icon={Receipt} punto={!!sesion.cuenta_pendiente}>
                Cuenta
              </Pestana>
            </div>
          </nav>
        )}
      </div>

      <TicketPagado />
    </div>
  );
};
