import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion, useReducedMotion } from 'framer-motion';
import toast from 'react-hot-toast';
import { BookOpen, Clock, Hand, Plus, RefreshCw, Send, ShoppingBag, Trash2, WifiOff } from 'lucide-react';
import { sonar, vibrar } from '../../lib/avisos';
import { cliente, codigoError, mensajeError } from '../../services/clienteApi';
import { money } from '../../components/Stats';
import { BottomSheet } from '../../components/cliente/BottomSheet';
import { useComensal } from '../../components/cliente/ComensalContext';
import { MAX_CANTIDAD, MAX_LINEAS, MAX_NOTA_GENERAL, MAX_NOTA_ITEM } from '../../components/cliente/carrito';
import { Aviso, Cantidad, EtiquetasDieta, FilaTotal, FotoItem } from '../../components/cliente/ui';
import { emojiCategoria } from '../../components/cliente/utils';

const aviso = { position: 'top-center' };
const ANILLO = { boxShadow: 'inset 0 0 0 3px #2A4520, inset 0 0 0 4px #C9A64F' };

// ---------- Esqueleto de carga ----------
const Esqueleto = () => (
  <div className="space-y-3 pt-2" role="status" aria-label="Cargando el menú">
    <div className="h-6 w-40 animate-pulse rounded-full bg-pistacho-100 motion-reduce:animate-none" />
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => (
        <div key={i} className="h-8 w-24 animate-pulse rounded-full bg-pistacho-100 motion-reduce:animate-none" />
      ))}
    </div>
    {[0, 1, 2, 3].map((i) => (
      <div key={i} className="flex gap-3 rounded-2xl border border-oro-200/60 bg-marfil p-2.5">
        <div className="h-20 w-20 animate-pulse rounded-xl bg-pistacho-100 motion-reduce:animate-none" />
        <div className="flex-1 space-y-2 py-1">
          <div className="h-4 w-2/3 animate-pulse rounded bg-pistacho-100 motion-reduce:animate-none" />
          <div className="h-3 w-full animate-pulse rounded bg-pistacho-50 motion-reduce:animate-none" />
          <div className="h-3 w-1/2 animate-pulse rounded bg-pistacho-50 motion-reduce:animate-none" />
        </div>
      </div>
    ))}
  </div>
);

// ---------- Tarjeta de producto ----------
const TarjetaItem = ({ item, enCarrito, soloLectura, onAbrir }) => (
  <li className="flex gap-3 rounded-2xl border border-oro-200/70 bg-marfil p-2.5 shadow-soft">
    <button
      type="button"
      onClick={onAbrir}
      className="flex min-w-0 flex-1 gap-3 rounded-xl text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cobalto-200"
      aria-label={`${item.nombre}, ${money(item.precio)}. Ver detalles`}
    >
      <span className="relative shrink-0">
        <FotoItem src={item.miniatura || item.imagen} icono={item.icono} className="h-20 w-20 rounded-xl ring-1 ring-oro-200" />
        {enCarrito > 0 && (
          <span className="absolute -left-1.5 -top-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-cobalto-500 px-1 text-[10px] font-semibold text-marfil ring-2 ring-marfil">
            {enCarrito}
          </span>
        )}
      </span>
      <span className="flex min-w-0 flex-1 flex-col py-0.5">
        <span className="font-serif text-[15.5px] italic font-medium leading-snug text-verde-700">{item.nombre}</span>
        {item.descripcion && <span className="mt-0.5 line-clamp-2 text-[12px] leading-snug text-verde-600">{item.descripcion}</span>}
        <EtiquetasDieta item={item} className="mt-auto pt-1.5" />
      </span>
    </button>
    <div className="flex shrink-0 flex-col items-end justify-between py-0.5">
      <span className="text-[13.5px] font-semibold text-verde-800">{money(item.precio)}</span>
      {!soloLectura && (
        <button
          type="button"
          onClick={onAbrir}
          aria-label={`Agregar ${item.nombre}`}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-verde-700 text-marfil transition-colors hover:bg-cobalto-500 active:scale-95"
          style={ANILLO}
        >
          <Plus className="h-4 w-4" aria-hidden="true" />
        </button>
      )}
    </div>
  </li>
);

