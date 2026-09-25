import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useData } from '../hooks/useData';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge, Badge } from '../components/StatusBadge';
import { money } from '../components/Stats';
import { Tablero } from '../components/tablero/Tablero';
import { esQR, origenDe } from '../components/tablero/utils';
import { ChefHat, DollarSign, Receipt, Check, Clock, Armchair, User, X, QrCode } from 'lucide-react';
import toast from 'react-hot-toast';

const ACTIVE = ['pendiente', 'confirmada', 'preparando', 'lista'];

// Filtros de la lista. Un pedido sigue abierto hasta que se cobra (o se cancela):
// "Activos" + "Por cobrar" son los abiertos y "Completados" solo los entregados y pagados.
const FILTERS = {
  all: () => true,
  pending: (p) => ACTIVE.includes(p.status),
  por_cobrar: (p) => p.status === 'entregada' && !p.is_paid,
  entregada: (p) => p.status === 'entregada' && p.is_paid,
};

// Tipo de pedido del backend -> etiqueta en español
const ORDER_TYPE_LABELS = {
  mesa: 'En mesa',
  takeaway: 'Para llevar',
  delivery: 'A domicilio',
  escritorio: 'Mostrador',
};

// Métodos de pago que acepta POST /pedidos/orders/{id}/mark_paid/
const PAYMENT_METHODS = [
  { value: 'efectivo', label: 'Efectivo' },
  { value: 'tarjeta', label: 'Tarjeta' },
  { value: 'transferencia', label: 'Transferencia' },
];

