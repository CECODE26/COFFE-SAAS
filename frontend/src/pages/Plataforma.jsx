import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { StatTile, UsageBar, Avatar, money } from '../components/Stats';
import { TenantForm } from '../components/TenantForm';
import { UserForm } from '../components/UserForm';
import { PLAN_LABELS, PLANES_DE_PAGO } from '../lib/roles';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Network, Store, Users, CircleDollarSign, ArrowUpRight, Power, MoreHorizontal, Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

const TENANT_STATUS = {
  active: ['sage', 'Activo'],
  inactive: ['neutral', 'Inactivo'],
  suspended: ['terracotta', 'Suspendido'],
};

// Paleta "Pistacho y oro" por plan: pistacho, cobalto, oro y verde bosque
const PLAN_TONE = { free: 'neutral', basic: 'slate', pro: 'brass', enterprise: 'sage' };
const PLAN_COLOR = { free: '#BFD8A5', basic: '#22409A', pro: '#C39B45', enterprise: '#2A4520' };

// Título de sección con antetítulo manuscrito
const SectionTitle = ({ script, title, subtitle }) => (
  <div>
    {script && <p className="font-script text-[20px] leading-none text-oro-600">{script}</p>}
    <h2 className="font-serif text-2xl italic font-medium text-verde-700">{title}</h2>
    {subtitle && <p className="mt-0.5 text-sm text-verde-600">{subtitle}</p>}
  </div>
);

