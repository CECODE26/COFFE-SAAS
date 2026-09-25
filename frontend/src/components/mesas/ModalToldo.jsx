import React, { useEffect, useId, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';
import { ToldoFino } from '../Decor';

// Pila de diálogos abiertos: Escape y el foco atrapado solo afectan al de arriba
const pila = [];
let bloqueosScroll = 0;

const ENFOCABLES =
  'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ANCHOS = {
  sm: 'sm:max-w-sm',
  md: 'sm:max-w-md',
  lg: 'sm:max-w-xl',
};

// Diálogo con toldo fino, antetítulo manuscrito ("Mesa 7") y título serif en cursiva.
// Se monta en <body> (así se apila sobre otros diálogos y no se imprime) y se cierra con Escape.
export const ModalToldo = ({ onClose, eyebrow, titulo, subtitulo, children, pie, ancho = 'md', etiqueta }) => {
  const id = useId();
  const tituloId = `${id}-titulo`;
  const dialogoRef = useRef(null);
  const cerrarRef = useRef(onClose);
  useEffect(() => {
    cerrarRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    pila.push(id);
    const previo = document.activeElement;
    bloqueosScroll += 1;
    document.body.style.overflow = 'hidden';
    dialogoRef.current?.focus();

    const alTeclear = (e) => {
      if (pila[pila.length - 1] !== id) return;
      if (e.key === 'Escape') {
        e.stopPropagation();
        cerrarRef.current?.();
        return;
      }
      if (e.key !== 'Tab' || !dialogoRef.current) return;
      const nodos = Array.from(dialogoRef.current.querySelectorAll(ENFOCABLES)).filter((n) => n.offsetParent !== null);
      if (!nodos.length) {
        e.preventDefault();
        return;
      }
      const primero = nodos[0];
      const ultimo = nodos[nodos.length - 1];
      const activo = document.activeElement;
      if (e.shiftKey && (activo === primero || activo === dialogoRef.current)) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && activo === ultimo) {
        e.preventDefault();
        primero.focus();
      }
    };
    document.addEventListener('keydown', alTeclear);

    return () => {
      document.removeEventListener('keydown', alTeclear);
      const i = pila.lastIndexOf(id);
      if (i >= 0) pila.splice(i, 1);
      bloqueosScroll = Math.max(0, bloqueosScroll - 1);
      if (bloqueosScroll === 0) document.body.style.overflow = '';
      if (previo && typeof previo.focus === 'function' && document.contains(previo)) previo.focus();
    };
  }, [id]);

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-verde-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        ref={dialogoRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={etiqueta ? undefined : tituloId}
        aria-label={etiqueta}
        tabIndex={-1}
        className={`animate-fade-in relative flex max-h-[92vh] w-full ${ANCHOS[ancho] || ANCHOS.md} flex-col overflow-hidden rounded-t-3xl border border-oro-200/80 bg-marfil shadow-lift focus:outline-none sm:rounded-3xl`}
      >
        <ToldoFino />
        <button
          type="button"
          onClick={onClose}
          className="absolute right-3 top-7 z-10 rounded-full p-1.5 text-verde-600 transition-colors hover:bg-pistacho-100 hover:text-verde-800"
          aria-label="Cerrar"
        >
          <X className="h-5 w-5" aria-hidden="true" />
        </button>

        <header className="px-10 pb-3 pt-3 text-center">
          {eyebrow && <p className="font-script text-[22px] leading-none text-oro-600">{eyebrow}</p>}
          <h2 id={tituloId} className="mt-1 font-serif text-[1.45rem] italic font-medium leading-tight text-verde-700">
            {titulo}
          </h2>
          {subtitulo && <div className="mt-1 text-xs text-verde-600">{subtitulo}</div>}
          <div className="mt-2.5 flex items-center justify-center gap-3" aria-hidden="true">
            <span className="h-px w-10 bg-oro-300" />
            <span className="rombo" />
            <span className="h-px w-10 bg-oro-300" />
          </div>
        </header>

        <div className="flex-1 overflow-y-auto px-4 pb-4 sm:px-5">{children}</div>

        {pie && (
          <div className="flex flex-wrap items-center justify-end gap-2 border-t border-oro-200/80 bg-crema px-4 py-3 sm:px-5">
            {pie}
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};

// Título de sección dentro de un diálogo: antetítulo dorado con contador y filete
export const Seccion = ({ titulo, cuenta, icono: Icono, children, className = '' }) => (
  <section className={`mt-4 first:mt-1 ${className}`}>
    <div className="mb-2 flex items-center gap-2">
      {Icono && <Icono className="h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />}
      <h3 className="font-sans text-[10px] font-medium uppercase tracking-[0.2em] text-oro-600">
        {titulo}
        {cuenta !== undefined && <span className="ml-1.5 text-verde-600">{cuenta}</span>}
      </h3>
      <span className="h-px flex-1 bg-oro-200" aria-hidden="true" />
    </div>
    {children}
  </section>
);

// Aviso en línea dentro del diálogo (errores del backend, confirmaciones)
export const Aviso = ({ tono = 'error', icono: Icono, children, className = '' }) => {
  const tonos = {
    error: 'border-terracotta-600/25 bg-terracotta-100/60 text-terracotta-700',
    oro: 'border-oro-300/70 bg-oro-50 text-oro-700',
    cobalto: 'border-cobalto-200 bg-cobalto-50 text-cobalto-600',
  };
  return (
    <div
      role={tono === 'error' ? 'alert' : 'status'}
      className={`flex items-start gap-2 rounded-2xl border px-3 py-2 text-xs leading-snug ${tonos[tono] || tonos.error} ${className}`}
    >
      {Icono && <Icono className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden="true" />}
      <div className="min-w-0 flex-1">{children}</div>
    </div>
  );
};