// ---------- Hoja de detalle del producto ----------
const DetalleItem = ({ item: abierto, soloLectura, onCerrar, onAgregar }) => {
  const [cantidad, setCantidad] = useState(1);
  const [nota, setNota] = useState('');
  // Se conserva el último producto para que la hoja no quede vacía mientras se cierra
  const [item, setItem] = useState(abierto);
  const notaId = useId();

  useEffect(() => {
    if (!abierto) return;
    setItem(abierto);
    setCantidad(1);
    setNota('');
  }, [abierto]);

  const total = item ? Number(item.precio) * cantidad : 0;

  return (
    <BottomSheet
      open={!!abierto}
      onClose={onCerrar}
      title={item?.nombre || ''}
      eyebrow={item?.categoria}
      cabecera={
        item && (
          <FotoItem src={item.imagen} alt={item.nombre} icono={item.icono} grande className="aspect-[16/9] max-h-[36vh] w-full" />
        )
      }
      footer={
        soloLectura ? (
          <p className="text-center text-[13px] text-verde-600">Tu cuenta ya fue pagada: no puedes agregar productos.</p>
        ) : (
          <button
            type="button"
            onClick={() => onAgregar(item, cantidad, nota)}
            className="btn-primary min-h-[48px] w-full px-5 text-[12.5px]"
          >
            Agregar · {money(total)}
          </button>
        )
      }
    >
      {item && (
        <>
          <div className="flex items-center justify-between gap-3">
            <span className="font-serif text-xl italic text-verde-800">{money(item.precio)}</span>
            <span className="flex items-center gap-2">
              <EtiquetasDieta item={item} />
              {item.tiempo ? (
                <span className="inline-flex items-center gap-1 text-[11px] text-verde-600">
                  <Clock className="h-3.5 w-3.5" aria-hidden="true" />≈ {item.tiempo} min
                </span>
              ) : null}
            </span>
          </div>
          {item.descripcion && <p className="mt-2 text-[13.5px] leading-relaxed text-verde-600">{item.descripcion}</p>}

          {!soloLectura && (
            <>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="label mb-0">Cantidad</span>
                <Cantidad valor={cantidad} onChange={setCantidad} max={MAX_CANTIDAD} nombre={item.nombre} />
              </div>
              <div className="mt-4">
                <label htmlFor={notaId} className="label">
                  Nota para la cocina <span className="normal-case tracking-normal text-verde-600/70">(opcional)</span>
                </label>
                <input
                  id={notaId}
                  className="input py-2.5 text-[14px]"
                  value={nota}
                  onChange={(e) => setNota(e.target.value.slice(0, MAX_NOTA_ITEM))}
                  maxLength={MAX_NOTA_ITEM}
                  placeholder="Ej.: sin azúcar, leche de almendra"
                  enterKeyHint="done"
                />
                <p className="mt-1 text-right text-[10.5px] text-verde-600/70">
                  {nota.length}/{MAX_NOTA_ITEM}
                </p>
              </div>
            </>
          )}
        </>
      )}
    </BottomSheet>
  );
};

