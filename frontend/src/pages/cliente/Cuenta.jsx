import React, { useCallback, useEffect, useId, useState } from 'react';
import { Link } from 'react-router-dom';
import toast from 'react-hot-toast';
import {
  AlertCircle,
  ArrowLeftRight,
  Banknote,
  BellRing,
  CheckCircle2,
  CreditCard,
  LogOut,
  Receipt,
  RefreshCw,
  WifiOff,
} from 'lucide-react';
import { sonar } from '../../lib/avisos';
import { cliente, codigoError, escribirLocal, leerLocal, mensajeError, segundosEspera } from '../../services/clienteApi';
import { Segmented } from '../../components/Layout';
import { money } from '../../components/Stats';
import { BottomSheet } from '../../components/cliente/BottomSheet';
import { useComensal } from '../../components/cliente/ComensalContext';
import { Aviso, Cargando, FilaTotal } from '../../components/cliente/ui';
import { estadoCliente, METODOS_PAGO, segundosRestantes } from '../../components/cliente/utils';

const aviso = { position: 'top-center' };
const CLAVE_METODO = 'coffe_metodo_pago';
const CLAVE_ESPERA_MESERO = 'coffe_espera_mesero';
const MAX_MENSAJE = 200;

const METODOS = [
  { valor: 'efectivo', icono: Banknote },
  { valor: 'tarjeta', icono: CreditCard },
  { valor: 'transferencia', icono: ArrowLeftRight },
];

// Cuenta regresiva hasta un instante (ms epoch)
const useCuentaRegresiva = (hasta) => {
  const [restantes, setRestantes] = useState(() => segundosRestantes(hasta));
  useEffect(() => {
    setRestantes(segundosRestantes(hasta));
    if (!hasta || hasta <= Date.now()) return undefined;
    const t = setInterval(() => {
      const s = segundosRestantes(hasta);
      setRestantes(s);
      if (s <= 0) clearInterval(t);
    }, 1000);
    return () => clearInterval(t);
  }, [hasta]);
  return restantes;
};

