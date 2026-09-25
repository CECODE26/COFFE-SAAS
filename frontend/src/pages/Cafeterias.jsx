import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { CafeteriaForm } from '../components/CafeteriaForm';
import { Store, MapPin, Clock, Phone, Armchair, Users, Network, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

export const Cafeterias = () => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const [cafes, setCafes] = useState([]);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = () => fetchAll('/cafeterias/').then(setCafes);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando cafeterías', { id: 'Error cargando cafeterías' }))
      .finally(() => setLoading(false));
  }, []);

  const toggle = async (cafe) => {
    try {
      await api.post(`/cafeterias/${cafe.id}/${cafe.is_active ? 'deactivate' : 'activate'}/`);
      toast.success(cafe.is_active ? 'Cafetería cerrada' : 'Cafetería abierta');
      await load();
    } catch {
      toast.error('No tienes permisos para esta acción');
    }
  };

  const filtered = cafes.filter((c) => (filter === 'all' ? true : filter === 'open' ? c.is_active : !c.is_active));

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow={isSuper ? 'Plataforma' : user?.tenant_name}
            title="Cafeterías"
            subtitle={isSuper ? 'Todos los locales de todos los distribuidores.' : 'Los locales de tu red.'}
            actions={
              <>
                <Segmented
                  value={filter}
                  onChange={setFilter}
                  options={[
                    { value: 'all', label: 'Todas', count: cafes.length },
                    { value: 'open', label: 'Abiertas', count: cafes.filter((c) => c.is_active).length },
                    { value: 'closed', label: 'Cerradas', count: cafes.filter((c) => !c.is_active).length },
                  ]}
                />
                <Button onClick={() => setCreating(true)}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Nueva cafetería
                </Button>
              </>
            }
          />

          {filtered.length === 0 ? (
            <EmptyState icon={Store} title="Sin cafeterías aquí" />
          ) : (
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
              {filtered.map((c, i) => (
                <Card
                  key={c.id}
                  padded={false}
                  className={`animate-fade-in flex flex-col overflow-hidden hover:shadow-lift ${!c.is_active ? 'opacity-75' : ''}`}
                  style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                >
                  <div className="flex-1 p-6">
                    {isSuper && (
                      <p className="eyebrow mb-2 inline-flex items-center gap-1.5">
                        <Network className="h-3 w-3" aria-hidden="true" /> {c.tenant_name}
                      </p>
                    )}
                    <div className="flex items-start justify-between gap-3">
                      <h3 className="font-serif text-2xl italic font-medium leading-snug text-verde-700">{c.name}</h3>
                      {c.is_active ? <Badge tone="sage">Abierta</Badge> : <Badge tone="terracotta">Cerrada</Badge>}
                    </div>
                    <div className="mt-3 flex items-center gap-2" aria-hidden="true">
                      <span className="h-px w-10 bg-oro-300" />
                      <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" />
                    </div>
                    <div className="mt-3 space-y-1.5 text-sm text-verde-600">
                      <p className="flex items-start gap-2">
                        <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
                        {c.address}, {c.city}
                      </p>
                      <p className="flex items-center gap-2">
                        <Clock className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
                        {c.open_time?.slice(0, 5)} – {c.close_time?.slice(0, 5)}
                      </p>
                      {c.phone && (
                        <p className="flex items-center gap-2">
                          <Phone className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
                          {c.phone}
                        </p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 border-t border-oro-200/70 bg-crema/70 px-6 py-3 text-sm">
                    <div className="flex gap-4 text-verde-600">
                      <span className="inline-flex items-center gap-1.5">
                        <Armchair className="h-4 w-4 text-oro-600" aria-hidden="true" />
                        <span className="sr-only">Mesas:</span> {c.mesas_count}
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-oro-600" aria-hidden="true" />
                        <span className="sr-only">Equipo:</span> {c.active_users_count}
                      </span>
                    </div>
                    {user?.role === 'distribuidor_admin' && (
                      <Button size="sm" variant={c.is_active ? 'ghost' : 'secondary'} onClick={() => toggle(c)}>
                        {c.is_active ? 'Cerrar' : 'Abrir'}
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
      <CafeteriaForm open={creating} onClose={() => setCreating(false)} onCreated={() => load()} />
    </Layout>
  );
};
