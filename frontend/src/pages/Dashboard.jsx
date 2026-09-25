import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { money } from '../components/Stats';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Receipt, Armchair, Gauge, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

// ¿La fecha ISO cae en el día de hoy (hora local del navegador)?
const isToday = (iso) => {
  if (!iso) return false;
  const d = new Date(iso);
  const now = new Date();
  return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth() && d.getDate() === now.getDate();
};

// Roles que ven varios locales a la vez
const MULTI_LOCAL_ROLES = ['distribuidor_admin', 'super_admin'];

export const Dashboard = () => {
  const { pedidos, fetchMesas, fetchPedidos } = useData();
  const { user } = useAuth();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        await fetchMesas();
        await fetchPedidos();

        // Fetch stats
        const mesasStats = await api.get('/mesas/mesas/stats/');
        setStats(mesasStats.data);
      } catch (error) {
        console.error('Error loading dashboard data:', error);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fetchMesas, fetchPedidos]);

  // "Limpiando" en cobalto claro, como su insignia de estado
  const chartData = [
    { name: 'Disponibles', value: stats?.available_mesas || 0, color: '#7C9E5C' },
    { name: 'Ocupadas', value: stats?.occupied_mesas || 0, color: '#A4452F' },
    { name: 'Reservadas', value: stats?.reserved_mesas || 0, color: '#C39B45' },
    { name: 'Limpiando', value: stats?.cleaning_mesas || 0, color: '#4A64B8' },
  ];

  // Solo pedidos creados hoy: "En curso" es un subconjunto de ellos
  const pedidosHoy = pedidos.filter((p) => isToday(p.created_at));
  const enCursoHoy = pedidosHoy.filter((p) => !['entregada', 'cancelada'].includes(p.status)).length;
  const multiLocal = MULTI_LOCAL_ROLES.includes(user?.role);

  const statCards = [
    {
      icon: Armchair,
      label: 'Mesas',
      value: stats?.total_mesas || 0,
      hint: `${stats?.available_mesas || 0} disponibles`,
    },
    {
      icon: Receipt,
      label: 'En curso',
      value: enCursoHoy,
      hint: `de ${pedidosHoy.length} ${pedidosHoy.length === 1 ? 'pedido' : 'pedidos'} hoy`,
    },
    {
      icon: Gauge,
      label: 'Ocupación',
      value: `${Math.round(stats?.average_occupancy || 0)}%`,
      hint: 'promedio del salón',
    },
    {
      icon: Users,
      label: 'Capacidad',
      value: stats?.total_capacity || 0,
      hint: 'comensales',
    },
  ];

  const today = new Date().toLocaleDateString('es-EC', { weekday: 'long', day: 'numeric', month: 'long' });

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow={today}
            title={`${greeting()}${user?.first_name ? `, ${user.first_name}` : ''}`}
            subtitle={multiLocal ? 'Así van tus locales hoy.' : 'Así va tu cafetería hoy.'}
          />

          {/* Métricas */}
          <div className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              const featured = i === 0;
              return (
                <div
                  key={stat.label}
                  className={`animate-fade-in relative overflow-hidden rounded-2xl px-4 py-3 ${
                    featured
                      ? 'bg-verde-700 text-marfil shadow-lift'
                      : 'border border-oro-200/80 bg-marfil shadow-soft'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                >
                  {/* Aro dorado interior en la tarjeta destacada */}
                  {featured && (
                    <span
                      className="pointer-events-none absolute inset-1 rounded-[0.8rem] border border-oro-400/60"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-center justify-between gap-2">
                    <p
                      className={`text-[10px] font-medium uppercase tracking-[0.16em] ${
                        featured ? 'text-oro-300' : 'text-verde-600'
                      }`}
                    >
                      {stat.label}
                    </p>
                    <span
                      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full ring-1 ${
                        featured
                          ? 'bg-verde-800/60 text-oro-300 ring-oro-400/50'
                          : 'bg-pistacho-100 text-cobalto-500 ring-oro-300'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="h-3 w-3" aria-hidden="true" />
                    </span>
                  </div>
                  <p
                    className={`relative mt-2 font-serif text-[1.6rem] italic font-medium leading-none ${
                      featured ? 'text-marfil' : 'text-verde-700'
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className={`relative mt-1.5 flex items-center gap-1.5 text-[11px] ${featured ? 'text-verde-100' : 'text-verde-600'}`}>
                    <span
                      className={`inline-block h-1 w-1 shrink-0 rotate-45 ${featured ? 'bg-oro-300' : 'bg-oro-400'}`}
                      aria-hidden="true"
                    />
                    {stat.hint}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
            {/* Estado de mesas */}
            <Card padded={false} className="p-4 sm:p-5 lg:col-span-3">
              <div className="mb-3 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="font-serif text-xl italic font-medium text-verde-700">Estado del salón</h2>
                  <p className="text-xs text-verde-600">Distribución actual de mesas</p>
                </div>
                <Link to="/mesas" className="enlace !min-h-[32px] shrink-0 gap-1 !text-[11px]">
                  Ver mesas <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={170}>
                <BarChart data={chartData} barSize={34} margin={{ top: 4, right: 4, bottom: 0, left: -8 }}>
                  <CartesianGrid vertical={false} stroke="#E7DDBF" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="name"
                    axisLine={{ stroke: '#C39B45' }}
                    tickLine={false}
                    tick={{ fill: '#4A6334', fontSize: 11 }}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#4A6334', fontSize: 11 }} width={28} />
                  <Tooltip
                    cursor={{ fill: 'rgba(191, 216, 165, 0.25)' }}
                    contentStyle={{
                      background: '#2A4520',
                      border: '1px solid #C39B45',
                      borderRadius: 14,
                      color: '#FFFBF1',
                      fontSize: 13,
                    }}
                    itemStyle={{ color: '#FFFBF1' }}
                    labelStyle={{ color: '#D8B45C', fontFamily: '"Playfair Display", Georgia, serif', fontStyle: 'italic' }}
                    formatter={(v) => [v, 'Mesas']}
                  />
                  {/* Barras con remate en arco, como la vitrina */}
                  <Bar dataKey="value" radius={[17, 17, 0, 0]}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Leyenda con rombos */}
              <ul className="mt-2 flex flex-wrap justify-center gap-x-5 gap-y-1 border-t border-oro-200/70 pt-2.5">
                {chartData.map((d) => (
                  <li key={d.name} className="flex items-center gap-1.5">
                    <span className="inline-block h-1.5 w-1.5 rotate-45" style={{ background: d.color }} aria-hidden="true" />
                    <span className="text-[10px] font-medium uppercase tracking-[0.14em] text-verde-600">{d.name}</span>
                    <span className="font-serif text-sm italic text-verde-700">{d.value}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Pedidos recientes */}
            <Card padded={false} className="p-4 sm:p-5 lg:col-span-2">
              <div className="mb-2 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="font-serif text-xl italic font-medium text-verde-700">Pedidos recientes</h2>
                  <p className="text-xs text-verde-600">Últimos movimientos</p>
                </div>
                <Link to="/pedidos" className="enlace !min-h-[32px] shrink-0 gap-1 !text-[11px]">
                  Todos <ArrowUpRight className="h-3.5 w-3.5" aria-hidden="true" />
                </Link>
              </div>
              {pedidos.length === 0 ? (
                <div className="py-8 text-center">
                  <span className="rombo" aria-hidden="true" />
                  <p className="mt-3 font-serif text-lg italic text-verde-600">Aún no hay pedidos hoy.</p>
                </div>
              ) : (
                <ul className="divide-y divide-oro-200/70">
                  {pedidos.slice(0, 5).map((pedido) => (
                    <li key={pedido.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium tracking-wide text-verde-700">{pedido.order_number}</p>
                        <StatusBadge status={pedido.status} className="mt-0.5 !py-0.5 !text-[10px]" />
                      </div>
                      <span className="shrink-0 font-serif text-base italic text-verde-700">{money(pedido.total)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
        </>
      )}
    </Layout>
  );
};
