import React, { useEffect, useId, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';

export const Modal = ({ open, onClose, eyebrow, title, subtitle, children, footer, size = 'md' }) => {
  const titleId = useId();

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = '';
    };
  }, [open, onClose]);

  if (!open) return null;

  const widths = { md: 'max-w-lg', lg: 'max-w-2xl' };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 bg-verde-900/50 backdrop-blur-sm" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={`animate-fade-in relative flex max-h-[92vh] w-full ${widths[size]} flex-col rounded-t-3xl border border-oro-300/70 bg-marfil shadow-lift sm:rounded-3xl`}
      >
        {/* Cabecera: antetítulo manuscrito, título en cursiva y filete de oro */}
        <div className="flex items-start justify-between gap-4 px-5 pb-4 pt-6 sm:px-7 sm:pt-7">
          <div className="min-w-0">
            {eyebrow && <p className="mb-1 font-script text-[22px] leading-none text-oro-600">{eyebrow}</p>}
            <h2 id={titleId} className="font-serif text-[1.75rem] italic font-medium leading-tight text-verde-700 sm:text-3xl">
              {title}
            </h2>
            {subtitle && <p className="mt-1.5 text-sm text-verde-600">{subtitle}</p>}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="shrink-0 rounded-full p-2 text-verde-600 ring-1 ring-oro-200 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" aria-hidden="true" />
          </button>
        </div>
        <div className="flex items-center gap-3 px-5 sm:px-7" aria-hidden="true">
          <span className="h-px flex-1 bg-oro-300/70" />
          <span className="rombo" />
          <span className="h-px flex-1 bg-oro-300/70" />
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-6 sm:px-7">{children}</div>

        {footer && (
          <div className="flex flex-wrap justify-end gap-2 border-t border-oro-200/80 bg-crema px-5 py-4 sm:rounded-b-3xl sm:px-7">
            {footer}
          </div>
        )}
      </div>
    </div>
  );
};

export const Field = ({ label, error, hint, required, children, className = '' }) => {
  const id = useId();
  const noteId = `${id}-nota`;
  const note = error || hint;
  // Enlaza la etiqueta con el control cuando el hijo es un input/select/textarea directo,
  // y el error (o la pista) como descripción del control
  const linkable = React.isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const control = linkable
    ? React.cloneElement(children, {
        id: children.props.id || id,
        'aria-invalid': error ? true : children.props['aria-invalid'],
        'aria-describedby': [children.props['aria-describedby'], note && noteId].filter(Boolean).join(' ') || undefined,
      })
    : children;
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={linkable ? control.props.id : undefined}>
          {label}
          {required && <span className="ml-0.5 text-oro-600">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <p id={noteId} role="alert" className="field-error mt-1.5 text-xs text-terracotta-700">{error}</p>
      ) : (
        hint && <p id={noteId} className="field-hint mt-1.5 text-xs text-verde-600">{hint}</p>
      )}
    </div>
  );
};

export const FormAlert = ({ children }) => {
  const ref = useRef(null);
  useEffect(() => {
    if (children) ref.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [children]);
  return children ? (
    <div
      ref={ref}
      role="alert"
      className="form-alert mb-5 flex items-start gap-2.5 rounded-2xl border border-terracotta-600/25 bg-terracotta-100/60 px-4 py-3 text-sm text-terracotta-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
      <p>{children}</p>
    </div>
  ) : null;
};

// Convierte la respuesta de error de DRF en { campo: mensaje } + mensaje general
export const parseApiErrors = (error) => {
  const data = error?.response?.data;
  if (!data || typeof data !== 'object') {
    return { fields: {}, general: 'No se pudo guardar. Revisa tu conexión e inténtalo de nuevo.' };
  }
  const fields = {};
  let general = data.detail || null;
  Object.entries(data).forEach(([key, value]) => {
    const msg = Array.isArray(value) ? value[0] : value;
    if (key === 'non_field_errors' || key === 'detail') general = msg;
    else fields[key] = msg;
  });
  return { fields, general };
};
