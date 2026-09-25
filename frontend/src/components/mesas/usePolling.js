import { useEffect, useRef } from 'react';

// Ejecuta `tarea` cada `ms` mientras la pestaña esté visible. Con la pestaña oculta se pausa y,
// al volver, refresca de inmediato. Nunca lanza dos ejecuciones a la vez.
export const usePolling = (tarea, ms = 10000, activo = true) => {
  const tareaRef = useRef(tarea);
  useEffect(() => {
    tareaRef.current = tarea;
  }, [tarea]);

  useEffect(() => {
    if (!activo) return undefined;
    let timer = null;
    let enCurso = false;

    const tick = async () => {
      if (document.hidden || enCurso) return;
      enCurso = true;
      try {
        await tareaRef.current();
      } catch (e) {
        /* un fallo puntual no detiene el sondeo */
      } finally {
        enCurso = false;
      }
    };
    const iniciar = () => {
      if (!timer) timer = setInterval(tick, ms);
    };
    const parar = () => {
      clearInterval(timer);
      timer = null;
    };
    const alCambiarVisibilidad = () => {
      if (document.hidden) {
        parar();
      } else {
        tick();
        iniciar();
      }
    };

    if (!document.hidden) iniciar();
    document.addEventListener('visibilitychange', alCambiarVisibilidad);
    return () => {
      parar();
      document.removeEventListener('visibilitychange', alCambiarVisibilidad);
    };
  }, [ms, activo]);
};
