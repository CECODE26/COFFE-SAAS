import React, { createContext, useState, useCallback } from 'react';
import api, { fetchAll } from '../services/api';

export const DataContext = createContext();

export const DataProvider = ({ children }) => {
  const [mesas, setMesas] = useState([]);
  const [pedidos, setPedidos] = useState([]);
  const [menuItems, setMenuItems] = useState([]);
  const [reservas, setReservas] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Mesas
  const fetchMesas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll('/mesas/mesas/');
      setMesas(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const occupyMesa = useCallback(async (mesaId, guestCount) => {
    try {
      await api.post(`/mesas/mesas/${mesaId}/occupy/`, { guest_count: guestCount });
      await fetchMesas();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchMesas]);

  const freeMesa = useCallback(async (mesaId) => {
    try {
      await api.post(`/mesas/mesas/${mesaId}/free/`);
      await fetchMesas();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchMesas]);

  // Pedidos
  const fetchPedidos = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll('/pedidos/orders/');
      setPedidos(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const createPedido = useCallback(async (data) => {
    try {
      const response = await api.post('/pedidos/orders/', data);
      await fetchPedidos();
      return response.data;
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchPedidos]);

  // `body` es opcional: mark_paid necesita { payment_method }
  const updatePedidoStatus = useCallback(async (pedidoId, action, body) => {
    try {
      await api.post(`/pedidos/orders/${pedidoId}/${action}/`, body);
      await fetchPedidos();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchPedidos]);

  // Menu Items
  const fetchMenuItems = useCallback(async () => {
    setLoading(true);
    try {
      // El endpoint pagina: se recorren todas las páginas
      const data = await fetchAll('/menu/items/available/');
      setMenuItems(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  // Reservas
  const fetchReservas = useCallback(async () => {
    setLoading(true);
    try {
      const data = await fetchAll('/mesas/reservas/');
      setReservas(data);
      setError(null);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  const confirmReserva = useCallback(async (reservaId) => {
    try {
      await api.post(`/mesas/reservas/${reservaId}/confirm/`);
      await fetchReservas();
    } catch (err) {
      setError(err.message);
      throw err;
    }
  }, [fetchReservas]);

  const value = {
    mesas,
    pedidos,
    menuItems,
    reservas,
    loading,
    error,
    fetchMesas,
    occupyMesa,
    freeMesa,
    fetchPedidos,
    createPedido,
    updatePedidoStatus,
    fetchMenuItems,
    fetchReservas,
    confirmReserva,
  };

  return (
    <DataContext.Provider value={value}>
      {children}
    </DataContext.Provider>
  );
};
