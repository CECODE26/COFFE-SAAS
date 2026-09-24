import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { StatTile, UsageBar, Avatar, money } from '../components/Stats';
import { PLAN_LABELS } from '../lib/roles';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Network, Store, Users, CircleDollarSign, ArrowUpRight, Power, MoreHorizontal } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

const TENANT_STATUS = {
  active: ['sage', 'Activo'],
  inactive: ['neutral', 'Inactivo'],
  suspended: ['terracotta', 'Suspendido'],
};

const PLAN_TONE = { free: 'neutral', basic: 'slate', pro: 'brass', enterprise: 'honey' };
const PLAN_COLOR = { free: '#d3bfad', basic: '#51707f', pro: '#cf9442', enterprise: '#2b1e16' };

export const Plataforma = () => {
  const [tenants, setTenants] = useState([]);
  const [cafes, setCafes] = useState([]);
  const [orders, setOrders] = useState([]);
  const [usersCount, setUsersCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [openMenu, setOpenMenu] = useState(null);

  const load = useCallback(async () => {
    const [t, c, o, u] = await Promise.all([
      fetchAll('/tenants/'),
      fetchAll('/cafeterias/'),
      fetchAll('/pedidos/orders/'),
      api.get('/auth/users/'),
    ]);
    setTenants(t);
    setCafes(c);
    setOrders(o);
    setUsersCount(u.data.count ?? u.data.length);
  }, []);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando la plataforma'))
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
  const activeTenants = tenants.filter((t) => t.status === 'active').length;

  const chartData = tenants
    .map((t) => ({ name: t.name, value: Math.round(salesByTenant[t.id] || 0), plan: t.plan }))
    .sort((a, b) => b.value - a.value);

  const planCounts = Object.keys(PLAN_LABELS).map((p) => ({ plan: p, count: tenants.filter((t) => t.plan === p).length }));

  const runAction = async (fn, ok) => {
    setOpenMenu(null);
    try {
      await fn();
      toast.success(ok);
      await load();
    } catch {
      toast.error('No se pudo completar la acción');
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
          />

          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatTile featured icon={Network} label="Distribuidores" value={tenants.length} hint={`${activeTenants} activos`} />
            <StatTile icon={Store} label="Cafeterías" value={cafes.length} hint={`${cafes.filter((c) => c.is_active).length} abiertas`} delay={60} />
            <StatTile icon={Users} label="Usuarios" value={usersCount} hint="en toda la plataforma" delay={120} />
            <StatTile icon={CircleDollarSign} label="Volumen" value={money(totalSales)} hint={`${orders.length} pedidos`} delay={180} />
          </div>

          {/* Distribuidores */}
          <Card padded={false} className="mb-6">
            <div className="flex items-end justify-between p-6 pb-4">
              <div>
                <h2 className="text-2xl font-medium text-espresso-800">Distribuidores</h2>
                <p className="text-sm text-espresso-400">Plan, límites de uso y estado de cada cuenta</p>
              </div>
              <Link to="/cafeterias" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
                Ver cafeterías <ArrowUpRight className="h-4 w-4" />
              </Link>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full min-w-[820px] text-sm">
                <thead>
                  <tr className="border-y border-foam bg-cream/50 text-left text-[11px] uppercase tracking-wider text-espresso-400">
                    <th className="px-6 py-3 font-medium">Distribuidor</th>
                    <th className="px-3 py-3 font-medium">Plan</th>
                    <th className="px-3 py-3 font-medium">Cafeterías</th>
                    <th className="px-3 py-3 font-medium">Usuarios</th>
                    <th className="px-3 py-3 text-right font-medium">Volumen</th>
                    <th className="px-3 py-3 font-medium">Estado</th>
                    <th className="px-6 py-3" />
                  </tr>
                </thead>
                <tbody className="divide-y divide-foam">
                  {tenants.map((t) => {
                    const [tone, label] = TENANT_STATUS[t.status] || TENANT_STATUS.inactive;
                    return (
                      <tr key={t.id} className="transition-colors hover:bg-cream/40">
                        <td className="px-6 py-4">
                          <div className="flex items-center gap-3">
                            <Avatar name={t.name} dark={t.status === 'active'} />
                            <div className="min-w-0">
                              <p className="font-medium text-espresso-800">{t.name}</p>
                              <p className="truncate text-xs text-espresso-400">{t.email}</p>
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
                        <td className="px-3 py-4 text-right font-serif text-base text-espresso-800">
                          {money(salesByTenant[t.id])}
                        </td>
                        <td className="px-3 py-4">
                          <Badge tone={tone}>{label}</Badge>
                        </td>
                        <td className="relative px-6 py-4 text-right">
                          <button
                            onClick={() => setOpenMenu(openMenu === t.id ? null : t.id)}
                            className="rounded-full p-1.5 text-espresso-400 hover:bg-foam hover:text-espresso-800"
                            aria-label="Acciones"
                          >
                            <MoreHorizontal className="h-5 w-5" />
                          </button>
                          {openMenu === t.id && (
                            <div className="animate-fade-in absolute right-6 top-12 z-20 w-52 rounded-2xl border border-espresso-100 bg-paper p-1.5 text-left shadow-lift">
                              {t.status === 'active' ? (
                                <button
                                  onClick={() => runAction(() => api.post(`/tenants/${t.id}/deactivate/`), `${t.name} desactivado`)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-terracotta-700 hover:bg-terracotta-100"
                                >
                                  <Power className="h-4 w-4" /> Desactivar
                                </button>
                              ) : (
                                <button
                                  onClick={() => runAction(() => api.post(`/tenants/${t.id}/activate/`), `${t.name} activado`)}
                                  className="flex w-full items-center gap-2 rounded-xl px-3 py-2 text-sage-700 hover:bg-sage-100"
                                >
                                  <Power className="h-4 w-4" /> Activar
                                </button>
                              )}
                              <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wider text-espresso-300">
                                Cambiar plan
                              </p>
                              {Object.entries(PLAN_LABELS).map(([plan, name]) => (
                                <button
                                  key={plan}
                                  disabled={plan === t.plan}
                                  onClick={() =>
                                    runAction(() => api.post(`/tenants/${t.id}/upgrade_plan/`, { plan }), `Plan ${name} asignado`)
                                  }
                                  className="flex w-full items-center justify-between rounded-xl px-3 py-2 text-espresso-700 hover:bg-foam disabled:cursor-default disabled:text-espresso-300 disabled:hover:bg-transparent"
                                >
                                  {name}
                                  {plan === t.plan && <span className="text-[10px] uppercase tracking-wider">actual</span>}
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
            <Card className="lg:col-span-3">
              <h2 className="text-2xl font-medium text-espresso-800">Volumen por distribuidor</h2>
              <p className="mb-6 text-sm text-espresso-400">Pedidos no cancelados, en USD</p>
              <ResponsiveContainer width="100%" height={chartData.length * 52 + 10}>
                <BarChart data={chartData} layout="vertical" barSize={22} margin={{ left: 0, right: 16 }}>
                  <XAxis type="number" hide />
                  <YAxis
                    type="category"
                    dataKey="name"
                    width={150}
                    axisLine={false}
                    tickLine={false}
                    tick={{ fill: '#6b4e3b', fontSize: 12 }}
                  />
                  <Tooltip
                    cursor={{ fill: '#f7f1e8' }}
                    contentStyle={{ background: '#2b1e16', border: 'none', borderRadius: 12, fontSize: 13 }}
                    itemStyle={{ color: '#f7f1e8' }}
                    labelStyle={{ color: '#dcae64' }}
                    formatter={(v) => [money(v), 'Volumen']}
                  />
                  <Bar dataKey="value" radius={[4, 10, 10, 4]}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={PLAN_COLOR[d.plan]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="lg:col-span-2">
              <h2 className="text-2xl font-medium text-espresso-800">Planes</h2>
              <p className="mb-6 text-sm text-espresso-400">Cómo se reparten los distribuidores</p>
              <div className="mb-6 flex h-3 overflow-hidden rounded-full bg-foam">
                {planCounts.map(({ plan, count }) =>
                  count ? (
                    <div
                      key={plan}
                      style={{ width: `${(count / tenants.length) * 100}%`, background: PLAN_COLOR[plan] }}
                      className="border-r-2 border-paper last:border-r-0"
                    />
                  ) : null
                )}
              </div>
              <ul className="space-y-3">
                {planCounts.map(({ plan, count }) => (
                  <li key={plan} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2.5 text-espresso-600">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: PLAN_COLOR[plan] }} />
                      {PLAN_LABELS[plan]}
                    </span>
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
