import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BookOpen, Plus, Search, SearchX, Tags } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { fetchAll } from '../services/api';
import { useCarta } from '../components/carta/useCarta';
import { TarjetaProducto } from '../components/carta/TarjetaProducto';
import { ProductoForm } from '../components/carta/ProductoForm';
import { CategoriasModal } from '../components/carta/CategoriasModal';
import { QuitarProducto } from '../components/carta/QuitarProducto';
import { BotonIcono, Etiqueta } from '../components/carta/ui';
import { cambiaDisponibilidad, gestionaCarta, normalizar } from '../components/carta/utils';
import { emojiCategoria } from '../components/cliente/utils';

// ---------- Filtros ----------
const pasaEstado = (item, estado) => {
  if (estado === 'desactivados') return !item.is_active;
  if (!item.is_active) return false;
  if (estado === 'disponibles') return item.is_available;
  if (estado === 'agotados') return !item.is_available;
  return true;
};

const pasaCategoria = (item, cat) => cat === 'todas' || (cat === 'sin' ? !item.category : item.category === cat);

const porNombre = (a, b) => a.name.localeCompare(b.name, 'es');

const plural = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;

// Botón compacto de la cabecera (mismo tamaño que en Mesas)
const COMPACTO = '!min-h-[34px] !px-4 !text-[10px]';

// Fila de filtros en una línea que se desliza si no cabe, con una barra fina y dorada (no la gruesa del sistema)
const FILA_FILTROS =
  '[scrollbar-width:thin] [scrollbar-color:#ead39a_transparent] [&::-webkit-scrollbar]:h-1 [&::-webkit-scrollbar-thumb]:border-0 [&::-webkit-scrollbar-thumb]:bg-oro-200 [&>div]:flex-nowrap [&_button]:whitespace-nowrap [&_button]:!px-3 [&_button]:!py-1 [&_button]:!text-[10.5px]';

// Aviso con acción opcional (vacío, sin resultados, error)
const Aviso = ({ icon: Icon, titulo, children, acciones }) => (
  <Card className="flex flex-col items-center px-5 py-10 text-center">
    <span className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-pistacho-100 text-cobalto-500 ring-1 ring-oro-300">
      <Icon className="h-5 w-5" aria-hidden="true" />
    </span>
    <p className="font-serif text-xl italic text-verde-700">{titulo}</p>
    {children && <p className="mt-1 max-w-md text-sm text-verde-600">{children}</p>}
    {acciones && <div className="mt-4 flex flex-wrap justify-center gap-2">{acciones}</div>}
  </Card>
);