export const Plataforma = () => {
  const [tenants, setTenants] = useState([]);
  const [cafes, setCafes] = useState([]);
  const [orders, setOrders] = useState([]);
  // Usuarios de la plataforma: activos (como la tabla) y total de cuentas
  const [users, setUsers] = useState({ active: 0, total: 0 });
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);
  // Alta de distribuidor y, al terminar, de su administrador (UserForm con ese distribuidor elegido)
  const [creatingTenant, setCreatingTenant] = useState(false);
  const [adminFor, setAdminFor] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // /plataforma?nuevo=distribuidor (p. ej. desde el aviso del formulario de usuarios) abre el alta
  useEffect(() => {
    if (searchParams.get('nuevo') !== 'distribuidor') return;
    setCreatingTenant(true);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const load = useCallback(async () => {
    const [t, c, o, u] = await Promise.all([
      fetchAll('/tenants/'),
      fetchAll('/cafeterias/'),
      fetchAll('/pedidos/orders/'),
      fetchAll('/auth/users/'),
    ]);
    setTenants(t);
    setCafes(c);
    setOrders(o);
    setUsers({ active: u.filter((x) => x.is_active).length, total: u.length });
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando la plataforma', { id: 'Error cargando la plataforma' }))
      .finally(() => setLoading(false));
  }, [load]);

  const salesByTenant = useMemo(() => {
    const acc = {};
    orders.forEach((o) => {
      if (o.status === 'cancelada') return;
      acc[o.tenant] = (acc[o.tenant] || 0) + Number(o.total);
    });
    return acc;
  }, [orders]);

  const totalSales = Object.values(salesByTenant).reduce((a, b) => a + b, 0);
  // Mismo criterio que el monto: solo pedidos no cancelados
  const validOrders = orders.filter((o) => o.status !== 'cancelada').length;
  const activeTenants = tenants.filter((t) => t.status === 'active').length;

  const chartData = tenants
    .map((t) => ({ name: t.name, value: Math.round((salesByTenant[t.id] || 0) * 100) / 100, plan: t.plan }))
    .sort((a, b) => b.value - a.value);

  // No hay plan gratis: solo aparece si queda alguna cuenta antigua en él
  const planCounts = Object.keys(PLAN_LABELS)
    .map((p) => ({ plan: p, count: tenants.filter((t) => t.plan === p).length }))
    .filter(({ plan, count }) => plan !== 'free' || count > 0);

  const runAction = async (fn, ok) => {
    setOpenMenu(null);
    try {
      const res = await fn();
      toast.success(ok);
      // Bajar a un plan con menos cupo del que ya usa se permite, pero el backend avisa
      if (res?.data?.aviso) toast(res.data.aviso, { duration: 8000 });
      await load();
    } catch (error) {
      const data = error?.response?.data;
      toast.error(data?.error || data?.detail || 'No se pudo completar la acción');
    }
  };

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Consola de plataforma"
            title="Toda la red, de un vistazo"
            subtitle="Distribuidores, planes y actividad de cada cafetería en COFFE-SAAS."
            actions={
              <Button onClick={() => setCreatingTenant(true)}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo distribuidor
              </Button>
            }
          />

          <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            <StatTile featured icon={Network} label="Distribuidores" value={tenants.length} hint={`${activeTenants} activos`} />
            <StatTile icon={Store} label="Cafeterías" value={cafes.length} hint={`${cafes.filter((c) => c.is_active).length} abiertas`} delay={60} />
            <StatTile icon={Users} label="Usuarios" value={users.active} hint={`de ${users.total} en total`} delay={120} />
            <StatTile icon={CircleDollarSign} label="Volumen" value={money(totalSales)} hint={`${validOrders} ${validOrders === 1 ? 'pedido no cancelado' : 'pedidos no cancelados'}`} delay={180} />
          </div>

          {/* Distribuidores */}
          <Card padded={false} className="mb-6">
            <div className="flex flex-wrap items-end justify-between gap-3 p-6 pb-4">
              <SectionTitle script="La red" title="Distribuidores" subtitle="Plan, límites de uso y estado de cada cuenta" />
              <Link to="/cafeterias" className="enlace gap-1.5">
                Ver cafeterías <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>

            {/* relative: contiene el "Acciones" sr-only (absolute); sin esto se escapaba del scroll
                y ensanchaba toda la página en móvil, y el modal de alta salía cortado */}
            <div className="relative overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-y border-oro-300/60 bg-crema/70 text-left text-[11px] uppercase tracking-[0.18em] text-verde-600">
                    <th className="px-6 py-3 font-medium">Distribuidor</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Cafeterías</th>
                    <th className="px-3 py-3 font-medium">Usuarios</th>
                    <th className="px-3 py-3 text-right font-medium">Volumen</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3">
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-oro-200/60">
                  {tenants.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-6 py-10 text-center">
                        <p className="font-serif text-xl italic text-verde-700">Todavía no hay distribuidores</p>
                        <p className="mt-1 text-sm text-verde-600">Crea el primero y luego su administrador.</p>
                        <Button size="sm" variant="secondary" className="mt-4" onClick={() => setCreatingTenant(true)}>
                          <Plus className="h-4 w-4" aria-hidden="true" /> Nuevo distribuidor
                        </Button>
                      </td>
                    </tr>
                  )}
                  {tenants.map((t) => {
                    const [tone, label] = TENANT_STATUS[t.status] || TENANT_STATUS.inactive;
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-pistacho-50">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={t.name} dark={t.status === 'active'} />
                            <div className="min-w-0">
                              <p className="font-medium text-verde-800">{t.name}</p>
                              <p className="truncate text-xs text-verde-600">{t.email}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-4">
                          <Badge tone={PLAN_TONE[t.plan]} dot={false}>{PLAN_LABELS[t.plan]}</Badge>
                        </td>
                        <td className="w-36 px-3 py-4">
                          <UsageBar value={t.active_cafes_count} max={t.max_cafes} />
                        </td>
                        <td className="w-36 px-3 py-4">
                          <UsageBar value={t.active_users_count} max={t.max_users} />
                        </td>
                        <td className="px-3 py-4 text-right font-serif text-base italic text-verde-700">
                          {money(salesByTenant[t.id])}
                        </td>
                        <td className="px-3 py-4">
                          <Badge tone={tone}>{label}</Badge>
                        </td>
                        <td className="relative px-6 py-4 text-right">
                          <button
                            onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                            className="rounded-full p-2 text-verde-600 ring-1 ring-transparent transition-colors hover:bg-pistacho-100 hover:text-cobalto-500 hover:ring-oro-200"
                            aria-label="Acciones"
                            aria-expanded={openMenu === t.id}
                          >
                            <MoreHorizontal className="h-5 w-5" aria-hidden="true" />
                          </button>
                          {openMenu === t.id && (
                            <div className="animate-fade-in absolute right-6 top-12 z-20 w-56 rounded-2xl border border-oro-300/70 bg-marfil p-1.5 text-left shadow-lift">
                              {t.status === 'active' ? (
                                <button
                                  onClick={() => runAction(() => api.post(`/tenants/${t.id}/deactivate/`), `${t.name} desactivado`)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-terracotta-700 transition-colors hover:bg-terracotta-100"
                                >
                                  <Power className="h-4 w-4" aria-hidden="true" /> Desactivar
                                </button>
                              ) : (
                                <button
                                  onClick={() => runAction(() => api.post(`/tenants/${t.id}/activate/`), `${t.name} activado`)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-verde-700 transition-colors hover:bg-pistacho-100"
                                >
                                  <Power className="h-4 w-4" aria-hidden="true" /> Activar
                                </button>
                              )}
                              <div className="mx-3 my-1.5 flex items-center gap-2" aria-hidden="true">
                                <span className="h-px flex-1 bg-oro-300/70" />
                                <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" />
                                <span className="h-px flex-1 bg-oro-300/70" />
                              </div>
                              <p className="px-3 pb-1 text-[10px] font-medium uppercase tracking-[0.22em] text-oro-600">
                                Cambiar plan
                              </p>
                              {/* Planes que se venden; el gratis solo se ve (como actual) en cuentas antiguas */}
                              {(t.plan === 'free' ? ['free', ...PLANES_DE_PAGO] : PLANES_DE_PAGO).map((plan) => (
                                <button
                                  key={plan}
                                  disabled={plan === t.plan}
                                  onClick={() =>
                                    runAction(
                                      () => api.post(`/tenants/${t.id}/upgrade_plan/`, { plan }),
                                      `Plan ${PLAN_LABELS[plan]} asignado`
                                    )
                                  }
                                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-verde-700 transition-colors hover:bg-pistacho-50 hover:text-cobalto-500 disabled:cursor-default disabled:text-verde-500 disabled:hover:bg-transparent"
                                >
                                  <span className="flex items-center gap-2.5">
                                    <span
                                      className="h-2 w-2 rotate-45 ring-1 ring-verde-400/40"
                                      style={{ background: PLAN_COLOR[plan] }}
                                      aria-hidden="true"
                                    />
                                    {PLAN_LABELS[plan]}
                                  </span>
                                  {plan === t.plan && (
                                    <span className="text-[10px] uppercase tracking-[0.18em] text-cobalto-500">actual</span>
                                  )}
                                </button>
                              ))}
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

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            <Card className="min-w-0 lg:col-span-3">
              <div className="mb-6">
                <SectionTitle script="Cifras" title="Volumen por distribuidor" subtitle="Pedidos no cancelados, en USD" />
              </div>
              {chartData.length === 0 && (
                <p className="py-6 text-center text-sm text-verde-600">Aparecerá cuando haya distribuidores en la red.</p>
              )}
              {chartData.length > 0 && (
                <ResponsiveContainer width="100%" height={chartData.length * 52 + 10}>
                  <BarChart data={chartData} layout="vertical" barSize={22} margin={{ left: 0, right: 16 }}>
                    <XAxis type="number" hide />
                    <YAxis
                      type="category"
                      dataKey="name"
                      width={150}
                      axisLine={false}
                      tickLine={false}
                      tick={{ fill: '#2A4520', fontSize: 12, fontFamily: 'Jost, sans-serif' }}
                    />
                    <Tooltip
                      cursor={{ fill: '#BFD8A5', fillOpacity: 0.25 }}
                      contentStyle={{
                        background: '#2A4520',
                        border: '1px solid #C39B45',
                        borderRadius: 14,
                        fontSize: 13,
                        fontFamily: 'Jost, sans-serif',
                      }}
                      itemStyle={{ color: '#FFFBF1' }}
                      labelStyle={{ color: '#D8B45C', fontFamily: '"Playfair Display", serif', fontStyle: 'italic' }}
                      formatter={(v) => [money(v), 'Volumen']}
                    />
                    <Bar dataKey="value" radius={[4, 12, 12, 4]}>
                      {chartData.map((d) => (
                        <Cell
                          key={d.name}
                          fill={PLAN_COLOR[d.plan]}
                          stroke={d.plan === 'free' ? '#7C9E5C' : undefined}
                          strokeWidth={d.plan === 'free' ? 1 : 0}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              )}
            </Card>

            <Card className="lg:col-span-2">
              <div className="mb-6">
                <SectionTitle script="La carta" title="Planes" subtitle="Cómo se reparten los distribuidores" />
              </div>
              <div className="mb-6 flex h-3 overflow-hidden rounded-full bg-pistacho-100 ring-1 ring-inset ring-oro-200/70">
                {planCounts.map(({ plan, count }) =>
                  count ? (
                    <div
                      key={plan}
                      style={{ width: `${(count / tenants.length) * 100}%`, background: PLAN_COLOR[plan] }}
                      className="border-r-2 border-marfil last:border-r-0"
                    />
                  ) : null
                )}
              </div>
              <ul className="space-y-3">
                {planCounts.map(({ plan, count }) => (
                  <li key={plan} className="flex items-baseline text-sm">
                    <span className="flex items-center gap-2.5 text-[12px] font-medium uppercase tracking-[0.16em] text-verde-600">
                      <span
                        className="h-2.5 w-2.5 rotate-45 ring-1 ring-verde-400/40"
                        style={{ background: PLAN_COLOR[plan] }}
                        aria-hidden="true"
                      />
                      {PLAN_LABELS[plan]}
                    </span>
                    <span className="mx-3 flex-1 border-b border-dotted border-oro-300" aria-hidden="true" />
                    <span className="font-serif text-lg italic text-verde-700">{count}</span>
                  </li>
                ))}
              </ul>
            </Card>
          </div>
        </>
      )}
      <TenantForm
        open={creatingTenant}
        onClose={() => setCreatingTenant(false)}
        onCreated={() => load().catch(() => {})}
        onCreateAdmin={(tenant) => {
          setCreatingTenant(false);
          setAdminFor(tenant);
        }}
      />
      <UserForm
        open={!!adminFor}
        onClose={() => setAdminFor(null)}
        onCreated={() => load().catch(() => {})}
        initialRole="distribuidor_admin"
        initialTenant={adminFor?.id}
      />
    </Layout>
  );
};
