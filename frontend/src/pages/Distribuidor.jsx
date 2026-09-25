import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge, StatusBadge } from '../components/StatusBadge';
import { StatTile, UsageBar, Avatar, money } from '../components/Stats';
import { ToldoFino } from '../components/Decor';
import { PLAN_LABELS, ROLE_LABELS } from '../lib/roles';
import { Store, Users, Receipt, CircleDollarSign, MapPin, Clock, ArrowUpRight, Sparkles } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

// Aro dorado interior + sombra elevada (misma receta que la tarjeta destacada)
const FEATURED_SHADOW =
  'inset 0 0 0 4px #2A4520, inset 0 0 0 5px rgba(216, 180, 92, 0.75), 0 2px 4px rgba(42, 69, 32, 0.06), 0 16px 36px -12px rgba(42, 69, 32, 0.22)';

// Título de sección con antetítulo manuscrito
const SectionTitle = ({ script, title, subtitle }) => (
  <div>
    {script && <p className="font-script text-[20px] leading-none text-oro-600">{script}</p>}
    <h2 className="font-serif text-2xl italic font-medium text-verde-700">{title}</h2>
    {subtitle && <p className="mt-0.5 text-sm text-verde-600">{subtitle}</p>}
  </div>
);

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

  // Personas del equipo y cuántas tienen la cuenta activa (mismo dato que la tarjeta "Equipo")
  const activeUsers = users.filter((u) => u.is_active).length;

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
                <div className="flex items-center gap-3 rounded-full border border-oro-300/80 bg-pistacho-50 py-2 pl-2 pr-5 shadow-soft">
                  <span
                    className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-marfil text-oro-600 ring-1 ring-oro-400"
                    aria-hidden="true"
                  >
                    <Sparkles className="h-4 w-4" aria-hidden="true" />
                  </span>
                  <p className="text-sm text-verde-600">
                    ¿Más locales?{' '}
                    <span className="font-serif text-[15px] italic font-medium text-cobalto-500">Mejora tu plan</span>
                  </p>
                </div>
              )
            }
          />

          <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <div
              className="animate-fade-in rounded-xl2 bg-verde-700 p-5 text-marfil"
              style={{ boxShadow: FEATURED_SHADOW }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-pistacho-200">Cafeterías</p>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-oro-300 ring-1 ring-oro-300/60"
                  aria-hidden="true"
                >
                  <Store className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-serif text-[1.65rem] italic font-medium leading-tight sm:text-4xl">
                {tenant.active_cafes_count}
              </p>
              <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-verde-800 ring-1 ring-inset ring-oro-300/30">
                <div
                  className="h-full rounded-full bg-oro-300"
                  style={{ width: `${Math.min(100, (tenant.active_cafes_count / Math.max(tenant.max_cafes, 1)) * 100)}%` }}
                />
              </div>
              <p className="mt-1 text-xs text-verde-100">de {tenant.max_cafes} permitidas</p>
            </div>
            <Card className="animate-fade-in !p-5">
              <div className="flex items-center justify-between gap-2">
                <p className="stat-label">Equipo</p>
                <span
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-pistacho-50 text-oro-600 ring-1 ring-oro-300/70"
                  aria-hidden="true"
                >
                  <Users className="h-4 w-4" aria-hidden="true" />
                </span>
              </div>
              <p className="mt-3 font-serif text-[1.65rem] italic font-medium leading-tight text-verde-700 sm:text-4xl">
                {tenant.active_users_count}
              </p>
              <UsageBar value={tenant.active_users_count} max={tenant.max_users} className="mt-2" />
            </Card>
            <StatTile icon={Receipt} label="En curso" value={activeOrders} hint={`pedidos de ${orders.length}`} delay={120} />
            <StatTile icon={CircleDollarSign} label="Volumen" value={money(totalSales)} hint="pedidos no cancelados" delay={180} />
          </div>

          {/* Cafeterías */}
          <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
            <SectionTitle script="Tu red" title="Tus cafeterías" />
            <Link to="/cafeterias" className="enlace gap-1.5">
              Gestionar <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
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
                  style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                >
                  {/* Fachada: toldo fino sobre cabecera verde bosque */}
                  <div className="relative border-b-2 border-oro-300 bg-verde-700 text-marfil">
                    <ToldoFino />
                    <div className="px-6 pb-5 pt-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className="font-serif text-xl italic font-medium leading-snug text-marfil">{c.name}</h3>
                        {!c.is_active && <Badge tone="terracotta">Cerrada</Badge>}
                      </div>
                      <p className="mt-1.5 inline-flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-[0.18em] text-pistacho-200">
                        <MapPin className="h-3.5 w-3.5 text-oro-300" aria-hidden="true" /> {c.city}
                      </p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 divide-x divide-oro-200/70 border-b border-oro-200/70 text-center">
                    <div className="px-1 py-4">
                      <p className="font-serif text-2xl italic font-medium text-verde-700">{occ}%</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Ocupación</p>
                    </div>
                    <div className="px-1 py-4">
                      <p className="font-serif text-2xl italic font-medium text-verde-700">{s.activos}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">En curso</p>
                    </div>
                    <div className="px-1 py-4">
                      <p className="font-serif text-2xl italic font-medium text-verde-700">{c.active_users_count}</p>
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Equipo</p>
                    </div>
                  </div>
                  <div className="flex items-center justify-between gap-3 bg-crema/60 px-6 py-3.5 text-sm">
                    <span className="inline-flex items-center gap-1.5 text-verde-600">
                      <Clock className="h-3.5 w-3.5 text-oro-600" aria-hidden="true" />
                      {c.open_time?.slice(0, 5)} – {c.close_time?.slice(0, 5)}
                    </span>
                    <span className="font-serif text-lg italic font-medium text-cobalto-500">{money(s.ventas)}</span>
                  </div>
                </Card>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="min-w-0 lg:col-span-3">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <SectionTitle script="Al momento" title="Actividad reciente" subtitle="Últimos pedidos en toda tu red" />
                <Link to="/pedidos" className="enlace gap-1.5">
                  Pedidos <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <ul className="divide-y divide-oro-200/60">
                {recent.map((o) => (
                  <li key={o.id} className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-verde-800">{o.cafeteria_name}</p>
                      <p className="text-xs text-verde-600">
                        {o.order_number} · {new Date(o.created_at).toLocaleString('es-EC', { dateStyle: 'short', timeStyle: 'short' })}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <StatusBadge status={o.status} />
                      <span className="w-20 text-right font-serif text-lg italic text-verde-700">{money(o.total)}</span>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <SectionTitle script="La brigada" title="Tu equipo" subtitle={`${users.length} ${users.length === 1 ? 'persona' : 'personas'} · ${activeUsers} ${activeUsers === 1 ? 'activa' : 'activas'}`} />
                <Link to="/usuarios" className="enlace gap-1.5">
                  Ver <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <div className="mb-5 flex -space-x-2" aria-hidden="true">
                {users.slice(0, 7).map((u) => (
                  <div key={u.id} className="rounded-full ring-2 ring-marfil">
                    <Avatar name={u.full_name} size="sm" />
                  </div>
                ))}
                {users.length > 7 && (
                  <div className="flex h-8 w-8 items-center justify-center rounded-full bg-cobalto-500 text-[11px] font-medium text-marfil ring-2 ring-marfil">
                    +{users.length - 7}
                  </div>
                )}
              </div>
              <ul className="space-y-2.5">
                {roleCounts.map(([role, count]) => (
                  <li key={role} className="flex items-baseline text-sm">
                    <span className="text-verde-600">{ROLE_LABELS[role] || role}</span>
                    <span className="mx-3 flex-1 border-b border-dotted border-oro-300" aria-hidden="true" />
                    <span className="font-serif text-lg italic text-verde-700">{count}</span>
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
