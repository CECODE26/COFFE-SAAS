import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { Avatar } from '../components/Stats';
import { ROLE_LABELS } from '../lib/roles';
import { Button } from '../components/Button';
import { UserForm } from '../components/UserForm';
import { Search, Users, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import { fetchAll } from '../services/api';

// Tonos de la paleta "Pistacho y oro" (terracota queda para estados de error)
const ROLE_TONE = {
  super_admin: 'slate',
  distribuidor_admin: 'brass',
  cafe_admin: 'honey',
  gerente: 'sage',
};

// Alcance de los roles que no pertenecen a un local concreto (columna "Local")
const SCOPE_LABELS = {
  super_admin: 'Toda la plataforma',
  distribuidor_admin: 'Toda la red',
};

const GROUPS = {
  admins: ['super_admin', 'distribuidor_admin', 'cafe_admin'],
  staff: ['gerente', 'camarero', 'cajero', 'cocinero', 'usuario'],
};

export const Usuarios = () => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState('all');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => fetchAll('/auth/users/').then(setUsers);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando usuarios', { id: 'Error cargando usuarios' }))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return users.filter((u) => {
      if (filter !== 'all' && !GROUPS[filter].includes(u.role)) return false;
      if (!q) return true;
      return [u.full_name, u.email, u.cafeteria_name, u.tenant_name].some((v) => v?.toLowerCase().includes(q));
    });
  }, [users, filter, query]);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow={isSuper ? 'Plataforma' : user?.tenant_name}
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
              placeholder="Buscar por nombre, email o local…"
              aria-label="Buscar por nombre, email o local"
              className="input !rounded-full !py-2.5 pl-11"
            />
          </div>

          {filtered.length === 0 ? (
            <EmptyState icon={Users} title="Nadie coincide" description="Prueba con otra búsqueda." />
          ) : (
            <Card padded={false} className="overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-sm">
                  <thead>
                    <tr className="border-b border-oro-300/60 bg-crema/70 text-left text-[11px] uppercase tracking-[0.18em] text-verde-600">
                      <th className="px-6 py-3 font-medium">Persona</th>
                      <th className="px-3 py-3 font-medium">Rol</th>
                      <th className="px-3 py-3 font-medium">{isSuper ? 'Distribuidor / local' : 'Local'}</th>
                      <th className="px-3 py-3 font-medium">Alta</th>
                      <th className="px-6 py-3 font-medium">Estado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-oro-200/60">
                    {filtered.map((u) => (
                      <tr key={u.id} className="transition-colors hover:bg-pistacho-50">
                        <td className="px-6 py-3.5">
                          <div className="flex items-center gap-3">
                            <Avatar name={u.full_name} size="sm" dark={GROUPS.admins.includes(u.role)} />
                            <div className="min-w-0">
                              <p className="font-medium text-verde-800">{u.full_name}</p>
                              <p className="truncate text-xs text-verde-600">{u.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3.5">
                          <Badge tone={ROLE_TONE[u.role] || 'neutral'} dot={false}>
                            {ROLE_LABELS[u.role] || u.role}
                          </Badge>
                        </td>
                        <td className="px-3 py-3.5 text-verde-600">
                          {isSuper && u.tenant_name && (
                            <p className="text-[11px] font-medium uppercase tracking-[0.14em] text-oro-600">{u.tenant_name}</p>
                          )}
                          {/* Los admins de plataforma y de red no dependen de un local: se muestra su alcance */}
                          <p>{SCOPE_LABELS[u.role] || u.cafeteria_name || '—'}</p>
                        </td>
                        <td className="px-3 py-3.5 text-verde-600">
                          {new Date(u.created_at).toLocaleDateString('es-EC', { day: 'numeric', month: 'short' })}
                        </td>
                        <td className="px-6 py-3.5">
                          {u.is_active ? <Badge tone="sage">Activo</Badge> : <Badge tone="neutral">Inactivo</Badge>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
      <UserForm open={creating} onClose={() => setCreating(false)} onCreated={() => load()} />
    </Layout>
  );
};