// ---------- Línea editable del carrito ----------
const LineaCarrito = ({ linea, carrito }) => {
  const [editando, setEditando] = useState(false);
  const notaId = useId();
  return (
    <li className="py-3">
      <div className="flex gap-3">
        <FotoItem src={linea.imagen} icono={linea.icono} className="h-12 w-12 shrink-0 rounded-lg ring-1 ring-oro-200" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <p className="font-serif text-[15px] italic leading-snug text-verde-800">{linea.nombre}</p>
            <p className="shrink-0 text-[13px] font-semibold text-verde-800">{money(Number(linea.precio) * linea.cantidad)}</p>
          </div>
          <p className="text-[11px] text-verde-600">{money(linea.precio)} c/u</p>
          {editando ? (
            <div className="mt-1.5">
              <label htmlFor={notaId} className="sr-only">
                Nota para {linea.nombre}
              </label>
              <input
                id={notaId}
                autoFocus
                className="input py-1.5 text-[13px]"
                value={linea.nota}
                onChange={(e) => carrito.cambiarNota(linea.uid, e.target.value)}
                onBlur={() => setEditando(false)}
                onKeyDown={(e) => e.key === 'Enter' && setEditando(false)}
                maxLength={MAX_NOTA_ITEM}
                placeholder="Ej.: sin azúcar"
              />
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setEditando(true)}
              className="mt-0.5 text-left text-[12px] text-cobalto-500 underline decoration-oro-300 underline-offset-2"
            >
              {linea.nota ? <span className="italic">“{linea.nota}”</span> : 'Agregar nota'}
            </button>
          )}
          <div className="mt-2 flex items-center justify-between">
            <Cantidad
              compacto
              valor={linea.cantidad}
              onChange={(n) => carrito.cambiarCantidad(linea.uid, n)}
              max={MAX_CANTIDAD}
              nombre={linea.nombre}
            />
            <button
              type="button"
              onClick={() => carrito.quitar(linea.uid)}
              aria-label={`Quitar ${linea.nombre} del pedido`}
              className="flex h-8 w-8 items-center justify-center rounded-full text-terracotta-700 transition-colors hover:bg-terracotta-100"
            >
              <Trash2 className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </li>
  );
};

