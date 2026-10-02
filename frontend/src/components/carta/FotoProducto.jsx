import React, { useId, useRef, useState } from 'react';
import { Camera, ImagePlus, RefreshCw, Trash2 } from 'lucide-react';
import { FOTO_MAX_MB } from './utils';

// Zona de la foto del producto: arrastrar o elegir, vista previa, cambiar/quitar y progreso de subida.
// No valida ni sube: entrega el archivo con onArchivo y el formulario decide.
// En el celular es compacta (miniatura a la izquierda y botones al lado) para llegar rápido al nombre.
export const FotoProducto = ({ src, onArchivo, onQuitar, error, progreso = null, disabled = false }) => {
  const inputRef = useRef(null);
  const camaraRef = useRef(null);
  const [arrastrando, setArrastrando] = useState(false);
  const ayudaId = useId();
  const errorId = useId();

  const elegir = (e) => {
    const archivo = e.target.files?.[0];
    // Permite volver a elegir el mismo archivo después de quitarlo
    e.target.value = '';
    if (archivo) onArchivo(archivo);
  };

  const abrir = () => !disabled && inputRef.current?.click();

  const arrastre = {
    onDragOver: (e) => {
      e.preventDefault();
      if (!disabled) setArrastrando(true);
    },
    onDragLeave: () => setArrastrando(false),
    onDrop: (e) => {
      e.preventDefault();
      setArrastrando(false);
      const archivo = e.dataTransfer?.files?.[0];
      if (archivo && !disabled) onArchivo(archivo);
    },
  };

  const describedBy = error ? errorId : ayudaId;
  const subiendo = progreso !== null;

  return (
    <div className="flex items-start gap-3 sm:block">
      <input ref={inputRef} type="file" accept="image/*" className="hidden" tabIndex={-1} onChange={elegir} />
      {/* En el celular abre directamente la cámara trasera */}
      <input ref={camaraRef} type="file" accept="image/*" capture="environment" className="hidden" tabIndex={-1} onChange={elegir} />

      {src ? (
        <div
          {...arrastre}
          className={`relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl bg-pistacho-50 ring-1 transition sm:aspect-square sm:h-auto sm:w-full ${
            arrastrando ? 'ring-2 ring-cobalto-500' : 'ring-oro-300'
          }`}
        >
          <img src={src} alt="Vista previa de la foto del producto" className="h-full w-full object-cover" />
          {subiendo && (
            <div className="absolute inset-x-0 bottom-0 bg-verde-900/75 px-2 py-1.5 text-marfil sm:px-2.5 sm:py-2" aria-live="polite">
              <div className="flex items-center justify-between gap-1 text-[9px] font-medium uppercase tracking-[0.08em] sm:text-[10.5px] sm:tracking-[0.12em]">
                <span className="truncate">{progreso < 100 ? 'Subiendo' : 'Procesando…'}</span>
                {progreso < 100 && <span>{progreso} %</span>}
              </div>
              <div
                className="mt-1 h-1 overflow-hidden rounded-full bg-marfil/25"
                role="progressbar"
                aria-label="Subida de la foto"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progreso}
              >
                <div className="h-full rounded-full bg-oro-300 transition-[width] duration-200" style={{ width: `${progreso}%` }} />
              </div>
            </div>
          )}
        </div>
      ) : (
        <button
          type="button"
          onClick={abrir}
          disabled={disabled}
          aria-describedby={describedBy}
          {...arrastre}
          className={`flex h-24 w-24 shrink-0 flex-col items-center justify-center gap-1 rounded-2xl border-2 border-dashed px-2 text-center transition-colors sm:aspect-square sm:h-auto sm:w-full sm:gap-1.5 sm:px-3 ${
            arrastrando
              ? 'border-cobalto-500 bg-cobalto-50'
              : error
              ? 'border-terracotta-600/50 bg-terracotta-100/40'
              : 'border-oro-300 bg-pistacho-50 hover:border-cobalto-500 hover:bg-marfil'
          }`}
        >
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-marfil text-oro-600 ring-1 ring-oro-300 sm:h-10 sm:w-10" aria-hidden="true">
            <ImagePlus className="h-4 w-4 sm:h-5 sm:w-5" />
          </span>
          <span className="text-[10px] font-medium uppercase leading-tight tracking-[0.1em] text-verde-700 sm:text-[11.5px] sm:tracking-[0.14em]">
            {arrastrando ? 'Suéltala aquí' : 'Agregar foto'}
          </span>
          <span className="hidden text-[11px] leading-snug text-verde-600 sm:block">Arrástrala o haz clic para elegirla</span>
        </button>
      )}

      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap gap-1.5 sm:mt-2">
          {src && (
            <>
              <button
                type="button"
                onClick={abrir}
                disabled={disabled}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-oro-400/70 bg-marfil px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500 disabled:opacity-50"
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" /> Cambiar
              </button>
              <button
                type="button"
                onClick={onQuitar}
                disabled={disabled}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-terracotta-700 transition-colors hover:bg-terracotta-100 disabled:opacity-50"
              >
                <Trash2 className="h-3.5 w-3.5" aria-hidden="true" /> Quitar
              </button>
            </>
          )}
          <button
            type="button"
            onClick={() => !disabled && camaraRef.current?.click()}
            disabled={disabled}
            className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full border border-oro-400/70 bg-marfil px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500 disabled:opacity-50 sm:hidden"
          >
            <Camera className="h-3.5 w-3.5" aria-hidden="true" /> Tomar foto
          </button>
        </div>

        {error ? (
          <p id={errorId} role="alert" className="mt-1.5 text-xs text-terracotta-700">
            {error}
          </p>
        ) : (
          <p id={ayudaId} className="mt-1.5 text-[11px] leading-snug text-verde-600">
            JPG, PNG o WebP · máx. {FOTO_MAX_MB} MB. Se verá en la carta de los clientes.
          </p>
        )}
      </div>
    </div>
  );
};
