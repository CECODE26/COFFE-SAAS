import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ChefHat, DollarSign, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

export const Pedidos = () => {
  const { pedidos, fetchPedidos, updatePedidoStatus } = useData();
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadPedidos = async () => {
      setLoading(true);
      try {
        await fetchPedidos();
      } catch (error) {
        toast.error('Error cargando pedidos');
      } finally {
        setLoading(false);
      }
    };

    loadPedidos();
  }, [fetchPedidos]);

  const handleStatusChange = async (pedidoId, action) => {
    try {
      await updatePedidoStatus(pedidoId, action);
      toast.success('Pedido actualizado');
    } catch (error) {
      toast.error('Error al actualizar pedido');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pendiente: 'bg-yellow-100 text-yellow-800',
      confirmada: 'bg-blue-100 text-blue-800',
      preparando: 'bg-orange-100 text-orange-800',
      lista: 'bg-green-100 text-green-800',
      entregada: 'bg-gray-100 text-gray-800',
      cancelada: 'bg-red-100 text-red-800',
    };
    return badges[status] || badges.pendiente;
  };

  const filteredPedidos = filter === 'all'
    ? pedidos
    : filter === 'pending'
    ? pedidos.filter(p => ['pendiente', 'confirmada', 'preparando', 'lista'].includes(p.status))
    : pedidos.filter(p => p.status === filter);

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
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Pedidos</h1>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'Todos' },
              { value: 'pending', label: 'Activos' },
              { value: 'entregada', label: 'Completados' },
            ].map((f) => (
              <Button
                key={f.value}
                variant={filter === f.value ? 'primary' : 'secondary'}
                size="sm"
                onClick={() => setFilter(f.value)}
              >
                {f.label}
              </Button>
            ))}
          </div>
        </div>

        {/* Pedidos List */}
        <div className="space-y-4">
          {filteredPedidos.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-gray-600">No hay pedidos para mostrar</p>
            </Card>
          ) : (
            filteredPedidos.map((pedido) => (
              <Card key={pedido.id} className="hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {pedido.order_number}
                    </h3>
                    <p className="text-sm text-gray-600">
                      {new Date(pedido.created_at).toLocaleString('es-EC')}
                    </p>
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(pedido.status)}`}>
                      {pedido.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4 py-4 border-y border-gray-200">
                  <div>
                    <p className="text-sm text-gray-600">Tipo</p>
                    <p className="font-semibold text-gray-900">{pedido.order_type}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Items</p>
                    <p className="font-semibold text-gray-900">{pedido.items?.length || 0}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Total</p>
                    <p className="font-semibold text-lg text-gray-900">${pedido.total}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Pago</p>
                    <p className="font-semibold text-gray-900">
                      {pedido.is_paid ? '✓ Pagado' : 'Pendiente'}
                    </p>
                  </div>
                </div>

                {/* Items */}
                {pedido.items && pedido.items.length > 0 && (
                  <div className="mb-4 bg-gray-50 rounded p-3">
                    <p className="text-sm font-medium text-gray-700 mb-2">Items:</p>
                    <div className="space-y-1">
                      {pedido.items.map((item, idx) => (
                        <p key={idx} className="text-sm text-gray-600">
                          • {item.menu_item_name} x{item.quantity}
                        </p>
                      ))}
                    </div>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {pedido.status === 'pendiente' && (
                    <>
                      <Button
                        size="sm"
                        variant="secondary"
                        onClick={() => handleStatusChange(pedido.id, 'confirm')}
                      >
                        Confirmar
                      </Button>
                      <Button
                        size="sm"
                        variant="danger"
                        onClick={() => handleStatusChange(pedido.id, 'cancel')}
                      >
                        Cancelar
                      </Button>
                    </>
                  )}

                  {pedido.status === 'confirmada' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleStatusChange(pedido.id, 'send_to_kitchen')}
                      className="flex items-center gap-2"
                    >
                      <ChefHat className="w-4 h-4" />
                      Enviar a Cocina
                    </Button>
                  )}

                  {pedido.status === 'preparando' && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleStatusChange(pedido.id, 'mark_ready')}
                    >
                      Marcar Listo
                    </Button>
                  )}

                  {pedido.status === 'lista' && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleStatusChange(pedido.id, 'complete')}
                    >
                      Entregado
                    </Button>
                  )}

                  {!pedido.is_paid && pedido.status === 'entregada' && (
                    <Button
                      size="sm"
                      variant="primary"
                      onClick={() => handleStatusChange(pedido.id, 'mark_paid')}
                      className="flex items-center gap-2"
                    >
                      <DollarSign className="w-4 h-4" />
                      Pagado
                    </Button>
                  )}
                </div>
              </Card>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
