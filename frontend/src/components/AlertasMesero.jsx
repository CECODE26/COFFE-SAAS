import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { ArrowRight, Bell, BellRing, Check, HelpingHand, MessageSquare, Receipt, X } from 'lucide-react';
import api from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { notificar, sonar, vibrar } from '../lib/avisos';
import { Button } from './Button';
import { useAhora, usePolling } from './tablero/hooks';
import { haceCuanto, mensajeError } from './tablero/utils';

// Campana de avisos de las mesas (clientes que llaman al mesero, piden la cuenta o avisos del sistema).
// GET /comensales/alertas/?atendida=false cada 6 s · POST /comensales/alertas/<id>/atender/

const RUTA = '/comensales/alertas/';
const ESPERA = 6000;
// Si el backend aún no tiene la ruta (404) se reintenta con calma y sin mostrar errores
const ESPERA_SIN_RUTA = 30000;

export const ROLES_CON_ALERTAS = ['cafe_admin', 'gerente', 'camarero', 'cajero'];
export const rolConAlertas = (rol) => ROLES_CON_ALERTAS.includes(rol);

// Avisos ya vistos por este usuario. Vive fuera del componente porque cada página monta su propio
// Layout: así un aviso que llega mientras se cambia de pantalla suena igual en la siguiente.
const memoria = { usuario: null, ids: null };

const mesaDe = (a) => (a.mesa && a.mesa.numero !== undefined && a.mesa.numero !== null ? `Mesa ${a.mesa.numero}` : 'Mesa');

// "Mesa 7 · ANA llama al mesero", "Mesa 7 · ANA pide la cuenta (grupal) · Tarjeta", "Mesa 7 · ANA: mensaje"
export const textoAlerta = (a) => {
  const mesa = mesaDe(a);
  const quien = a.alias || '';
  if (a.tipo === 'ayuda') return `${mesa} · ${quien ? `${quien} llama al mesero` : 'Llaman al mesero'}`;
  if (a.tipo === 'cuenta') return `${mesa} · ${a.mensaje || `${quien || 'La mesa'} pide la cuenta`}`;
  const mensaje = a.mensaje || 'Necesita atención';
  return `${mesa} · ${quien ? `${quien}: ${mensaje}` : mensaje}`;
};

const ICONO = { ayuda: HelpingHand, cuenta: Receipt, personalizado: MessageSquare };
const TONO_ICONO = {
  ayuda: 'bg-terracotta-100 text-terracotta-700 ring-terracotta-600/20',
  cuenta: 'bg-oro-100 text-oro-700 ring-oro-300',
  personalizado: 'bg-cobalto-50 text-cobalto-600 ring-cobalto-200',
};

const porLlegada = (a, b) => new Date(a.created_at) - new Date(b.created_at);

const iconoToast = <BellRing className="h-4 w-4 shrink-0 text-oro-300" aria-hidden="true" />;

