import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { Users, ShoppingCart, Utensils, Calendar } from 'lucide-react';
import api from '../services/api';

export const Dashboard = () => {
  const { mesas, pedidos, fetchMesas, fetchPedidos } = useData();
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
    { name: 'Disponibles', value: stats?.available_mesas || 0 },
    { name: 'Ocupadas', value: stats?.occupied_mesas || 0 },
    { name: 'Reservadas', value: stats?.reserved_mesas || 0 },
  ];

  const statCards = [
    {
      icon: Utensils,
      label: 'Mesas',
      value: stats?.total_mesas || 0,
      color: 'bg-blue-500',
    },
    {
      icon: ShoppingCart,
      label: 'Pedidos Activos',
      value: pedidos.filter(p => p.status !== 'entregada').length,
      color: 'bg-orange-500',
    },
    {
      icon: Users,
      label: 'Ocupación',
      value: `${Math.round(stats?.average_occupancy || 0)}%`,
      color: 'bg-green-500',
    },
    {
      icon: Calendar,
      label: 'Capacidad Total',
      value: stats?.total_capacity || 0,
      color: 'bg-purple-500',
    },
  ];

  if (loading) {
    return (
      <div>
        <Navbar />
        <div className="flex items-center justify-center h-screen">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <Navbar />
      <div className="max-w-7xl mx-auto p-4 sm:p-6 lg:p-8">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">Dashboard</h1>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
          {statCards.map((stat) => {
            const Icon = stat.icon;
            return (
              <Card key={stat.label} className="relative overflow-hidden">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-gray-600 text-sm font-medium">{stat.label}</p>
                    <p className="text-3xl font-bold text-gray-900 mt-2">{stat.value}</p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <Icon className="w-6 h-6 text-white" />
                  </div>
                </div>
              </Card>
            );
          })}
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Mesa Status Chart */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Estado de Mesas</h2>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="value" fill="#8b5cf6" />
              </BarChart>
            </ResponsiveContainer>
          </Card>

          {/* Recent Orders */}
          <Card>
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Pedidos Recientes</h2>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {pedidos.slice(0, 5).map((pedido) => (
                <div key={pedido.id} className="flex justify-between items-center p-3 bg-gray-50 rounded">
                  <div>
                    <p className="font-medium text-gray-900">{pedido.order_number}</p>
                    <p className="text-sm text-gray-600">{pedido.status}</p>
                  </div>
                  <span className="font-semibold text-gray-900">${pedido.total}</span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
