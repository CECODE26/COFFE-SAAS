import React, { useEffect, useId, useRef } from 'react';
import { AnimatePresence, motion, useDragControls, useReducedMotion } from 'framer-motion';
import { X } from 'lucide-react';

const ENFOCABLES =
  'a[href], button:not([disabled]), textarea:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Hoja inferior (bottom sheet) del celular: sube desde abajo, se cierra con la X, Escape,
// tocando el fondo o arrastrando la manija hacia abajo. Atrapa el foco y lo devuelve al cerrar.
export const BottomSheet = ({ open, onClose, eyebrow, title, children, footer, cabecera, ocultarTitulo = false }) => {
  const titleId = useId();
  const panelRef = useRef(null);
  const reduce = useReducedMotion();
  const drag = useDragControls();
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return undefined;
    const anterior = document.activeElement;
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const enfocar = setTimeout(() => {
      const panel = panelRef.current;
      if (!panel) return;
      const autofoco = panel.querySelector('[data-autofocus]');
      (autofoco || panel).focus({ preventScroll: true });
    }, 30);

    const onKey = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onCloseRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !panelRef.current) return;
      const nodos = Array.from(panelRef.current.querySelectorAll(ENFOCABLES)).filter((n) => n.offsetParent !== null);
      if (!nodos.length) return;
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      if (e.shiftKey && (document.activeElement === primero || document.activeElement === panelRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', onKey);

    return () => {
      clearTimeout(enfocar);
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
      if (anterior && typeof anterior.focus === 'function') anterior.focus({ preventScroll: true });
    };
  }, [open]);

  const panelVariants = reduce
    ? { oculto: { opacity: 0 }, visible: { opacity: 1 } }
    : { oculto: { y: '100%' }, visible: { y: 0 } };

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-50 flex items-end justify-center print:hidden"
          initial="oculto"
          animate="visible"
          exit="oculto"
        >
          <motion.div
            className="absolute inset-0 bg-verde-900/55 backdrop-blur-[2px]"
            variants={{ oculto: { opacity: 0 }, visible: { opacity: 1 } }}
            transition={{ duration: 0.2 }}
            onClick={onClose}
            aria-hidden="true"
          />
          <motion.div
            ref={panelRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            tabIndex={-1}
            variants={panelVariants}
            transition={reduce ? { duration: 0.15 } : { type: 'spring', damping: 34, stiffness: 340 }}
            drag={reduce ? false : 'y'}
            dragListener={false}
            dragControls={drag}
            dragConstraints={{ top: 0, bottom: 0 }}
            dragElastic={{ top: 0, bottom: 0.7 }}
            onDragEnd={(e, info) => {
              if (info.offset.y > 110 || info.velocity.y > 650) onClose();
            }}
            className="relative flex max-h-[92vh] w-full max-w-[480px] flex-col overflow-hidden rounded-t-[1.75rem] border border-b-0 border-oro-300/70 bg-marfil shadow-lift focus:outline-none"
          >
            {/* Manija para arrastrar */}
            <div
              className="absolute inset-x-0 top-0 z-20 flex cursor-grab touch-none justify-center pb-2 pt-2 active:cursor-grabbing"
              onPointerDown={(e) => drag.start(e)}
              aria-hidden="true"
            >
              <span className="h-1 w-10 rounded-full bg-oro-300/80" />
            </div>

            <button
              type="button"
              onClick={onClose}
              className="absolute right-3 top-3 z-20 flex h-9 w-9 items-center justify-center rounded-full bg-marfil/90 text-verde-700 ring-1 ring-oro-200 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {cabecera}
              <div className={`px-5 ${cabecera ? 'pt-4' : 'pt-7'}`}>
                {eyebrow && <p className="mb-0.5 font-script text-[19px] leading-none text-oro-600">{eyebrow}</p>}
                <h2
                  id={titleId}
                  className={ocultarTitulo ? 'sr-only' : 'pr-10 font-serif text-[1.45rem] italic font-medium leading-tight text-verde-700'}
                >
                  {title}
                </h2>
              </div>
              <div className="px-5 pb-5 pt-3">{children}</div>
            </div>

            {footer && (
              <div className="shrink-0 border-t border-oro-200/80 bg-crema px-5 py-3 pb-[calc(0.75rem_+_env(safe-area-inset-bottom))]">
                {footer}
              </div>
            )}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
