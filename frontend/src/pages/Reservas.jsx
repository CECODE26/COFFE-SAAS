import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { Phone, Mail, CalendarDays, Users, Armchair, Check, StickyNote } from 'lucide-react';
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

  const filteredReservas = filter === 'all'
    ? reservas
    : reservas.filter(r => r.status === filter);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Agenda"
            title="Reservas"
            subtitle="Quién viene, cuándo y a qué mesa."
            actions={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todas', count: reservas.length },
                  { value: 'pendiente', label: 'Pendientes', count: reservas.filter(r => r.status === 'pendiente').length },
                  { value: 'confirmada', label: 'Confirmadas', count: reservas.filter(r => r.status === 'confirmada').length },
                ]}
              />
            }
          />

          {filteredReservas.length === 0 ? (
            <EmptyState icon={CalendarDays} title="No hay reservas para mostrar" description="Las nuevas reservas aparecerán aquí." />
          ) : (
            <div className="space-y-4">
              {filteredReservas.map((reserva, i) => {
                const raw = reserva.reservation_date || '';
                const date = new Date(raw.length === 10 ? `${raw}T00:00:00` : raw);
                return (
                  <Card
                    key={reserva.id}
                    padded={false}
                    className="animate-fade-in flex flex-col overflow-hidden hover:shadow-lift sm:flex-row"
                    style={{ animationDelay: `${i * 40}ms` }}
                  >
                    {/* Bloque de fecha */}
                    <div className="flex shrink-0 items-center gap-4 bg-espresso-800 px-6 py-4 text-cream sm:w-36 sm:flex-col sm:justify-center sm:gap-0 sm:py-6">
                      <p className="text-xs font-semibold uppercase tracking-[0.2em] text-brass-300">
                        {date.toLocaleDateString('es-EC', { month: 'short' }).replace('.', '')}
                      </p>
                      <p className="font-serif text-4xl font-medium leading-none sm:my-1 sm:text-5xl">{date.getDate()}</p>
                      <p className="text-sm text-espresso-200">{reserva.reservation_time?.slice(0, 5)}</p>
                    </div>

                    <div className="flex flex-1 flex-col gap-4 p-6 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="text-2xl font-medium text-espresso-800">{reserva.customer_name}</h3>
                          <StatusBadge status={reserva.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-espresso-400">
                          <span className="inline-flex items-center gap-1.5">
                            <Phone className="h-3.5 w-3.5" />
                            {reserva.customer_phone}
                          </span>
                          {reserva.customer_email && (
                            <span className="inline-flex items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5" />
                              {reserva.customer_email}
                            </span>
                          )}
                        </div>
                        {reserva.notes && (
                          <p className="mt-3 inline-flex items-start gap-2 rounded-lg bg-brass-50 px-3 py-2 text-sm text-espresso-600">
                            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-brass-500" />
                            {reserva.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center gap-6 md:border-l md:border-foam md:pl-6">
                        <div>
                          <p className="stat-label">Mesa</p>
                          <p className="inline-flex items-center gap-1.5 font-serif text-2xl text-espresso-800">
                            <Armchair className="h-4 w-4 text-brass-500" />
                            {reserva.mesa_number}
                          </p>
                        </div>
                        <div>
                          <p className="stat-label">Personas</p>
                          <p className="inline-flex items-center gap-1.5 font-serif text-2xl text-espresso-800">
                            <Users className="h-4 w-4 text-brass-500" />
                            {reserva.guest_count}
                          </p>
                        </div>
                        {reserva.status === 'pendiente' && (
                          <Button size="sm" onClick={() => handleConfirm(reserva.id)}>
                            <Check className="h-4 w-4" />
                            Confirmar
                          </Button>
                        )}
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </>
      )}
    </Layout>
  );
};
