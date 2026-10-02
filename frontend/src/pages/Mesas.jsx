import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ToldoFino } from '../components/Decor';
import { Badge, StatusBadge, statusTone } from '../components/StatusBadge';
import { money } from '../components/Stats';
import { DetalleMesa } from '../components/mesas/DetalleMesa';
import { QrMesaModal } from '../components/mesas/QrMesaModal';
import { ImprimirQrDialog } from '../components/mesas/ImprimirQrDialog';
import { MesaForm } from '../components/mesas/MesaForm';
import { AccionMesaDialog } from '../components/mesas/AccionMesaDialog';
import { HojaQr } from '../components/mesas/TarjetaQr';
import { usePolling } from '../components/mesas/usePolling';
import { useImpresion } from '../components/mesas/useImpresion';
import {
  ROLES_ADMIN_QR, ROLES_GESTION_MESAS, comensalesApi, conQrCode, mensajeError, mesasApi, obtenerLogos, plural,
  zonasPorLocal,
} from '../components/mesas/utils';
import { Users, Armchair, MapPin, Minus, Pencil, Plus, Power, X, QrCode, Printer, Smartphone } from 'lucide-react';
import toast from 'react-hot-toast';

// Franja superior de la tarjeta según el estado de la mesa
const ACCENT = {
  sage: 'bg-pistacho-500',
  terracotta: 'bg-terracotta-600',
  honey: 'bg-oro-400',
  slate: 'bg-cobalto-500',
  brass: 'bg-oro-500',
  neutral: 'bg-verde-200',
};

// Estados desde los que se puede sentar a clientes (abre el modal de "¿Cuántos llegan?")
const SEATABLE = ['disponible', 'reservada'];

// Cada cuánto se refrescan las mesas y el resumen de comensales QR
const REFRESCO_MS = 10000;

// Orden estable: por local (nombre y, si empatan, id) y luego por número de mesa
const byCafeAndNumber = (a, b) =>
  (a.cafeteria_name || '').localeCompare(b.cafeteria_name || '', 'es') ||
  String(a.cafeteria ?? '').localeCompare(String(b.cafeteria ?? '')) ||
  (a.number || 0) - (b.number || 0);

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

// Resumen QR de una mesa normalizado: { personas, porCobrar, pideCuenta, llamados }
const leerResumen = (r) =>
  r
    ? {
        personas: num(r.personas),
        porCobrar: num(r.por_cobrar ?? r.total_pendiente),
        pideCuenta: num(r.solicitudes_pendientes),
        llamados: num(r.alertas_pendientes),
      }
    : null;

const tieneQr = (q) => !!q && (q.personas > 0 || q.porCobrar > 0 || q.pideCuenta > 0 || q.llamados > 0);

