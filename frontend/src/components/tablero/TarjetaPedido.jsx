import React, { memo } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { Send, Flame, Check, CheckCheck, X, Clock, QrCode, MessageSquare, Loader2 } from 'lucide-react';
import { Button } from '../Button';
import { Badge } from '../StatusBadge';
import { money } from '../Stats';
import {
  ACCION_PRINCIPAL,
  ACCIONES,
  SUBESTADO,
  cantidadProductos,
  esCancelable,
  esQR,
  haceCuanto,
  horaCorta,
  itemsDe,
  lugarDe,
  minutosDesde,
  origenDe,
} from './utils';

const EASE = [0.22, 1, 0.36, 1];

// Botón principal de cada paso
const BOTON = {
  confirm: { variant: 'primary', Icono: Send },
  send_to_kitchen: { variant: 'accent', Icono: Flame },
  mark_ready: { variant: 'success', Icono: Check },
  complete: { variant: 'primary', Icono: CheckCheck },
};

const COMPACTO = '!min-h-[30px] !px-3 !text-[10px] !tracking-[0.12em]';
const BADGE_MINI = '!px-2 !py-0.5 !text-[9px] !tracking-[0.1em]';
// A partir de estos minutos sin entregar, el tiempo se pinta en terracota
const MINUTOS_DEMORA = 15;

const etiquetaResalte = (status) => {
  if (status === 'pendiente') return 'Nuevo';
  if (status === 'lista') return 'Listo';
  return 'Actualizado';
};

