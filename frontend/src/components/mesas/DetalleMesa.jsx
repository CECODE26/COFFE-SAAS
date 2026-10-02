import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import {
  AlertTriangle, BellRing, Check, DoorClosed, Hand, KeyRound, MessageSquare, Pencil, QrCode, Receipt, RotateCw,
  Smartphone, Sparkles, StickyNote, UserPlus, Users,
} from 'lucide-react';
import { Button } from '../Button';
import { Badge, StatusBadge } from '../StatusBadge';
import { money } from '../Stats';
import { sonar } from '../../lib/avisos';
import { ModalToldo, Seccion, Aviso } from './ModalToldo';
import { PanelCobro } from './PanelCobro';
import { CodigoReconexion } from './CodigoReconexion';
import { usePolling } from './usePolling';
import {
  ESTADO_MESA_LABEL, METODO_LABEL, comensalesApi, haceCuanto, juntarNombres, mensajeError, plural,
} from './utils';

const ESTADO_SESION = {
  activa: ['sage', 'Activa'],
  pagada: ['slate', 'Pagada'],
  cerrada: ['neutral', 'Cerrada'],
};

const ALERTA = {
  ayuda: { icono: Hand, texto: 'Llama al mesero' },
  cuenta: { icono: Receipt, texto: 'Pide la cuenta' },
  personalizado: { icono: MessageSquare, texto: 'Aviso' },
};

const pareceId = (t) => typeof t === 'string' && /^[0-9a-f-]{32,36}$/i.test(t);
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Botón pequeño de las filas del detalle
const BotonFila = ({ children, ...props }) => (
  <Button size="sm" className="!min-h-[28px] !gap-1 !px-2.5 !text-[10px] !tracking-[0.1em]" {...props}>
    {children}
  </Button>
);

