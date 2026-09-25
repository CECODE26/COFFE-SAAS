import React, { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { notificar, sonar, vibrar } from '../../lib/avisos';
import {
  cliente,
  escribirLocal,
  guardarMesa,
  leerLocal,
  mensajeError,
  mesaGuardada,
  setManejadorSinSesion,
  urlBienvenida,
  vaciarCarritos,
} from '../../services/clienteApi';
import { useCarrito } from './carrito';
import { estadoCliente, etiquetaMesa, pedidoActivo, unirNombres, usePolling } from './utils';

// Contexto del comensal: sesión (polling cada 5 s), sus pedidos (polling adaptable),
// carrito y avisos (solicitudes de unión, cambios de estado, cuenta pagada).

const ComensalContext = createContext(null);
export const useComensal = () => useContext(ComensalContext);

export const CLAVE_SESION = 'coffe_sesion';
const claveTicketVisto = (id) => `coffe_ticket_visto_${id}`;
const aviso = { position: 'top-center' };

// Qué decir cuando cambia el estado de uno de MIS pedidos
const CAMBIOS = {
  en_cocina: { texto: 'Tu pedido llegó a cocina', sonido: 'ok', icono: '👩‍🍳' },
  preparando: { texto: 'Tu pedido está en preparación', sonido: 'ok', icono: '🔥' },
  listo: { texto: '¡Pronto llegará tu pedido!', sonido: 'listo', icono: '🔔' },
  entregado: { texto: '¡Buen provecho! Tu pedido fue entregado', sonido: 'ok', icono: '☕' },
  cancelado: { texto: 'Tu pedido fue cancelado. Si tienes dudas, llama al mesero.', sonido: 'ok', icono: '⚠️' },
};

export const ComensalProvider = ({ children }) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const rutaRef = useRef(pathname);
  rutaRef.current = pathname;
  const [sesion, setSesion] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [errorCarga, setErrorCarga] = useState(null);
  const [pedidos, setPedidos] = useState(null);
  const [ticketAbierto, setTicketAbierto] = useState(false);
  const [pollingRapido, setPollingRapido] = useState(false);

  const sesionRef = useRef(null);
  const estadosPedidosRef = useRef(null);
  const avisadosRef = useRef(new Map());

  const carrito = useCarrito(sesion?.id);

  // Si la sesión se pierde, el cliente HTTP navega con el router (sin recargar la página)
  useEffect(() => {
    setManejadorSinSesion((url) => navigate(url, { replace: true }));
    return () => setManejadorSinSesion(null);
  }, [navigate]);

  // ---------- Sesión ----------
  const procesarSesion = useCallback((data) => {
    const prev = sesionRef.current;
    sesionRef.current = data;

    if (data?.mesa?.qr) guardarMesa(data.mesa.qr);
    if (data?.id) escribirLocal(CLAVE_SESION, data.id);

    if (prev) {
      // Alguien pide unirse a mi grupo
      const antes = new Set((prev.solicitudes_union || []).map((s) => s.id));
      const nuevas = (data.solicitudes_union || []).filter((s) => !antes.has(s.id));
      if (nuevas.length) {
        sonar('alerta');
        vibrar([90, 60, 90]);
        notificar(`${nuevas[0].alias} quiere unirse a tu grupo`, 'Abre la mesa para aceptar o rechazar.', { tag: 'union' });
      }

      // Se resolvió MI solicitud de unión
      if (prev.union_pendiente && !data.union_pendiente) {
        const integrantes = data.grupo?.integrantes || [];
        const aceptado = (prev.union_pendiente.nombres || []).some((n) => integrantes.includes(n));
        if (aceptado) {
          sonar('ok');
          toast.success(`¡Ya estás en el grupo de ${unirNombres(prev.union_pendiente.nombres)}!`, aviso);
        } else {
          toast('Seguirás con tu cuenta aparte.', { ...aviso, icon: 'ℹ️' });
        }
      }

      // Me cobraron: modal con el ticket
      if (prev.estado === 'activa' && data.estado === 'pagada') {
        sonar('ok');
        vibrar([120, 60, 120]);
        notificar('Tu cuenta fue pagada', 'Gracias por tu visita.', { tag: 'pagada' });
        setTicketAbierto(true);
      }
    } else if (data?.estado === 'pagada' && data?.id && !leerLocal(claveTicketVisto(data.id))) {
      // Primera vez que se ve la sesión pagada; si ya está en el comprobante, no hace falta el modal
      if (rutaRef.current.startsWith('/mesa/ticket')) escribirLocal(claveTicketVisto(data.id), '1');
      else setTicketAbierto(true);
    }

    setSesion(data);
  }, []);

  const recargar = useCallback(async () => {
    try {
      const { data } = await cliente.sesion();
      procesarSesion(data);
      setErrorCarga(null);
    } catch (e) {
      if (!sesionRef.current) setErrorCarga(mensajeError(e, 'No pudimos cargar tu mesa.'));
    } finally {
      setCargando(false);
    }
  }, [procesarSesion]);

  useEffect(() => {
    recargar();
  }, [recargar]);

  usePolling(recargar, 5000, !!sesion);

  // Un 409 "sesion_pagada" en cualquier acción: refrescar sin esperar al polling
  useEffect(() => {
    const alPagar = () => recargar();
    window.addEventListener('coffe:sesion-pagada', alPagar);
    return () => window.removeEventListener('coffe:sesion-pagada', alPagar);
  }, [recargar]);

  // ---------- Mis pedidos (para el seguimiento y los avisos de cambio) ----------
  const recargarPedidos = useCallback(async () => {
    const { data } = await cliente.pedidos('mio');
    const lista = Array.isArray(data) ? data : data?.results || [];
    const previos = estadosPedidosRef.current;
    if (previos) {
      lista.forEach((p) => {
        const antes = previos.get(p.id);
        const ahora = estadoCliente(p);
        // Dos consultas simultáneas no deben avisar dos veces el mismo cambio
        if (antes && antes !== ahora && CAMBIOS[ahora] && avisadosRef.current.get(p.id) !== ahora) {
          avisadosRef.current.set(p.id, ahora);
          const c = CAMBIOS[ahora];
          sonar(c.sonido);
          vibrar(ahora === 'listo' ? [200, 90, 200, 90, 260] : [110]);
          toast(c.texto, { ...aviso, icon: c.icono, id: `pedido-${p.id}` });
          notificar(c.texto, etiquetaMesa(sesionRef.current?.mesa), { tag: `pedido-${p.id}` });
        }
      });
    }
    estadosPedidosRef.current = new Map(lista.map((p) => [p.id, estadoCliente(p)]));
    setPedidos(lista);
    return lista;
  }, []);

  useEffect(() => {
    if (sesion?.id) recargarPedidos().catch(() => {});
  }, [sesion?.id, recargarPedidos]);

  const hayActivos = (pedidos || []).some(pedidoActivo);
  usePolling(recargarPedidos, pollingRapido || hayActivos ? 4000 : 12000, !!sesion);

  // ---------- Acciones ----------
  const cerrarTicket = useCallback(() => {
    setTicketAbierto(false);
    if (sesionRef.current?.id) escribirLocal(claveTicketVisto(sesionRef.current.id), '1');
  }, []);

  // Lanza el error para que la pantalla muestre el motivo (409 cuenta_abierta)
  const salir = useCallback(async () => {
    const qr = sesionRef.current?.mesa?.qr || mesaGuardada();
    await cliente.salir();
    vaciarCarritos();
    escribirLocal(CLAVE_SESION, null);
    if (sesionRef.current?.id) escribirLocal(claveTicketVisto(sesionRef.current.id), null);
    toast('¡Gracias por tu visita!', { ...aviso, icon: '☕' });
    navigate(urlBienvenida(qr), { replace: true });
  }, [navigate]);

  const value = useMemo(() => {
    const integrantes = sesion?.grupo?.integrantes || [];
    return {
      sesion,
      cargando,
      errorCarga,
      recargar,
      pedidos,
      recargarPedidos,
      setPollingRapido,
      carrito,
      mesa: sesion?.mesa || null,
      local: sesion?.mesa?.local || null,
      grupo: sesion?.grupo || null,
      integrantes,
      hayGrupo: integrantes.length > 1,
      pagada: sesion?.estado === 'pagada',
      ticketAbierto,
      abrirTicket: () => setTicketAbierto(true),
      cerrarTicket,
      salir,
    };
  }, [sesion, cargando, errorCarga, recargar, pedidos, recargarPedidos, carrito, ticketAbierto, cerrarTicket, salir]);

  return <ComensalContext.Provider value={value}>{children}</ComensalContext.Provider>;
};
