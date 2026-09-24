import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge, StatusBadge } from '../components/StatusBadge';
import { StatTile, UsageBar, Avatar, money } from '../components/Stats';
import { PLAN_LABELS, ROLE_LABELS } from '../lib/roles';
import { Store, Users, Receipt, CircleDollarSign, MapPin, Clock, ArrowUpRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

export const Distribuidor = () => {
  const [tenant, setTenant] = useState(null);
  const [cafes, setCafes] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      api.get('/tenants/my_tenant/'),
      fetchAll('/cafeterias/'),
      fetchAll('/mesas/mesas/'),
      fetchAll('/pedidos/orders/'),
      fetchAll('/auth/users/'),
    ])
      .then(([t, c, m, o, u]) => {
        setTenant(t.data);
        setCafes(c);
        setMesas(m);
        setOrders(o);
        setUsers(u);
      })
      .catch(() => toast.error('Error cargando tu red'))
      .finally(() => setLoading(false));
  }, []);

  // Métricas por cafetería calculadas a partir de mesas y pedidos
  const byCafe = useMemo(() => {
    const acc = {};
    cafes.forEach((c) => (acc[c.id] = { mesas: 0, ocupadas: 0, ventas: 0, activos: 0 }));
    mesas.forEach((m) => {
      if (!acc[m.cafeteria]) return;
      acc[m.cafeteria].mesas += 1;
      if (m.status === 'ocupada') acc[m.cafeteria].ocupadas += 1;
    });
    orders.forEach((o) => {
      if (!acc[o.cafeteria] || o.status === 'cancelada') return;
      acc[o.cafeteria].ventas += Number(o.total);
      if (['pendiente', 'confirmada', 'preparando', 'lista'].includes(o.status)) acc[o.cafeteria].activos += 1;
    });
    return acc;
  }, [cafes, mesas, orders]);

  const totalSales = Object.values(byCafe).reduce((a, c) => a + c.ventas, 0);
  const activeOrders = Object.values(byCafe).reduce((a, c) => a + c.activos, 0);

  const roleCounts = useMemo(() => {
    const acc = {};
    users.forEach((u) => (acc[u.role] = (acc[u.role] || 0) + 1));
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [users]);

  const recent = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);

  return (
    <Layout>
      {loading || !tenant ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow={`Distribuidor · Plan ${PLAN_LABELS[tenant.plan]}`}
            title={tenant.name}
            subtitle={`${tenant.business_name} · RUC ${tenant.ruc}${tenant.city ? ` · ${tenant.city}` : ''}`}
            actions={
              tenant.plan !== 'enterprise' && (
                <div className="flex items-center gap-3 rounded-2xl border border-brass-200 bg-brass-50 px-4 py-2.5">
                  <Sparkles className="h-4 w-4 text-brass-600" />
                  <p className="text-sm text-espresso-600">
                    ¿Más locales? <span className="font-medium text-brass-700">Mejora tu plan</span>
                  </p>
                </div>
              )
            }
          />

          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <div className="animate-fade-in rounded-xl2 bg-espresso-800 p-5 text-cream shadow-lift">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium uppercase tracking-wider text-espresso-200">Cafeterías</p>
                <Store className="h-4 w-4 text-brass-300" />
              </div>
              <p className="mt-4 font-serif text-4xl font-medium">{tenant.active_cafes_count}</p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-espresso-700">
                <div
                  className="h-full rounded-full bg-brass-300"
                  style={{ width: `${Math.min(100, (tenant.active_cafes_count / tenant.max_cafes) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-espresso-300">de {tenant.max_cafes} permitidas</p>
            </div>
            <Card className="animate-fade-in !p-5">
              <div className="flex items-center justify-between">
                <p className="stat-label">Equipo</p>
                <Users className="h-4 w-4 text-brass-500" />
              </div>
              <p className="mt-4 font-serif text-4xl font-medium text-espresso-800">{tenant.active_users_count}</p>
              <UsageBar value={tenant.active_users_count} max={tenant.max_users} className="mt-2" />
            </Card>
            <StatTile icon={Receipt} label="En curso" value={activeOrders} hint={`pedidos de ${orders.length}`} delay={120} />
            <StatTile icon={CircleDollarSign} label="Volumen" value={money(totalSales)} hint="pedidos no cancelados" delay={180} />
          </div>

          {/* Cafeterías */}
          <div className="mb-4 flex items-end justify-between">
            <h2 className="text-2xl font-medium text-espresso-800">Tus cafeterías</h2>
            <Link to="/cafeterias" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
              Gestionar <ArrowUpRight className="h-4 w-4" />
            </Link>
          </div>
          <div className="mb-10 grid grid-cols-1 gap-5 md:grid-cols-2 xl:grid-cols-3">
            {cafes.map((c, i) => {
              const s = byCafe[c.id] || {};
              const occ = s.mesas ? Math.round((s.ocupadas / s.mesas) * 100) : 0;
              return (
                <Card
                  key={c.id}
                  padded={false}
                  className="animate-fade-in overflow-hidden hover:shadow-lift"
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="relative bg-espresso-800 px-6 pb-5 pt-6 text-cream">
                    <div
                      className="pointer-events-none absolute -right-10 -top-10 h-32 w-32 rounded-full opacity-60"
                      style={{ background: 'radial-gradient(circle, rgba(220,174,100,0.35), transparent 70%)' }}
                    />
                    <div className="relative flex items-start justify-between gap-2">
                      <h3 className="text-xl font-medium">{c.name}</h3>
                      {!c.is_active && <Badge tone="terracotta">Cerrada</Badge>}
                    </div>
                    <p className="relative mt-1 inline-flex items-center gap-1.5 text-xs text-espresso-200">
                      <MapPin className="h-3.5 w-3.5" /> {c.city}
                    </p>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-foam border-b border-foam text-center">
                    <div className="py-4">
                      <p className="font-serif text-2xl text-espresso-800">{occ}%</p>
                      <p className="text-[11px] uppercase tracking-wider text-espresso-400">Ocupación</p>
                    </div>
                    <div className="py-4">
                      <p className="font-serif text-2xl text-espresso-800">{s.activos}</p>
                      <p className="text-[11px] uppercase tracking-wider text-espresso-400">En curso</p>
                    </div>
                    <div className="py-4">
                      <p className="font-serif text-2xl text-espresso-800">{c.active_users_count}</p>
                      <p className="text-[11px] uppercase tracking-wider text-espresso-400">Equipo</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between px-6 py-3.5 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-espresso-400">
                      <Clock className="h-3.5 w-3.5" />
                      {c.open_time?.slice(0, 5)} – {c.close_time?.slice(0, 5)}
                    </span>
                    <span className="font-serif text-lg text-brass-600">{money(s.ventas)}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="lg:col-span-3">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-medium text-espresso-800">Actividad reciente</h2>
                  <p className="text-sm text-espresso-400">Últimos pedidos en toda tu red</p>
                </div>
                <Link to="/pedidos" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
                  Pedidos <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <ul className="divide-y divide-foam">
                {recent.map((o) => (
                  <li key={o.id} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate font-medium text-espresso-800">{o.cafeteria_name}</p>
                      <p className="text-xs text-espresso-400">
                        {o.order_number} · {new Date(o.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={o.status} />
                      <span className="w-20 text-right font-serif text-lg text-espresso-700">{money(o.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-medium text-espresso-800">Tu equipo</h2>
                  <p className="text-sm text-espresso-400">{users.length} personas en la red</p>
                </div>
                <Link to="/usuarios" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
                  Ver <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <div className="mb-5 flex -space-x-2">
                {users.slice(0, 7).map((u) => (
                  <div key={u.id} className="rounded-full ring-2 ring-paper">
                    <Avatar name={u.full_name} size="sm" />
                  </div>
                ))}
                {users.length > 7 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-espresso-800 text-[11px] font-medium text-brass-300 ring-2 ring-paper">
                    +{users.length - 7}
                  </div>
                )}
              </div>
              <ul className="space-y-2.5">
                {roleCounts.map(([role, count]) => (
                  <li key={role} className="flex items-center justify-between text-sm">
                    <span className="text-espresso-600">{ROLE_LABELS[role] || role}</span>
                    <span className="font-serif text-lg text-espresso-800">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
};
