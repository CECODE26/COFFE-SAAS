// Historia de bienvenida al escanear el QR, como las historias de Instagram: una sola pantalla de 5 s
// con la barra de progreso arriba; al llenarse pasa de una a la bienvenida (corte directo, sin giros).
// Como Instagram, espera a los datos (listo): mientras tanto solo el papel crema tapa la página, y la taza,
// el nombre y la barra aparecen juntos; así los 5 s siempre son de la pantalla completa.
// Tocar o pulsar Enter/Espacio/Escape la pasa; mantener presionado la pausa; con la pestaña oculta también.
// Rendimiento: el tiempo lo lleva la animación CSS de la barra (transform, .historia-progreso en index.css),
// pausada con animation-play-state y terminada con animationend: sin re-render por cuadro.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { TazaHumeante } from './TazaHumeante';
import { Cargando } from './ui';
import { etiquetaMesa } from './utils';

const DURACION_MS = 5000; // lo que tarda en llenarse la barra (como una historia de foto de Instagram)
const MANTENER_MS = 200; // una presión más larga pausa en vez de pasar
const SALIDA_MS = 120; // fundido mínimo al pasar, solo para evitar el destello
const RESPALDO_MS = 600; // margen del temporizador de respaldo por si la animación de la barra no corriera

// ---------- Solo la primera vez por mesa en esta sesión del navegador ----------
const claveHistoria = (qr) => `coffe_intro_${qr}`;

export const historiaPendiente = (qr) => {
  if (!qr) return false;
  try {
    return !window.sessionStorage.getItem(claveHistoria(qr));
  } catch (e) {
    return false; // sin almacenamiento no podríamos recordarla: mejor no repetirla en cada carga
  }
};

const marcarHistoriaVista = (qr) => {
  try {
    window.sessionStorage.setItem(claveHistoria(qr), '1');
  } catch (e) {
    /* sin almacenamiento */
  }
};

// Verde de la carta con una luz suave detrás del vapor y una trama muy fina
const TEXTURA = {
  backgroundColor: '#2A4520',
  backgroundImage: [
    'radial-gradient(120% 65% at 50% 36%, rgba(191,216,165,.17), rgba(191,216,165,0) 62%)',
    'radial-gradient(150% 110% at 50% 50%, rgba(10,20,8,0) 55%, rgba(10,20,8,.38))',
    'repeating-linear-gradient(90deg, rgba(255,251,241,.03) 0 1px, transparent 1px 6px)',
    'repeating-linear-gradient(0deg, rgba(10,20,8,.07) 0 1px, transparent 1px 4px)',
  ].join(','),
};

