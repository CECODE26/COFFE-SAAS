import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader } from '../components/Layout';
import { Card } from '../components/Card';
import { StatusBadge } from '../components/StatusBadge';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { Users, Receipt, Armchair, Gauge, ArrowUpRight } from 'lucide-react';
import api from '../services/api';

const greeting = () => {
  const h = new Date().getHours();
  if (h < 12) return 'Buenos días';
  if (h < 19) return 'Buenas tardes';
  return 'Buenas noches';
};

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

  const chartData = [
    { name: 'Disponibles', value: stats?.available_mesas || 0, color: '#5b7a55' },
    { name: 'Ocupadas', value: stats?.occupied_mesas || 0, color: '#b0523a' },
    { name: 'Reservadas', value: stats?.reserved_mesas || 0, color: '#cf9442' },
  ];

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
      value: pedidos.filter(p => !['entregada', 'cancelada'].includes(p.status)).length,
      hint: `pedidos de ${pedidos.length}`,
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
            subtitle="Así va tu cafetería hoy."
          />

          {/* Métricas */}
          <div className="mb-8 grid grid-cols-2 gap-4 lg:grid-cols-4">
            {statCards.map((stat, i) => {
              const Icon = stat.icon;
              const featured = i === 0;
              return (
                <div
                  key={stat.label}
                  className={`animate-fade-in rounded-xl2 p-5 ${
                    featured
                      ? 'bg-espresso-800 text-cream shadow-lift'
                      : 'border border-espresso-100/70 bg-paper shadow-soft'
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                >
                  <div className="flex items-center justify-between">
                    <p className={`text-xs font-medium uppercase tracking-wider ${featured ? 'text-espresso-200' : 'text-espresso-400'}`}>
                      {stat.label}
                    </p>
                    <Icon className={`h-4 w-4 ${featured ? 'text-brass-300' : 'text-brass-500'}`} />
                  </div>
                  <p className={`mt-4 font-serif text-4xl font-medium ${featured ? 'text-cream' : 'text-espresso-800'}`}>
                    {stat.value}
                  </p>
                  <p className={`mt-1 text-xs ${featured ? 'text-espresso-300' : 'text-espresso-400'}`}>{stat.hint}</p>
                </div>
              );
            })}
          </div>

          <div className="grid grid-cols-1 gap-6 lg:grid-cols-5">
            {/* Estado de mesas */}
            <Card className="lg:col-span-3">
              <div className="mb-6 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-medium text-espresso-800">Estado del salón</h2>
                  <p className="text-sm text-espresso-400">Distribución actual de mesas</p>
                </div>
                <Link to="/mesas" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
                  Ver mesas <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={chartData} barSize={56}>
                  <CartesianGrid vertical={false} stroke="#efe6d8" />
                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#8c6b55', fontSize: 12 }} />
                  <YAxis allowDecimals={false} axisLine={false} tickLine={false} tick={{ fill: '#b39680', fontSize: 12 }} width={28} />
                  <Tooltip
                    cursor={{ fill: '#f7f1e8' }}
                    contentStyle={{
                      background: '#2b1e16',
                      border: 'none',
                      borderRadius: 12,
                      color: '#f7f1e8',
                      fontSize: 13,
                    }}
                    itemStyle={{ color: '#f7f1e8' }}
                    labelStyle={{ color: '#dcae64' }}
                    formatter={(v) => [v, 'Mesas']}
                  />
                  <Bar dataKey="value" radius={[10, 10, 4, 4]}>
                    {chartData.map((d) => (
                      <Cell key={d.name} fill={d.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Card>

            {/* Pedidos recientes */}
            <Card className="lg:col-span-2">
              <div className="mb-4 flex items-start justify-between">
                <div>
                  <h2 className="text-2xl font-medium text-espresso-800">Pedidos recientes</h2>
                  <p className="text-sm text-espresso-400">Últimos movimientos</p>
                </div>
                <Link to="/pedidos" className="inline-flex items-center gap-1 text-sm font-medium text-brass-600 hover:text-brass-700">
                  Todos <ArrowUpRight className="h-4 w-4" />
                </Link>
              </div>
              {pedidos.length === 0 ? (
                <p className="py-12 text-center font-serif italic text-espresso-400">Aún no hay pedidos hoy.</p>
              ) : (
                <ul className="divide-y divide-foam">
                  {pedidos.slice(0, 5).map((pedido) => (
                    <li key={pedido.id} className="flex items-center justify-between gap-3 py-3.5">
                      <div className="min-w-0">
                        <p className="truncate font-medium text-espresso-800">{pedido.order_number}</p>
                        <StatusBadge status={pedido.status} className="mt-1" />
                      </div>
                      <span className="font-serif text-lg text-espresso-700">${pedido.total}</span>
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
