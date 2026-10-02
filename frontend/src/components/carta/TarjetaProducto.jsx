import React from 'react';
import { Clock, Pencil, RotateCcw, Trash2 } from 'lucide-react';
import { money } from '../Stats';
import { FotoItem } from '../cliente/ui';
import { BotonIcono, Etiqueta, Interruptor } from './ui';

// Tarjeta compacta de un producto de la carta.
// gestiona: editar, quitar y reactivar; disponibilidad: interruptor Disponible/Agotado (gestión y gerente).
export const TarjetaProducto = ({
  item,
  icono,
  gestiona = false,
  disponibilidad = false,
  ocupado = false,
  onDisponible,
  onEditar,
  onQuitar,
  onReactivar,
}) => {
  const inactivo = !item.is_active;
  const agotado = !item.is_available;
  const foto = item.image_thumb || item.image;
  // El margen solo llega para quien gestiona la carta (el backend no lo envía a los demás)
  const margen = gestiona && item.profit_margin != null && Number(item.cost) > 0 ? Math.round(item.profit_margin) : null;
  const conAcciones = gestiona || (disponibilidad && !inactivo);

  return (
    <article
      className={`flex gap-2.5 rounded-2xl border p-2 shadow-soft sm:p-2.5 ${
        inactivo ? 'border-dashed border-oro-300 bg-crema/70' : 'border-oro-200/80 bg-marfil'
      }`}
    >
      <FotoItem
        key={foto || 'sin-foto'}
        src={foto}
        icono={icono}
        className={`h-16 w-16 shrink-0 rounded-xl ring-1 ring-oro-200 ${agotado || inactivo ? 'opacity-60 grayscale' : ''}`}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex items-start gap-2">
          <h3
            className={`min-w-0 flex-1 truncate font-serif text-[15px] italic font-medium leading-snug ${
              inactivo ? 'text-verde-600' : 'text-verde-700'
            }`}
            title={item.name}
          >
            {item.name}
          </h3>
          <span className={`shrink-0 text-[13.5px] font-semibold ${inactivo ? 'text-verde-600' : 'text-verde-800'}`}>
            {money(item.price)}
          </span>
        </div>
        {item.description && (
          <p className="truncate text-[11.5px] leading-snug text-verde-600" title={item.description}>
            {item.description}
          </p>
        )}

        {/* Etiquetas y datos separados por espacio (sin «·»: al partirse la línea no queda un separador suelto) */}
        <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1">
          {inactivo ? (
            <Etiqueta tono="neutro">Desactivado</Etiqueta>
          ) : (
            agotado && <Etiqueta tono="terracota">Agotado</Etiqueta>
          )}
          {item.is_vegan ? (
            <Etiqueta tono="verde">Vegano</Etiqueta>
          ) : (
            item.is_vegetarian && <Etiqueta tono="verde">Vegetariano</Etiqueta>
          )}
          {item.has_gluten && <Etiqueta tono="oro">Gluten</Etiqueta>}
          {item.preparation_time > 0 && (
            <span className="inline-flex items-center gap-0.5 whitespace-nowrap text-[10.5px] text-verde-600">
              <Clock className="h-3 w-3 text-oro-600" aria-hidden="true" />
              {item.preparation_time} min
            </span>
          )}
          {margen !== null && (
            <span className={`whitespace-nowrap text-[10.5px] ${margen < 30 ? 'text-oro-700' : 'text-verde-600'}`}>
              {margen} % margen
            </span>
          )}
        </div>

        {conAcciones && (
          <div className="mt-auto flex items-center justify-between gap-1 pt-1">
            {inactivo ? (
              <button
                type="button"
                onClick={() => onReactivar(item)}
                disabled={ocupado}
                className="inline-flex min-h-[32px] items-center gap-1.5 rounded-full px-2 text-[10.5px] font-medium uppercase tracking-[0.12em] text-cobalto-500 transition-colors hover:bg-cobalto-50 disabled:cursor-wait disabled:opacity-60"
              >
                <RotateCcw className="h-3.5 w-3.5" aria-hidden="true" /> Reactivar
              </button>
            ) : (
              <Interruptor
                activo={!agotado}
                onChange={(valor) => onDisponible(item, valor)}
                etiqueta={`${item.name}: disponible`}
                textoSi="Disponible"
                textoNo="Agotado"
                disabled={ocupado}
              />
            )}
            {gestiona && (
              <div className="flex items-center">
                <BotonIcono icon={Pencil} etiqueta={`Editar ${item.name}`} onClick={() => onEditar(item)} />
                <BotonIcono icon={Trash2} etiqueta={`Quitar ${item.name}`} tono="peligro" onClick={() => onQuitar(item)} />
              </div>
            )}
          </div>
        )}
      </div>
    </article>
  );
};