// Encabezado de cada grupo: ícono, nombre en cursiva, filete dorado y contador
const EncabezadoGrupo = ({ grupo, gestiona, onAgregar }) => {
  const { categoria, items } = grupo;
  const emoji = emojiCategoria(categoria.icon);
  const oculta = categoria.is_active === false;
  return (
    <div className="mb-2 flex items-center gap-2">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pistacho-100 text-base ring-1 ring-oro-300 ${
          oculta ? 'opacity-60 grayscale' : ''
        }`}
        aria-hidden="true"
      >
        {emoji || <span className="rombo" />}
      </span>
      <h2 id={`grupo-${grupo.id}`} className="min-w-0 truncate font-serif text-xl italic font-medium leading-tight text-verde-700">
        {categoria.name}
      </h2>
      {oculta && (
        <span title="No sale en la carta: ni los clientes ni el personal la ven al pedir">
          <Etiqueta tono="oro">Oculta</Etiqueta>
        </span>
      )}
      {/* En el celular el nombre tiene prioridad: sin filete y el contador solo con el número */}
      <span className="hidden min-w-[1.5rem] flex-1 items-center gap-2 sm:flex" aria-hidden="true">
        <span className="h-px flex-1 bg-oro-300" />
        <span className="rombo" />
      </span>
      <span
        className="ml-auto shrink-0 text-[10.5px] font-medium uppercase tracking-[0.16em] text-verde-600 sm:ml-0"
        title={plural(items.length, 'producto', 'productos')}
      >
        <span className="sm:hidden" aria-hidden="true">
          {items.length}
        </span>
        <span className="sr-only sm:not-sr-only">{plural(items.length, 'producto', 'productos')}</span>
      </span>
      {gestiona && categoria.id !== undefined && (
        <BotonIcono icon={Plus} etiqueta={`Agregar producto en ${categoria.name}`} onClick={onAgregar} className="-my-1" />
      )}
    </div>
  );
};

export const Menu = () => {
  const { user } = useAuth();
  const role = user?.role;
  const gestiona = gestionaCarta(role);
  const disponibilidad = cambiaDisponibilidad(role);
  const esSuper = role === 'super_admin';

  // El super_admin elige de qué distribuidor ve la carta
  const [tenants, setTenants] = useState(null);
  const [tenant, setTenant] = useState('');
  useEffect(() => {
    if (!esSuper) return;
    fetchAll('/tenants/')
      .then((lista) => {
        setTenants(lista);
        setTenant((actual) => actual || lista[0]?.id || '');
      })
      .catch(() => setTenants([]));
  }, [esSuper]);

  const carta = useCarta({ tenant: esSuper ? tenant : null, listo: !esSuper || !!tenant });
  const { items, categorias, loading, error } = carta;

  const [busqueda, setBusqueda] = useState('');
  const [catFiltro, setCatFiltro] = useState('todas');
  const [estado, setEstado] = useState('todos');

  // Modales
  const [form, setForm] = useState(null); // { item, categoria }
  const [catsAbierto, setCatsAbierto] = useState(false);
  const [quitando, setQuitando] = useState(null);

  const abrirNuevo = (categoria = '') =>
    setForm({ item: null, categoria: categoria || (catFiltro !== 'todas' && catFiltro !== 'sin' ? catFiltro : '') });

  // Al cambiar de distribuidor se empieza sin filtros
  useEffect(() => {
    setBusqueda('');
    setCatFiltro('todas');
    setEstado('todos');
  }, [tenant]);

  const q = normalizar(busqueda);
  const base = useMemo(
    () => (q ? items.filter((i) => normalizar(`${i.name} ${i.description || ''} ${i.category_name || ''}`).includes(q)) : items),
    [items, q]
  );

  const hayDesactivados = items.some((i) => !i.is_active);
  const haySinCategoria = items.some((i) => !i.category);

  // Si el filtro elegido deja de existir (categoría eliminada, último desactivado reactivado…), se vuelve a «Todas/Todos»
  useEffect(() => {
    if (loading) return;
    if (catFiltro === 'sin' ? !haySinCategoria : catFiltro !== 'todas' && !categorias.some((c) => c.id === catFiltro)) {
      setCatFiltro('todas');
    }
    if (estado === 'desactivados' && !hayDesactivados) setEstado('todos');
  }, [loading, catFiltro, categorias, haySinCategoria, estado, hayDesactivados]);

  // Contadores: cada filtro cuenta lo que se vería al elegirlo, con los demás filtros aplicados
  const enEstado = useMemo(() => base.filter((i) => pasaEstado(i, estado)), [base, estado]);
  const enCategoria = useMemo(() => base.filter((i) => pasaCategoria(i, catFiltro)), [base, catFiltro]);
  const visibles = useMemo(() => enCategoria.filter((i) => pasaEstado(i, estado)), [enCategoria, estado]);

  const opcionesCat = [
    { value: 'todas', label: 'Todas', count: enEstado.length },
    ...categorias.map((c) => ({
      value: c.id,
      label: `${emojiCategoria(c.icon) ? `${c.icon} ` : ''}${c.name}`,
      count: enEstado.filter((i) => i.category === c.id).length,
    })),
    ...(haySinCategoria ? [{ value: 'sin', label: 'Sin categoría', count: enEstado.filter((i) => !i.category).length }] : []),
  ];

  const cuentaEstado = (e) => enCategoria.filter((i) => pasaEstado(i, e)).length;
  const opcionesEstado = [
    { value: 'todos', label: 'Todos', count: cuentaEstado('todos') },
    { value: 'disponibles', label: 'Disponibles', count: cuentaEstado('disponibles') },
    { value: 'agotados', label: 'Agotados', count: cuentaEstado('agotados') },
    ...(gestiona && (hayDesactivados || estado === 'desactivados')
      ? [{ value: 'desactivados', label: 'Desactivados', count: cuentaEstado('desactivados') }]
      : []),
  ];

  // Agrupa en el orden de la carta; las categorías vacías solo se muestran a gestión y sin filtros
  const mostrarVacias = gestiona && !q && estado === 'todos';
  const grupos = useMemo(() => {
    const porCat = new Map();
    visibles.forEach((i) => {
      const clave = i.category || 'sin';
      if (!porCat.has(clave)) porCat.set(clave, []);
      porCat.get(clave).push(i);
    });
    const lista = [];
    categorias.forEach((c) => {
      if (catFiltro !== 'todas' && catFiltro !== c.id) return;
      const its = porCat.get(c.id) || [];
      porCat.delete(c.id);
      if (its.length || mostrarVacias) lista.push({ id: c.id, categoria: c, items: [...its].sort(porNombre) });
    });
    // Productos de categorías que este rol no ve en la lista (por ejemplo, ocultas)
    porCat.forEach((its, clave) => {
      if (clave === 'sin') return;
      lista.push({ id: clave, categoria: { name: its[0].category_name || 'Otra categoría' }, items: [...its].sort(porNombre) });
    });
    if (porCat.has('sin')) {
      lista.push({ id: 'sin', categoria: { id: null, name: 'Sin categoría' }, items: [...porCat.get('sin')].sort(porNombre) });
    }
    return lista;
  }, [visibles, categorias, catFiltro, mostrarVacias]);

  // Conteo de productos activos por categoría (para el modal de categorías)
  const categoriasConConteo = useMemo(
    () => categorias.map((c) => ({ ...c, items_count: items.filter((i) => i.category === c.id && i.is_active).length })),
    [categorias, items]
  );

  const activos = items.filter((i) => i.is_active);
  const agotados = activos.filter((i) => !i.is_available).length;
  const sinFoto = activos.filter((i) => !i.image).length;
  const subtitulo = loading || error
    ? null
    : gestiona
    ? [
        plural(activos.length, 'producto en la carta', 'productos en la carta'),
        agotados ? plural(agotados, 'agotado', 'agotados') : null,
        sinFoto ? `${sinFoto} sin foto` : null,
      ]
        .filter(Boolean)
        .join(' · ')
    : disponibilidad
    ? 'Marca como agotado lo que se termine y vuelve a activarlo cuando haya.'
    : 'Lo que servimos hoy, organizado por categoría.';

  const hayFiltros = !!q || catFiltro !== 'todas' || estado !== 'todos';
  const limpiarFiltros = () => {
    setBusqueda('');
    setCatFiltro('todas');
    setEstado('todos');
  };

  const cartaVacia = items.length === 0 && categorias.length === 0;
  const listo = !loading && !error;

  const renderContenido = () => {
    if (esSuper && tenants && tenants.length === 0) {
      return (
        <Aviso icon={BookOpen} titulo="No hay distribuidores">
          Crea un distribuidor para empezar a armar su carta.
        </Aviso>
      );
    }
    if (loading) return <Loader />;
    if (error) {
      return (
        <Aviso
          icon={AlertTriangle}
          titulo="No se pudo cargar la carta"
          acciones={
            <Button size="sm" onClick={carta.cargar}>
              Reintentar
            </Button>
          }
        >
          {error}
        </Aviso>
      );
    }
    if (cartaVacia || (!gestiona && items.length === 0)) {
      return gestiona ? (
        <Aviso
          icon={BookOpen}
          titulo="Tu carta está vacía"
          acciones={
            <>
              <Button size="sm" variant="secondary" onClick={() => setCatsAbierto(true)}>
                <Tags className="h-4 w-4" aria-hidden="true" /> Crear categorías
              </Button>
              <Button size="sm" onClick={() => abrirNuevo()}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Agregar producto
              </Button>
            </>
          }
        >
          Crea tus categorías (bebidas, panadería, postres…) y agrega los productos con su foto. Así los verán tus
          clientes al escanear el QR de la mesa.
        </Aviso>
      ) : (
        <Aviso icon={BookOpen} titulo="Aún no hay productos disponibles">
          Cuando el administrador cargue la carta, aparecerá aquí.
        </Aviso>
      );
    }

    return (
      <>
        {/* Buscador y estado */}
        <div className="mb-2.5 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-oro-600" aria-hidden="true" />
            <input
              type="search"
              value={busqueda}
              onChange={(e) => setBusqueda(e.target.value)}
              placeholder="Buscar producto…"
              aria-label="Buscar producto por nombre o descripción"
              className="input !rounded-full !py-2 pl-10 text-sm"
            />
          </div>
          {disponibilidad && (
            <div className={`-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 ${FILA_FILTROS}`}>
              <Segmented value={estado} onChange={setEstado} options={opcionesEstado} />
            </div>
          )}
        </div>

        {/* Categorías (desliza en el celular) */}
        {opcionesCat.length > 2 && (
          <div className={`-mx-4 mb-4 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 ${FILA_FILTROS}`}>
            <Segmented value={catFiltro} onChange={setCatFiltro} options={opcionesCat} />
          </div>
        )}

        {grupos.length === 0 ? (
          <Aviso
            icon={SearchX}
            titulo="Nada coincide"
            acciones={
              hayFiltros && (
                <Button size="sm" variant="secondary" onClick={limpiarFiltros}>
                  Ver toda la carta
                </Button>
              )
            }
          >
            {estado === 'agotados' && !q ? 'No hay productos agotados. ¡Todo está disponible!' : 'Prueba con otra búsqueda o cambia el filtro.'}
          </Aviso>
        ) : (
          <div className="space-y-5">
            {grupos.map((grupo) => (
              <section key={grupo.id} aria-labelledby={`grupo-${grupo.id}`} className="animate-fade-in">
                <EncabezadoGrupo grupo={grupo} gestiona={gestiona} onAgregar={() => abrirNuevo(grupo.categoria.id || '')} />
                {grupo.items.length === 0 ? (
                  <button
                    type="button"
                    onClick={() => abrirNuevo(grupo.categoria.id)}
                    className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-oro-300 bg-pistacho-50/60 px-3 py-3 text-[11px] font-medium uppercase tracking-[0.14em] text-verde-600 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Sin productos · agregar el primero
                  </button>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 xl:grid-cols-3">
                    {grupo.items.map((item) => (
                      <TarjetaProducto
                        key={item.id}
                        item={item}
                        icono={grupo.categoria.icon}
                        gestiona={gestiona}
                        disponibilidad={disponibilidad}
                        ocupado={carta.ocupados.has(item.id)}
                        onDisponible={carta.cambiarDisponible}
                        onEditar={(it) => setForm({ item: it, categoria: '' })}
                        onQuitar={setQuitando}
                        onReactivar={carta.reactivar}
                      />
                    ))}
                  </div>
                )}
              </section>
            ))}
          </div>
        )}
      </>
    );
  };

  return (
    <Layout>
      <PageHeader
        eyebrow="Tu carta"
        title="Menú"
        subtitle={subtitulo}
        actions={
          (esSuper || gestiona) && (
            <>
              {esSuper && tenants && tenants.length > 0 && (
                <select
                  value={tenant}
                  onChange={(e) => setTenant(e.target.value)}
                  aria-label="Distribuidor"
                  className="input !w-auto !rounded-full !py-1.5 !pl-4 text-sm"
                >
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              )}
              {gestiona && (
                <>
                  <Button variant="secondary" size="sm" onClick={() => setCatsAbierto(true)} disabled={!listo} className={COMPACTO}>
                    <Tags className="h-3.5 w-3.5" aria-hidden="true" /> Categorías
                  </Button>
                  <Button size="sm" onClick={() => abrirNuevo()} disabled={!listo} className={COMPACTO}>
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" /> Nuevo producto
                  </Button>
                </>
              )}
            </>
          )
        }
      />

      {renderContenido()}

      {gestiona && (
        <>
          <ProductoForm
            open={!!form}
            onClose={() => setForm(null)}
            item={form?.item || null}
            categoriaInicial={form?.categoria || ''}
            categorias={categorias}
            tenant={esSuper ? tenant : null}
            onGuardado={carta.ponerItem}
            onCategoriaGuardada={carta.ponerCategoria}
          />
          <CategoriasModal
            open={catsAbierto}
            onClose={() => setCatsAbierto(false)}
            categorias={categoriasConConteo}
            tenant={esSuper ? tenant : null}
            onGuardada={carta.ponerCategoria}
            onOrden={carta.ordenarLista}
            onEliminada={carta.quitarCategoria}
          />
          <QuitarProducto
            item={quitando}
            onClose={() => setQuitando(null)}
            onQuitar={carta.quitar}
            onAgotar={carta.agotar}
          />
        </>
      )}
    </Layout>
  );
};