// Detalle de una mesa con comensales QR: cuentas pedidas, grupos con sus integrantes, cobros,
// códigos de reconexión, solicitudes de unión, alertas y cierre de la mesa.
export const DetalleMesa = ({ mesaId, mesa, onClose, onCambio, onVerQr, onMesaLista, onEditar }) => {
  const [datos, setDatos] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [errorAccion, setErrorAccion] = useState(null);
  const [cobro, setCobro] = useState(null);
  const [codigo, setCodigo] = useState(null);
  const [pidiendoCodigo, setPidiendoCodigo] = useState(null);
  const [atendiendo, setAtendiendo] = useState(null);
  const [confirmandoCierre, setConfirmandoCierre] = useState(false);
  const [cerrando, setCerrando] = useState(false);
  const [liberando, setLiberando] = useState(false);
  const hayDatos = useRef(false);

  const cargar = useCallback(async () => {
    try {
      const d = await comensalesApi.detalle(mesaId);
      hayDatos.current = true;
      setDatos(d || {});
      setErrorCarga(null);
    } catch (e) {
      // Si ya hay datos, un fallo del sondeo no borra lo que se ve
      if (!hayDatos.current) setErrorCarga(mensajeError(e, 'No se pudo cargar el detalle de la mesa.'));
    } finally {
      setCargando(false);
    }
  }, [mesaId]);

  useEffect(() => {
    cargar();
  }, [cargar]);
  usePolling(cargar, 10000);

  const reintentar = () => {
    setCargando(true);
    setErrorCarga(null);
    cargar();
  };

  const m = datos?.mesa || {};
  const numero = m.numero ?? mesa?.number ?? '';
  const zona = m.zona ?? mesa?.location ?? '';
  const estado = m.estado ?? mesa?.status;
  const notaCierre = m.nota_cierre ?? mesa?.nota_cierre ?? '';
  const grupos = datos?.grupos || [];
  const solicitudes = (datos?.solicitudes_pago || []).filter((s) => !s.estado || s.estado === 'pendiente');
  const uniones = datos?.solicitudes_union || [];
  const alertas = datos?.alertas || [];

  const integrantes = grupos.flatMap((g) => g.integrantes || []);
  const personas = integrantes.filter((i) => i.estado === 'activa').length;
  const porCobrar = grupos.reduce((acc, g) => acc + num(g.por_cobrar), 0);
  const vacio = !grupos.length && !solicitudes.length && !alertas.length && !uniones.length;

  const nombresGrupo = (grupoId) => {
    const g = grupos.find((x) => String(x.id) === String(grupoId));
    if (g) return juntarNombres(g.integrantes || []);
    if (typeof grupoId === 'object' || (typeof grupoId === 'string' && !pareceId(grupoId))) return juntarNombres(grupoId);
    return '';
  };

  // Método preferido de una cuenta pendiente del mismo grupo (para preseleccionarlo al cobrar)
  const preferidoDeGrupo = (grupoId) =>
    solicitudes.find((s) => String(s.grupo) === String(grupoId) && s.metodo_preferido)?.metodo_preferido;

  // ---------- Cobro ----------
  const avisarCobro = (r) => {
    const total = money(r?.total_cobrado);
    let mensaje;
    if (r?.mesa_estado === 'limpiando') {
      mensaje = `Cobrado ${total}. Mesa en limpieza: pulsa 'Mesa lista' cuando esté preparada.`;
    } else {
      const estadoTxt = r?.mesa_estado === 'ocupada' ? 'sigue ocupada' : `queda ${ESTADO_MESA_LABEL[r?.mesa_estado] || r?.mesa_estado || 'actualizada'}`;
      mensaje = `Cobrado ${total}. Mesa ${numero} ${estadoTxt}.${r?.nota_cierre ? ` ${r.nota_cierre}` : ''}`;
    }
    toast.success(mensaje, { duration: 7000, style: { borderRadius: '18px', maxWidth: '26rem' } });
  };

  const ejecutarCobro = async (metodo) => {
    const r = await comensalesApi.cobrar(mesaId, { ...cobro.body, metodo_pago: metodo });
    setCobro(null);
    sonar('ok');
    avisarCobro(r);
    await Promise.all([cargar(), onCambio?.()]);
  };

  const cobrarSolicitud = (s) => {
    const quien = juntarNombres(s.solicitada_por);
    const grupo = nombresGrupo(s.grupo);
    setCobro({
      titulo: s.tipo === 'grupal' ? 'Cuenta grupal' : `Cuenta de ${quien || 'la persona'}`,
      detalle:
        s.tipo === 'grupal'
          ? `${grupo ? `Grupo: ${grupo}. ` : ''}Si el grupo pidió algo más, el total se recalcula al cobrar.`
          : quien
          ? `Consumo de ${quien}`
          : 'Cuenta individual',
      total: s.total,
      metodoInicial: s.metodo_preferido,
      body: { solicitud: s.id },
    });
  };

  const cobrarSesiones = (grupo, lista) => {
    const alias = juntarNombres(lista);
    const total = lista.reduce((acc, i) => acc + num(i.por_cobrar), 0);
    setCobro({
      titulo: lista.length > 1 ? 'Cobrar grupo' : `Cobrar a ${alias}`,
      detalle: lista.length > 1 ? alias : `Solo el consumo de ${alias}`,
      total,
      metodoInicial: preferidoDeGrupo(grupo.id),
      body: { sesiones: lista.map((i) => i.id) },
    });
  };

  // ---------- Reconexión ----------
  const pedirCodigo = async (integrante, { desdeDialogo = false } = {}) => {
    setPidiendoCodigo(integrante.id);
    setErrorAccion(null);
    try {
      const r = await comensalesApi.codigo(integrante.id);
      setCodigo({ ...r, alias: r?.alias || integrante.alias, integrante, recibidoEn: Date.now() });
    } catch (e) {
      const msg = mensajeError(e, 'No se pudo generar el código de reconexión.');
      if (desdeDialogo) toast.error(msg);
      else setErrorAccion(msg);
    } finally {
      setPidiendoCodigo(null);
    }
  };

  // ---------- Alertas ----------
  const atender = async (alerta) => {
    setAtendiendo(alerta.id);
    try {
      await comensalesApi.atenderAlerta(alerta.id);
      setDatos((d) => ({ ...d, alertas: (d?.alertas || []).filter((a) => a.id !== alerta.id) }));
      onCambio?.();
    } catch (e) {
      toast.error(mensajeError(e, 'No se pudo marcar la alerta como atendida.'));
    } finally {
      setAtendiendo(null);
    }
  };

  // ---------- Cierre ----------
  const cerrarMesa = async () => {
    setCerrando(true);
    setErrorAccion(null);
    try {
      await comensalesApi.cerrar(mesaId);
      toast.success(`Mesa ${numero} cerrada: queda disponible.`);
      await onCambio?.();
      onClose();
    } catch (e) {
      setErrorAccion(mensajeError(e, 'No se pudo cerrar la mesa.'));
      setConfirmandoCierre(false);
      setCerrando(false);
    }
  };

  const mesaLista = async () => {
    setLiberando(true);
    const ok = await onMesaLista?.();
    if (ok) onClose();
    else {
      setLiberando(false);
      cargar();
    }
  };

  const verQr = () =>
    onVerQr?.(
      mesa || {
        id: m.id || mesaId,
        number: numero,
        location: zona,
        qr_code: m.qr_code,
      }
    );

  // ---------- Pie ----------
  const puedeCerrar = estado !== 'limpiando' && (grupos.length > 0 || uniones.length > 0 || estado === 'ocupada');
  let pie;
  if (confirmandoCierre) {
    pie = (
      <>
        <span className="mr-auto text-xs font-medium text-verde-700">¿Cerrar la mesa {numero}?</span>
        <Button variant="ghost" size="sm" onClick={() => setConfirmandoCierre(false)} disabled={cerrando}>
          No
        </Button>
        <Button variant="danger" size="sm" onClick={cerrarMesa} disabled={cerrando}>
          <DoorClosed className="h-3.5 w-3.5" aria-hidden="true" />
          {cerrando ? 'Cerrando…' : 'Sí, cerrar mesa'}
        </Button>
      </>
    );
  } else {
    pie = (
      <>
        <span className="mr-auto flex items-center gap-1.5">
          <Button variant="secondary" size="sm" onClick={verQr}>
            <QrCode className="h-3.5 w-3.5" aria-hidden="true" />
            QR
          </Button>
          {/* Solo roles de gestión (lo decide la página) */}
          {onEditar && (
            <Button variant="ghost" size="sm" onClick={onEditar} className="!px-3" aria-label={`Editar la mesa ${numero}`}>
              <Pencil className="h-3.5 w-3.5" aria-hidden="true" />
              Editar
            </Button>
          )}
        </span>
        {estado === 'limpiando' && (
          <Button size="sm" onClick={mesaLista} disabled={liberando}>
            <Sparkles className="h-3.5 w-3.5" aria-hidden="true" />
            Mesa lista
          </Button>
        )}
        {puedeCerrar && (
          <Button variant="danger" size="sm" onClick={() => setConfirmandoCierre(true)} disabled={!datos}>
            <DoorClosed className="h-3.5 w-3.5" aria-hidden="true" />
            Cerrar mesa
          </Button>
        )}
      </>
    );
  }

  const subtitulo = (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-1">
      {estado && <StatusBadge status={estado} className="!px-2 !py-0.5 !text-[9px] !tracking-[0.1em]" />}
      {zona && <span>{zona}</span>}
      {datos && (personas > 0 || porCobrar > 0) && (
        <span>
          {plural(personas, 'persona', 'personas')}
          {porCobrar > 0 && ` · ${money(porCobrar)} por cobrar`}
        </span>
      )}
    </span>
  );

  const ahora = Date.now();

  return (
    <>
      <ModalToldo
        onClose={onClose}
        eyebrow={`Mesa ${numero}`}
        titulo="Cuentas y comensales"
        subtitulo={subtitulo}
        pie={pie}
        ancho="lg"
      >
        {cargando && !datos ? (
          <div className="flex h-48 flex-col items-center justify-center gap-3" role="status">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500" />
            <p className="font-script text-xl text-oro-600">Cargando la mesa…</p>
          </div>
        ) : errorCarga && !datos ? (
          <div className="py-8 text-center">
            <Aviso icono={AlertTriangle} className="mx-auto max-w-sm text-left">
              {errorCarga}
            </Aviso>
            <Button variant="secondary" size="sm" onClick={reintentar} className="mt-3">
              <RotateCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          </div>
        ) : (
          <div>
            {errorAccion && (
              <Aviso icono={AlertTriangle} className="mb-3">
                {errorAccion}
              </Aviso>
            )}

            {confirmandoCierre && (
              <Aviso tono="oro" icono={DoorClosed} className="mb-3">
                Se cerrarán todas las sesiones QR de la mesa y quedará disponible. Si alguien tiene consumo sin cobrar, primero cóbralo.
              </Aviso>
            )}

            {notaCierre && (
              <Aviso tono="oro" icono={StickyNote} className="mb-3">
                {notaCierre}
              </Aviso>
            )}

            {estado === 'limpiando' && (
              <Aviso tono="cobalto" icono={Sparkles} className="mb-3">
                Mesa en limpieza: pulsa «Mesa lista» cuando esté preparada.
              </Aviso>
            )}

            {vacio && (
              <div className="flex flex-col items-center py-8 text-center">
                <span className="flex h-11 w-11 items-center justify-center rounded-full bg-pistacho-100 text-cobalto-500 ring-1 ring-oro-300">
                  <Smartphone className="h-5 w-5" aria-hidden="true" />
                </span>
                <p className="mt-2 font-serif text-lg italic text-verde-700">Nadie conectado por QR</p>
                <p className="mt-0.5 max-w-xs text-xs text-verde-600">
                  Cuando los clientes escaneen el QR de la mesa aparecerán aquí con su consumo.
                </p>
              </div>
            )}

            {/* Cuentas pedidas por los clientes */}
            {solicitudes.length > 0 && (
              <Seccion titulo="Piden la cuenta" cuenta={solicitudes.length} icono={Receipt}>
                <ul className="space-y-1.5">
                  {solicitudes.map((s) => {
                    const quien = juntarNombres(s.solicitada_por);
                    const grupo = s.tipo === 'grupal' ? nombresGrupo(s.grupo) : '';
                    return (
                      <li key={s.id} className="flex items-center gap-2 rounded-2xl border border-oro-300/70 bg-oro-50 px-3 py-2">
                        <div className="min-w-0 flex-1">
                          <p className="flex flex-wrap items-center gap-1.5 text-sm text-verde-700">
                            <span className="font-serif italic font-medium">{quien || 'Personal'}</span>
                            <Badge tone={s.tipo === 'grupal' ? 'slate' : 'honey'} dot={false} className="!px-1.5 !py-0 !text-[9px]">
                              {s.tipo === 'grupal' ? 'Grupal' : 'Individual'}
                            </Badge>
                          </p>
                          <p className="mt-0.5 text-[11px] leading-snug text-verde-600">
                            {[
                              grupo && `Grupo: ${grupo}`,
                              s.metodo_preferido && `Prefiere ${(METODO_LABEL[s.metodo_preferido] || s.metodo_preferido).toLowerCase()}`,
                              haceCuanto(s.created_at, ahora),
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </p>
                        </div>
                        <p className="shrink-0 font-serif text-lg italic font-medium text-verde-700">{money(s.total)}</p>
                        <BotonFila onClick={() => cobrarSolicitud(s)} aria-label={`Cobrar la cuenta de ${quien || 'la mesa'}`}>
                          Cobrar
                        </BotonFila>
                      </li>
                    );
                  })}
                </ul>
              </Seccion>
            )}

            {/* Alertas sin atender */}
            {alertas.length > 0 && (
              <Seccion titulo="Llamados y avisos" cuenta={alertas.length} icono={BellRing}>
                <ul className="space-y-1.5">
                  {alertas.map((a) => {
                    const tipo = ALERTA[a.tipo] || ALERTA.personalizado;
                    const Icono = tipo.icono;
                    return (
                      <li key={a.id} className="flex items-center gap-2 rounded-2xl border border-terracotta-600/20 bg-terracotta-100/40 px-3 py-2">
                        <Icono className="h-4 w-4 shrink-0 text-terracotta-700" aria-hidden="true" />
                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug text-verde-700">
                            <span className="font-serif italic font-medium">{a.alias || 'Aviso del sistema'}</span>
                            <span className="text-verde-600"> · {a.mensaje || tipo.texto}</span>
                          </p>
                          <p className="text-[11px] text-verde-600">{haceCuanto(a.created_at, ahora)}</p>
                        </div>
                        <BotonFila
                          variant="secondary"
                          onClick={() => atender(a)}
                          disabled={atendiendo === a.id}
                          aria-label={`Marcar como atendido el llamado de ${a.alias || 'la mesa'}`}
                        >
                          <Check className="h-3 w-3" aria-hidden="true" />
                          Atendido
                        </BotonFila>
                      </li>
                    );
                  })}
                </ul>
              </Seccion>
            )}

            {/* Grupos e integrantes */}
            {grupos.length > 0 && (
              <Seccion titulo="Comensales" cuenta={plural(personas, 'activa', 'activas')} icono={Users}>
                <ul className="space-y-2">
                  {grupos.map((g) => {
                    const lista = g.integrantes || [];
                    const activos = lista.filter((i) => i.estado === 'activa');
                    const totalActivos = activos.reduce((acc, i) => acc + num(i.por_cobrar), 0);
                    const multi = lista.length > 1;
                    return (
                      <li key={g.id} className="overflow-hidden rounded-2xl border border-oro-200/80 bg-marfil">
                        <div className="flex items-center justify-between gap-2 border-b border-oro-100 bg-pistacho-50/60 px-3 py-1.5">
                          <div className="min-w-0">
                            <p className="text-[9px] font-medium uppercase tracking-[0.18em] text-oro-600">
                              {multi ? 'Grupo' : 'Cuenta aparte'}
                            </p>
                            <p className="truncate font-serif text-[15px] italic font-medium text-verde-700">{juntarNombres(lista)}</p>
                          </div>
                          <p className="shrink-0 text-right leading-tight">
                            <span className="block font-serif text-lg italic font-medium text-verde-700">{money(g.por_cobrar)}</span>
                            <span className="text-[9px] uppercase tracking-[0.14em] text-verde-600">por cobrar</span>
                          </p>
                        </div>

                        <ul className="divide-y divide-oro-100 px-3">
                          {lista.map((i) => {
                            const [tono, etiqueta] = ESTADO_SESION[i.estado] || ['neutral', i.estado];
                            const puedeCobrarSolo = multi && activos.length > 1 && i.estado === 'activa' && num(i.por_cobrar) > 0;
                            const puedeReconectar = i.estado === 'activa' || i.estado === 'pagada';
                            return (
                              <li key={i.id} className="flex flex-wrap items-center gap-x-2 gap-y-1 py-1.5">
                                <div className="min-w-0 flex-1">
                                  <p className="flex flex-wrap items-center gap-1.5">
                                    <span className="font-serif text-sm italic font-medium text-verde-700">{i.alias}</span>
                                    <Badge tone={tono} className="!px-1.5 !py-0 !text-[9px]">
                                      {etiqueta}
                                    </Badge>
                                  </p>
                                  <p className="text-[11px] leading-snug text-verde-600">
                                    {[
                                      plural(num(i.pedidos), 'pedido', 'pedidos'),
                                      num(i.por_cobrar) > 0 ? `${money(i.por_cobrar)} por cobrar` : i.estado === 'activa' ? 'sin consumo por cobrar' : null,
                                      i.estado === 'activa' && i.ultima_actividad && `activo ${haceCuanto(i.ultima_actividad, ahora)}`,
                                    ]
                                      .filter(Boolean)
                                      .join(' · ')}
                                  </p>
                                </div>
                                <div className="flex shrink-0 gap-1">
                                  {puedeCobrarSolo && (
                                    <BotonFila variant="secondary" onClick={() => cobrarSesiones(g, [i])}>
                                      Cobrar solo a {i.alias}
                                    </BotonFila>
                                  )}
                                  {puedeReconectar && (
                                    <BotonFila
                                      variant="ghost"
                                      onClick={() => pedirCodigo(i)}
                                      disabled={pidiendoCodigo === i.id}
                                      aria-label={`Reconectar a ${i.alias}: generar código`}
                                    >
                                      <KeyRound className="h-3 w-3" aria-hidden="true" />
                                      Reconectar
                                    </BotonFila>
                                  )}
                                </div>
                              </li>
                            );
                          })}
                        </ul>

                        {activos.length > 0 && (
                          <div className="border-t border-oro-100 px-3 py-2">
                            {totalActivos > 0 ? (
                              <Button
                                size="sm"
                                onClick={() => cobrarSesiones(g, activos)}
                                className="w-full !min-h-[30px] !text-[10px] !tracking-[0.12em]"
                              >
                                {activos.length > 1 ? `Cobrar grupo · ${money(totalActivos)}` : `Cobrar a ${activos[0].alias} · ${money(totalActivos)}`}
                              </Button>
                            ) : (
                              <p className="text-center text-[11px] text-verde-600">Sin consumo por cobrar.</p>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </Seccion>
            )}

            {/* Solicitudes de unión (informativo: las resuelven los propios clientes) */}
            {uniones.length > 0 && (
              <Seccion titulo="Quieren unirse" cuenta={uniones.length} icono={UserPlus}>
                <ul className="space-y-1">
                  {uniones.map((u) => (
                    <li key={u.id} className="flex items-start gap-2 text-xs text-verde-700">
                      <span className="mt-1.5 inline-block h-1.5 w-1.5 shrink-0 rotate-45 bg-oro-400" aria-hidden="true" />
                      <span>
                        <span className="font-serif text-sm italic font-medium">{u.alias}</span> quiere unirse a{' '}
                        <span className="font-medium">{juntarNombres(u.grupo_nombres) || 'otro grupo'}</span>
                        <span className="text-verde-600"> · {haceCuanto(u.created_at, ahora)}</span>
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-1.5 text-[11px] text-verde-600">Lo aceptan o rechazan desde sus celulares; mientras tanto pide por su cuenta.</p>
              </Seccion>
            )}
          </div>
        )}
      </ModalToldo>

      {cobro && (
        <PanelCobro
          mesaNumero={numero}
          titulo={cobro.titulo}
          detalle={cobro.detalle}
          total={cobro.total}
          metodoInicial={cobro.metodoInicial}
          onCobrar={ejecutarCobro}
          onClose={() => setCobro(null)}
        />
      )}

      {codigo && (
        <CodigoReconexion
          mesaNumero={numero}
          datos={codigo}
          onRegenerar={() => pedirCodigo(codigo.integrante, { desdeDialogo: true })}
          onClose={() => setCodigo(null)}
        />
      )}
    </>
  );
};
