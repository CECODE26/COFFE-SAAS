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
          <div className="mb-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              const featured = i === 0;
              return (
                <div
                  key={stat.label}
                  className={`animate-fade-in relative overflow-hidden rounded-3xl p-4 sm:p-5 ${
                    featured
                      ? 'bg-verde-700 text-marfil shadow-lift'
                      : 'border border-oro-200/80 bg-marfil shadow-soft'
                  }`}
                  style={{ animationDelay: `${Math.min(i, 10) * 60}ms` }}
                >
                  {/* Aro dorado interior en la tarjeta destacada */}
                  {featured && (
                    <span
                      className="pointer-events-none absolute inset-1.5 rounded-[1.1rem] border border-oro-400/60"
                      aria-hidden="true"
                    />
                  )}
                  <div className="relative flex items-center justify-between gap-2">
                    <p
                      className={`text-[11px] font-medium uppercase tracking-[0.2em] ${
                        featured ? 'text-oro-300' : 'text-verde-600'
                      }`}
                    >
                      {stat.label}
                    </p>
                    <span
                      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ${
                        featured
                          ? 'bg-verde-800/60 text-oro-300 ring-oro-400/50'
                          : 'bg-pistacho-100 text-cobalto-500 ring-oro-300'
                      }`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" aria-hidden="true" />
                    </span>
                  </div>
                  <p
                    className={`relative mt-4 font-serif text-4xl italic font-medium leading-none sm:text-[2.6rem] ${
                      featured ? 'text-marfil' : 'text-verde-700'
                    }`}
                  >
                    {stat.value}
                  </p>
                  <p className={`relative mt-3 flex items-center gap-2 text-xs ${featured ? 'text-verde-100' : 'text-verde-600'}`}>
                    <span
                      className={`inline-block h-1.5 w-1.5 shrink-0 rotate-45 ${featured ? 'bg-oro-300' : 'bg-oro-400'}`}
                      aria-hidden="true"
                    />
                    {stat.hint}
                  </p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Estado de mesas */}
            <Card className="lg:col-span-3">
              <div className="mb-6 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="font-serif text-2xl italic font-medium text-verde-700">Estado del salón</h2>
                  <p className="mt-1 text-sm text-verde-600">Distribución actual de mesas</p>
                </div>
                <Link to="/mesas" className="enlace shrink-0 gap-1 text-[12px]">
                  Ver mesas <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barSize={56}>
                  <CartesianGrid vertical={false} stroke="#E7DDBF" strokeDasharray="2 4" />
                  <XAxis
                    dataKey="name"
                    axisLine={{ stroke: '#C39B45' }}
                    tickLine={false}
                    tick={{ fill: '#4A6334', fontSize: 12, letterSpacing: '0.08em' }}
                  />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#4A6334', fontSize: 12 }} width={28} />
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
                  <Bar dataKey="value" radius={[28, 28, 0, 0]}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
              {/* Leyenda con rombos */}
              <ul className="mt-4 flex flex-wrap justify-center gap-x-6 gap-y-2 border-t border-oro-200/70 pt-4">
                {chartData.map((d) => (
                  <li key={d.name} className="flex items-center gap-2">
                    <span className="inline-block h-2 w-2 rotate-45" style={{ background: d.color }} aria-hidden="true" />
                    <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-verde-600">{d.name}</span>
                    <span className="font-serif text-lg italic text-verde-700">{d.value}</span>
                  </li>
                ))}
              </ul>
            </Card>

            {/* Pedidos recientes */}
            <Card className="lg:col-span-2">
              <div className="mb-4 flex flex-wrap items-start justify-between gap-x-4 gap-y-1">
                <div>
                  <h2 className="font-serif text-2xl italic font-medium text-verde-700">Pedidos recientes</h2>
                  <p className="mt-1 text-sm text-verde-600">Últimos movimientos</p>
                </div>
                <Link to="/pedidos" className="enlace shrink-0 gap-1 text-[12px]">
                  Todos <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </Link>
              </div>
              {pedidos.length === 0 ? (
                <div className="py-12 text-center">
                  <span className="rombo" aria-hidden="true" />
                  <p className="mt-3 font-serif text-lg italic text-verde-600">Aún no hay pedidos hoy.</p>
                </div>
              ) : (
                <ul className="divide-y divide-oro-200/70">
                  {pedidos.slice(0, 5).map((pedido) => (
                    <li key={pedido.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium tracking-wide text-verde-700">{pedido.order_number}</p>
                        <StatusBadge status={pedido.status} className="mt-1" />
                      </div>
                      <span className="shrink-0 font-serif text-xl italic text-verde-700">{money(pedido.total)}</span>
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
