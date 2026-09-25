import { useEffect, useRef, useState } from 'react';

// Hora actual que se refresca cada `cada` ms (para los "hace 3 min")
export const useAhora = (cada = 30000) => {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setAhora(Date.now()), cada);
    return () => clearInterval(t);
  }, [cada]);
  return ahora;
};

const coincideConsulta = (consulta) =>
  typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(consulta).matches;

// true mientras la media query se cumpla (p. ej. '(min-width: 1024px)')
export const useMedia = (consulta) => {
  const [coincide, setCoincide] = useState(() => coincideConsulta(consulta));
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return undefined;
    const mq = window.matchMedia(consulta);
    const alCambiar = () => setCoincide(mq.matches);
    alCambiar();
    if (mq.addEventListener) mq.addEventListener('change', alCambiar);
    else mq.addListener(alCambiar);
    return () => {
      if (mq.removeEventListener) mq.removeEventListener('change', alCambiar);
      else mq.removeListener(alCambiar);
    };
  }, [consulta]);
  return coincide;
};

// Consulta periódica sin solaparse: la siguiente vuelta se programa cuando termina la anterior.
// `esperaMs(visible)` decide el intervalo según si la pestaña está a la vista.
// Al volver a la pestaña se consulta en el acto.
export const usePolling = (cargar, esperaMs) => {
  const cargarRef = useRef(cargar);
  const esperaRef = useRef(esperaMs);
  useEffect(() => {
    cargarRef.current = cargar;
    esperaRef.current = esperaMs;
  });

  useEffect(() => {
    let activo = true;
    let enVuelo = false;
    let timer = null;

    const ciclo = async () => {
      clearTimeout(timer);
      if (enVuelo || !activo) return;
      enVuelo = true;
      try {
        await cargarRef.current();
      } catch (e) {
        /* cada carga maneja sus propios errores */
      } finally {
        enVuelo = false;
      }
      if (activo) timer = setTimeout(ciclo, esperaRef.current(document.visibilityState === 'visible'));
    };

    const alCambiarVisibilidad = () => {
      if (document.visibilityState === 'visible') ciclo();
    };

    ciclo();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      activo = false;
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, []);
};