// Lápiz discreto de la tarjeta para editar la mesa (roles de gestión); va al final de la línea de datos
const BotonEditar = ({ mesa, onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="-my-1 -mr-1 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-verde-400 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
    aria-label={`Editar la mesa ${mesa.number}`}
    title="Editar mesa"
  >
    <Pencil className="h-3 w-3" aria-hidden="true" />
  </button>
);

// Badge pequeño de la tarjeta ("Pide la cuenta", "Llamado")
const MiniBadge = ({ tone, children }) => (
  <Badge tone={tone} className="!gap-1 !px-1.5 !py-0.5 !text-[9px] !tracking-[0.08em]">
    {children}
  </Badge>
);

export const Mesas = () => {
  const { mesas, fetchMesas, occupyMesa, freeMesa } = useData();
  const { user } = useAuth();
  const esAdmin = ROLES_ADMIN_QR.includes(user?.role);
  const esGestion = ROLES_GESTION_MESAS.includes(user?.role);
  const [selectedMesa, setSelectedMesa] = useState(null);
  const [guestCount, setGuestCount] = useState(2);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  // Mesa con una petición en curso (evita dobles clics)
  const [busyId, setBusyId] = useState(null);
  // Comensales QR por mesa: { <mesa_id>: { personas, por_cobrar, solicitudes_pendientes, alertas_pendientes } }
  const [resumen, setResumen] = useState({});
  // Modal del QR de una mesa y logos de los locales (para la tarjeta imprimible)
  const [qrMesa, setQrMesa] = useState(null);
  const [logos, setLogos] = useState({});
  const [eligiendoLocal, setEligiendoLocal] = useState(false);
  const [preparandoHoja, setPreparandoHoja] = useState(false);
  const { imprimir, imprimiendo, portal } = useImpresion();
  // Gestión: mesas desactivadas, formulario de alta/edición ({ mesa } o { mesa: null }) y acción por confirmar
  const [inactivas, setInactivas] = useState([]);
  const [form, setForm] = useState(null);
  const [accionMesa, setAccionMesa] = useState(null);

  // El detalle se abre con ?mesa=<id> (la campana de alertas enlaza así)
  const [searchParams, setSearchParams] = useSearchParams();
  const detalleId = searchParams.get('mesa');

  const abrirDetalle = useCallback(
    (id) =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.set('mesa', id);
          return p;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  const cerrarDetalle = useCallback(
    () =>
      setSearchParams(
        (prev) => {
          const p = new URLSearchParams(prev);
          p.delete('mesa');
          return p;
        },
        { replace: true }
      ),
    [setSearchParams]
  );

  // El modal de sentar está abierto si hay una mesa elegida que admite clientes
  const seating = !!selectedMesa && SEATABLE.includes(selectedMesa.status);

  // Cerrar el modal con Escape mientras está abierto
  useEffect(() => {
    if (!seating) return undefined;
    const onKey = (e) => e.key === 'Escape' && setSelectedMesa(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [seating]);

  // Resumen de comensales QR; si falla (o la ruta aún no existe) se conserva el último
  const cargarResumen = useCallback(async () => {
    try {
      const data = await comensalesApi.resumen();
      setResumen(data && typeof data === 'object' && !Array.isArray(data) ? data : {});
    } catch (error) {
      /* sin resumen: las tarjetas se ven como siempre */
    }
  }, []);

  const refrescar = useCallback(() => Promise.all([fetchMesas(), cargarResumen()]), [fetchMesas, cargarResumen]);

  // Mesas desactivadas (solo gestión); si falla se conserva la última lista
  const cargarInactivas = useCallback(async () => {
    try {
      setInactivas(await mesasApi.inactivas());
    } catch (error) {
      /* sin cambios */
    }
  }, []);

  useEffect(() => {
    if (esGestion) cargarInactivas();
  }, [esGestion, cargarInactivas]);

  useEffect(() => {
    const loadMesas = async () => {
      setLoading(true);
      try {
        await refrescar();
      } catch (error) {
        toast.error('Error cargando mesas', { id: 'Error cargando mesas' });
      } finally {
        setLoading(false);
      }
    };

    loadMesas();
  }, [refrescar]);

  // Sondeo cada 10 s (se pausa con la pestaña oculta)
  usePolling(refrescar, REFRESCO_MS, !loading);
  // Mientras se ven las desactivadas, también se refrescan
  usePolling(cargarInactivas, REFRESCO_MS, esGestion && !loading && filter === 'inactivas');

  // Al reactivar la última desactivada, el filtro «Inactivas» desaparece: se vuelve a «Todas»
  useEffect(() => {
    if (filter === 'inactivas' && inactivas.length === 0) setFilter('all');
  }, [filter, inactivas.length]);

  // Abre el modal de sentar con un número de clientes razonable para la mesa
  const openSeat = (mesa) => {
    setGuestCount(Math.min(mesa.capacity, Math.max(mesa.min_capacity || 1, 2)));
    setSelectedMesa(mesa);
  };

  // Sienta clientes en una mesa libre o a los de una reserva (misma acción: occupy)
  const handleOccupy = async () => {
    if (!selectedMesa || busyId) return;

    setBusyId(selectedMesa.id);
    try {
      await occupyMesa(selectedMesa.id, guestCount);
      toast.success(
        selectedMesa.status === 'reservada'
          ? `Reserva sentada en la mesa ${selectedMesa.number}`
          : `Mesa ${selectedMesa.number} ocupada`
      );
      setSelectedMesa(null);
    } catch (error) {
      toast.error(mensajeError(error, 'Error al ocupar mesa'));
    } finally {
      setBusyId(null);
    }
  };

  // Deja la mesa disponible: al liberar una ocupada o al terminar de limpiarla ("Mesa lista").
  // Si el backend la bloquea por personas conectadas por QR, muestra su mensaje y ofrece ver el detalle.
  const handleFree = async (mesa, okMessage = 'Mesa liberada') => {
    setBusyId(mesa.id);
    try {
      await freeMesa(mesa.id);
      cargarResumen();
      toast.success(okMessage);
      return true;
    } catch (error) {
      const msg = mensajeError(error, 'Error al liberar mesa');
      const q = leerResumen(resumen[String(mesa.id)]);
      const porQr = error?.response?.status === 400 && (/QR|conectad/i.test(msg) || (q && q.personas > 0));
      if (porQr) {
        toast.error(
          (t) => (
            <span className="flex flex-col items-start gap-1">
              <span>{msg}</span>
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  abrirDetalle(mesa.id);
                }}
                className="text-[11px] font-medium uppercase tracking-[0.14em] text-oro-300 underline underline-offset-4 hover:text-marfil"
              >
                Ver detalle
              </button>
            </span>
          ),
          { duration: 9000, style: { borderRadius: '18px', maxWidth: '26rem' } }
        );
      } else {
        toast.error(msg);
      }
      return false;
    } finally {
      setBusyId(null);
    }
  };

  // QR de una mesa (desde la tarjeta o desde el detalle); carga el logo del local para la tarjeta
  const abrirQr = (mesa) => {
    const enLista = mesas.find((m) => String(m.id) === String(mesa.id));
    const completa = enLista ? { ...enLista, qr_code: enLista.qr_code || mesa.qr_code } : mesa;
    setQrMesa(completa);
    if (completa.cafeteria) obtenerLogos([completa.cafeteria]).then((l) => setLogos((prev) => ({ ...prev, ...l })));
  };

  // ---- Gestión de mesas ----
  const abrirForm = (mesa = null) => setForm({ mesa });

  // Mesa creada: se refresca la grilla y se abre su QR para imprimirlo o descargarlo de una vez
  const alGuardar = (fila, modo) => {
    setForm(null);
    if (modo === 'crear') {
      toast.success(`Mesa ${fila.number} creada · su QR ya está listo`);
      setFilter((f) => (f === 'all' || f === 'disponible' ? f : 'all'));
      abrirQr(fila);
    } else {
      toast.success(`Mesa ${fila.number} actualizada`);
    }
    refrescar();
    if (fila.is_active === false) cargarInactivas();
  };

  // Desactivar / reactivar / borrar se confirman en su propio diálogo
  const pedirAccion = (accion, mesa) => {
    setForm(null);
    setAccionMesa({ accion, mesa });
  };

  const alTerminarAccion = (accion, respuesta) => {
    const mesa = accionMesa?.mesa;
    setAccionMesa(null);
    toast.success(respuesta?.message || `Mesa ${mesa?.number ?? ''} borrada`, { duration: 6000 });
    if (accion !== 'reactivar' && mesa && String(detalleId) === String(mesa.id)) cerrarDetalle();
    refrescar();
    cargarInactivas();
  };

  // Acción principal de cada estado: etiqueta, variante del botón y qué hace al pulsar
  const mesaAction = (mesa, qr) => {
    // Con comensales QR, la acción es ver la cuenta (desde el detalle se cobra o se cierra)
    if (tieneQr(qr) && mesa.status !== 'limpiando') {
      return qr.pideCuenta > 0
        ? { label: 'Cobrar', variant: 'primary', onClick: () => abrirDetalle(mesa.id) }
        : { label: 'Ver cuenta', variant: 'secondary', onClick: () => abrirDetalle(mesa.id) };
    }
    switch (mesa.status) {
      case 'disponible':
        return { label: 'Sentar clientes', variant: 'primary', onClick: () => openSeat(mesa) };
      case 'reservada':
        return { label: 'Sentar reserva', variant: 'primary', onClick: () => openSeat(mesa) };
      case 'limpiando':
        return { label: 'Mesa lista', variant: 'secondary', onClick: () => handleFree(mesa, 'Mesa lista') };
      case 'ocupada':
        return { label: 'Liberar mesa', variant: 'secondary', onClick: () => handleFree(mesa) };
      default:
        return null;
    }
  };

  const multiCafe = new Set([...mesas, ...inactivas].map((m) => m.cafeteria)).size > 1;
  const countBy = (s) => mesas.filter((m) => m.status === s).length;
  const sorted = useMemo(() => [...mesas].sort(byCafeAndNumber), [mesas]);
  const filtered = useMemo(() => {
    if (filter === 'inactivas') return [...inactivas].sort(byCafeAndNumber);
    return filter === 'all' ? sorted : sorted.filter((m) => m.status === filter);
  }, [sorted, inactivas, filter]);
  // Zonas ya usadas en cada local (sugerencias del formulario)
  const zonas = useMemo(() => zonasPorLocal([...mesas, ...inactivas]), [mesas, inactivas]);
  const pidenCuenta = mesas.filter((m) => num(resumen[String(m.id)]?.solicitudes_pendientes) > 0).length;

  // Con varios locales, agrupa las mesas por cafetería (respetando el orden anterior)
  const groups = useMemo(() => {
    if (!multiCafe) return [{ key: 'all', name: null, mesas: filtered }];
    const acc = [];
    filtered.forEach((m) => {
      const last = acc[acc.length - 1];
      if (last && last.key === m.cafeteria) last.mesas.push(m);
      else acc.push({ key: m.cafeteria, name: m.cafeteria_name || 'Local', mesas: [m] });
    });
    return acc;
  }, [filtered, multiCafe]);

  // Locales con mesas activas (para la hoja de QR)
  const locales = useMemo(() => {
    const acc = [];
    sorted.forEach((m) => {
      if (m.is_active === false) return;
      const last = acc[acc.length - 1];
      if (last && last.id === m.cafeteria) last.cantidad += 1;
      else acc.push({ id: m.cafeteria, nombre: m.cafeteria_name || 'Local', cantidad: 1 });
    });
    return acc;
  }, [sorted]);

  // Hoja con los QR de todas las mesas del local (6 por A4) e imprime
  const imprimirHoja = async (localId) => {
    const lista = sorted.filter(
      (m) => m.is_active !== false && (localId === 'todos' || String(m.cafeteria) === String(localId))
    );
    if (!lista.length) {
      toast.error('No hay mesas activas para imprimir.');
      return;
    }
    setPreparandoHoja(true);
    try {
      const [conCodigo, logosHoja] = await Promise.all([conQrCode(lista), obtenerLogos(lista.map((m) => m.cafeteria))]);
      const listas = conCodigo.filter((m) => m.qr_code);
      if (!listas.length) {
        toast.error('No se pudieron obtener los códigos QR de las mesas.');
        return;
      }
      if (listas.length < conCodigo.length) {
        toast.error(`${plural(conCodigo.length - listas.length, 'mesa sin código QR quedó', 'mesas sin código QR quedaron')} fuera de la hoja.`);
      }
      setLogos((prev) => ({ ...prev, ...logosHoja }));
      setEligiendoLocal(false);
      imprimir(<HojaQr mesas={listas} logos={logosHoja} />);
    } finally {
      setPreparandoHoja(false);
    }
  };

  const handleImprimirQr = () => {
    if (locales.length > 1) setEligiendoLocal(true);
    else imprimirHoja(locales[0]?.id ?? 'todos');
  };

  // Posición de cada mesa en la lista visible, para escalonar la animación con tope
  const position = new Map(filtered.map((m, i) => [m.id, i]));

  // Zona, capacidad y lápiz de edición (gestión) en UNA línea: la zona se recorta si no cabe
  const renderDatos = (mesa, capacidad, etiquetaCapacidad) => (
    <div className="mt-2 flex items-center gap-2 text-xs text-verde-600">
      <span className="inline-flex min-w-0 flex-1 items-center gap-1" title={mesa.location || undefined}>
        {mesa.location && (
          <>
            <MapPin className="h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />
            <span className="truncate">{mesa.location}</span>
          </>
        )}
      </span>
      <span className="inline-flex shrink-0 items-center gap-1" title={etiquetaCapacidad} aria-label={etiquetaCapacidad}>
        <Users className="h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />
        {capacidad}
      </span>
      {esGestion && <BotonEditar mesa={mesa} onClick={() => abrirForm(mesa)} />}
    </div>
  );

  const capacidadDe = (mesa) =>
    mesa.status === 'ocupada' && mesa.is_active !== false
      ? [`${mesa.guest_count}/${mesa.capacity}`, `${mesa.guest_count} de ${mesa.capacity} personas`]
      : [String(mesa.capacity), `Capacidad: ${plural(mesa.capacity, 'persona', 'personas')}`];

  // Mesa desactivada (vista "Desactivadas"): atenuada, sin QR ni operación; solo editar o reactivar
  const renderInactiva = (mesa) => (
    <Card
      key={mesa.id}
      padded={false}
      className="animate-fade-in relative overflow-hidden !rounded-2xl !border-dashed !bg-crema !shadow-none"
      style={{ animationDelay: `${Math.min(position.get(mesa.id) || 0, 10) * 40}ms` }}
    >
      <span className="absolute inset-x-0 top-0 h-1 bg-verde-200" aria-hidden="true" />
      <div className="px-3.5 pb-3 pt-3.5">
        <div className="opacity-60">
          {/* Si no caben en una fila, el estado baja: nunca tapa el número */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="flex shrink-0 items-baseline gap-1.5">
              <span className="sr-only sm:not-sr-only text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Mesa</span>
              <span className="font-serif text-[1.6rem] italic font-medium leading-none text-verde-700">{mesa.number}</span>
            </p>
            <Badge tone="neutral" className="shrink-0 !px-2 !py-0.5 !text-[9px] !tracking-[0.1em]">
              Desactivada
            </Badge>
          </div>
          {renderDatos(mesa, ...capacidadDe(mesa))}
        </div>
        <div className="mt-3">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => pedirAccion('reactivar', mesa)}
            aria-label={`Reactivar la mesa ${mesa.number}`}
            className="w-full !min-h-[32px] !px-2 !text-[10px] !tracking-[0.12em]"
          >
            <Power className="h-3.5 w-3.5" aria-hidden="true" />
            Reactivar
          </Button>
        </div>
      </div>
    </Card>
  );

  // Tarjeta compacta: número y estado en una línea, detalles debajo y la acción dentro
  const renderMesa = (mesa) => {
    if (mesa.is_active === false) return renderInactiva(mesa);
    const qr = leerResumen(resumen[String(mesa.id)]);
    const conQr = tieneQr(qr);
    const atencion = conQr && (qr.pideCuenta > 0 || qr.llamados > 0);
    const action = mesaAction(mesa, qr);
    const textoQr = conQr
      ? [qr.personas > 0 && plural(qr.personas, 'persona', 'personas'), qr.porCobrar > 0 && `${money(qr.porCobrar)} por cobrar`]
          .filter(Boolean)
          .join(' · ') || 'Ver cuenta QR'
      : '';
    return (
      <Card
        key={mesa.id}
        padded={false}
        className={`animate-fade-in group relative overflow-hidden !rounded-2xl hover:shadow-lift ${atencion ? 'ring-2 ring-oro-400' : ''}`}
        style={{ animationDelay: `${Math.min(position.get(mesa.id) || 0, 10) * 40}ms` }}
      >
        <span className={`absolute inset-x-0 top-0 h-1 ${ACCENT[statusTone(mesa.status)]}`} aria-hidden="true" />
        <div className="px-3.5 pb-3 pt-3.5">
          {/* Si no caben en una fila, el estado baja: nunca tapa el número */}
          <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
            <p className="flex shrink-0 items-baseline gap-1.5">
              <span className="sr-only sm:not-sr-only text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Mesa</span>
              <span className="font-serif text-[1.6rem] italic font-medium leading-none text-verde-700">{mesa.number}</span>
            </p>
            <StatusBadge status={mesa.status} className="shrink-0 !px-2 !py-0.5 !text-[9px] !tracking-[0.1em]" />
          </div>

          {renderDatos(mesa, ...capacidadDe(mesa))}

          {/* Comensales conectados por QR: abre el detalle */}
          {conQr && (
            <button
              type="button"
              onClick={() => abrirDetalle(mesa.id)}
              className="mt-1.5 flex w-full items-start gap-1 rounded text-left text-[11px] font-medium leading-tight text-cobalto-600 hover:underline"
              aria-label={`Ver detalle de la mesa ${mesa.number}: ${textoQr}`}
            >
              <Smartphone className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{textoQr}</span>
            </button>
          )}

          {atencion && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {qr.pideCuenta > 0 && (
                <MiniBadge tone="honey">Pide la cuenta{qr.pideCuenta > 1 ? ` ·${qr.pideCuenta}` : ''}</MiniBadge>
              )}
              {qr.llamados > 0 && <MiniBadge tone="terracotta">Llamado{qr.llamados > 1 ? ` ·${qr.llamados}` : ''}</MiniBadge>}
            </div>
          )}

          {mesa.nota_cierre && (
            <p className="mt-1.5 line-clamp-2 text-[10px] italic leading-snug text-oro-700" title={mesa.nota_cierre}>
              {mesa.nota_cierre}
            </p>
          )}

          <div className="mt-3 flex items-center gap-1.5">
            {action ? (
              <Button
                size="sm"
                variant={action.variant}
                disabled={busyId === mesa.id}
                onClick={action.onClick}
                aria-label={`${action.label} · mesa ${mesa.number}`}
                className="min-w-0 flex-1 !min-h-[32px] !px-2 !text-[10px] !tracking-[0.12em]"
              >
                {action.label}
              </Button>
            ) : (
              <span className="flex-1" />
            )}
            <button
              type="button"
              onClick={() => abrirQr(mesa)}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-oro-400/70 bg-marfil text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
              aria-label={`QR de la mesa ${mesa.number}`}
              title="QR de la mesa"
            >
              <QrCode className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </Card>
    );
  };

  const mesaDetalle = detalleId ? mesas.find((m) => String(m.id) === String(detalleId)) : null;

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Salón"
            title="Mesas"
            subtitle={`${countBy('disponible')} de ${mesas.length} mesas listas para recibir clientes${
              pidenCuenta ? ` · ${pidenCuenta} ${pidenCuenta === 1 ? 'pide' : 'piden'} la cuenta` : ''
            }.`}
            actions={
              <>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleImprimirQr}
                  disabled={!locales.length || preparandoHoja || imprimiendo}
                  className="!min-h-[34px] !px-4 !text-[10px]"
                >
                  <Printer className="h-3.5 w-3.5" aria-hidden="true" />
                  {preparandoHoja && !eligiendoLocal ? 'Preparando…' : 'Imprimir QR'}
                </Button>
                {esGestion && (
                  <Button size="sm" onClick={() => abrirForm()} className="!min-h-[34px] !px-4 !text-[10px]">
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Nueva mesa
                  </Button>
                )}
              </>
            }
          />

          {/* Filtros en una sola fila compacta (en el celular se deslizan si no caben) */}
          {(mesas.length > 0 || inactivas.length > 0) && (
            <div className="-mx-4 mb-3 overflow-x-auto px-4 pb-0.5 [scrollbar-width:none] sm:mx-0 sm:px-0 [&::-webkit-scrollbar]:hidden [&>div]:flex-nowrap [&_button]:whitespace-nowrap [&_button]:!px-3 [&_button]:!py-1 [&_button]:!text-[10.5px]">
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todas', count: mesas.length },
                  { value: 'disponible', label: 'Libres', count: countBy('disponible') },
                  { value: 'ocupada', label: 'Ocupadas', count: countBy('ocupada') },
                  // Solo gestión, y solo si hay alguna desactivada
                  ...(esGestion && inactivas.length > 0 ? [{ value: 'inactivas', label: 'Inactivas', count: inactivas.length }] : []),
                ]}
              />
            </div>
          )}

          {filtered.length === 0 ? (
            filter === 'inactivas' ? (
              <EmptyState
                icon={Armchair}
                title="Sin mesas desactivadas"
                description="Las mesas que desactives aparecen aquí para reactivarlas."
              />
            ) : mesas.length === 0 ? (
              <EmptyState
                icon={Armchair}
                title="Aún no hay mesas"
                description={
                  esGestion
                    ? 'Agrega la primera con «Nueva mesa»: su QR se genera solo.'
                    : 'El administrador del local todavía no ha agregado mesas.'
                }
              />
            ) : (
              <EmptyState icon={Armchair} title="Sin mesas aquí" description="Prueba con otro filtro." />
            )
          ) : (
            <div className="space-y-6">
              {groups.map((g) => (
                <section key={g.key}>
                  {/* Encabezado del local (solo cuando hay varios): cursiva, filete y rombo dorado */}
                  {g.name && (
                    <div className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1">
                      <h2 className="min-w-0 font-serif text-lg italic font-medium leading-tight text-verde-700">{g.name}</h2>
                      <span className="flex min-w-[3rem] flex-1 items-center gap-2" aria-hidden="true">
                        <span className="h-px flex-1 bg-oro-300" />
                        <span className="rombo" />
                        <span className="h-px w-5 bg-oro-300" />
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
                        {g.mesas.length} {g.mesas.length === 1 ? 'mesa' : 'mesas'}
                      </span>
                    </div>
                  )}
                  {/* Desde sm, tantas columnas como quepan con tarjetas de 12rem: así nada se parte en dos líneas */}
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-[repeat(auto-fill,minmax(12rem,1fr))]">{g.mesas.map(renderMesa)}</div>
                </section>
              ))}
            </div>
          )}

          {/* Modal para sentar clientes (mesa libre o reservada); Escape lo cierra */}
          {seating && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-verde-900/50 backdrop-blur-sm"
                onClick={() => setSelectedMesa(null)}
                aria-hidden="true"
              />
              <Card
                padded={false}
                className="animate-fade-in relative w-full max-w-sm overflow-hidden text-center shadow-lift"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ocupar-mesa-titulo"
              >
                <ToldoFino />
                <button
                  type="button"
                  onClick={() => setSelectedMesa(null)}
                  className="absolute right-3 top-8 rounded-full p-2 text-verde-600 transition-colors hover:bg-pistacho-100 hover:text-verde-800"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="px-6 pb-8 pt-6 sm:px-8">
                  <p className="font-script text-[26px] leading-none text-oro-600">Mesa {selectedMesa.number}</p>
                  <h2 id="ocupar-mesa-titulo" className="mt-2 font-serif text-3xl italic font-medium text-verde-700">
                    ¿Cuántos llegan?
                  </h2>
                  <div className="mt-4 flex items-center justify-center gap-3" aria-hidden="true">
                    <span className="h-px w-10 bg-oro-300" />
                    <span className="rombo" />
                    <span className="h-px w-10 bg-oro-300" />
                  </div>

                  <div className="my-7 flex items-center justify-center gap-6">
                    <button
                      onClick={() => setGuestCount(Math.max(selectedMesa.min_capacity || 1, guestCount - 1))}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-oro-400/70 bg-marfil text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                      aria-label="Menos"
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <span
                      className="min-w-[4rem] text-center font-serif text-6xl italic font-medium leading-none text-verde-700"
                      aria-live="polite"
                    >
                      {guestCount}
                    </span>
                    <button
                      onClick={() => setGuestCount(Math.min(selectedMesa.capacity, guestCount + 1))}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-oro-400/70 bg-marfil text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                      aria-label="Más"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mb-8 text-[11px] font-medium uppercase tracking-[0.18em] text-verde-600">
                    Capacidad {selectedMesa.min_capacity || 1} – {selectedMesa.capacity} personas
                  </p>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setSelectedMesa(null)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button onClick={handleOccupy} disabled={busyId === selectedMesa.id} className="flex-1">
                      Confirmar
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}

          {/* Detalle de la mesa con comensales QR (?mesa=<id>) */}
          {detalleId && (
            <DetalleMesa
              key={`detalle-${detalleId}`}
              mesaId={detalleId}
              mesa={mesaDetalle}
              onClose={cerrarDetalle}
              onCambio={refrescar}
              onVerQr={abrirQr}
              onMesaLista={() => handleFree(mesaDetalle || { id: detalleId }, 'Mesa lista')}
              onEditar={esGestion && mesaDetalle ? () => abrirForm(mesaDetalle) : undefined}
            />
          )}

          {/* Alta o edición de una mesa (gestión) */}
          {form && (
            <MesaForm
              key={form.mesa ? `editar-${form.mesa.id}` : 'nueva'}
              mesa={form.mesa}
              rol={user?.role}
              zonas={zonas}
              onClose={() => setForm(null)}
              onGuardada={alGuardar}
              onAccion={pedirAccion}
            />
          )}

          {/* Confirmar desactivar / reactivar / borrar */}
          {accionMesa && (
            <AccionMesaDialog
              key={`${accionMesa.accion}-${accionMesa.mesa.id}`}
              accion={accionMesa.accion}
              mesa={accionMesa.mesa}
              onClose={() => setAccionMesa(null)}
              onHecho={alTerminarAccion}
            />
          )}

          {/* QR de una mesa: vista previa, imprimir, PNG y regenerar */}
          {qrMesa && (
            <QrMesaModal
              key={`qr-${qrMesa.id}`}
              mesa={qrMesa}
              logo={logos[String(qrMesa.cafeteria)]}
              esAdmin={esAdmin}
              onClose={() => setQrMesa(null)}
              onRegenerado={(nuevo) => {
                setQrMesa((q) => (q ? { ...q, qr_code: nuevo } : q));
                fetchMesas();
              }}
            />
          )}

          {eligiendoLocal && (
            <ImprimirQrDialog
              locales={locales}
              preparando={preparandoHoja}
              onImprimir={imprimirHoja}
              onClose={() => setEligiendoLocal(false)}
            />
          )}

          {portal}
        </>
      )}
    </Layout>
  );
};
