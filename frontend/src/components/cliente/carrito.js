import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { claveCarrito, escribirLocal, leerLocal } from '../../services/clienteApi';
import { aCentavos, ivaDe } from './utils';

// Carrito del comensal: vive en el navegador (localStorage, una clave por id de sesión).
// El servidor valida precios y disponibilidad al crear el pedido.

export const MAX_LINEAS = 30;
export const MAX_CANTIDAD = 20;
export const MAX_NOTA_ITEM = 140;
export const MAX_NOTA_GENERAL = 200;

const VACIO = { lineas: [], nota: '' };

const leerCarrito = (sesionId) => {
  if (!sesionId) return VACIO;
  try {
    const raw = leerLocal(claveCarrito(sesionId));
    const c = raw ? JSON.parse(raw) : null;
    if (c && Array.isArray(c.lineas)) {
      return {
        lineas: c.lineas.filter((l) => l && l.id && l.uid),
        nota: typeof c.nota === 'string' ? c.nota : '',
      };
    }
  } catch (e) {
    /* carrito corrupto: se empieza de cero */
  }
  return VACIO;
};

const nuevoUid = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
const limpiarNota = (nota, max = MAX_NOTA_ITEM) => String(nota || '').replace(/\s+/g, ' ').trim().slice(0, max);

export const useCarrito = (sesionId) => {
  const [carrito, setCarrito] = useState(() => leerCarrito(sesionId));
  // Copia del estado vigente para decidir fuera de los "updaters" (que React puede repetir)
  const actualRef = useRef(carrito);
  actualRef.current = carrito;

  // Cambió la sesión (otra persona en este celular): se carga su propio carrito
  useEffect(() => {
    setCarrito(leerCarrito(sesionId));
  }, [sesionId]);

  const guardar = useCallback(
    (cambio) => {
      setCarrito((prev) => {
        const next = typeof cambio === 'function' ? cambio(prev) : cambio;
        if (sesionId) {
          const vacio = !next.lineas.length && !next.nota;
          escribirLocal(claveCarrito(sesionId), vacio ? null : JSON.stringify(next));
        }
        return next;
      });
    },
    [sesionId]
  );

  // Devuelve false si el carrito ya tiene el máximo de líneas
  const agregar = useCallback(
    (item, cantidad = 1, nota = '') => {
      const notaLimpia = limpiarNota(nota);
      const mismaLinea = (l) => l.id === item.id && (l.nota || '').toLowerCase() === notaLimpia.toLowerCase();
      const existe = actualRef.current.lineas.some(mismaLinea);
      if (!existe && actualRef.current.lineas.length >= MAX_LINEAS) return false;
      guardar((prev) => {
        const igual = prev.lineas.find(mismaLinea);
        if (igual) {
          return {
            ...prev,
            lineas: prev.lineas.map((l) =>
              l.uid === igual.uid ? { ...l, cantidad: Math.min(MAX_CANTIDAD, l.cantidad + cantidad) } : l
            ),
          };
        }
        if (prev.lineas.length >= MAX_LINEAS) return prev;
        const linea = {
          uid: nuevoUid(),
          id: item.id,
          nombre: item.nombre,
          precio: item.precio,
          imagen: item.imagen || null,
          icono: item.icono || '',
          cantidad: Math.max(1, Math.min(MAX_CANTIDAD, cantidad)),
          nota: notaLimpia,
        };
        return { ...prev, lineas: [...prev.lineas, linea] };
      });
      return true;
    },
    [guardar]
  );

  const cambiarCantidad = useCallback(
    (uid, cantidad) =>
      guardar((prev) => ({
        ...prev,
        lineas: prev.lineas.map((l) =>
          l.uid === uid ? { ...l, cantidad: Math.max(1, Math.min(MAX_CANTIDAD, cantidad)) } : l
        ),
      })),
    [guardar]
  );

  const cambiarNota = useCallback(
    (uid, nota) =>
      guardar((prev) => ({
        ...prev,
        lineas: prev.lineas.map((l) => (l.uid === uid ? { ...l, nota: String(nota || '').slice(0, MAX_NOTA_ITEM) } : l)),
      })),
    [guardar]
  );

  const quitar = useCallback(
    (uid) => guardar((prev) => ({ ...prev, lineas: prev.lineas.filter((l) => l.uid !== uid) })),
    [guardar]
  );

  const setNotaGeneral = useCallback(
    (nota) => guardar((prev) => ({ ...prev, nota: String(nota || '').slice(0, MAX_NOTA_GENERAL) })),
    [guardar]
  );

  const vaciar = useCallback(() => guardar(VACIO), [guardar]);

  // Actualiza nombre y precio con el menú vigente y quita lo que ya no se ofrece.
  // Devuelve los nombres retirados para avisar a la persona.
  const sincronizar = useCallback(
    (itemsPorId) => {
      const retirados = actualRef.current.lineas.filter((l) => !itemsPorId.has(l.id)).map((l) => l.nombre);
      guardar((prev) => {
        if (!prev.lineas.length) return prev;
        let cambio = false;
        const lineas = [];
        prev.lineas.forEach((l) => {
          const item = itemsPorId.get(l.id);
          if (!item) {
            cambio = true;
            return;
          }
          if (item.nombre !== l.nombre || String(item.precio) !== String(l.precio) || (item.imagen || null) !== l.imagen) {
            cambio = true;
            lineas.push({ ...l, nombre: item.nombre, precio: item.precio, imagen: item.imagen || null, icono: item.icono || '' });
          } else {
            lineas.push(l);
          }
        });
        return cambio ? { ...prev, lineas } : prev;
      });
      return retirados;
    },
    [guardar]
  );

  const resumen = useMemo(() => {
    const cantidad = carrito.lineas.reduce((s, l) => s + l.cantidad, 0);
    const subtotal = carrito.lineas.reduce((s, l) => s + aCentavos(l.precio) * l.cantidad, 0);
    const iva = ivaDe(subtotal);
    return { cantidad, subtotal: subtotal / 100, iva: iva / 100, total: (subtotal + iva) / 100 };
  }, [carrito.lineas]);

  return useMemo(
    () => ({
      lineas: carrito.lineas,
      nota: carrito.nota,
      ...resumen,
      agregar,
      cambiarCantidad,
      cambiarNota,
      quitar,
      setNotaGeneral,
      vaciar,
      sincronizar,
    }),
    [carrito, resumen, agregar, cambiarCantidad, cambiarNota, quitar, setNotaGeneral, vaciar, sincronizar]
  );
};