// ---------- Hoja del carrito ----------
const CarritoSheet = ({ open, onCerrar, onEnviado, onMenuDesactualizado }) => {
  const { carrito } = useComensal();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const enviandoRef = useRef(false);
  const notaId = useId();

  useEffect(() => {
    if (open) setError(null);
  }, [open]);

  const enviar = async () => {
    if (enviandoRef.current || !carrito.lineas.length) return;
    enviandoRef.current = true;
    setEnviando(true);
    setError(null);
    try {
      await cliente.crearPedido({
        items: carrito.lineas.map((l) => ({
          menu_item: l.id,
          cantidad: l.cantidad,
          ...(l.nota ? { nota: l.nota } : {}),
        })),
        nota: carrito.nota.trim() || undefined,
      });
      sonar('ok');
      vibrar([60]);
      toast.success('¡Pedido enviado!', aviso);
      carrito.vaciar();
      onEnviado();
    } catch (e) {
      const status = e?.response?.status;
      if (status === 429) {
        // El aviso con los segundos ya lo muestra el cliente HTTP
      } else if (codigoError(e) === 'sesion_pagada') {
        setError('Tu cuenta ya fue pagada: ya no puedes enviar pedidos.');
      } else if (codigoError(e) === 'producto_no_disponible') {
        // Se recarga el menú: el carrito se sincroniza y quita lo que ya no se ofrece
        setError(mensajeError(e, 'Uno de los productos ya no está disponible.'));
        onMenuDesactualizado();
      } else {
        setError(mensajeError(e, 'No pudimos enviar tu pedido. Inténtalo de nuevo.'));
      }
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  };

  const vacio = carrito.lineas.length === 0;

  return (
    <BottomSheet
      open={open}
      onClose={onCerrar}
      eyebrow="Revisa antes de enviar"
      title="Tu pedido"
      footer={
        !vacio && (
          <button
            type="button"
            onClick={enviar}
            disabled={enviando}
            className="btn-primary min-h-[48px] w-full px-5 text-[12.5px] disabled:opacity-60"
          >
            <Send className="h-4 w-4" aria-hidden="true" />
            {enviando ? 'Enviando…' : `Enviar pedido · ${money(carrito.total)}`}
          </button>
        )
      }
    >
      {vacio ? (
        <p className="py-6 text-center text-sm text-verde-600">Tu pedido está vacío. Agrega algo del menú.</p>
      ) : (
        <>
          {error && (
            <p role="alert" className="mb-2 rounded-2xl bg-terracotta-100/70 px-3 py-2 text-[13px] text-terracotta-700">
              {error}
            </p>
          )}
          <ul className="divide-y divide-oro-200/70">
            {carrito.lineas.map((l) => (
              <LineaCarrito key={l.uid} linea={l} carrito={carrito} />
            ))}
          </ul>

          <div className="mt-2">
            <label htmlFor={notaId} className="label">
              Nota general <span className="normal-case tracking-normal text-verde-600/70">(opcional)</span>
            </label>
            <textarea
              id={notaId}
              rows={2}
              className="input resize-none py-2 text-[13.5px]"
              value={carrito.nota}
              onChange={(e) => carrito.setNotaGeneral(e.target.value)}
              maxLength={MAX_NOTA_GENERAL}
              placeholder="Ej.: traer todo junto, por favor"
            />
          </div>

          <div className="mt-4 space-y-1 rounded-2xl bg-crema px-3.5 py-3 ring-1 ring-oro-200/70">
            <FilaTotal etiqueta="Subtotal" valor={money(carrito.subtotal)} />
            <FilaTotal etiqueta="IVA 15 %" valor={money(carrito.iva)} />
            <FilaTotal etiqueta="Total estimado" valor={money(carrito.total)} fuerte className="pt-1" />
          </div>

          <button
            type="button"
            onClick={carrito.vaciar}
            className="mx-auto mt-3 block text-[12px] text-verde-600 underline decoration-oro-300 underline-offset-4 hover:text-terracotta-700"
          >
            Vaciar pedido
          </button>
        </>
      )}
    </BottomSheet>
  );
};

// ---------- Pantalla del menú ----------
export const MenuCliente = () => {
  const { carrito, pagada } = useComensal();
  const navigate = useNavigate();
  const reduce = useReducedMotion();

  const [menu, setMenu] = useState(null);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState(null);
  const [itemAbierto, setItemAbierto] = useState(null);
  const [carritoAbierto, setCarritoAbierto] = useState(false);
  const [activa, setActiva] = useState(null);

  const tabsRef = useRef(null);
  const bloqueoSpy = useRef(false);
  const bloqueoTimer = useRef(null);
  const sincronizarRef = useRef(carrito.sincronizar);
  sincronizarRef.current = carrito.sincronizar;

  const cargar = useCallback(async () => {
    setCargando(true);
    setError(null);
    try {
      const { data } = await cliente.menu();
      setMenu(data);
    } catch (e) {
      setError(mensajeError(e, 'No pudimos cargar el menú.'));
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    cargar();
  }, [cargar]);

  // Categorías con productos; cada producto conoce su categoría (para el placeholder)
  const categorias = useMemo(
    () =>
      (menu?.categorias || [])
        .map((c) => ({
          ...c,
          // Los productos sin categoría llegan en "Otros" con id null
          id: c.id ?? 'otros',
          items: (c.items || []).map((it) => ({ ...it, icono: c.icono, categoria: c.nombre })),
        }))
        .filter((c) => c.items.length > 0),
    [menu]
  );

  // Precios y nombres del carrito al día con el menú; quitar lo que ya no se ofrece
  useEffect(() => {
    if (!menu) return;
    const porId = new Map();
    categorias.forEach((c) => c.items.forEach((it) => porId.set(it.id, it)));
    const retirados = sincronizarRef.current(porId);
    if (retirados.length) {
      toast(`Quitamos de tu pedido lo que ya no está disponible: ${retirados.join(', ')}.`, {
        ...aviso,
        icon: 'ℹ️',
        duration: 5000,
      });
    }
  }, [menu, categorias]);

  useEffect(() => {
    if (categorias.length && !activa) setActiva(String(categorias[0].id));
  }, [categorias, activa]);

  // Scroll-spy: la categoría visible más arriba es la activa. Al llegar al fondo de la página se activa la
  // última (las categorías cortas del final nunca llegan a la franja de arriba)
  useEffect(() => {
    if (!categorias.length || typeof IntersectionObserver === 'undefined') return undefined;
    const visibles = new Set();
    const orden = categorias.map((c) => String(c.id));
    // Solo si la página se desplaza: una carta corta está "al fondo" desde el inicio
    const alFondo = () => {
      const alto = document.documentElement.scrollHeight;
      return alto > window.innerHeight + 4 && window.scrollY > 0 && window.innerHeight + window.scrollY >= alto - 4;
    };
    const obs = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) visibles.add(e.target.dataset.cat);
          else visibles.delete(e.target.dataset.cat);
        });
        if (bloqueoSpy.current) return;
        const primera = alFondo() ? orden[orden.length - 1] : orden.find((id) => visibles.has(id));
        if (primera) setActiva(primera);
      },
      { rootMargin: '-64px 0px -55% 0px', threshold: 0 }
    );
    orden.forEach((id) => {
      const el = document.getElementById(`cat-${id}`);
      if (el) obs.observe(el);
    });
    const alDesplazar = () => {
      if (!bloqueoSpy.current && alFondo()) setActiva(orden[orden.length - 1]);
    };
    window.addEventListener('scroll', alDesplazar, { passive: true });
    return () => {
      obs.disconnect();
      window.removeEventListener('scroll', alDesplazar);
    };
  }, [categorias]);

  // La pestaña activa siempre a la vista dentro de la barra
  useEffect(() => {
    const cont = tabsRef.current;
    const tab = cont?.querySelector(`[data-tab="${activa}"]`);
    if (!cont || !tab) return;
    const destino = tab.offsetLeft - cont.clientWidth / 2 + tab.clientWidth / 2;
    cont.scrollTo({ left: Math.max(0, destino), behavior: reduce ? 'auto' : 'smooth' });
  }, [activa, reduce]);

  useEffect(() => () => clearTimeout(bloqueoTimer.current), []);

  const irACategoria = (id) => {
    const el = document.getElementById(`cat-${id}`);
    if (!el) return;
    setActiva(String(id));
    bloqueoSpy.current = true;
    clearTimeout(bloqueoTimer.current);
    bloqueoTimer.current = setTimeout(() => {
      bloqueoSpy.current = false;
    }, 800);
    el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
  };

  const agregar = (item, cantidad, nota) => {
    const ok = carrito.agregar(item, cantidad, nota);
    if (!ok) {
      toast.error(`Tu pedido ya tiene ${MAX_LINEAS} productos distintos. Envíalo y sigue pidiendo.`, aviso);
      return;
    }
    vibrar([30]);
    toast.success(`Agregado: ${cantidad} × ${item.nombre}`, { ...aviso, id: 'agregado', duration: 1800 });
    setItemAbierto(null);
  };

  const cantidadPorItem = useMemo(() => {
    const m = new Map();
    carrito.lineas.forEach((l) => m.set(l.id, (m.get(l.id) || 0) + l.cantidad));
    return m;
  }, [carrito.lineas]);

  if (cargando && !menu) return <Esqueleto />;

  if (error && !menu) {
    return (
      <Aviso
        icon={WifiOff}
        titulo="No pudimos cargar el menú"
        className="mt-4"
        accion={
          <button type="button" onClick={cargar} className="btn-primary min-h-[44px] px-6 text-[12px]">
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Reintentar
          </button>
        }
      >
        {error}
      </Aviso>
    );
  }

  const local = menu?.local;
  const mostrarBoton = !pagada && carrito.cantidad > 0;

  return (
    <div>
      {/* Presentación de la carta */}
      {local?.banner ? (
        <div className="relative -mx-1 mb-3 overflow-hidden rounded-2xl ring-1 ring-oro-200">
          <img src={local.banner} alt="" className="h-28 w-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-t from-verde-900/70 via-verde-900/10 to-transparent" aria-hidden="true" />
          <div className="absolute bottom-2.5 left-3.5">
            <p className="font-script text-lg leading-none text-oro-200">La carta</p>
            <h1 className="font-serif text-[1.4rem] italic font-medium leading-tight text-marfil">¿Qué se te antoja?</h1>
          </div>
        </div>
      ) : (
        <div className="mb-2">
          <p className="font-script text-[19px] leading-none text-oro-600">La carta</p>
          <h1 className="font-serif text-[1.5rem] italic font-medium leading-tight text-verde-700">¿Qué se te antoja?</h1>
        </div>
      )}
      <p className="mb-1 text-[11.5px] text-verde-600/80">Toca un producto para ver detalles. Precios sin IVA.</p>

      {categorias.length === 0 ? (
        <Aviso icon={BookOpen} titulo="La carta aún no está lista" className="mt-4">
          No hay productos disponibles en este momento. Llama al mesero si necesitas ayuda.
        </Aviso>
      ) : (
        <>
          {/* Pestañas de categorías, pegajosas */}
          <nav aria-label="Categorías del menú" className="sticky top-0 z-20 -mx-4 border-b border-oro-200/80 bg-crema/95 backdrop-blur">
            <div ref={tabsRef} className="flex gap-1.5 overflow-x-auto px-4 py-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {categorias.map((c) => {
                const sel = activa === String(c.id);
                const emoji = emojiCategoria(c.icono);
                return (
                  <button
                    key={c.id}
                    type="button"
                    data-tab={String(c.id)}
                    onClick={() => irACategoria(c.id)}
                    aria-current={sel ? 'true' : undefined}
                    className={`inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full px-3.5 py-1.5 text-[11.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
                      sel ? 'bg-verde-700 text-marfil' : 'border border-oro-300/70 bg-marfil text-verde-700 hover:text-cobalto-500'
                    }`}
                  >
                    {emoji && (
                      <span className="text-[13px] normal-case tracking-normal" aria-hidden="true">
                        {emoji}
                      </span>
                    )}
                    {c.nombre}
                  </button>
                );
              })}
            </div>
          </nav>

          {categorias.map((c) => {
            const emoji = emojiCategoria(c.icono);
            return (
              <section key={c.id} id={`cat-${c.id}`} data-cat={String(c.id)} aria-labelledby={`tit-${c.id}`} className="scroll-mt-14 pt-5">
                <div className="mb-2.5 flex items-center gap-2.5">
                  {emoji && (
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pistacho-100 text-base ring-1 ring-oro-300" aria-hidden="true">
                      {emoji}
                    </span>
                  )}
                  <h2 id={`tit-${c.id}`} className="font-serif text-[1.3rem] italic font-medium leading-tight text-verde-700">
                    {c.nombre}
                  </h2>
                  <span className="flex flex-1 items-center gap-1.5" aria-hidden="true">
                    <span className="h-px flex-1 bg-oro-300/80" />
                    <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" />
                  </span>
                </div>
                <ul className="space-y-2.5">
                  {c.items.map((it) => (
                    <TarjetaItem
                      key={it.id}
                      item={it}
                      enCarrito={cantidadPorItem.get(it.id) || 0}
                      soloLectura={pagada}
                      onAbrir={() => setItemAbierto(it)}
                    />
                  ))}
                </ul>
              </section>
            );
          })}

          <div className="mt-8 flex flex-col items-center gap-1 text-center text-[11.5px] text-verde-600/80">
            <Hand className="h-4 w-4 text-oro-500" aria-hidden="true" />
            ¿Dudas o alergias? Llama al mesero desde “Cuenta”.
          </div>
        </>
      )}

      {/* Botón flotante del carrito */}
      <AnimatePresence>
        {mostrarBoton && (
          <motion.div
            key="boton-carrito"
            initial={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 24 }}
            className="pointer-events-none fixed inset-x-0 bottom-[calc(3.5rem_+_env(safe-area-inset-bottom))] z-30 mx-auto max-w-[480px] px-4 pb-3 print:hidden"
          >
            <button
              type="button"
              onClick={() => setCarritoAbierto(true)}
              className="pointer-events-auto flex min-h-[50px] w-full items-center justify-between gap-3 rounded-full bg-verde-700 px-5 text-marfil shadow-lift transition-colors hover:bg-cobalto-500"
              style={ANILLO}
              aria-label={`Ver pedido: ${carrito.cantidad} producto${carrito.cantidad === 1 ? '' : 's'}, ${money(carrito.subtotal)}`}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium uppercase tracking-[0.16em]">
                <ShoppingBag className="h-4 w-4 text-oro-300" aria-hidden="true" />
                Ver pedido
              </span>
              <span className="text-[13px] font-medium">
                {carrito.cantidad} · {money(carrito.subtotal)}
              </span>
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <DetalleItem item={itemAbierto} soloLectura={pagada} onCerrar={() => setItemAbierto(null)} onAgregar={agregar} />
      <CarritoSheet
        open={carritoAbierto && !pagada}
        onCerrar={() => setCarritoAbierto(false)}
        onMenuDesactualizado={cargar}
        onEnviado={() => {
          setCarritoAbierto(false);
          navigate('/mesa/pedidos');
        }}
      />
    </div>
  );
};