export const AlertasMesero = ({ variante = 'claro' }) => {
  const { user } = useAuth();
  const [alertas, setAlertas] = useState([]);
  const [cargado, setCargado] = useState(false);
  const [abierto, setAbierto] = useState(false);
  const ahora = useAhora(30000);
  const reducir = useReducedMotion();
  const panelId = useId();

  const montado = useRef(false);
  const disponible = useRef(true);
  // Atendidas desde aquí: que una respuesta de polling ya en camino no las vuelva a mostrar
  const retiradas = useRef(new Set());
  const contenedor = useRef(null);
  const boton = useRef(null);
  const usuario = user?.id || user?.email || 'anon';

  useEffect(() => {
    montado.current = true;
    return () => {
      montado.current = false;
    };
  }, []);

  const cargar = useCallback(async () => {
    try {
      const { data } = await api.get(RUTA, { params: { atendida: 'false' } });
      if (!montado.current) return;
      disponible.current = true;
      const recibidas = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
      const idsServidor = new Set(recibidas.map((a) => a.id));
      retiradas.current.forEach((id) => {
        if (!idsServidor.has(id)) retiradas.current.delete(id);
      });
      const lista = recibidas.filter((a) => !retiradas.current.has(a.id)).sort(porLlegada);

      // Avisos nuevos: suenan, se anuncian y notifican (la primera carga de la sesión no suena)
      if (memoria.usuario !== usuario) {
        memoria.usuario = usuario;
        memoria.ids = null;
      }
      const previas = memoria.ids;
      memoria.ids = idsServidor;
      if (previas) {
        const nuevas = lista.filter((a) => !previas.has(a.id));
        if (nuevas.length) {
          sonar('alerta');
          vibrar([200, 80, 200]);
          nuevas.slice(0, 3).forEach((a) => toast(textoAlerta(a), { id: `alerta-${a.id}`, icon: iconoToast, duration: 7000 }));
          if (nuevas.length > 3) {
            toast(`${nuevas.length} avisos de mesas sin atender`, { id: 'alertas-varias', icon: iconoToast, duration: 7000 });
          }
          notificar(
            nuevas.length === 1 ? 'Aviso de mesa' : 'Avisos de mesas',
            nuevas.slice(0, 3).map(textoAlerta).join(' · '),
            { tag: nuevas.length === 1 ? `alerta-${nuevas[0].id}` : 'alertas-mesas' }
          );
        }
      }

      setAlertas(lista);
      setCargado(true);
    } catch (err) {
      if (!montado.current) return;
      // Nunca se muestran errores del polling: sin ruta (404) o sin red, la campana queda en silencio
      if (err?.response?.status === 404) disponible.current = false;
      setCargado(true);
    }
  }, [usuario]);

  usePolling(cargar, () => (disponible.current ? ESPERA : ESPERA_SIN_RUTA));

  // Cerrar con Escape (devuelve el foco a la campana) o tocando fuera del panel
  useEffect(() => {
    if (!abierto) return undefined;
    const alTeclear = (e) => {
      if (e.key === 'Escape') {
        setAbierto(false);
        boton.current?.focus();
      }
    };
    const alTocar = (e) => {
      if (contenedor.current && !contenedor.current.contains(e.target)) setAbierto(false);
    };
    document.addEventListener('keydown', alTeclear);
    document.addEventListener('pointerdown', alTocar);
    return () => {
      document.removeEventListener('keydown', alTeclear);
      document.removeEventListener('pointerdown', alTocar);
    };
  }, [abierto]);

  // Atender: sale de la lista al instante y vuelve si el backend responde error
  const atender = async (alerta) => {
    retiradas.current.add(alerta.id);
    setAlertas((prev) => prev.filter((a) => a.id !== alerta.id));
    try {
      await api.post(`${RUTA}${alerta.id}/atender/`);
      toast.success(`Atendido · ${mesaDe(alerta)}`, { id: `atender-${alerta.id}` });
    } catch (err) {
      retiradas.current.delete(alerta.id);
      if (montado.current) {
        setAlertas((prev) => (prev.some((a) => a.id === alerta.id) ? prev : [...prev, alerta].sort(porLlegada)));
      }
      toast.error(mensajeError(err, 'No se pudo marcar el aviso como atendido.'), { id: `atender-${alerta.id}` });
    }
  };

  const total = alertas.length;
  const etiqueta = total ? `Avisos de mesas: ${total} sin atender` : 'Avisos de mesas: sin avisos';
  const Campana = total ? BellRing : Bell;
  const contador = total > 9 ? '9+' : String(total);

  const oscuro = variante === 'oscuro';

  return (
    <div ref={contenedor} className={oscuro ? 'relative' : ''}>
      {oscuro ? (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={etiqueta}
          aria-expanded={abierto}
          aria-controls={panelId}
          aria-haspopup="dialog"
          className={`flex w-full items-center gap-3 rounded-2xl border px-3 py-2 text-left transition-colors ${
            total ? 'border-oro-400/60 bg-verde-800 hover:bg-verde-900' : 'border-white/10 bg-verde-800/60 hover:bg-verde-800'
          }`}
        >
          <span
            className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${
              total ? 'bg-oro-300 text-verde-800 ring-oro-200' : 'bg-white/10 text-pistacho-300 ring-white/10'
            }`}
          >
            <Campana className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0 flex-1 leading-tight">
            <span className="block text-[11px] font-medium uppercase tracking-[0.16em] text-marfil">Avisos de mesas</span>
            <span className="block text-[11px] text-verde-200">{total ? `${total} sin atender` : 'Sin avisos pendientes'}</span>
          </span>
          {total > 0 && (
            <span className="min-w-[1.5rem] rounded-full bg-terracotta-600 px-1.5 py-0.5 text-center text-[11px] font-medium text-marfil">
              {contador}
            </span>
          )}
        </button>
      ) : (
        <button
          ref={boton}
          type="button"
          onClick={() => setAbierto((v) => !v)}
          aria-label={etiqueta}
          aria-expanded={abierto}
          aria-controls={panelId}
          aria-haspopup="dialog"
          className="relative flex h-11 w-11 items-center justify-center rounded-full text-verde-700 transition-colors hover:bg-pistacho-100"
        >
          <Campana className="h-5 w-5" aria-hidden="true" />
          {total > 0 && (
            <span className="absolute right-1 top-1 min-w-[1.1rem] rounded-full bg-terracotta-600 px-1 text-center text-[10px] font-medium leading-[1.1rem] text-marfil ring-2 ring-crema">
              {contador}
            </span>
          )}
        </button>
      )}

      <AnimatePresence>
        {abierto && (
          <motion.div
            id={panelId}
            role="dialog"
            aria-label="Avisos de mesas"
            initial={reducir ? false : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reducir ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, y: -6 }}
            transition={{ duration: 0.18 }}
            className={
              oscuro
                ? 'absolute left-full top-0 z-40 ml-7 w-[22rem]'
                : 'absolute inset-x-3 top-full z-40 mt-1 sm:left-auto sm:right-4 sm:w-[22rem]'
            }
          >
            <div className="overflow-hidden rounded-2xl border border-oro-300/70 bg-marfil text-left shadow-lift">
              <div className="flex items-center justify-between gap-2 border-b border-oro-200/80 px-4 py-2.5">
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 text-[9px] font-medium uppercase tracking-[0.2em] text-oro-600">
                    <span className="h-1 w-1 rotate-45 bg-oro-400" aria-hidden="true" />
                    Por orden de llegada
                  </p>
                  <h2 className="font-serif text-lg italic font-medium leading-tight text-verde-700">Avisos de mesas</h2>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setAbierto(false);
                    boton.current?.focus();
                  }}
                  aria-label="Cerrar avisos"
                  className="shrink-0 rounded-full p-1.5 text-verde-600 ring-1 ring-oro-200 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>

              <div className="max-h-[min(60vh,26rem)] overflow-y-auto overscroll-contain">
                {!cargado ? (
                  <div className="flex items-center justify-center gap-2 px-4 py-8" role="status">
                    <span className="h-5 w-5 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500" aria-hidden="true" />
                    <span className="text-[12px] text-verde-600">Cargando avisos…</span>
                  </div>
                ) : total === 0 ? (
                  <div className="flex flex-col items-center px-4 py-8 text-center">
                    <span className="mb-2 flex h-9 w-9 items-center justify-center rounded-full bg-pistacho-100 text-oro-600 ring-1 ring-oro-300/70">
                      <Bell className="h-4 w-4" aria-hidden="true" />
                    </span>
                    <p className="font-serif text-base italic text-verde-700">Sin avisos pendientes</p>
                    <p className="mt-0.5 text-[12px] text-verde-600">Cuando una mesa llame o pida la cuenta, sonará aquí.</p>
                  </div>
                ) : (
                  <ul className="divide-y divide-oro-200/70">
                    {alertas.map((a) => {
                      const Icono = ICONO[a.tipo] || MessageSquare;
                      return (
                        <li key={a.id} className="flex gap-3 px-4 py-3">
                          <span
                            className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${
                              TONO_ICONO[a.tipo] || TONO_ICONO.personalizado
                            }`}
                          >
                            <Icono className="h-4 w-4" aria-hidden="true" />
                          </span>
                          <div className="min-w-0 flex-1">
                            <p className="text-[13px] font-medium leading-snug text-verde-800 [overflow-wrap:anywhere]">{textoAlerta(a)}</p>
                            <p className="mt-0.5 text-[11px] text-verde-600">
                              {a.mesa?.zona ? `${a.mesa.zona} · ` : ''}
                              {haceCuanto(a.created_at, ahora)}
                            </p>
                            <div className="mt-2 flex flex-wrap items-center gap-2">
                              <Button
                                size="sm"
                                onClick={() => atender(a)}
                                className="!min-h-[28px] !px-3 !text-[10px] !tracking-[0.12em]"
                                aria-label={`Atender: ${textoAlerta(a)}`}
                              >
                                <Check className="h-3.5 w-3.5" aria-hidden="true" />
                                Atender
                              </Button>
                              {a.mesa?.id && (
                                <Link
                                  to={`/mesas?mesa=${encodeURIComponent(a.mesa.id)}`}
                                  onClick={() => setAbierto(false)}
                                  className="inline-flex min-h-[28px] items-center gap-1 rounded-full px-2 text-[10px] font-medium uppercase tracking-[0.12em] text-cobalto-600 underline decoration-oro-400 underline-offset-4 transition-colors hover:text-cobalto-700"
                                >
                                  Ver mesa
                                  <ArrowRight className="h-3 w-3" aria-hidden="true" />
                                </Link>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