const Animada = ({ children }) => {
  const reducir = useReducedMotion();
  return (
    <motion.li
      layout={reducir ? false : 'position'}
      initial={reducir ? false : { opacity: 0, y: 14, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={reducir ? { opacity: 0, transition: { duration: 0 } } : { opacity: 0, scale: 0.96, transition: { duration: 0.15 } }}
      transition={{ duration: 0.3, ease: EASE }}
    >
      {children}
    </motion.li>
  );
};

// Tarjeta compacta de la columna ENTREGADO
const TarjetaEntregada = ({ pedido, resaltado }) => {
  const { titulo, detalle } = lugarDe(pedido);
  return (
    <Animada>
      <article
        aria-label={`${titulo}${detalle ? ` · ${detalle}` : ''}, entregado, ${pedido.is_paid ? 'pagado' : 'por cobrar'}`}
        className={`rounded-xl border bg-marfil px-3 py-2 transition-shadow ${
          resaltado ? 'border-oro-400 shadow-soft ring-2 ring-oro-300' : 'border-oro-200/70'
        }`}
      >
        <div className="flex items-center justify-between gap-2">
          <p className="min-w-0 truncate leading-tight">
            <span className="font-serif text-[15px] italic font-medium text-verde-700">{titulo}</span>
            {detalle && <span className="text-[11px] text-verde-600"> · {detalle}</span>}
          </p>
          <Badge tone={pedido.is_paid ? 'sage' : 'honey'} className={`shrink-0 ${BADGE_MINI}`}>
            {pedido.is_paid ? 'Pagado' : 'Por cobrar'}
          </Badge>
        </div>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-verde-600">
          {esQR(pedido) && (
            <span className="inline-flex items-center gap-1 text-cobalto-600">
              <QrCode className="h-3 w-3" aria-hidden="true" />
              {origenDe(pedido)}
              <span aria-hidden="true" className="text-verde-600">·</span>
            </span>
          )}
          <span>Entregado {horaCorta(pedido.completed_at || pedido.updated_at)}</span>
          <span className="ml-auto font-serif text-[13px] italic font-medium text-verde-700">{money(pedido.total)}</span>
        </p>
      </article>
    </Animada>
  );
};

const TarjetaActiva = ({
  pedido,
  ahora,
  resaltado,
  ocupado,
  mostrarLocal,
  arrastrable,
  onAccion,
  onCancelar,
  onArrastreInicio,
  onArrastreFin,
}) => {
  const { titulo, detalle } = lugarDe(pedido);
  const qr = esQR(pedido);
  const lista = pedido.status === 'lista';
  const accion = ACCION_PRINCIPAL[pedido.status];
  const boton = accion ? BOTON[accion] : null;
  const cancelable = esCancelable(pedido);
  const demorado = minutosDesde(pedido.created_at, ahora) >= MINUTOS_DEMORA;
  const items = itemsDe(pedido);
  const sub = SUBESTADO[pedido.status];
  const notaPedido = pedido.notes || pedido.kitchen_notes || '';
  const puedeArrastrar = arrastrable && !ocupado;

  const marco = resaltado
    ? 'border-oro-400 bg-marfil shadow-lift ring-2 ring-oro-300'
    : lista
      ? 'border-verde-500/50 bg-pistacho-100 shadow-soft ring-1 ring-pistacho-400'
      : 'border-oro-200/80 bg-marfil shadow-soft';

  const alEmpezarArrastre = (e) => {
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(pedido.id));
    onArrastreInicio(pedido.id);
  };

  return (
    <Animada>
      <article
        draggable={puedeArrastrar}
        onDragStart={puedeArrastrar ? alEmpezarArrastre : undefined}
        onDragEnd={puedeArrastrar ? onArrastreFin : undefined}
        aria-label={`${titulo}${detalle ? ` · ${detalle}` : ''}, ${sub ? sub.etiqueta : pedido.status}`}
        aria-busy={ocupado || undefined}
        className={`relative rounded-2xl border px-3 pb-2.5 pt-2.5 transition-[box-shadow,opacity] duration-300 ${marco} ${
          puedeArrastrar ? 'cursor-grab active:cursor-grabbing' : ''
        } ${ocupado ? 'opacity-70' : ''}`}
      >
        {resaltado && (
          <span className="absolute -top-2 left-3 rounded-full bg-oro-400 px-2 py-px text-[9px] font-medium uppercase tracking-[0.16em] text-verde-800 shadow-soft">
            {etiquetaResalte(pedido.status)}
          </span>
        )}

        {/* Mesa y origen */}
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            {mostrarLocal && pedido.cafeteria_name && (
              <p className="truncate text-[9px] font-medium uppercase tracking-[0.18em] text-oro-600">{pedido.cafeteria_name}</p>
            )}
            <p className="truncate leading-tight">
              <span className="font-serif text-[1.05rem] italic font-medium text-verde-700">{titulo}</span>
              {detalle && <span className="text-[12px] text-verde-600"> · {detalle}</span>}
            </p>
          </div>
          <Badge tone={qr ? 'slate' : 'neutral'} className={`max-w-[55%] shrink-0 truncate ${BADGE_MINI}`}>
            {origenDe(pedido)}
          </Badge>
        </div>

        {/* Hora y tiempo transcurrido */}
        <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-[11px] text-verde-600">
          <Clock className="h-3 w-3 shrink-0 text-oro-600" aria-hidden="true" />
          <span>{horaCorta(pedido.created_at)}</span>
          <span aria-hidden="true">·</span>
          <span className={demorado ? 'font-medium text-terracotta-700' : ''}>{haceCuanto(pedido.created_at, ahora)}</span>
          {pedido.order_number && (
            <span className="ml-auto text-[10px] tracking-[0.04em] text-verde-600/80">{pedido.order_number}</span>
          )}
        </p>

        {/* Ítems estilo comanda */}
        {items.length > 0 ? (
          <ul className="mt-2 space-y-1 border-t border-dashed border-oro-300/80 pt-2">
            {items.map((it) => (
              <li key={it.clave} className="text-[13px] leading-snug text-verde-800">
                <span className="mr-1 font-serif italic font-medium text-oro-600">{it.cantidad}×</span>
                {it.nombre}
                {it.nota && (
                  <span className="mt-0.5 flex items-start gap-1 pl-4 text-[11px] italic leading-snug text-terracotta-700">
                    <MessageSquare className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />
                    {it.nota}
                  </span>
                )}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-2 border-t border-dashed border-oro-300/80 pt-2 text-[12px] text-verde-600">
            {cantidadProductos(pedido)} {cantidadProductos(pedido) === 1 ? 'producto' : 'productos'}
          </p>
        )}

        {notaPedido && (
          <p className="mt-1.5 rounded-lg bg-oro-50 px-2 py-1 text-[11px] leading-snug text-oro-700 ring-1 ring-oro-200">
            <span className="font-medium">Nota:</span> {notaPedido}
          </p>
        )}

        {/* Subestado y total */}
        <div className="mt-2 flex items-center justify-between gap-2">
          {pedido.status === 'pendiente' ? (
            <span className="text-[11px] text-verde-600">
              {cantidadProductos(pedido)} {cantidadProductos(pedido) === 1 ? 'producto' : 'productos'}
            </span>
          ) : (
            sub && (
              <Badge tone={sub.tono} className={BADGE_MINI}>
                {sub.etiqueta}
              </Badge>
            )
          )}
          <span className="font-serif text-[1.05rem] italic font-medium leading-none text-verde-700">{money(pedido.total)}</span>
        </div>

        {/* Acciones: siguiente paso con un clic */}
        {boton && (
          <div className="mt-2 flex items-center gap-1.5">
            <Button
              size="sm"
              variant={boton.variant}
              disabled={ocupado}
              onClick={() => onAccion(pedido, accion)}
              className={`flex-1 ${COMPACTO}`}
            >
              {ocupado ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <boton.Icono className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {ACCIONES[accion].etiqueta}
            </Button>
            {cancelable &&
              (pedido.status === 'pendiente' ? (
                <Button size="sm" variant="danger" disabled={ocupado} onClick={() => onCancelar(pedido.id)} className={COMPACTO}>
                  Cancelar
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={ocupado}
                  onClick={() => onCancelar(pedido.id)}
                  aria-label={`Cancelar pedido ${pedido.order_number || titulo}`}
                  title="Cancelar pedido"
                  className="!min-h-[30px] !px-2"
                >
                  <X className="h-3.5 w-3.5" aria-hidden="true" />
                </Button>
              ))}
          </div>
        )}
      </article>
    </Animada>
  );
};

export const TarjetaPedido = memo((props) =>
  props.pedido.status === 'entregada' ? (
    <TarjetaEntregada pedido={props.pedido} resaltado={props.resaltado} />
  ) : (
    <TarjetaActiva {...props} />
  )
);
TarjetaPedido.displayName = 'TarjetaPedido';
