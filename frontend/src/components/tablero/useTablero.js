import React, { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { BellRing, CheckCheck } from 'lucide-react';
import api from '../../services/api';
import { money } from '../Stats';
import { sonar, notificar, vibrar } from '../../lib/avisos';
import { usePolling } from './hooks';
import { ACCIONES, cantidadProductos, descripcionAviso, mensajeError, nombreCorto } from './utils';

const RUTA = '/pedidos/orders/tablero/';
// Cada 4 s con la pestaña a la vista. Oculta, el ritmo baja a 20 s en vez de detenerse del todo:
// así siguen llegando el sonido y la notificación del sistema de un pedido nuevo.
const ESPERA_VISIBLE = 4000;
const ESPERA_OCULTA = 20000;
// Mientras el backend aún no ofrece el tablero (404), se reintenta con calma y sin errores
const ESPERA_SIN_RUTA = 15000;
// Tiempo que una tarjeta nueva o recién cambiada queda resaltada
const RESALTE_MS = 8000;

const iconoAviso = (Icono) =>
  React.createElement(Icono, { className: 'h-4 w-4 shrink-0 text-oro-300', 'aria-hidden': true });

const textoExito = (accion, p) => {
  const lugar = nombreCorto(p);
  switch (accion) {
    case 'confirm':
      return `Enviado a cocina · ${lugar}`;
    case 'send_to_kitchen':
      return `En preparación · ${lugar}`;
    case 'mark_ready':
      return `Listo para entregar · ${lugar}`;
    case 'complete':
      return lugar.startsWith('Mesa') ? `Pedido entregado a la ${lugar.toLowerCase()}` : `Pedido entregado · ${lugar}`;
    case 'cancel':
      return `Pedido cancelado · ${lugar}`;
    default:
      return 'Pedido actualizado';
  }
};

const productos = (n) => `${n} ${n === 1 ? 'producto' : 'productos'}`;

export const useTablero = () => {
  const [pedidos, setPedidos] = useState([]);
  // cargando | listo | no_disponible (la ruta aún no existe) | error (falló la primera carga)
  const [estado, setEstado] = useState('cargando');
  const [sinConexion, setSinConexion] = useState(false);
  const [actualizadoEn, setActualizadoEn] = useState(null);
  const [resaltados, setResaltados] = useState(() => new Set());
  const [ocupados, setOcupados] = useState(() => new Set());

  // Último estado conocido de cada pedido (null hasta la primera carga: esa no suena)
  const conocidos = useRef(null);
  // Estados optimistas de las acciones en curso: el polling no los pisa
  const optimistas = useRef(new Map());
  // Cambia al empezar y al terminar cada acción: descarta respuestas de polling ya viejas
  const mutacion = useRef(0);
  const ocupadosRef = useRef(new Set());
  const estadoRef = useRef('cargando');
  const montado = useRef(false);
  const temporizadores = useRef(new Set());
  // Última respuesta tal cual: si no cambió, no se vuelve a pintar el tablero
  const ultimoJson = useRef('');

  useEffect(() => {
    montado.current = true;
    const lista = temporizadores.current;
    return () => {
      montado.current = false;
      lista.forEach(clearTimeout);
      lista.clear();
    };
  }, []);

  const fijarEstado = useCallback((valor) => {
    estadoRef.current = valor;
    setEstado(valor);
  }, []);

  const resaltar = useCallback((ids) => {
    if (!ids.length) return;
    setResaltados((prev) => {
      const s = new Set(prev);
      ids.forEach((id) => s.add(id));
      return s;
    });
    const t = setTimeout(() => {
      temporizadores.current.delete(t);
      if (!montado.current) return;
      setResaltados((prev) => {
        const s = new Set(prev);
        ids.forEach((id) => s.delete(id));
        return s;
      });
    }, RESALTE_MS);
    temporizadores.current.add(t);
  }, []);

  // Compara con lo último conocido y dispara sonidos, avisos y notificaciones
  const avisar = useCallback(
    (lista) => {
      const previos = conocidos.current;
      conocidos.current = new Map(lista.map((p) => [p.id, p.status]));
      if (!previos) return;

      const nuevos = [];
      const listos = [];
      const cambiados = [];
      let aCocina = false;

      lista.forEach((p) => {
        if (optimistas.current.has(p.id)) return; // lo está moviendo este equipo
        const antes = previos.get(p.id);
        if (antes === p.status) return;
        cambiados.push(p.id);
        if (!antes && p.status === 'pendiente') nuevos.push(p);
        else if (p.status === 'lista') listos.push(p);
        else if (p.status === 'confirmada') aCocina = true;
      });

      if (nuevos.length) {
        sonar('nuevo');
        vibrar();
        if (nuevos.length > 3) {
          toast(`${nuevos.length} pedidos nuevos en caja`, { id: 'tablero-nuevos', icon: iconoAviso(BellRing), duration: 6000 });
        } else {
          nuevos.forEach((p) =>
            toast(`Nuevo pedido · ${descripcionAviso(p)}`, { id: `nuevo-${p.id}`, icon: iconoAviso(BellRing), duration: 6000 })
          );
        }
        if (nuevos.length === 1) {
          const p = nuevos[0];
          notificar('Nuevo pedido', `${descripcionAviso(p)} · ${productos(cantidadProductos(p))} · ${money(p.total)}`, {
            tag: `pedido-${p.id}`,
          });
        } else {
          notificar('Pedidos nuevos', `${nuevos.length} pedidos esperan en caja`, { tag: 'pedidos-nuevos' });
        }
      }

      if (listos.length) {
        if (!nuevos.length) sonar('listo');
        listos.slice(0, 3).forEach((p) =>
          toast(`Listo para entregar · ${nombreCorto(p)}`, { id: `listo-${p.id}`, icon: iconoAviso(CheckCheck), duration: 6000 })
        );
        notificar('Listo para entregar', listos.map(nombreCorto).join(', '), { tag: 'pedidos-listos' });
      }

      // Llegó a cocina (lo envió otra persona): un toque suave, si no sonó ya otra cosa
      if (aCocina && !nuevos.length && !listos.length) sonar('ok');

      resaltar(cambiados);
    },
    [resaltar]
  );

  const cargar = useCallback(async () => {
    const version = mutacion.current;
    try {
      const { data } = await api.get(RUTA);
      // Si hubo una acción mientras viajaba la respuesta, esta ya es vieja: la próxima trae lo nuevo
      if (!montado.current || version !== mutacion.current) return;
      const lista = Array.isArray(data) ? data : Array.isArray(data?.results) ? data.results : [];
      avisar(lista);
      const json = JSON.stringify(lista);
      if (json !== ultimoJson.current || optimistas.current.size) {
        ultimoJson.current = json;
        setPedidos(
          lista.map((p) => (optimistas.current.has(p.id) ? { ...p, status: optimistas.current.get(p.id) } : p))
        );
      }
      fijarEstado('listo');
      setSinConexion(false);
      setActualizadoEn(Date.now());
    } catch (err) {
      if (!montado.current) return;
      if (err?.response?.status === 404 && estadoRef.current !== 'listo') {
        fijarEstado('no_disponible');
        return;
      }
      setSinConexion(true);
      if (estadoRef.current === 'cargando') fijarEstado('error');
    }
  }, [avisar, fijarEstado]);

  usePolling(cargar, (visible) => {
    if (estadoRef.current === 'no_disponible') return ESPERA_SIN_RUTA;
    return visible ? ESPERA_VISIBLE : ESPERA_OCULTA;
  });

  const recargar = useCallback(() => {
    if (estadoRef.current !== 'listo') fijarEstado('cargando');
    return cargar();
  }, [cargar, fijarEstado]);

  const marcarOcupado = useCallback((id, ocupado) => {
    if (ocupado) ocupadosRef.current.add(id);
    else ocupadosRef.current.delete(id);
    setOcupados(new Set(ocupadosRef.current));
  }, []);

  // Mueve el pedido con actualización optimista; si el backend responde error, vuelve atrás
  const ejecutar = useCallback(
    async (pedido, accion) => {
      const def = ACCIONES[accion];
      if (!def || ocupadosRef.current.has(pedido.id)) return false;
      if (!def.desde.includes(pedido.status)) {
        toast.error('Este pedido ya cambió de estado. Actualizando el tablero…', { id: `accion-${pedido.id}` });
        cargar();
        return false;
      }

      const anterior = { status: pedido.status, updated_at: pedido.updated_at };
      mutacion.current += 1;
      ultimoJson.current = '';
      optimistas.current.set(pedido.id, def.hacia);
      marcarOcupado(pedido.id, true);
      setPedidos((prev) =>
        prev.map((p) => (p.id === pedido.id ? { ...p, status: def.hacia, updated_at: new Date().toISOString() } : p))
      );

      let ok = false;
      try {
        await api.post(`/pedidos/orders/${pedido.id}/${accion}/`);
        ok = true;
        // Ya lo sabemos: que el próximo polling no lo anuncie otra vez
        if (conocidos.current) conocidos.current.set(pedido.id, def.hacia);
        toast.success(textoExito(accion, pedido), { id: `accion-${pedido.id}` });
        if (accion === 'confirm') sonar('ok');
        else if (accion === 'mark_ready') sonar('listo');
      } catch (err) {
        if (montado.current) {
          setPedidos((prev) => prev.map((p) => (p.id === pedido.id ? { ...p, ...anterior } : p)));
        }
        toast.error(mensajeError(err, 'No se pudo actualizar el pedido.'), { id: `accion-${pedido.id}` });
      } finally {
        optimistas.current.delete(pedido.id);
        mutacion.current += 1;
        if (montado.current) {
          marcarOcupado(pedido.id, false);
          cargar();
        }
      }
      return ok;
    },
    [cargar, marcarOcupado]
  );

  return { pedidos, estado, sinConexion, actualizadoEn, resaltados, ocupados, ejecutar, recargar };
};
