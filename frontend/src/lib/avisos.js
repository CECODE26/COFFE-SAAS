import { useCallback, useEffect, useState } from 'react';

// Avisos para el personal y el cliente: sonidos sintetizados (sin archivos de audio),
// notificaciones del navegador, vibración y contador en el título de la pestaña.
// Los navegadores solo dejan sonar audio después de un gesto del usuario: el AudioContext
// se "desbloquea" con el primer clic o toque en la página.

const CLAVE_SONIDO = 'coffe_sonido';

let contexto = null;
const obtenerContexto = () => {
  if (typeof window === 'undefined') return null;
  const Ctx = window.AudioContext || window.webkitAudioContext;
  if (!Ctx) return null;
  if (!contexto) contexto = new Ctx();
  if (contexto.state === 'suspended') contexto.resume().catch(() => {});
  return contexto;
};

if (typeof window !== 'undefined') {
  const desbloquear = () => {
    obtenerContexto();
    window.removeEventListener('pointerdown', desbloquear);
    window.removeEventListener('keydown', desbloquear);
  };
  window.addEventListener('pointerdown', desbloquear);
  window.addEventListener('keydown', desbloquear);
}

// Cada sonido es una secuencia de notas [frecuencia Hz, inicio s, duración s]
const MELODIAS = {
  // Pedido nuevo: campanita ascendente de dos notas
  nuevo: [[880, 0, 0.18], [1318.5, 0.16, 0.32]],
  // Pedido listo: tres notas alegres
  listo: [[783.99, 0, 0.14], [987.77, 0.13, 0.14], [1174.66, 0.26, 0.34]],
  // Llamado del cliente / pide la cuenta: dos toques insistentes
  alerta: [[1046.5, 0, 0.12], [1046.5, 0.2, 0.12], [1396.9, 0.4, 0.3]],
  // Confirmación suave
  ok: [[659.25, 0, 0.12], [880, 0.1, 0.2]],
};

export const sonidoActivado = () => {
  try {
    return localStorage.getItem(CLAVE_SONIDO) !== 'no';
  } catch (e) {
    return true;
  }
};

export const sonar = (tipo = 'nuevo') => {
  if (!sonidoActivado()) return;
  const ctx = obtenerContexto();
  if (!ctx || ctx.state !== 'running') return;
  const notas = MELODIAS[tipo] || MELODIAS.nuevo;
  const ahora = ctx.currentTime + 0.02;
  notas.forEach(([frecuencia, inicio, duracion]) => {
    const osc = ctx.createOscillator();
    const gan = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = frecuencia;
    // Envolvente corta para que suene a campana y no a pitido
    gan.gain.setValueAtTime(0.0001, ahora + inicio);
    gan.gain.exponentialRampToValueAtTime(0.28, ahora + inicio + 0.015);
    gan.gain.exponentialRampToValueAtTime(0.0001, ahora + inicio + duracion);
    osc.connect(gan).connect(ctx.destination);
    osc.start(ahora + inicio);
    osc.stop(ahora + inicio + duracion + 0.05);
  });
};

export const vibrar = (patron = [120, 60, 120]) => {
  try {
    if (navigator.vibrate) navigator.vibrate(patron);
  } catch (e) {
    /* sin vibración */
  }
};

// Notificación del sistema: solo si hay permiso y la pestaña no está a la vista
export const notificar = (titulo, cuerpo, { tag, forzar = false } = {}) => {
  try {
    if (!('Notification' in window) || Notification.permission !== 'granted') return;
    if (!forzar && document.visibilityState === 'visible') return;
    const n = new Notification(titulo, { body: cuerpo, tag, icon: '/favicon.ico' });
    n.onclick = () => {
      window.focus();
      n.close();
    };
  } catch (e) {
    /* algunos navegadores móviles no permiten new Notification */
  }
};

// Estado del sonido y del permiso de notificaciones para los botones de la interfaz
export const useAvisos = () => {
  const [sonido, setSonidoState] = useState(sonidoActivado);
  const [permiso, setPermiso] = useState(() =>
    typeof window !== 'undefined' && 'Notification' in window ? Notification.permission : 'unsupported'
  );

  const setSonido = useCallback((valor) => {
    try {
      localStorage.setItem(CLAVE_SONIDO, valor ? 'si' : 'no');
    } catch (e) {
      /* sin almacenamiento */
    }
    setSonidoState(valor);
    if (valor) {
      obtenerContexto();
      setTimeout(() => sonar('ok'), 50);
    }
  }, []);

  const pedirPermiso = useCallback(async () => {
    if (!('Notification' in window)) return 'unsupported';
    try {
      const r = await Notification.requestPermission();
      setPermiso(r);
      return r;
    } catch (e) {
      return Notification.permission;
    }
  }, []);

  return { sonido, setSonido, permiso, pedirPermiso };
};

// Muestra "(3) Pedidos · COFFE-SAAS" en la pestaña mientras haya pendientes
export const useTituloConContador = (n, base = 'COFFE-SAAS') => {
  useEffect(() => {
    const anterior = document.title;
    document.title = n > 0 ? `(${n}) ${base}` : base;
    return () => {
      document.title = anterior;
    };
  }, [n, base]);
};
