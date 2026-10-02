import { useCallback, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../../services/api';
import { mensajeError, ordenarCategorias } from './utils';

const avisoDisponible = (data) =>
  toast.success(data.is_available ? `«${data.name}» vuelve a estar disponible` : `«${data.name}» marcado como agotado`);

// Datos de la carta del panel: productos y categorías, con cambios locales después de cada acción.
// `tenant` solo lo usa el super_admin (?tenant=); con `listo` en false todavía no se carga nada.
export const useCarta = ({ tenant = null, listo = true }) => {
  const [items, setItems] = useState([]);
  const [categorias, setCategorias] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  // ids de productos con una petición en curso
  const [ocupados, setOcupados] = useState(() => new Set());
  // Descarta respuestas viejas si se recarga (o se cambia de distribuidor) antes de que lleguen
  const peticion = useRef(0);

  const qs = tenant ? `?tenant=${tenant}` : '';

  const cargar = useCallback(async () => {
    const id = ++peticion.current;
    setLoading(true);
    setError(null);
    try {
      const [its, cats] = await Promise.all([fetchAll(`/menu/items/${qs}`), fetchAll(`/menu/categories/${qs}`)]);
      if (id !== peticion.current) return;
      setItems(its);
      setCategorias(ordenarCategorias(cats));
    } catch (err) {
      if (id !== peticion.current) return;
      setError(mensajeError(err, 'No se pudo cargar la carta. Revisa tu conexión e inténtalo de nuevo.'));
    } finally {
      if (id === peticion.current) setLoading(false);
    }
  }, [qs]);

  useEffect(() => {
    if (listo) cargar();
  }, [cargar, listo]);

  const marcarOcupado = useCallback(
    (id, si) =>
      setOcupados((prev) => {
        const s = new Set(prev);
        if (si) s.add(id);
        else s.delete(id);
        return s;
      }),
    []
  );

  const cambiarCampo = useCallback(
    (id, campos) => setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...campos } : i))),
    []
  );

  // Agrega o reemplaza un producto
  const ponerItem = useCallback(
    (item) =>
      setItems((prev) => (prev.some((i) => i.id === item.id) ? prev.map((i) => (i.id === item.id ? item : i)) : [...prev, item])),
    []
  );

  // Disponible/Agotado al instante; si el backend falla, vuelve como estaba y lanza el error
  const enviarDisponible = useCallback(
    async (item, valor) => {
      marcarOcupado(item.id, true);
      cambiarCampo(item.id, { is_available: valor });
      try {
        const { data } = await api.post(`/menu/items/${item.id}/disponibilidad/`, { is_available: valor });
        ponerItem(data);
        return data;
      } catch (err) {
        cambiarCampo(item.id, { is_available: item.is_available });
        throw err;
      } finally {
        marcarOcupado(item.id, false);
      }
    },
    [ponerItem, marcarOcupado, cambiarCampo]
  );

  // Para el interruptor de la tarjeta: avisa con toasts y no lanza
  const cambiarDisponible = useCallback(
    async (item, valor) => {
      try {
        avisoDisponible(await enviarDisponible(item, valor));
      } catch (err) {
        toast.error(mensajeError(err, 'No se pudo cambiar la disponibilidad.'));
      }
    },
    [enviarDisponible]
  );

  // Para el diálogo de quitar («Solo marcar agotado»): el error lo muestra el diálogo
  const agotar = useCallback(async (item) => avisoDisponible(await enviarDisponible(item, false)), [enviarDisponible]);

  // Sin pedidos se borra; con pedidos el backend lo desactiva y explica por qué
  const quitar = useCallback(
    async (item) => {
      const { data } = await api.delete(`/menu/items/${item.id}/`);
      if (data?.desactivado) {
        if (data.item) ponerItem(data.item);
        else cambiarCampo(item.id, { is_active: false });
        toast.success(data.detail, { duration: 7000 });
      } else {
        setItems((prev) => prev.filter((i) => i.id !== item.id));
        toast.success(`«${item.name}» se quitó de la carta`);
      }
    },
    [ponerItem, cambiarCampo]
  );

  const reactivar = useCallback(
    async (item) => {
      marcarOcupado(item.id, true);
      try {
        const { data } = await api.patch(`/menu/items/${item.id}/`, { is_active: true });
        ponerItem(data);
        toast.success(`«${data.name}» vuelve a la carta`);
      } catch (err) {
        toast.error(mensajeError(err, 'No se pudo reactivar el producto.'));
      } finally {
        marcarOcupado(item.id, false);
      }
    },
    [ponerItem, marcarOcupado]
  );

  // ---------- Categorías ----------
  const ponerCategoria = useCallback((cat) => {
    setCategorias((prev) =>
      ordenarCategorias(prev.some((c) => c.id === cat.id) ? prev.map((c) => (c.id === cat.id ? { ...c, ...cat } : c)) : [...prev, cat])
    );
    // Cada producto trae el nombre de su categoría
    setItems((prev) =>
      prev.map((i) => (i.category === cat.id && i.category_name !== cat.name ? { ...i, category_name: cat.name } : i))
    );
  }, []);

  // La lista ya viene en el orden nuevo
  const ordenarLista = useCallback((lista) => setCategorias(lista), []);

  // Sus productos no se borran: quedan sin categoría. Si estaba oculta, el backend además los desactiva
  // (no aparecen de golpe en la carta)
  const quitarCategoria = useCallback((cat) => {
    setCategorias((prev) => prev.filter((c) => c.id !== cat.id));
    const oculta = cat.is_active === false;
    setItems((prev) =>
      prev.map((i) =>
        i.category === cat.id ? { ...i, category: null, category_name: null, ...(oculta ? { is_active: false } : {}) } : i
      )
    );
  }, []);

  return {
    items,
    categorias,
    loading,
    error,
    ocupados,
    cargar,
    ponerItem,
    cambiarDisponible,
    agotar,
    quitar,
    reactivar,
    ponerCategoria,
    ordenarLista,
    quitarCategoria,
  };
};
