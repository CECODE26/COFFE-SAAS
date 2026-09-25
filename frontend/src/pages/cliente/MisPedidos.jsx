import React, { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, useReducedMotion } from 'framer-motion';
import { Bell, ClipboardList, WifiOff } from 'lucide-react';
import { useAvisos } from '../../lib/avisos';
import { cliente, mensajeError } from '../../services/clienteApi';
import { Segmented } from '../../components/Layout';
import { money } from '../../components/Stats';
import { useComensal } from '../../components/cliente/ComensalContext';
import { Seguimiento } from '../../components/cliente/Seguimiento';
import { Aviso, Cargando } from '../../components/cliente/ui';
import { estadoCliente, hora, numeroCorto, pedidoActivo, usePolling } from '../../components/cliente/utils';

const recientesPrimero = (a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0);

const TarjetaPedido = ({ pedido, mostrarAlias, esMio }) => {
  const estado = estadoCliente(pedido);
  const activo = pedidoActivo(pedido);
  const reduce = useReducedMotion();
  const items = Array.isArray(pedido.items) ? pedido.items : [];

  return (
    <motion.article
      layout={!reduce}
      initial={reduce ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl border bg-marfil px-3.5 py-3 shadow-soft ${
        estado === 'listo' ? 'border-oro-400 ring-2 ring-oro-200' : 'border-oro-200/80'
      }`}
      aria-label={`Pedido ${numeroCorto(pedido.numero)}`}
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10.5px] font-medium uppercase tracking-[0.18em] text-oro-600">
            Pedido N.º {numeroCorto(pedido.numero)}
            {pedido.created_at && <span className="text-verde-600/80"> · {hora(pedido.created_at)}</span>}
          </p>
          {mostrarAlias && pedido.alias && (
            <p className="mt-0.5 text-[12px] text-verde-700">
              de <span className="font-semibold">{pedido.alias}</span>
              {esMio && <span className="text-verde-600"> (tú)</span>}
            </p>
          )}
        </div>
        <div className="text-right">
          <p className="font-serif text-[17px] italic font-medium leading-none text-verde-800">{money(pedido.total)}</p>
          {pedido.is_paid && <p className="mt-1 text-[10px] font-medium uppercase tracking-[0.14em] text-verde-500">Pagado</p>}
        </div>
      </header>

      {activo || estado === 'cancelado' ? (
        <Seguimiento estado={estado} />
      ) : (
        <p className="mt-2 inline-flex items-center gap-1.5 rounded-full bg-pistacho-100 px-2.5 py-0.5 text-[11px] font-medium uppercase tracking-[0.12em] text-verde-700">
          <span className="h-1.5 w-1.5 rotate-45 bg-verde-500" aria-hidden="true" />
          Entregado
        </p>
      )}

      {items.length > 0 && (
        <ul className={`mt-3 space-y-0.5 border-t border-dashed border-oro-200 pt-2 text-[12.5px] ${activo ? '' : 'text-verde-600'}`}>
          {items.map((it, i) => (
            <li key={`${it.nombre}-${i}`} className="flex justify-between gap-3">
              <span className="min-w-0">
                <span className="text-verde-600">{it.cantidad} ×</span> {it.nombre}
                {it.nota && <span className="block text-[11.5px] italic text-verde-600/90">“{it.nota}”</span>}
              </span>
              {it.precio !== undefined && (
                <span className="shrink-0 text-verde-600">{money(Number(it.precio) * Number(it.cantidad || 1))}</span>
              )}
            </li>
          ))}
        </ul>
      )}
    </motion.article>
  );
};

export const MisPedidos = () => {
  const { sesion, pedidos: mios, recargarPedidos, setPollingRapido, hayGrupo } = useComensal();
  const { permiso, pedirPermiso } = useAvisos();
  const [alcance, setAlcance] = useState('mio');
  const [grupales, setGrupales] = useState(null);
  const [errorGrupo, setErrorGrupo] = useState(null);

  // Mientras esta pantalla esté abierta, el seguimiento se consulta cada 4 s
  useEffect(() => {
    setPollingRapido(true);
    recargarPedidos().catch(() => {});
    return () => setPollingRapido(false);
  }, [setPollingRapido, recargarPedidos]);

  useEffect(() => {
    if (!hayGrupo && alcance === 'grupo') setAlcance('mio');
  }, [hayGrupo, alcance]);

  const cargarGrupo = useCallback(async () => {
    try {
      const { data } = await cliente.pedidos('grupo');
      setGrupales(Array.isArray(data) ? data : data?.results || []);
      setErrorGrupo(null);
    } catch (e) {
      setErrorGrupo(mensajeError(e, 'No pudimos cargar los pedidos del grupo.'));
    }
  }, []);

  useEffect(() => {
    if (alcance === 'grupo') cargarGrupo();
  }, [alcance, cargarGrupo]);

  usePolling(cargarGrupo, 4000, alcance === 'grupo');

  const lista = alcance === 'grupo' ? grupales : mios;
  const cargando = lista === null || lista === undefined;
  const ordenados = (lista || []).slice().sort(recientesPrimero);
  const activos = ordenados.filter((p) => pedidoActivo(p) || estadoCliente(p) === 'cancelado');
  const entregados = ordenados.filter((p) => estadoCliente(p) === 'entregado');
  const misIds = new Set((mios || []).map((p) => p.id));

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="font-script text-[19px] leading-none text-oro-600">En vivo</p>
          <h1 className="font-serif text-[1.5rem] italic font-medium leading-tight text-verde-700">Mis pedidos</h1>
        </div>
        {hayGrupo && (
          <Segmented
            value={alcance}
            onChange={setAlcance}
            options={[
              { value: 'mio', label: 'Míos' },
              { value: 'grupo', label: 'Mi grupo' },
            ]}
          />
        )}
      </div>

      {permiso === 'default' && activos.length > 0 && (
        <button
          type="button"
          onClick={pedirPermiso}
          className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-oro-300/80 bg-marfil px-3 py-1.5 text-[11.5px] text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
        >
          <Bell className="h-3.5 w-3.5" aria-hidden="true" />
          Avísame aunque cambie de pestaña
        </button>
      )}

      {alcance === 'grupo' && errorGrupo && !grupales ? (
        <Aviso icon={WifiOff} titulo="Sin conexión" className="mt-2">
          {errorGrupo}
        </Aviso>
      ) : cargando ? (
        <Cargando texto="Buscando tus pedidos…" />
      ) : ordenados.length === 0 ? (
        <Aviso
          icon={ClipboardList}
          titulo={alcance === 'grupo' ? 'Tu grupo aún no pide' : 'Aún no has pedido'}
          className="mt-2"
          accion={
            !sesion || sesion.estado !== 'pagada' ? (
              <Link to="/mesa" className="btn-primary min-h-[44px] px-6 text-[12px]">
                Ver el menú
              </Link>
            ) : null
          }
        >
          Elige algo del menú y aquí verás cómo avanza, paso a paso.
        </Aviso>
      ) : (
        <div className="space-y-3">
          {activos.map((p) => (
            <TarjetaPedido key={p.id} pedido={p} mostrarAlias={alcance === 'grupo'} esMio={misIds.has(p.id)} />
          ))}

          {entregados.length > 0 && (
            <>
              <div className="flex items-center gap-2.5 pt-2" aria-hidden="true">
                <span className="h-px flex-1 bg-oro-300/70" />
                <span className="text-[10.5px] font-medium uppercase tracking-[0.2em] text-verde-600">Entregados</span>
                <span className="h-px flex-1 bg-oro-300/70" />
              </div>
              <h2 className="sr-only">Pedidos entregados</h2>
              {entregados.map((p) => (
                <TarjetaPedido key={p.id} pedido={p} mostrarAlias={alcance === 'grupo'} esMio={misIds.has(p.id)} />
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
};