// Consumo de una persona dentro de la cuenta
const BloqueIntegrante = ({ integrante, esYo, mostrarSubtotal }) => {
  const lineas = [];
  (integrante.pedidos || []).forEach((p) => {
    const sinEntregar = estadoCliente(p) !== 'entregado';
    (p.items || []).forEach((it, i) => lineas.push({ ...it, clave: `${p.id}-${i}`, sinEntregar }));
  });
  return (
    <div className="py-3 first:pt-0 last:pb-0">
      <div className="mb-1.5 flex items-baseline justify-between gap-2">
        <p className="text-[12px] font-semibold uppercase tracking-[0.14em] text-verde-800">
          {integrante.alias}
          {esYo && <span className="ml-1 font-normal normal-case tracking-normal text-verde-600">(tú)</span>}
        </p>
        {mostrarSubtotal && <p className="text-[12.5px] font-medium text-verde-700">{money(integrante.subtotal)}</p>}
      </div>
      {lineas.length === 0 ? (
        <p className="text-[12.5px] text-verde-600">Sin consumo por cobrar.</p>
      ) : (
        <ul className="space-y-0.5 text-[12.5px]">
          {lineas.map((it) => (
            <li key={it.clave} className="flex justify-between gap-3">
              <span className="min-w-0 text-verde-800">
                <span className="text-verde-600">{it.cantidad} ×</span> {it.nombre}
                {it.sinEntregar && (
                  <span className="ml-1.5 rounded-full bg-oro-100 px-1.5 py-px text-[9.5px] font-medium uppercase tracking-[0.1em] text-oro-700">
                    por llegar
                  </span>
                )}
              </span>
              <span className="shrink-0 text-verde-600">{money(Number(it.precio) * Number(it.cantidad || 1))}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

// Hoja para llamar al mesero (mensaje opcional)
const LlamarMesero = ({ open, onCerrar, esperaHasta, onEspera }) => {
  const [mensaje, setMensaje] = useState('');
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const restantes = useCuentaRegresiva(esperaHasta);
  const mensajeId = useId();

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const llamar = async () => {
    if (enviando || restantes > 0) return;
    setEnviando(true);
    setError(null);
    try {
      await cliente.llamarMesero({ tipo: 'ayuda', mensaje: mensaje.trim() || undefined });
      sonar('ok');
      toast.success('Listo, un mesero viene en camino.', aviso);
      setMensaje('');
      onEspera(30);
      onCerrar();
    } catch (e) {
      if (e?.response?.status === 429) onEspera(segundosEspera(e));
      else if (codigoError(e) === 'sesion_pagada') setError('Tu cuenta ya fue pagada. Si necesitas algo, pídeselo al personal.');
      else setError(mensajeError(e, 'No pudimos avisar al mesero.'));
    } finally {
      setEnviando(false);
    }
  };

  return (
    <BottomSheet
      open={open}
      onClose={onCerrar}
      eyebrow="¿Necesitas algo?"
      title="Llamar al mesero"
      footer={
        <button
          type="button"
          onClick={llamar}
          disabled={enviando || restantes > 0}
          className="btn-primary min-h-[48px] w-full px-5 text-[12.5px] disabled:opacity-60"
        >
          <BellRing className="h-4 w-4" aria-hidden="true" />
          {restantes > 0 ? `Podrás llamar en ${restantes} s` : enviando ? 'Avisando…' : 'Llamar al mesero'}
        </button>
      }
    >
      {error && (
        <p role="alert" className="mb-3 rounded-2xl bg-terracotta-100/70 px-3 py-2 text-[13px] text-terracotta-700">
          {error}
        </p>
      )}
      <label htmlFor={mensajeId} className="label">
        Mensaje <span className="normal-case tracking-normal text-verde-600/70">(opcional)</span>
      </label>
      <textarea
        id={mensajeId}
        data-autofocus
        rows={3}
        className="input resize-none py-2 text-[14px]"
        value={mensaje}
        onChange={(e) => setMensaje(e.target.value.slice(0, MAX_MENSAJE))}
        maxLength={MAX_MENSAJE}
        placeholder="Ej.: ¿nos traen servilletas?"
      />
      <p className="mt-1 text-right text-[10.5px] text-verde-600/70">
        {mensaje.length}/{MAX_MENSAJE}
      </p>
    </BottomSheet>
  );
};

export const Cuenta = () => {
  const { sesion, pagada, hayGrupo, pedidos, recargar, salir, abrirTicket } = useComensal();
  const [tipo, setTipo] = useState('individual');
  const [cuenta, setCuenta] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);

  const [metodo, setMetodo] = useState(() => leerLocal(CLAVE_METODO, '') || '');
  const [confirmacion, setConfirmacion] = useState(null);
  const [pidiendo, setPidiendo] = useState(false);
  const [errorPedir, setErrorPedir] = useState(null);

  const [llamarAbierto, setLlamarAbierto] = useState(false);
  const [esperaMesero, setEsperaMesero] = useState(() => Number(leerLocal(CLAVE_ESPERA_MESERO, 0)) || 0);
  const restantesMesero = useCuentaRegresiva(esperaMesero);

  const [salirAbierto, setSalirAbierto] = useState(false);
  const [saliendo, setSaliendo] = useState(false);
  const [errorSalir, setErrorSalir] = useState(null);

  const metodoId = useId();

  useEffect(() => {
    if (!hayGrupo && tipo === 'grupal') setTipo('individual');
  }, [hayGrupo, tipo]);

  const cargar = useCallback(async () => {
    setError(null);
    try {
      const { data } = await cliente.cuenta(tipo);
      setCuenta(data);
    } catch (e) {
      setError(mensajeError(e, 'No pudimos cargar tu cuenta.'));
    } finally {
      setCargando(false);
    }
  }, [tipo]);

  // Recargar al cambiar el tipo, al avanzar mis pedidos o al cambiar la solicitud de cuenta
  const firmaPedidos = (pedidos || []).map((p) => `${p.id}:${estadoCliente(p)}:${p.is_paid ? 1 : 0}`).join('|');
  const firmaSolicitud = sesion?.cuenta_pendiente?.id || '';
  useEffect(() => {
    if (!pagada) cargar();
    else setCargando(false);
  }, [cargar, firmaPedidos, firmaSolicitud, pagada]);

  const elegirMetodo = (valor) => {
    setMetodo(valor);
    escribirLocal(CLAVE_METODO, valor);
  };

  const iniciarEspera = (segundos) => {
    const hasta = Date.now() + segundos * 1000;
    setEsperaMesero(hasta);
    escribirLocal(CLAVE_ESPERA_MESERO, String(hasta));
  };

  const pedirCuenta = async (confirmar = false) => {
    if (pidiendo) return;
    setPidiendo(true);
    setErrorPedir(null);
    try {
      const { data } = await cliente.pedirCuenta({ tipo, metodo_preferido: metodo || undefined, confirmar });
      if (data?.requiere_confirmacion) {
        setConfirmacion(data);
        return;
      }
      setConfirmacion(null);
      sonar('ok');
      toast.success('La cuenta va en camino', aviso);
      await Promise.all([cargar(), recargar()]);
    } catch (e) {
      if (e?.response?.status === 429) {
        // El aviso con los segundos ya lo muestra el cliente HTTP
      } else if (codigoError(e) === 'sesion_pagada') {
        setErrorPedir('Tu cuenta ya fue pagada.');
      } else {
        setErrorPedir(mensajeError(e, 'No pudimos pedir la cuenta.'));
      }
    } finally {
      setPidiendo(false);
    }
  };

  const confirmarSalida = async () => {
    setSaliendo(true);
    setErrorSalir(null);
    try {
      await salir();
    } catch (e) {
      setErrorSalir(
        codigoError(e) === 'cuenta_abierta'
          ? mensajeError(e, 'Tienes consumo sin pagar: pide la cuenta antes de salir.')
          : mensajeError(e, 'No pudimos cerrar tu sesión.')
      );
      setSaliendo(false);
    }
  };

  // Sin consumo propio pendiente: se puede salir de la mesa
  const sinConsumo =
    pedidos !== null && (pedidos || []).every((p) => p.is_paid || estadoCliente(p) === 'cancelado');
  const puedeSalir = pagada || sinConsumo;

  const solicitud = cuenta?.solicitud_pendiente || null;
  const integrantes = cuenta?.integrantes || [];
  const total = Number(cuenta?.total || 0);

  const encabezado = (
    <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
      <div>
        <p className="font-script text-[19px] leading-none text-oro-600">Tu consumo</p>
        <h1 className="font-serif text-[1.5rem] italic font-medium leading-tight text-verde-700">Cuenta</h1>
      </div>
      {hayGrupo && !pagada && (
        <Segmented
          value={tipo}
          onChange={(v) => {
            setTipo(v);
            setConfirmacion(null);
            setCargando(true);
          }}
          options={[
            { value: 'individual', label: 'Solo lo mío' },
            { value: 'grupal', label: 'Mi grupo' },
          ]}
        />
      )}
    </div>
  );

  const acciones = (
    <div className="mt-4 space-y-2.5">
      {!pagada && (
        <button
          type="button"
          onClick={() => setLlamarAbierto(true)}
          className="btn-secondary min-h-[46px] w-full px-5 text-[12px]"
        >
          <BellRing className="h-4 w-4" aria-hidden="true" />
          {restantesMesero > 0 ? `Mesero avisado · de nuevo en ${restantesMesero} s` : 'Llamar al mesero'}
        </button>
      )}
      {puedeSalir && (
        <button
          type="button"
          onClick={() => {
            setErrorSalir(null);
            setSalirAbierto(true);
          }}
          className="mx-auto flex min-h-[40px] items-center gap-1.5 text-[12px] font-medium uppercase tracking-[0.16em] text-verde-600 underline decoration-oro-300 underline-offset-4 hover:text-terracotta-700"
        >
          <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
          Salir de la mesa
        </button>
      )}
    </div>
  );

  const hojas = (
    <>
      <LlamarMesero
        open={llamarAbierto}
        onCerrar={() => setLlamarAbierto(false)}
        esperaHasta={esperaMesero}
        onEspera={iniciarEspera}
      />
      <BottomSheet
        open={salirAbierto}
        onClose={() => setSalirAbierto(false)}
        eyebrow="Hasta pronto"
        title="¿Salir de la mesa?"
        footer={
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSalirAbierto(false)}
              className="btn-secondary min-h-[44px] flex-1 px-4 text-[11.5px]"
            >
              Quedarme
            </button>
            <button
              type="button"
              onClick={confirmarSalida}
              disabled={saliendo}
              className="btn-primary min-h-[44px] flex-1 px-4 text-[11.5px] disabled:opacity-60"
            >
              {saliendo ? 'Saliendo…' : 'Sí, salir'}
            </button>
          </div>
        }
      >
        <p className="text-[13.5px] text-verde-600">
          Cerraremos tu sesión en este celular. Si vuelves, escanea de nuevo el QR de la mesa.
        </p>
        {errorSalir && (
          <p role="alert" className="mt-3 rounded-2xl bg-terracotta-100/70 px-3 py-2 text-[13px] text-terracotta-700">
            {errorSalir}
          </p>
        )}
      </BottomSheet>
    </>
  );

  // ---------- Cuenta ya pagada ----------
  if (pagada) {
    const ticket = sesion?.ticket;
    return (
      <div>
        {encabezado}
        <div className="rounded-3xl border border-pistacho-300 bg-marfil px-5 py-6 text-center shadow-soft">
          <CheckCircle2 className="mx-auto h-9 w-9 text-verde-500" aria-hidden="true" />
          <h2 className="mt-2 font-serif text-xl italic text-verde-700">Tu cuenta ya fue pagada</h2>
          {ticket?.total !== undefined && (
            <p className="mt-1 text-sm text-verde-600">
              Tu consumo: <span className="font-semibold text-verde-800">{money(ticket.total)}</span>
              {ticket.tipo === 'grupal' && ticket.total_cobrado != null && (
                <> · Cuenta del grupo: <span className="font-semibold text-verde-800">{money(ticket.total_cobrado)}</span></>
              )}
              {ticket.metodo_pago && <> · {METODOS_PAGO[ticket.metodo_pago] || ticket.metodo_pago}</>}
            </p>
          )}
          <div className="mt-4 flex flex-col gap-2">
            <Link to="/mesa/ticket" className="btn-primary min-h-[46px] px-5 text-[12px]">
              <Receipt className="h-4 w-4" aria-hidden="true" />
              Ver comprobante
            </Link>
            <button type="button" onClick={abrirTicket} className="text-[12px] text-verde-600 underline decoration-oro-300 underline-offset-4">
              Ver resumen rápido
            </button>
          </div>
        </div>
        {acciones}
        {hojas}
      </div>
    );
  }

  // ---------- Cuenta abierta ----------
  return (
    <div>
      {encabezado}

      {cargando && !cuenta ? (
        <Cargando texto="Sumando tu cuenta…" />
      ) : error && !cuenta ? (
        <Aviso
          icon={WifiOff}
          titulo="No pudimos cargar tu cuenta"
          accion={
            <button type="button" onClick={cargar} className="btn-primary min-h-[44px] px-6 text-[12px]">
              <RefreshCw className="h-4 w-4" aria-hidden="true" />
              Reintentar
            </button>
          }
        >
          {error}
        </Aviso>
      ) : total <= 0 && integrantes.every((i) => !(i.pedidos || []).length) ? (
        <Aviso
          icon={Receipt}
          titulo="Aún no tienes consumo"
          accion={
            <Link to="/mesa" className="btn-primary min-h-[44px] px-6 text-[12px]">
              Ver el menú
            </Link>
          }
        >
          {tipo === 'grupal' ? 'Tu grupo todavía no tiene pedidos por cobrar.' : 'Cuando pidas algo, aquí verás tu cuenta.'}
        </Aviso>
      ) : (
        <>
          {solicitud && (
            <div className="mb-3 flex items-start gap-3 rounded-2xl border border-pistacho-300 bg-pistacho-100 px-3.5 py-3" role="status">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-verde-600" aria-hidden="true" />
              <div className="text-[13px] text-verde-800">
                <p className="font-serif text-[16px] italic font-medium">La cuenta va en camino</p>
                <p className="text-verde-700">
                  {solicitud.tipo === 'grupal' ? 'Cuenta del grupo' : 'Tu cuenta'}
                  {solicitud.total !== undefined && <> · {money(solicitud.total)}</>}
                  {solicitud.metodo_preferido && <> · {METODOS_PAGO[solicitud.metodo_preferido] || solicitud.metodo_preferido}</>}
                </p>
                <p className="mt-0.5 text-[11.5px] text-verde-600">Un mesero se acercará a tu mesa para cobrar.</p>
              </div>
            </div>
          )}

          <section aria-label="Detalle de la cuenta" className="rounded-2xl border border-oro-200/80 bg-marfil px-3.5 py-3.5 shadow-soft">
            <div className="divide-y divide-dashed divide-oro-200">
              {integrantes.map((i) => (
                <BloqueIntegrante
                  key={i.alias}
                  integrante={i}
                  esYo={i.alias === sesion?.alias}
                  mostrarSubtotal={tipo === 'grupal'}
                />
              ))}
            </div>
            <div className="mt-3 space-y-1 border-t border-oro-300/70 pt-3">
              <FilaTotal etiqueta="Subtotal" valor={money(cuenta?.subtotal)} />
              <FilaTotal etiqueta="IVA 15 %" valor={money(cuenta?.iva)} />
              <FilaTotal etiqueta="Total" valor={money(cuenta?.total)} fuerte className="pt-1" />
            </div>
            {cuenta?.sin_entregar > 0 && (
              <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-oro-700">
                <AlertCircle className="h-3.5 w-3.5" aria-hidden="true" />
                {cuenta.sin_entregar} pedido{cuenta.sin_entregar === 1 ? '' : 's'} aún sin entregar
              </p>
            )}
          </section>

          {!solicitud && (
            <>
              <fieldset className="mt-4">
                <legend id={metodoId} className="label">
                  ¿Cómo prefieres pagar?
                </legend>
                <div className="grid grid-cols-3 gap-2">
                  {METODOS.map(({ valor, icono: Icono }) => {
                    const sel = metodo === valor;
                    return (
                      <label
                        key={valor}
                        className={`flex cursor-pointer flex-col items-center gap-1 rounded-2xl border px-2 py-2.5 text-[11px] font-medium uppercase tracking-[0.1em] transition-colors focus-within:ring-2 focus-within:ring-cobalto-200 ${
                          sel ? 'border-verde-600 bg-pistacho-100 text-verde-800' : 'border-oro-200/80 bg-marfil text-verde-600 hover:border-oro-400'
                        }`}
                      >
                        <input
                          type="radio"
                          name="metodo"
                          value={valor}
                          checked={sel}
                          onChange={() => elegirMetodo(valor)}
                          className="sr-only"
                        />
                        <Icono className={`h-4 w-4 ${sel ? 'text-cobalto-500' : ''}`} aria-hidden="true" />
                        {METODOS_PAGO[valor]}
                      </label>
                    );
                  })}
                </div>
              </fieldset>

              {errorPedir && (
                <p role="alert" className="mt-3 rounded-2xl bg-terracotta-100/70 px-3 py-2 text-[13px] text-terracotta-700">
                  {errorPedir}
                </p>
              )}

              {confirmacion ? (
                <div className="mt-4 rounded-2xl border border-oro-300 bg-oro-50 px-3.5 py-3" role="alert">
                  <p className="text-[13.5px] text-verde-800">
                    {confirmacion.mensaje ||
                      `Tienes ${confirmacion.sin_entregar} pedido(s) sin entregar, ¿pedir la cuenta de todas formas?`}
                  </p>
                  <div className="mt-3 flex gap-2">
                    <button
                      type="button"
                      onClick={() => setConfirmacion(null)}
                      className="btn-secondary min-h-[42px] flex-1 px-3 text-[11px]"
                    >
                      Esperar
                    </button>
                    <button
                      type="button"
                      onClick={() => pedirCuenta(true)}
                      disabled={pidiendo}
                      className="btn-primary min-h-[42px] flex-1 px-3 text-[11px] disabled:opacity-60"
                    >
                      {pidiendo ? 'Pidiendo…' : 'Pedir de todas formas'}
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => pedirCuenta(false)}
                  disabled={pidiendo || total <= 0}
                  className="btn-primary mt-4 min-h-[48px] w-full px-5 text-[12.5px] disabled:opacity-60"
                >
                  <Receipt className="h-4 w-4" aria-hidden="true" />
                  {pidiendo ? 'Pidiendo…' : tipo === 'grupal' ? 'Pedir la cuenta del grupo' : 'Pedir la cuenta'}
                </button>
              )}
            </>
          )}
        </>
      )}

      {acciones}
      {hojas}
    </div>
  );
};
