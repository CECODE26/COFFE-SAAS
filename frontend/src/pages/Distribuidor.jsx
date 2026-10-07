import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge, StatusBadge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { StatTile, Avatar, money } from '../components/Stats';
import { ToldoFino } from '../components/Decor';
import { CafeteriaForm } from '../components/CafeteriaForm';
import { ROLE_LABELS } from '../lib/roles';
import { PLAN_COLOR, precio } from '../lib/planes';
import { Store, Users, Receipt, CircleDollarSign, MapPin, Clock, ArrowUpRight, Plus, UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

// Título de sección con antetítulo manuscrito
const SectionTitle = ({ script, title, subtitle }) => (
  <div>
    {script && <p className="font-script text-[20px] leading-none text-oro-600">{script}</p>}
    <h2 className="font-serif text-2xl italic font-medium text-verde-700">{title}</h2>
    {subtitle && <p className="mt-0.5 text-sm text-verde-600">{subtitle}</p>}
  </div>
);

// Estado vacío breve dentro de una tarjeta: rombo, frase en cursiva y, si hace falta, una acción
const Vacio = ({ title, text, children }) => (
  <div className="py-6 text-center">
    <span className="rombo" aria-hidden="true" />
    <p className="mt-3 font-serif text-lg italic text-verde-700">{title}</p>
    {text && <p className="mx-auto mt-1 max-w-sm text-sm text-verde-600">{text}</p>}
    {children && <div className="mt-4 flex justify-center">{children}</div>}
  </div>
);

export const Distribuidor = () => {
  const [tenant, setTenant] = useState(null);
  const [cafes, setCafes] = useState([]);
  const [mesas, setMesas] = useState([]);
  const [orders, setOrders] = useState([]);
  const [users, setUsers] = useState([]);
  // Cafeterías activas por plan y total mensual estimado de la red (GET /cafeterias/resumen_planes/)
  const [planes, setPlanes] = useState(null);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    const [t, c, m, o, u, p] = await Promise.all([
      api.get('/tenants/my_tenant/'),
      fetchAll('/cafeterias/'),
      fetchAll('/mesas/mesas/'),
      fetchAll('/pedidos/orders/'),
      fetchAll('/auth/users/'),
      api.get('/cafeterias/resumen_planes/'),
    ]);
    setTenant(t.data);
    setCafes(c);
    setMesas(m);
    setOrders(o);
    setUsers(u);
    setPlanes(p.data);
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando tu red', { id: 'Error cargando tu red' }))
      .finally(() => setLoading(false));
  }, [load]);

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
  const openCafes = cafes.filter((c) => c.is_active).length;

  // Personas del equipo y cuántas tienen la cuenta activa
  const activeUsers = users.filter((u) => u.is_active).length;
  // Además del propio distribuidor: ¿ya hay admins de cafetería u otro personal?
  const hasStaff = users.some((u) => u.role !== 'distribuidor_admin');

  const roleCounts = useMemo(() => {
    const acc = {};
    users.forEach((u) => (acc[u.role] = (acc[u.role] || 0) + 1));
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [users]);

  const recent = [...orders].sort((a, b) => new Date(b.created_at) - new Date(a.created_at)).slice(0, 6);
  const planRows = planes?.planes || [];
  const activeByPlan = planes?.cafeterias_activas || 0;

  const newCafeButton = (label, variant = 'primary') => (
    <Button variant={variant} size={variant === 'primary' ? 'md' : 'sm'} onClick={() => setCreating(true)}>
      <Plus className="h-4 w-4" aria-hidden="true" /> {label}
    </Button>
  );

  return (
    <Layout>
      {loading || !tenant ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Distribuidor"
            title={tenant.name}
            subtitle={`${tenant.business_name} · RUC ${tenant.ruc}${tenant.city ? ` · ${tenant.city}` : ''}`}
            actions={cafes.length > 0 && newCafeButton('Nueva cafetería')}
          />

          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatTile
              featured
              icon={Store}
              label="Cafeterías"
              value={openCafes}
              hint={cafes.length ? `abiertas de ${cafes.length}` : 'aún sin locales'}
            />
            <StatTile icon={Users} label="Equipo" value={activeUsers} hint={`activas de ${users.length}`} delay={60} />
            <StatTile icon={Receipt} label="En curso" value={activeOrders} hint={`pedidos de ${orders.length}`} delay={120} />
            <StatTile icon={CircleDollarSign} label="Volumen" value={money(totalSales)} hint="pedidos no cancelados" delay={180} />
          </div>

          {/* Cafeterías */}
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <SectionTitle script="Tu red" title="Tus cafeterías" />
            {cafes.length > 0 && (
              <Link to="/cafeterias" className="enlace gap-1.5">
                Gestionar <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            )}
          </div>
          {cafes.length === 0 ? (
            <Card className="mb-6">
              <Vacio
                title="Todavía no tienes cafeterías"
                text="Crea tu primer local, elige su plan y luego dale un admin para que gestione su equipo."
              >
                {newCafeButton('Crear la primera cafetería', 'secondary')}
              </Vacio>
            </Card>
          ) : (
            <div className="mb-6 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
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
                        <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] font-medium uppercase tracking-[0.18em] text-pistacho-200">
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin className="h-3.5 w-3.5 text-oro-300" aria-hidden="true" /> {c.city}
                          </span>
                          {c.plan_info && (
                            <span className="inline-flex items-center gap-1.5 text-oro-200">
                              <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" aria-hidden="true" />
                              <span className="sr-only">Plan:</span> {c.plan_info.nombre}
                            </span>
                          )}
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
          )}

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            <Card className="min-w-0 lg:col-span-3">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                <SectionTitle script="Al momento" title="Actividad reciente" subtitle="Últimos pedidos en toda tu red" />
                {recent.length > 0 && (
                  <Link to="/pedidos" className="enlace gap-1.5">
                    Pedidos <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                )}
              </div>
              {recent.length === 0 ? (
                <Vacio
                  title="Aún no hay pedidos"
                  text={
                    cafes.length
                      ? 'Los pedidos de tus cafeterías aparecerán aquí en cuanto empiecen a atender.'
                      : 'Cuando tengas cafeterías, aquí verás sus últimos pedidos.'
                  }
                />
              ) : (
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
              )}
            </Card>

            <div className="flex flex-col gap-4 lg:col-span-2">
              {/* Planes de la red: el plan lo paga cada cafetería */}
              <Card>
                <div className="mb-4">
                  <SectionTitle script="La carta" title="Tus planes" subtitle="Cafeterías abiertas por plan" />
                </div>
                {activeByPlan === 0 ? (
                  <p className="text-sm text-verde-600">
                    Cuando tengas cafeterías abiertas verás aquí cuántas hay en cada plan y lo que suman al mes.
                  </p>
                ) : (
                  <>
                    <ul className="space-y-2.5">
                      {planRows.map((p) => (
                        <li key={p.codigo} className="flex items-baseline text-sm">
                          <span className="flex items-center gap-2 text-verde-600">
                            <span
                              className="h-2 w-2 rotate-45 ring-1 ring-verde-400/40"
                              style={{ background: PLAN_COLOR[p.codigo] }}
                              aria-hidden="true"
                            />
                            {p.nombre}
                            <span className="text-xs text-verde-500">
                              {p.cafeterias_activas} × {precio(p.precio_mensual)}
                            </span>
                          </span>
                          <span className="mx-3 flex-1 border-b border-dotted border-oro-300" aria-hidden="true" />
                          <span className="font-serif text-lg italic text-verde-700">{money(p.ingreso_mensual)}</span>
                        </li>
                      ))}
                    </ul>
                    <div className="mt-4 border-t border-oro-200/80 pt-3">
                      <p className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Total mensual estimado</p>
                      <p className="mt-1 flex items-baseline gap-2">
                        <span className="font-serif text-[1.6rem] italic font-medium leading-none text-cobalto-500">
                          {money(planes.ingreso_mensual)}
                        </span>
                        <span className="text-xs font-medium text-verde-600">/ mes + IVA</span>
                      </p>
                      <p className="mt-1 text-[11px] text-verde-600">
                        Con IVA ({planes.iva_porcentaje}%): {money(planes.ingreso_mensual_con_iva)}
                      </p>
                    </div>
                  </>
                )}
              </Card>

              <Card>
                <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
                  <SectionTitle
                    script="La brigada"
                    title="Tu equipo"
                    subtitle={`${users.length} ${users.length === 1 ? 'persona' : 'personas'} · ${activeUsers} ${activeUsers === 1 ? 'activa' : 'activas'}`}
                  />
                  <Link to="/usuarios" className="enlace gap-1.5">
                    Ver <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
                {!hasStaff ? (
                  <Vacio
                    title="Por ahora solo estás tú"
                    text={
                      cafes.length
                        ? 'Crea el admin de cada cafetería: él da de alta a su gerente, camareros, cajeros y cocina.'
                        : 'Primero crea una cafetería; después, su admin.'
                    }
                  >
                    {cafes.length > 0 && (
                      <Link to="/usuarios" className="enlace gap-1.5">
                        <UserPlus className="h-4 w-4" aria-hidden="true" /> Crear admin de cafetería
                      </Link>
                    )}
                  </Vacio>
                ) : (
                  <>
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
                  </>
                )}
              </Card>
            </div>
          </div>
        </>
      )}
      <CafeteriaForm open={creating} onClose={() => setCreating(false)} onSaved={() => load().catch(() => {})} />
    </Layout>
  );
};
