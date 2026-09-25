import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge, Badge } from '../components/StatusBadge';
import { ChefHat, DollarSign, Receipt, Check, Clock } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTIVE = ['pendiente', 'confirmada', 'preparando', 'lista'];

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

  const filteredPedidos = filter === 'all'
    ? pedidos
    : filter === 'pending'
    ? pedidos.filter(p => ACTIVE.includes(p.status))
    : pedidos.filter(p => p.status === filter);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Barra y cocina"
            title="Pedidos"
            subtitle="Sigue cada orden desde que se toma hasta que se cobra."
            actions={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todos', count: pedidos.length },
                  { value: 'pending', label: 'Activos', count: pedidos.filter(p => ACTIVE.includes(p.status)).length },
                  { value: 'entregada', label: 'Completados', count: pedidos.filter(p => p.status === 'entregada').length },
                ]}
              />
            }
          />

          {filteredPedidos.length === 0 ? (
            <EmptyState icon={Receipt} title="No hay pedidos para mostrar" description="Cuando lleguen nuevas órdenes aparecerán aquí." />
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
              {filteredPedidos.map((pedido, i) => (
                <Card
                  key={pedido.id}
                  padded={false}
                  className="animate-fade-in flex flex-col hover:shadow-lift"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <div className="flex items-start justify-between gap-4 p-6 pb-4">
                    <div className="min-w-0">
                      {pedido.cafeteria_name && <p className="eyebrow mb-1 truncate">{pedido.cafeteria_name}</p>}
                      <h3 className="font-serif text-2xl italic font-medium text-verde-700">{pedido.order_number}</h3>
                      <p className="mt-1.5 inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-verde-600">
                        <Clock className="h-3.5 w-3.5 text-oro-600" aria-hidden="true" />
                        {new Date(pedido.created_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}
                        <span className="inline-block h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
                        <span className="text-[11px] font-medium uppercase tracking-[0.16em]">{pedido.order_type}</span>
                      </p>
                    </div>
                    <StatusBadge status={pedido.status} className="shrink-0" />
                  </div>

                  {/* Items estilo ticket */}
                  <div className="mx-6 flex-1 rounded-2xl border border-dashed border-oro-400/80 bg-crema/70 px-4 py-3">
                    {pedido.items && pedido.items.length > 0 ? (
                      <ul className="space-y-1.5 text-sm">
                        {pedido.items.map((item, idx) => (
                          <li key={idx} className="flex items-baseline gap-2 text-verde-700">
                            <span className="min-w-0 truncate">{item.menu_item_name}</span>
                            <span className="mb-1 min-w-[1rem] flex-1 border-b border-dotted border-oro-400" aria-hidden="true" />
                            <span className="shrink-0 font-serif italic text-verde-600">×{item.quantity}</span>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-sm text-verde-600">
                        {pedido.items_count || 0} {pedido.items_count === 1 ? 'producto' : 'productos'}
                      </p>
                    )}
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-dashed border-oro-400/80 pt-3">
                      {pedido.is_paid ? (
                        <Badge tone="sage">Pagado</Badge>
                      ) : (
                        <Badge tone="honey">Por cobrar</Badge>
                      )}
                      <span className="flex items-baseline gap-2">
                        <span className="stat-label">Total</span>
                        <span className="font-serif text-2xl italic font-medium text-verde-700">${pedido.total}</span>
                      </span>
                    </div>
                  </div>

                  {/* Acciones */}
                  <div className="flex flex-wrap gap-2 p-6 pt-4">
                    {pedido.status === 'pendiente' && (
                      <>
                        <Button size="sm" onClick={() => handleStatusChange(pedido.id, 'confirm')}>
                          <Check className="h-4 w-4" aria-hidden="true" />
                          Confirmar
                        </Button>
                        <Button size="sm" variant="danger" onClick={() => handleStatusChange(pedido.id, 'cancel')}>
                          Cancelar
                        </Button>
                      </>
                    )}

                    {pedido.status === 'confirmada' && (
                      <Button size="sm" variant="accent" onClick={() => handleStatusChange(pedido.id, 'send_to_kitchen')}>
                        <ChefHat className="h-4 w-4" aria-hidden="true" />
                        Enviar a cocina
                      </Button>
                    )}

                    {pedido.status === 'preparando' && (
                      <Button size="sm" variant="success" onClick={() => handleStatusChange(pedido.id, 'mark_ready')}>
                        Marcar listo
                      </Button>
                    )}

                    {pedido.status === 'lista' && (
                      <Button size="sm" variant="success" onClick={() => handleStatusChange(pedido.id, 'complete')}>
                        Entregado
                      </Button>
                    )}

                    {!pedido.is_paid && pedido.status === 'entregada' && (
                      <Button size="sm" onClick={() => handleStatusChange(pedido.id, 'mark_paid')}>
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                        Registrar pago
                      </Button>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          )}
        </>
      )}
    </Layout>
  );
};
