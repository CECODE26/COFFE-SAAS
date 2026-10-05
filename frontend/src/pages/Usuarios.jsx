import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { Avatar } from '../components/Stats';
import { ROLE_LABELS } from '../lib/roles';
import { Button } from '../components/Button';
import { UserForm } from '../components/UserForm';
import { EliminarUsuario } from '../components/EliminarUsuario';
import { ROLE_TONE, mensajeError, nombreDe, puedeEliminar, puedeGestionar } from '../lib/usuarios';
import { Search, Users, Plus, Power, PowerOff, Trash2, Loader2 } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

// Alcance de los roles que no pertenecen a un local concreto (columna "Local")
const SCOPE_LABELS = {
  super_admin: 'Toda la plataforma',
  distribuidor_admin: 'Toda la red',
};

const GROUPS = {
  admins: ['super_admin', 'distribuidor_admin', 'cafe_admin'],
  staff: ['gerente', 'camarero', 'cajero', 'cocinero', 'usuario'],
};

// Botón compacto de las acciones de cada fila: solo icono (con su nombre en la ayuda y para lectores
// de pantalla) y con texto en pantallas muy anchas, para que la tabla no necesite desplazarse
const TONOS_ACCION = {
  suave: 'text-verde-700 ring-oro-300/70 hover:bg-pistacho-100 hover:text-cobalto-500',
  activar: 'bg-pistacho-50 text-verde-700 ring-pistacho-400/60 hover:bg-pistacho-100',
  peligro: 'text-terracotta-700 ring-terracotta-600/25 hover:bg-terracotta-100',
};

const AccionFila = ({ icon: Icon, tono = 'suave', etiqueta, cargando = false, children, ...props }) => (
  <button
    type="button"
    title={etiqueta}
    aria-label={etiqueta}
    aria-busy={cargando || undefined}
    className={`inline-flex h-8 w-8 items-center justify-center gap-1.5 rounded-full text-[11px] font-medium uppercase tracking-[0.12em] ring-1 transition-colors focus:outline-none focus-visible:ring-4 focus-visible:ring-cobalto-100 disabled:pointer-events-none disabled:opacity-60 2xl:w-auto 2xl:px-3 ${TONOS_ACCION[tono]}`}
    {...props}
  >
    {cargando ? (
      <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
    ) : (
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
    )}
    <span className="hidden 2xl:inline">{children}</span>
  </button>
);

// La columna de acciones queda fija a la derecha: en pantallas angostas la tabla se desplaza dentro de su
// tarjeta y los botones siguen a la vista. Fondo opaco (el de la fila) para tapar lo que pasa por debajo.
const SOMBRA_FIJA = 'shadow-[-10px_0_12px_-10px_rgba(42,69,32,0.35)]';

const FONDO_ACCIONES = {
  activo: 'bg-marfil',
  // Mismo tono que bg-crema/40 de la fila inactiva, sobre marfil
  inactivo: 'bg-marfil bg-gradient-to-r from-crema/40 to-crema/40 group-hover:bg-none',
};

// true cuando la tabla es más ancha que su tarjeta (se desplaza): la columna fija se marca con una sombra.
// Ref de callback: React la llama con null al desmontar y ahí se desconecta el observador.
const useDesborde = () => {
  const [desborda, setDesborda] = useState(false);
  const observador = useRef(null);
  const ref = useCallback((nodo) => {
    observador.current?.disconnect();
    observador.current = null;
    if (!nodo) return;
    const medir = () => setDesborda(nodo.scrollWidth > nodo.clientWidth + 1);
    medir();
    if (typeof ResizeObserver === 'undefined') return;
    observador.current = new ResizeObserver(medir);
    observador.current.observe(nodo);
    if (nodo.firstElementChild) observador.current.observe(nodo.firstElementChild);
  }, []);
  return [ref, desborda];
};

