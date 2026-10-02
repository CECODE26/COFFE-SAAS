// Fundido de la bienvenida al menú (al pulsar "Ver menú" o "Continuar como …").
// Una copia inerte de la bienvenida, en una capa fija por encima, se desvanece mientras el menú
// (que ya se monta debajo al navegar) aparece con un leve desfase y un ascenso mínimo.
// No retrasa la navegación ni la carga. El ascenso usa `top` con posición relativa y no transform:
// un transform en #root movería la barra inferior y el botón del carrito (position: fixed).
import { EASE } from '../Motion';

const EASE_CSS = `cubic-bezier(${EASE.join(', ')})`;
const MENU_FUNDIDO_MS = 450;
const MENU_DESFASE_MS = 80; // el menú empieza a aparecer un poco después de que la bienvenida se vaya
const MENU_ASCENSO_PX = 8;
const MENU_REDUCIDO_MS = 200; // movimiento reducido: solo opacidad

export const fundirAlMenu = (hoja) => {
  if (!hoja || typeof hoja.animate !== 'function') return;
  if (document.querySelector('[data-fundido-menu]')) return; // ya hay un fundido en curso
  try {
    const reducir = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const r = hoja.getBoundingClientRect();
    const duracion = reducir ? MENU_REDUCIDO_MS : MENU_FUNDIDO_MS;
    const curva = reducir ? 'ease' : EASE_CSS;

    const capa = document.createElement('div');
    capa.setAttribute('aria-hidden', 'true');
    capa.setAttribute('inert', '');
    capa.setAttribute('data-fundido-menu', '');
    capa.className = 'pointer-events-none fixed inset-0 z-[70] overflow-hidden';

    const copia = hoja.cloneNode(true);
    copia.removeAttribute('data-hoja');
    // El botón se clona "Entrando…" y apagado: en la copia se ve con su color normal
    copia.querySelectorAll('button[disabled]').forEach((b) => b.removeAttribute('disabled'));
    Object.assign(copia.style, {
      position: 'absolute',
      left: `${r.left}px`,
      top: `${r.top}px`,
      width: `${r.width}px`,
      height: `${r.height}px`,
      margin: '0',
      // La leve escala se centra en la parte visible de la hoja
      transformOrigin: `${Math.round(r.width / 2)}px ${Math.round(window.innerHeight / 2 - r.top)}px`,
    });
    capa.appendChild(copia);
    document.body.appendChild(capa);

    const animaciones = [
      copia.animate(
        reducir
          ? [{ opacity: 1 }, { opacity: 0 }]
          : [
              { opacity: 1, transform: 'scale(1)' },
              { opacity: 0, transform: 'scale(0.99)' },
            ],
        { duration: duracion, easing: curva, fill: 'forwards' }
      ),
    ];

    // Entrada del menú: se anima el contenedor de React, que sobrevive al cambio de ruta.
    // fill 'backwards': queda en 0 durante el desfase (lo que quede de la bienvenida no asoma bajo la copia).
    const raiz = hoja.closest('#root');
    let posicionPuesta = false;
    if (raiz && typeof raiz.animate === 'function') {
      const entrada = { duration: duracion, delay: reducir ? 0 : MENU_DESFASE_MS, easing: curva, fill: 'backwards' };
      animaciones.push(raiz.animate([{ opacity: 0 }, { opacity: 1 }], entrada));
      if (!reducir && window.getComputedStyle(raiz).position === 'static') {
        raiz.style.position = 'relative';
        posicionPuesta = true;
        animaciones.push(raiz.animate([{ top: `${MENU_ASCENSO_PX}px` }, { top: '0px' }], entrada));
      }
    }

    let limpio = false;
    let respaldo = null;
    const limpiar = () => {
      if (limpio) return;
      limpio = true;
      window.clearTimeout(respaldo);
      // Si algo quedó a medias, el menú queda visible del todo
      animaciones.forEach((a) => a.cancel());
      capa.remove();
      if (posicionPuesta) raiz.style.removeProperty('position');
    };
    Promise.all(animaciones.map((a) => a.finished)).then(limpiar, limpiar);
    // Respaldo por si `finished` no llega (p. ej. la pestaña pasó a segundo plano)
    respaldo = window.setTimeout(limpiar, duracion + MENU_DESFASE_MS + 1500);
  } catch (e) {
    /* sin animación: la navegación sigue igual */
  }
};
