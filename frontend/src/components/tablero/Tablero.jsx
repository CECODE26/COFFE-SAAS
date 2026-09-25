import React, { useCallback, useMemo, useState } from 'react';
import { AnimatePresence } from 'framer-motion';
import toast from 'react-hot-toast';
import { Bell, BellOff, BellRing, Info, KanbanSquare, List, RefreshCw, Volume2, VolumeX, WifiOff } from 'lucide-react';
import { Button } from '../Button';
import { Card } from '../Card';
import { Modal } from '../Form';
import { money } from '../Stats';
import { notificar, useAvisos, useTituloConContador } from '../../lib/avisos';
import { useAhora, useMedia } from './hooks';
import { useTablero } from './useTablero';
import { TarjetaPedido } from './TarjetaPedido';
import { ColumnaTablero, ColumnaVacia, EsqueletoColumna } from './ColumnaTablero';
import {
  COLUMNAS,
  SUBESTADOS_COCINA,
  accionPorArrastre,
  cantidadProductos,
  columnaDe,
  esCancelable,
  esQR,
  nombreCorto,
} from './utils';

const COMPACTO = '!min-h-[30px] !px-3 !text-[10px] !tracking-[0.12em]';
const CHIP = 'inline-flex min-h-[30px] items-center gap-1.5 rounded-full px-3 text-[10px] font-medium uppercase tracking-[0.12em]';

const porCreacion = (a, b) => new Date(a.created_at) - new Date(b.created_at);
const porEntrega = (a, b) =>
  new Date(b.completed_at || b.updated_at || b.created_at) - new Date(a.completed_at || a.updated_at || a.created_at);

const horaConSegundos = (ms) =>
  new Date(ms).toLocaleTimeString('es-EC', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });

export const Tablero = ({ onVerLista }) => {
  const { pedidos, estado, sinConexion, actualizadoEn, resaltados, ocupados, ejecutar, recargar } = useTablero();
  const { sonido, setSonido, permiso, pedirPermiso } = useAvisos();
  const ahora = useAhora(30000);
  const escritorio = useMedia('(min-width: 1024px)');
  const punteroFino = useMedia('(hover: hover) and (pointer: fine)');
  const arrastreActivo = escritorio && punteroFino;

  const [pestana, setPestana] = useState('caja');
  const [arrastradoId, setArrastradoId] = useState(null);
  const [sobre, setSobre] = useState(null);
  const [cancelarId, setCancelarId] = useState(null);

  // Pedidos repartidos por columna: caja y cocina por orden de llegada; entregados, lo último arriba
  const grupos = useMemo(() => {
    const g = { caja: [], cocina: [], entregado: [] };
    pedidos.forEach((p) => {
      const c = columnaDe(p.status);
      if (c) g[c].push(p);
    });
    g.caja.sort(porCreacion);
    g.cocina.sort(porCreacion);
    g.entregado.sort(porEntrega);
    return g;
  }, [pedidos]);

  const multiCafe = useMemo(() => new Set(pedidos.map((p) => p.cafeteria).filter(Boolean)).size > 1, [pedidos]);

  useTituloConContador(grupos.caja.length, 'Pedidos · COFFE-SAAS');

  const arrastrado = arrastradoId ? pedidos.find((p) => p.id === arrastradoId) : null;
  const pedidoCancelar = cancelarId ? pedidos.find((p) => p.id === cancelarId) : null;
  const cancelarAbierto = !!pedidoCancelar && esCancelable(pedidoCancelar);

  // ---------- Acciones ----------
  const alPedirCancelar = useCallback((id) => setCancelarId(id), []);
  const cerrarCancelar = useCallback(() => setCancelarId(null), []);
  const confirmarCancelar = () => {
    const pedido = pedidoCancelar;
    setCancelarId(null);
    if (pedido) ejecutar(pedido, 'cancel');
  };

  // ---------- Arrastrar y soltar (escritorio) ----------
  const alEmpezarArrastre = useCallback((id) => setArrastradoId(id), []);
  const alTerminarArrastre = useCallback(() => {
    setArrastradoId(null);
    setSobre(null);
  }, []);

  const estadoDrop = (columnaId) => {
    if (!arrastrado || columnaDe(arrastrado.status) === columnaId) return null;
    const { accion } = accionPorArrastre(arrastrado, columnaId);
    if (sobre === columnaId) return accion ? 'sobre-valido' : 'sobre-invalido';
    return accion ? 'valido' : null;
  };

  const handlersDrop = (columnaId) => ({
    onDragOver: (e) => {
      if (!arrastradoId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      if (sobre !== columnaId) setSobre(columnaId);
    },
    onDragLeave: (e) => {
      if (e.currentTarget.contains(e.relatedTarget)) return;
      setSobre((s) => (s === columnaId ? null : s));
    },
    onDrop: (e) => {
      if (!arrastradoId) return;
      e.preventDefault();
      const pedido = arrastrado;
      alTerminarArrastre();
      if (!pedido) return;
      const { accion, aviso } = accionPorArrastre(pedido, columnaId);
      if (accion) ejecutar(pedido, accion);
      else if (aviso) {
        toast(aviso, {
          id: 'tablero-arrastre',
          duration: 5000,
          icon: <Info className="h-4 w-4 shrink-0 text-oro-300" aria-hidden="true" />,
        });
      }
    },
  });

  // ---------- Avisos ----------
  const activarNotificaciones = async () => {
    const r = await pedirPermiso();
    if (r === 'granted') {
      toast.success('Notificaciones activadas');
      notificar('COFFE-SAAS', 'Te avisaremos de pedidos nuevos y de pedidos listos para entregar.', { forzar: true });
    } else if (r === 'denied') {
      toast.error('El navegador bloqueó las notificaciones. Puedes habilitarlas en la configuración del sitio.');
    }
  };

  const renderTarjeta = (p) => (
    <TarjetaPedido
      key={p.id}
      pedido={p}
      ahora={ahora}
      resaltado={resaltados.has(p.id)}
      ocupado={ocupados.has(p.id)}
      mostrarLocal={multiCafe}
      arrastrable={arrastreActivo}
      onAccion={ejecutar}
      onCancelar={alPedirCancelar}
      onArrastreInicio={alEmpezarArrastre}
      onArrastreFin={alTerminarArrastre}
    />
  );

  const cuerpoColumna = (columnaId) => {
    if (estado === 'cargando') return <EsqueletoColumna />;
    const lista = grupos[columnaId];
    if (columnaId === 'cocina') {
      return (
        <>
          {lista.length === 0 && <ColumnaVacia columnaId="cocina" />}
          {SUBESTADOS_COCINA.map((s) => {
            const sub = lista.filter((p) => p.status === s.status);
            return (
              <div key={s.status} className={sub.length ? 'mb-3 last:mb-0' : ''}>
                {sub.length > 0 && (
                  <p className="mb-1.5 flex items-center gap-2 px-1 text-[9px] font-medium uppercase tracking-[0.2em] text-verde-600">
                    <span className="h-1 w-1 rotate-45 bg-oro-400" aria-hidden="true" />
                    {s.titulo}
                    <span className="text-oro-600">{sub.length}</span>
                    <span className="h-px flex-1 bg-oro-200" aria-hidden="true" />
                  </p>
                )}
                <ul className="space-y-2.5" aria-label={`${s.titulo}: ${sub.length}`}>
                  <AnimatePresence initial={false}>{sub.map(renderTarjeta)}</AnimatePresence>
                </ul>
              </div>
            );
          })}
        </>
      );
    }
    return (
      <>
        {lista.length === 0 && <ColumnaVacia columnaId={columnaId} />}
        <ul className={columnaId === 'entregado' ? 'space-y-1.5' : 'space-y-2.5'}>
          <AnimatePresence initial={false}>{lista.map(renderTarjeta)}</AnimatePresence>
        </ul>
      </>
    );
  };

  // ---------- Estados especiales ----------
  if (estado === 'no_disponible' || estado === 'error') {
    const sinRuta = estado === 'no_disponible';
    return (
      <Card className="flex flex-col items-center py-12 text-center">
        <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pistacho-100 text-cobalto-500 ring-1 ring-oro-300">
          {sinRuta ? <KanbanSquare className="h-5 w-5" aria-hidden="true" /> : <WifiOff className="h-5 w-5" aria-hidden="true" />}
        </span>
        <p className="font-serif text-xl italic text-verde-700">
          {sinRuta ? 'El tablero aún no está disponible' : 'No pudimos cargar los pedidos'}
        </p>
        <p className="mt-1 max-w-md text-sm text-verde-600">
          {sinRuta
            ? 'El servidor todavía no ofrece el tablero de pedidos. Esta pantalla se activará sola; mientras tanto usa la lista.'
            : 'Revisa tu conexión. Seguimos intentándolo cada pocos segundos.'}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-2">
          {!sinRuta && (
            <Button size="sm" onClick={recargar} className={COMPACTO}>
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              Reintentar
            </Button>
          )}
          {onVerLista && (
            <Button size="sm" variant="secondary" onClick={onVerLista} className={COMPACTO}>
              <List className="h-3.5 w-3.5" aria-hidden="true" />
              Ver lista
            </Button>
          )}
        </div>
      </Card>
    );
  }

  return (
    <div>
      {/* Barra superior: estado de la conexión, sonido y notificaciones */}
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        {sinConexion ? (
          <p role="status" className="flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-[0.16em] text-terracotta-700">
            <WifiOff className="h-3.5 w-3.5" aria-hidden="true" />
            Sin conexión · reintentando
          </p>
        ) : (
          <p className="flex items-center gap-2 text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full rounded-full bg-verde-400 opacity-60 motion-safe:animate-ping" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-verde-500" />
            </span>
            En vivo
            {actualizadoEn && (
              <span className="normal-case tracking-normal text-verde-600/80">· actualizado {horaConSegundos(actualizadoEn)}</span>
            )}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1.5">
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setSonido(!sonido)}
            title={sonido ? 'Pulsa para silenciar los avisos' : 'Pulsa para activar los sonidos'}
            className={COMPACTO}
          >
            {sonido ? <Volume2 className="h-3.5 w-3.5" aria-hidden="true" /> : <VolumeX className="h-3.5 w-3.5" aria-hidden="true" />}
            <span className="sr-only sm:not-sr-only">{sonido ? 'Sonido activado' : 'Sonido desactivado'}</span>
          </Button>
          {permiso === 'default' && (
            <Button
              size="sm"
              variant="secondary"
              onClick={activarNotificaciones}
              title="Recibe un aviso del sistema aunque estés en otra pestaña"
              className={COMPACTO}
            >
              <Bell className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Activar notificaciones</span>
            </Button>
          )}
          {permiso === 'granted' && (
            <span className={`${CHIP} bg-pistacho-100 text-verde-700 ring-1 ring-pistacho-300`} title="Notificaciones activas">
              <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Notificaciones activas</span>
            </span>
          )}
          {permiso === 'denied' && (
            <span
              className={`${CHIP} bg-verde-50 text-verde-600 ring-1 ring-verde-100`}
              title="Habilítalas desde la configuración del sitio en tu navegador"
            >
              <BellOff className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="sr-only sm:not-sr-only">Notificaciones bloqueadas</span>
            </span>
          )}
        </div>
      </div>

      {/* Pestañas en móvil: una columna a la vez */}
      <div
        role="tablist"
        aria-label="Columnas del tablero"
        className="mb-3 grid grid-cols-3 gap-1 rounded-full border border-oro-300/70 bg-marfil p-1 lg:hidden"
      >
        {COLUMNAS.map((c) => {
          const activa = pestana === c.id;
          return (
            <button
              key={c.id}
              type="button"
              role="tab"
              id={`pestana-${c.id}`}
              aria-selected={activa}
              aria-controls={`columna-${c.id}`}
              onClick={() => setPestana(c.id)}
              className={`flex min-h-[34px] items-center justify-center gap-1.5 rounded-full px-2 text-[11px] font-medium uppercase tracking-[0.12em] transition-colors ${
                activa ? 'bg-verde-700 text-marfil' : 'text-verde-600 hover:text-cobalto-500'
              }`}
            >
              {c.titulo}
              <span
                className={`min-w-[1.25rem] rounded-full px-1.5 text-[10px] leading-[1.1rem] ${
                  activa ? 'bg-oro-300 text-verde-800' : 'bg-pistacho-100 text-verde-700'
                }`}
              >
                {estado === 'cargando' ? '·' : grupos[c.id].length}
              </span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        {COLUMNAS.map((c) => (
          <ColumnaTablero
            key={c.id}
            columna={c}
            total={grupos[c.id].length}
            visibleEnMovil={pestana === c.id}
            estadoDrop={arrastreActivo ? estadoDrop(c.id) : null}
            {...(arrastreActivo ? handlersDrop(c.id) : {})}
          >
            {cuerpoColumna(c.id)}
          </ColumnaTablero>
        ))}
      </div>

      {/* Confirmación para cancelar */}
      <Modal
        open={cancelarAbierto}
        onClose={cerrarCancelar}
        eyebrow="Confirmar"
        title="¿Cancelar el pedido?"
        subtitle={pedidoCancelar ? `${nombreCorto(pedidoCancelar)}${pedidoCancelar.order_number ? ` · ${pedidoCancelar.order_number}` : ''}` : ''}
        footer={
          <>
            <Button size="sm" variant="secondary" onClick={cerrarCancelar}>
              Volver
            </Button>
            <Button size="sm" variant="danger" onClick={confirmarCancelar}>
              Sí, cancelar pedido
            </Button>
          </>
        }
      >
        {pedidoCancelar && (
          <div className="space-y-3 text-sm text-verde-700">
            <p>
              {cantidadProductos(pedidoCancelar)} {cantidadProductos(pedidoCancelar) === 1 ? 'producto' : 'productos'} por{' '}
              <span className="font-serif italic font-medium">{money(pedidoCancelar.total)}</span>. El pedido saldrá del tablero y
              no se cobrará.
            </p>
            {esQR(pedidoCancelar) && (
              <p className="rounded-xl bg-oro-50 px-3 py-2 text-[13px] text-oro-700 ring-1 ring-oro-200">
                Se pidió por QR: {pedidoCancelar.comensal_alias || 'el cliente'} verá el pedido como cancelado en su celular.
              </p>
            )}
          </div>
        )}
      </Modal>
    </div>
  );
};