export const Usuarios = () => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  // El admin de cafetería solo ve su local: la columna "Local" repetiría siempre el mismo nombre
  const showLocal = isSuper || user?.role === 'distribuidor_admin';
  const searchLabel = showLocal ? 'Buscar por nombre, email o local' : 'Buscar por nombre o email';
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  // Cuenta que se está activando o desactivando desde su fila, y la que se va a eliminar
  const [cambiando, setCambiando] = useState(null);
  const [aEliminar, setAEliminar] = useState(null);
  const [tablaRef, desborda] = useDesborde();

  // Solo se aplica la respuesta de la última carga: una recarga lenta no pisa cambios más nuevos
  const ultimaCarga = useRef(0);
  const load = useCallback(async () => {
    const n = ++ultimaCarga.current;
    const lista = await fetchAll('/auth/users/');
    if (n === ultimaCarga.current) setUsers(lista);
  }, []);

  // Tras un cambio: si la recarga falla, el cambio ya está hecho; solo se avisa
  const recargar = useCallback(
    () => load().catch(() => toast.error('No se pudo actualizar la lista', { id: 'recargar-usuarios' })),
    [load]
  );

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando usuarios', { id: 'Error cargando usuarios' }))
      .finally(() => setLoading(false));
  }, [load]);

  // La fila cambia en cuanto responde el backend y los botones quedan libres; la lista se recarga
  // en segundo plano (si alguien más cambió algo, se ve al terminar)
  const marcarActiva = (id, activa) =>
    setUsers((lista) => lista.map((x) => (x.id === id ? { ...x, is_active: activa } : x)));

  const cambiarEstado = async (u) => {
    if (cambiando) return;
    const activar = !u.is_active;
    setCambiando(u.id);
    try {
      await api.post(`/auth/users/${u.id}/${activar ? 'activate' : 'deactivate'}/`);
    } catch (err) {
      toast.error(mensajeError(err));
      setCambiando(null);
      return;
    }
    marcarActiva(u.id, activar);
    setCambiando(null);
    toast.success(`Cuenta de ${nombreDe(u)} ${activar ? 'activada' : 'desactivada'}`);
    recargar();
  };

  const cerrarEliminar = useCallback(() => setAEliminar(null), []);

  const alEliminar = (u) => {
    setAEliminar(null);
    setUsers((lista) => lista.filter((x) => x.id !== u.id));
    toast.success(`Cuenta de ${nombreDe(u)} eliminada`);
    recargar();
  };

  const alDesactivar = (u) => {
    setAEliminar(null);
    marcarActiva(u.id, false);
    toast.success(`Cuenta de ${nombreDe(u)} desactivada`);
    recargar();
  };

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && !GROUPS[filter].includes(u.role)) return false;
      if (!q) return true;
      const campos = showLocal ? [u.full_name, u.email, u.cafeteria_name, u.tenant_name] : [u.full_name, u.email];
      return campos.some((v) => v?.toLowerCase().includes(q));
    });
  }, [users, filter, query, showLocal]);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow={isSuper ? 'Plataforma' : user?.cafeteria_name || user?.tenant_name}
            title={isSuper ? 'Usuarios' : 'Equipo'}
            subtitle={`${users.filter((u) => u.is_active).length} cuentas activas de ${users.length}.`}
            actions={
              <>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'Todos', count: users.length },
                    { value: 'admins', label: 'Admins', count: users.filter((u) => GROUPS.admins.includes(u.role)).length },
                    { value: 'staff', label: 'Staff', count: users.filter((u) => GROUPS.staff.includes(u.role)).length },
                  ]}
                />
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo usuario
                </Button>
              </>
            }
          />

          <div className="relative mb-6 max-w-sm">
            <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-oro-600" aria-hidden="true" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={`${searchLabel}…`}
              aria-label={searchLabel}
              className="input !rounded-full !py-2.5 pl-11"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nadie coincide" description="Prueba con otra búsqueda." />
          ) : (
            <Card padded={false} className="overflow-hidden">
              {/* relative: el encabezado sr-only de Acciones queda dentro del scroll y no ensancha la página */}
              <div ref={tablaRef} className="relative overflow-x-auto">
                <table className={`w-full text-sm ${showLocal ? 'min-w-[800px]' : 'min-w-[620px]'}`}>
                  <thead>
                    <tr className="border-b border-oro-300/60 bg-crema/70 text-left text-[11px] uppercase tracking-[0.18em] text-verde-600">
                      <th className="py-3 pl-6 pr-3 font-medium">Persona</th>
                      <th className="px-3 py-3 font-medium">Rol</th>
                      {showLocal && (
                        <th className="px-3 py-3 font-medium">{isSuper ? 'Distribuidor / local' : 'Local'}</th>
                      )}
                      <th className="px-3 py-3 font-medium">Alta</th>
                      <th className="px-3 py-3 font-medium">Estado</th>
                      <th
                        className={`sticky right-0 z-[1] bg-marfil bg-gradient-to-r from-crema/70 to-crema/70 py-3 pl-2 pr-5 ${desborda ? SOMBRA_FIJA : ''}`}
                      >
                        <span className="sr-only">Acciones</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-oro-200/60">
                    {filtered.map((u) => {
                      const gestionar = puedeGestionar(user, u);
                      const eliminar = puedeEliminar(user, u);
                      const enCurso = cambiando === u.id;
                      // Inactivo: datos atenuados; estado y acciones se leen completos
                      const tenue = u.is_active ? '' : 'opacity-55';
                      return (
                        <tr key={u.id} className={`group transition-colors hover:bg-pistacho-50 ${u.is_active ? '' : 'bg-crema/40'}`}>
                          <td className={`py-3.5 pl-6 pr-3 ${tenue}`}>
                            <div className="flex items-center gap-3">
                              <Avatar name={nombreDe(u)} size="sm" dark={u.is_active && GROUPS.admins.includes(u.role)} />
                              <div className="min-w-0">
                                <p className="font-medium text-verde-800">{u.full_name}</p>
                                <p className="truncate text-xs text-verde-600">{u.email}</p>
                              </div>
                            </div>
                          </td>
                          <td className={`px-3 py-3.5 ${tenue}`}>
                            <Badge tone={ROLE_TONE[u.role] || 'neutral'} dot={false}>
                              {ROLE_LABELS[u.role] || u.role}
                            </Badge>
                          </td>
                          {showLocal && (
                            <td className={`px-3 py-3.5 text-verde-600 ${tenue}`}>
                              {isSuper && u.tenant_name && (
                                <p className="whitespace-nowrap text-[11px] font-medium uppercase tracking-[0.14em] text-oro-600">{u.tenant_name}</p>
                              )}
                              {/* Los admins de plataforma y de red no dependen de un local: se muestra su alcance */}
                              <p>{SCOPE_LABELS[u.role] || u.cafeteria_name || '—'}</p>
                            </td>
                          )}
                          <td className={`whitespace-nowrap px-3 py-3.5 text-verde-600 ${tenue}`}>
                            {new Date(u.created_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}
                          </td>
                          <td className="px-3 py-3.5">
                            {u.is_active ? <Badge tone="sage">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>}
                          </td>
                          <td
                            className={`sticky right-0 z-[1] py-3.5 pl-2 pr-5 transition-colors group-hover:bg-pistacho-50 ${
                              FONDO_ACCIONES[u.is_active ? 'activo' : 'inactivo']
                            } ${desborda ? SOMBRA_FIJA : ''}`}
                          >
                            {(gestionar || eliminar) && (
                              <div className="flex items-center justify-end gap-1.5">
                                {gestionar && (
                                  <AccionFila
                                    icon={u.is_active ? PowerOff : Power}
                                    tono={u.is_active ? 'suave' : 'activar'}
                                    onClick={() => cambiarEstado(u)}
                                    disabled={!!cambiando}
                                    cargando={enCurso}
                                    etiqueta={`${u.is_active ? 'Desactivar' : 'Activar'} a ${nombreDe(u)}`}
                                  >
                                    {u.is_active
                                      ? (enCurso ? 'Desactivando…' : 'Desactivar')
                                      : (enCurso ? 'Activando…' : 'Activar')}
                                  </AccionFila>
                                )}
                                {eliminar && (
                                  <AccionFila
                                    icon={Trash2}
                                    tono="peligro"
                                    onClick={() => setAEliminar(u)}
                                    disabled={!!cambiando}
                                    etiqueta={`Eliminar a ${nombreDe(u)}`}
                                  >
                                    Eliminar
                                  </AccionFila>
                                )}
                              </div>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <UserForm open={creating} onClose={() => setCreating(false)} onCreated={() => recargar()} />
      <EliminarUsuario
        usuario={aEliminar}
        onClose={cerrarEliminar}
        onEliminado={alEliminar}
        onDesactivado={alDesactivar}
      />
    </Layout>
  );
};
