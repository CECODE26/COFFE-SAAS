import React, { useEffect, useId, useRef } from 'react';
import { X, AlertCircle } from 'lucide-react';

export const Modal = ({ open, onClose, eyebrow, title, subtitle, children, footer, size = 'md' }) => {
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
      <div className="absolute inset-0 bg-espresso-900/50 backdrop-blur-sm" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={`animate-fade-in relative flex max-h-[92vh] w-full ${widths[size]} flex-col rounded-t-3xl border border-espresso-100/70 bg-paper shadow-lift sm:rounded-3xl`}
      >
        <div className="flex items-start justify-between gap-4 border-b border-foam px-7 pb-5 pt-7">
          <div>
            {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
            <h2 className="text-3xl font-medium text-espresso-800">{title}</h2>
            {subtitle && <p className="mt-1 text-sm text-espresso-400">{subtitle}</p>}
          </div>
          <button
            onClick={onClose}
            className="rounded-full p-1.5 text-espresso-300 hover:bg-foam hover:text-espresso-700"
            aria-label="Cerrar"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-7 py-6">{children}</div>
        {footer && <div className="flex justify-end gap-2 border-t border-foam bg-cream/40 px-7 py-4 sm:rounded-b-3xl">{footer}</div>}
      </div>
    </div>
  );
};

export const Field = ({ label, error, hint, required, children, className = '' }) => {
  const id = useId();
  // Enlaza la etiqueta con el control cuando el hijo es un input/select/textarea directo
  const linkable = React.isValidElement(children) && ['input', 'select', 'textarea'].includes(children.type);
  const control = linkable ? React.cloneElement(children, { id: children.props.id || id }) : children;
  return (
    <div className={className}>
      {label && (
        <label className="label" htmlFor={linkable ? control.props.id : undefined}>
          {label}
          {required && <span className="ml-0.5 text-brass-500">*</span>}
        </label>
      )}
      {control}
      {error ? (
        <p className="field-error mt-1.5 text-xs text-terracotta-700">{error}</p>
      ) : (
        hint && <p className="field-hint mt-1.5 text-xs text-espresso-400">{hint}</p>
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
      className="form-alert mb-5 flex items-start gap-2.5 rounded-xl border border-terracotta-100 bg-terracotta-100/50 px-4 py-3 text-sm text-terracotta-700"
    >
      <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
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