// listo: llegó una mesa válida con su local; antes no se muestra nada ni corre el tiempo.
// saliendo: la página ya es operable y la historia se funde en SALIDA_MS; luego avisa con alSalir.
// alPasar puede llamarse varias veces (toque, tecla, fin de la barra): la página lo resuelve una sola vez.
export const HistoriaBienvenida = ({ qr, local, mesa, listo, saliendo, alPasar, alSalir }) => {
  const capaRef = useRef(null);
  const [mantenida, setMantenida] = useState(false);
  const [oculta, setOculta] = useState(() => document.hidden);
  // Presión en curso. mantuvo: su click no cuenta como toque. tocando: la capa no se desmonta con el dedo apoyado.
  const presion = useRef({ timer: 0, mantuvo: false, tocando: false });
  const fundidoListo = useRef(false);
  const pausada = (mantenida || oculta || !listo) && !saliendo;

  // Vista solo cuando de verdad se mostró (si la red no la deja llegar, sale en la próxima carga)
  useEffect(() => {
    if (listo) marcarHistoriaVista(qr);
  }, [listo, qr]);

  // El foco entra en la historia (lectores de pantalla); al cerrarla la página lo recupera
  useEffect(() => {
    capaRef.current?.focus({ preventScroll: true });
  }, []);

  useEffect(() => {
    const alCambiar = () => setOculta(document.hidden);
    document.addEventListener('visibilitychange', alCambiar);
    return () => document.removeEventListener('visibilitychange', alCambiar);
  }, []);

  useEffect(() => () => window.clearTimeout(presion.current.timer), []);

  // Enter, Espacio o Escape la pasan
  useEffect(() => {
    if (saliendo) return undefined;
    const alTeclear = (e) => {
      if (e.isComposing || e.altKey || e.ctrlKey || e.metaKey) return;
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Escape') {
        e.preventDefault();
        alPasar();
      }
    };
    window.addEventListener('keydown', alTeclear);
    return () => window.removeEventListener('keydown', alTeclear);
  }, [saliendo, alPasar]);

  // Respaldo por si la animación de la barra no llegara a correr: mismo tiempo (con margen) y mismas pausas
  const restante = useRef(DURACION_MS + RESPALDO_MS);
  useEffect(() => {
    if (pausada || saliendo) return undefined;
    const inicio = performance.now();
    const t = window.setTimeout(alPasar, restante.current);
    return () => {
      window.clearTimeout(t);
      restante.current = Math.max(0, restante.current - (performance.now() - inicio));
    };
  }, [pausada, saliendo, alPasar]);

  // Se desmonta tras el fundido, pero no con un dedo apoyado (su click caería en la página)
  const salirSiPuede = useCallback(() => {
    if (fundidoListo.current && !presion.current.tocando) alSalir();
  }, [alSalir]);

  useEffect(() => {
    if (!saliendo) return undefined;
    const t = window.setTimeout(() => {
      fundidoListo.current = true;
      salirSiPuede();
    }, SALIDA_MS);
    return () => window.clearTimeout(t);
  }, [saliendo, salirSiPuede]);

  // Mantener presionado pausa (como Instagram); al soltar continúa sin contar como toque.
  // Solo cuenta el primer dedo: apoyar y levantar un segundo dedo no anula la pausa del primero.
  const alPresionar = (e) => {
    if (!e.isPrimary) return;
    const p = presion.current;
    p.mantuvo = false;
    window.clearTimeout(p.timer);
    if (saliendo || (e.pointerType === 'mouse' && e.button !== 0)) return;
    if (e.target.closest('button')) return; // la ✕ es un botón normal
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // el soltar llega aunque el puntero salga de la capa
    } catch (err) {
      /* sin captura */
    }
    p.timer = window.setTimeout(() => {
      p.mantuvo = true;
      setMantenida(true);
    }, MANTENER_MS);
  };

  const alSoltar = (e) => {
    if (!e.isPrimary) return;
    window.clearTimeout(presion.current.timer);
    setMantenida(false);
  };

  // Se pasa con el click y no con pointerdown: en móviles el click de un toque llega después del touchend
  // y, si la capa ya dejara pasar los toques, caería en la página (teclado, "Ver menú"…)
  const alTocar = () => {
    const p = presion.current;
    if (p.mantuvo) {
      p.mantuvo = false; // soltó tras mantener: no cuenta como toque
      return;
    }
    if (!saliendo) alPasar();
  };

  const alFinToque = (e) => {
    if (e.touches.length > 0) return;
    presion.current.tocando = false;
    if (!saliendo) return;
    // La barra terminó con el dedo apoyado: que ese toque no se convierta en click sobre la página
    if (e.type === 'touchend' && e.cancelable) e.preventDefault();
    window.setTimeout(salirSiPuede, 0);
  };

  const nombre = local?.nombre;

  return (
    <div
      ref={capaRef}
      data-historia=""
      role="dialog"
      aria-modal="true"
      aria-label={nombre ? `Bienvenido a ${nombre}` : 'Bienvenida'}
      tabIndex={-1}
      className={`fixed inset-0 z-[80] touch-none select-none focus:outline-none ${
        saliendo ? 'pointer-events-none' : 'cursor-pointer'
      }`}
      style={{
        opacity: saliendo ? 0 : 1,
        transition: `opacity ${SALIDA_MS}ms ease-out`,
        WebkitTouchCallout: 'none',
        WebkitTapHighlightColor: 'transparent',
      }}
      onClick={alTocar}
      onPointerDown={alPresionar}
      onPointerUp={alSoltar}
      onPointerCancel={alSoltar}
      onTouchStart={() => {
        presion.current.tocando = true;
      }}
      onTouchEnd={alFinToque}
      onTouchCancel={alFinToque}
      onContextMenu={(e) => {
        if (presion.current.tocando) e.preventDefault(); // pulsación larga en móvil: sin menú del sistema
      }}
      onDragStart={(e) => e.preventDefault()}
      onWheel={saliendo ? undefined : alPasar}
    >
      {/* Columna de la app; el papel crema tapa la página de carga mientras llegan los datos */}
      <div className="relative mx-auto h-full w-full max-w-[480px] bg-crema sm:shadow-lift">
        {!listo && (
          // Red lenta: el aviso de carga solo se ve si la espera se alarga (sin parpadeo en redes rápidas)
          <div className="historia-espera flex h-full items-center justify-center">
            <Cargando texto="Buscando tu mesa…" />
          </div>
        )}
        {/* Se monta con los datos: la taza, el nombre y la barra (que empieza a contar) llegan juntos */}
        {listo && (
          <div className="historia-aparece absolute inset-0 overflow-hidden text-marfil" style={TEXTURA}>
            <div
              className="relative flex h-full flex-col px-3"
              style={{
                paddingTop: 'calc(env(safe-area-inset-top) + 8px)',
                paddingBottom: 'calc(env(safe-area-inset-bottom) + 18px)',
              }}
            >
              {/* Barra de progreso de un segmento */}
              <div className="h-[3px] overflow-hidden rounded-full bg-marfil/25" aria-hidden="true">
                <div
                  className="historia-progreso h-full w-full rounded-full bg-gradient-to-r from-marfil to-oro-200"
                  style={{ '--historia-ms': `${DURACION_MS}ms`, animationPlayState: pausada ? 'paused' : 'running' }}
                  onAnimationEnd={(e) => {
                    if (e.target === e.currentTarget && e.animationName === 'historia-progreso') alPasar();
                  }}
                />
              </div>

              {/* Cabecera: solo la mesa en tenue y la ✕; el nombre va al centro */}
              <div className="mt-1.5 flex items-center gap-2 pl-1">
                <p className="min-w-0 flex-1 truncate text-[12.5px] leading-tight tracking-[0.02em] text-marfil/65">
                  {mesa && etiquetaMesa(mesa)}
                </p>
                <button
                  type="button"
                  onClick={alPasar}
                  tabIndex={saliendo ? -1 : undefined}
                  aria-label="Cerrar y ver la carta"
                  className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-marfil/90 transition-colors hover:bg-marfil/10 hover:text-marfil focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-oro-200"
                >
                  <X className="h-6 w-6" strokeWidth={1.75} aria-hidden="true" />
                </button>
              </div>

              {/* Centro: la taza con su vapor y el nombre del local */}
              <div className="historia-acerca flex min-h-0 flex-1 flex-col justify-center px-6">
                {/* La taza toma el alto libre (sin vh: en móviles mide el viewport sin barras) */}
                <div className="historia-taza-hueco relative max-h-[420px] min-h-0 flex-1">
                  <div className="absolute inset-0 flex items-end justify-center">
                    <TazaHumeante className="historia-taza-tam" />
                  </div>
                </div>
                {/* Alto reservado: la taza queda en el mismo sitio con nombres de una o dos líneas */}
                <div className="flex min-h-[8.5rem] flex-col items-center pt-3 text-center [@media(max-height:560px)]:min-h-[6.25rem] [@media(max-height:560px)]:pt-1">
                  {local && (
                    <div className="flex w-full flex-col items-center">
                      <p className="font-script text-[26px] leading-none text-oro-300">Bienvenido a</p>
                      <h2 className="mt-1.5 line-clamp-2 max-w-full break-words font-serif text-[2.1rem] font-medium italic leading-[1.12] text-marfil [@media(max-height:560px)]:text-[1.6rem]">
                        {nombre}
                      </h2>
                      <div className="mt-3 flex items-center gap-2" aria-hidden="true">
                        <span className="h-px w-10 bg-oro-400/70" />
                        <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" />
                        <span className="h-px w-10 bg-oro-400/70" />
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <p className="mt-2 text-center text-[10.5px] font-medium uppercase tracking-[0.26em] text-marfil/70">
                Toca para continuar
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
