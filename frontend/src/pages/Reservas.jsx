import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Phone, Calendar } from 'lucide-react';
import toast from 'react-hot-toast';

export const Reservas = () => {
  const { reservas, fetchReservas, confirmReserva } = useData();
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadReservas = async () => {
      setLoading(true);
      try {
        await fetchReservas();
      } catch (error) {
        toast.error('Error cargando reservas');
      } finally {
        setLoading(false);
      }
    };

    loadReservas();
  }, [fetchReservas]);

  const handleConfirm = async (reservaId) => {
    try {
      await confirmReserva(reservaId);
      toast.success('Reserva confirmada');
    } catch (error) {
      toast.error('Error al confirmar reserva');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      pendiente: 'bg-yellow-100 text-yellow-800',
      confirmada: 'bg-green-100 text-green-800',
      cancelada: 'bg-red-100 text-red-800',
      completada: 'bg-gray-100 text-gray-800',
    };
    return badges[status] || badges.pendiente;
  };

  const filteredReservas = filter === 'all'
    ? reservas
    : reservas.filter(r => r.status === filter);

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
          <h1 className="text-3xl font-bold text-gray-900">Reservas</h1>
          <div className="flex gap-2">
            {[
              { value: 'all', label: 'Todas' },
              { value: 'pendiente', label: 'Pendientes' },
              { value: 'confirmada', label: 'Confirmadas' },
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

        {/* Reservas List */}
        <div className="space-y-4">
          {filteredReservas.length === 0 ? (
            <Card className="text-center py-8">
              <p className="text-gray-600">No hay reservas para mostrar</p>
            </Card>
          ) : (
            filteredReservas.map((reserva) => (
              <Card key={reserva.id} className="hover:shadow-lg transition-shadow">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex-1">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {reserva.customer_name}
                    </h3>
                    <div className="flex items-center gap-2 text-sm text-gray-600 mt-1">
                      <Phone className="w-4 h-4" />
                      {reserva.customer_phone}
                    </div>
                    {reserva.customer_email && (
                      <p className="text-sm text-gray-600">{reserva.customer_email}</p>
                    )}
                  </div>
                  <div className="text-right">
                    <span className={`inline-block px-3 py-1 rounded-full text-xs font-semibold ${getStatusBadge(reserva.status)}`}>
                      {reserva.status}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 md:grid-cols-4 gap-4 py-4 border-y border-gray-200 mb-4">
                  <div>
                    <p className="text-sm text-gray-600">Mesa</p>
                    <p className="font-semibold text-gray-900">#{reserva.mesa_number}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Clientes</p>
                    <p className="font-semibold text-gray-900">{reserva.guest_count}</p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Fecha</p>
                    <p className="font-semibold text-gray-900">
                      {new Date(reserva.reservation_date).toLocaleDateString('es-EC')}
                    </p>
                  </div>
                  <div>
                    <p className="text-sm text-gray-600">Hora</p>
                    <p className="font-semibold text-gray-900">{reserva.reservation_time}</p>
                  </div>
                </div>

                {reserva.notes && (
                  <div className="mb-4 bg-blue-50 rounded p-3">
                    <p className="text-sm text-blue-900">
                      <strong>Notas:</strong> {reserva.notes}
                    </p>
                  </div>
                )}

                {/* Actions */}
                <div className="flex flex-wrap gap-2">
                  {reserva.status === 'pendiente' && (
                    <Button
                      size="sm"
                      variant="success"
                      onClick={() => handleConfirm(reserva.id)}
                      className="flex items-center gap-2"
                    >
                      <Calendar className="w-4 h-4" />
                      Confirmar
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