// Vista de lista con cobro (la de siempre). Los pedidos por QR se cobran desde la cuenta de la mesa.
const ListaPedidos = () => {
  const { pedidos, fetchPedidos, updatePedidoStatus } = useData();
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  // Pedido cuyo selector de método de pago está abierto
  const [payingId, setPayingId] = useState(null);
  // Pedido con una petición en curso (evita dobles clics)
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    const loadPedidos = async () => {
      setLoading(true);
      try {
        await fetchPedidos();
      } catch (error) {
        toast.error('Error cargando pedidos', { id: 'Error cargando pedidos' });
      } finally {
        setLoading(false);
      }
    };

    loadPedidos();
  }, [fetchPedidos]);

  const handleStatusChange = async (pedidoId, action) => {
    setBusyId(pedidoId);
    try {
      await updatePedidoStatus(pedidoId, action);
      toast.success('Pedido actualizado');
    } catch (error) {
      toast.error('Error al actualizar pedido');
    } finally {
      setBusyId(null);
    }
  };

  // Registra el cobro con el método elegido (el backend exige payment_method)
  const handlePay = async (pedidoId, method) => {
    setBusyId(pedidoId);
    try {
      await updatePedidoStatus(pedidoId, 'mark_paid', { payment_method: method.value });
      toast.success(`Pago registrado · ${method.label}`);
      setPayingId(null);
    } catch (error) {
      toast.error('Error al registrar el pago');
    } finally {
      setBusyId(null);
    }
  };

  if (loading) return <Loader />;

  // Solo se muestra el nombre del local si hay pedidos de más de uno (como en Mesas)
  const multiCafe = new Set(pedidos.map((p) => p.cafeteria)).size > 1;

  const countOf = (key) => pedidos.filter(FILTERS[key]).length;
  const filteredPedidos = pedidos.filter(FILTERS[filter] || FILTERS.all);

  return (
    <>
      <div className="mb-4">
        <Segmented
          value={filter}
          onChange={setFilter}
          options={[
            { value: 'all', label: 'Todos', count: pedidos.length },
            { value: 'pending', label: 'Activos', count: countOf('pending') },
            { value: 'por_cobrar', label: 'Por cobrar', count: countOf('por_cobrar') },
            { value: 'entregada', label: 'Completados', count: countOf('entregada') },
          ]}
        />
      </div>

      {filteredPedidos.length === 0 ? (
        <EmptyState icon={Receipt} title="No hay pedidos para mostrar" description="Cuando lleguen nuevas órdenes aparecerán aquí." />
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          {filteredPedidos.map((pedido, i) => {
            const busy = busyId === pedido.id;
            const CustomerIcon = pedido.order_type === 'mesa' ? Armchair : User;
            const qr = esQR(pedido);
            return (
              <Card
                key={pedido.id}
                padded={false}
                className="animate-fade-in flex flex-col hover:shadow-lift"
                style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
              >
                <div className="flex items-start justify-between gap-4 p-6 pb-4">
                  <div className="min-w-0">
                    {multiCafe && pedido.cafeteria_name && (
                      <p className="eyebrow mb-1 truncate">{pedido.cafeteria_name}</p>
                    )}
                    <h3 className="font-serif text-2xl italic font-medium text-verde-700">{pedido.order_number}</h3>
                    {/* Mesa o cliente del pedido */}
                    {pedido.customer_info && (
                      <p className="mt-1 flex min-w-0 items-center gap-1.5 text-sm font-medium text-verde-700">
                        <CustomerIcon className="h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />
                        <span className="truncate">{pedido.customer_info}</span>
                        {qr && (
                          <Badge tone="slate" className="ml-1 shrink-0 !px-2 !py-0.5 !text-[9px] !tracking-[0.1em]">
                            {origenDe(pedido)}
                          </Badge>
                        )}
                      </p>
                    )}
                    <p className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-verde-600">
                      <Clock className="h-3.5 w-3.5 text-oro-600" aria-hidden="true" />
                      {new Date(pedido.created_at).toLocaleString('es-EC', { dateStyle: 'medium', timeStyle: 'short' })}
                      <span className="inline-block h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
                      <span className="text-[11px] font-medium uppercase tracking-[0.16em]">
                        {ORDER_TYPE_LABELS[pedido.order_type] || pedido.order_type}
                      </span>
                    </p>
                  </div>
                  <StatusBadge status={pedido.status} className="shrink-0" />
                </div>

                {/* Items estilo ticket (nombre ×cantidad); sin detalle, solo el conteo */}
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
                    {/* Un pedido cancelado no se cobra: no debe verse como deuda */}
                    {pedido.status === 'cancelada' ? (
                      <Badge tone="neutral">Sin cobro</Badge>
                    ) : pedido.is_paid ? (
                      <Badge tone="sage">Pagado</Badge>
                    ) : (
                      <Badge tone="honey">Por cobrar</Badge>
                    )}
                    <span className="flex items-baseline gap-2">
                      <span className="stat-label">Total</span>
                      <span className="font-serif text-2xl italic font-medium text-verde-700">{money(pedido.total)}</span>
                    </span>
                  </div>
                </div>

                {/* Acciones */}
                <div className="flex flex-wrap gap-2 p-6 pt-4">
                  {pedido.status === 'pendiente' && (
                    <>
                      <Button size="sm" disabled={busy} onClick={() => handleStatusChange(pedido.id, 'confirm')}>
                        <Check className="h-4 w-4" aria-hidden="true" />
                        Confirmar
                      </Button>
                      <Button size="sm" variant="danger" disabled={busy} onClick={() => handleStatusChange(pedido.id, 'cancel')}>
                        Cancelar
                      </Button>
                    </>
                  )}

                  {pedido.status === 'confirmada' && (
                    <Button size="sm" variant="accent" disabled={busy} onClick={() => handleStatusChange(pedido.id, 'send_to_kitchen')}>
                      <ChefHat className="h-4 w-4" aria-hidden="true" />
                      Enviar a cocina
                    </Button>
                  )}

                  {pedido.status === 'preparando' && (
                    <Button size="sm" variant="success" disabled={busy} onClick={() => handleStatusChange(pedido.id, 'mark_ready')}>
                      Marcar listo
                    </Button>
                  )}

                  {pedido.status === 'lista' && (
                    <Button size="sm" variant="success" disabled={busy} onClick={() => handleStatusChange(pedido.id, 'complete')}>
                      Entregado
                    </Button>
                  )}

                  {!pedido.is_paid &&
                    pedido.status === 'entregada' &&
                    (qr ? (
                      // Pedido hecho por QR: el backend rechaza mark_paid; se cobra con la cuenta de la mesa
                      <Link
                        to="/mesas"
                        className="inline-flex min-h-[36px] items-center gap-2 rounded-full bg-cobalto-50 px-4 text-[11px] font-medium uppercase tracking-[0.16em] text-cobalto-600 ring-1 ring-cobalto-200 transition-colors hover:bg-cobalto-100"
                      >
                        <QrCode className="h-4 w-4" aria-hidden="true" />
                        Se cobra desde Mesas
                      </Link>
                    ) : payingId === pedido.id ? (
                      // Selector de método de pago en la misma tarjeta
                      <div className="flex w-full flex-wrap items-center gap-2" role="group" aria-label="Método de pago">
                        <span className="stat-label mr-1 w-full sm:w-auto">¿Cómo paga?</span>
                        {PAYMENT_METHODS.map((method) => (
                          <Button
                            key={method.value}
                            size="sm"
                            variant="secondary"
                            disabled={busy}
                            onClick={() => handlePay(pedido.id, method)}
                          >
                            {method.label}
                          </Button>
                        ))}
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={busy}
                          onClick={() => setPayingId(null)}
                          aria-label="Cancelar cobro"
                          className="!px-2.5"
                        >
                          <X className="h-4 w-4" aria-hidden="true" />
                        </Button>
                      </div>
                    ) : (
                      <Button size="sm" disabled={busy} onClick={() => setPayingId(pedido.id)}>
                        <DollarSign className="h-4 w-4" aria-hidden="true" />
                        Registrar pago
                      </Button>
                    ))}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </>
  );
};

export const Pedidos = () => {
  // Tablero por defecto; la lista conserva el cobro de pedidos del personal
  const [vista, setVista] = useState('tablero');

  return (
    <Layout>
      <PageHeader
        eyebrow="Barra y cocina"
        title="Pedidos"
        subtitle={
          vista === 'tablero'
            ? 'Mueve cada pedido con un clic o arrastrándolo.'
            : 'Sigue cada orden desde que se toma hasta que se cobra.'
        }
        actions={
          <Segmented
            value={vista}
            onChange={setVista}
            options={[
              { value: 'tablero', label: 'Tablero' },
              { value: 'lista', label: 'Lista' },
            ]}
          />
        }
      />
      {vista === 'tablero' ? <Tablero onVerLista={() => setVista('lista')} /> : <ListaPedidos />}
    </Layout>
  );
};
