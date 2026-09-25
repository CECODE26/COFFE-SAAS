import React, { useEffect, useMemo, useState } from 'react';
import { useData } from '../hooks/useData';
import { useAuth } from '../hooks/useAuth';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge } from '../components/StatusBadge';
import { Phone, Mail, CalendarDays, Users, Armchair, Check, StickyNote } from 'lucide-react';
import toast from 'react-hot-toast';

// Roles que ven reservas de varios locales
const MULTI_LOCAL_ROLES = ['distribuidor_admin', 'super_admin'];

// Fecha local de hoy como "YYYY-MM-DD" (mismo formato que reservation_date)
const todayKey = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Clave ordenable fecha+hora: "YYYY-MM-DDTHH:MM"
const slotKey = (r) => `${(r.reservation_date || '').slice(0, 10)}T${(r.reservation_time || '').slice(0, 5)}`;

// Próximas primero (hoy y futuro, de la más cercana a la más lejana); luego pasadas (de la más reciente a la más antigua)
const sortReservas = (list) => {
  const today = todayKey();
  const proximas = [];
  const pasadas = [];
  list.forEach((r) => ((r.reservation_date || '').slice(0, 10) >= today ? proximas : pasadas).push(r));
  proximas.sort((a, b) => slotKey(a).localeCompare(slotKey(b)));
  pasadas.sort((a, b) => slotKey(b).localeCompare(slotKey(a)));
  return [...proximas, ...pasadas];
};

export const Reservas = () => {
  const { reservas, fetchReservas, confirmReserva } = useData();
  const { user } = useAuth();
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

  const sortedReservas = useMemo(() => sortReservas(reservas), [reservas]);
  const filteredReservas = filter === 'all'
    ? sortedReservas
    : sortedReservas.filter(r => r.status === filter);

  // Nombre del local visible solo cuando el usuario ve más de uno
  const multiCafe =
    MULTI_LOCAL_ROLES.includes(user?.role) || new Set(reservas.map((r) => r.cafeteria_name).filter(Boolean)).size > 1;

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
                    style={{ animationDelay: `${Math.min(i, 10) * 40}ms` }}
                  >
                    {/* Bloque de fecha */}
                    <div className="flex shrink-0 items-center gap-4 border-b-2 border-oro-300 bg-verde-700 px-6 py-4 text-marfil sm:w-36 sm:flex-col sm:justify-center sm:gap-0 sm:border-b-0 sm:border-r-2 sm:py-6">
                      <p className="text-[11px] font-medium uppercase tracking-[0.26em] text-oro-300">
                        {date.toLocaleDateString('es-EC', { month: 'short' }).replace('.', '')}
                      </p>
                      <p className="font-serif text-4xl italic font-medium leading-none sm:my-1.5 sm:text-5xl">{date.getDate()}</p>
                      <span className="mb-2 mt-1 hidden h-1.5 w-1.5 rotate-45 bg-oro-400 sm:block" aria-hidden="true" />
                      <p className="text-sm tracking-[0.12em] text-verde-100">{reserva.reservation_time?.slice(0, 5)}</p>
                    </div>

                    <div className="flex min-w-0 flex-1 flex-col gap-4 p-6 md:flex-row md:items-center">
                      <div className="min-w-0 flex-1">
                        {multiCafe && reserva.cafeteria_name && (
                          <p className="eyebrow mb-1 truncate">{reserva.cafeteria_name}</p>
                        )}
                        <div className="flex flex-wrap items-center gap-3">
                          <h3 className="font-serif text-2xl italic font-medium text-verde-700">{reserva.customer_name}</h3>
                          <StatusBadge status={reserva.status} />
                        </div>
                        <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm text-verde-600">
                          {reserva.customer_phone && (
                            <span className="inline-flex items-center gap-1.5">
                              <Phone className="h-3.5 w-3.5 text-oro-600" aria-hidden="true" />
                              {reserva.customer_phone}
                            </span>
                          )}
                          {reserva.customer_email && (
                            <span className="inline-flex min-w-0 items-center gap-1.5">
                              <Mail className="h-3.5 w-3.5 shrink-0 text-oro-600" aria-hidden="true" />
                              <span className="min-w-0 break-all">{reserva.customer_email}</span>
                            </span>
                          )}
                        </div>
                        {reserva.notes && (
                          <p className="mt-3 inline-flex items-start gap-2 rounded-2xl border border-oro-200/80 bg-oro-50 px-3 py-2 text-sm text-verde-700">
                            <StickyNote className="mt-0.5 h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
                            {reserva.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-t border-dashed border-oro-300/70 pt-4 md:border-l md:border-t-0 md:border-solid md:border-oro-200/80 md:pl-6 md:pt-0">
                        <div>
                          <p className="stat-label">Mesa</p>
                          <p className="inline-flex items-center gap-1.5 font-serif text-2xl italic text-verde-700">
                            <Armchair className="h-4 w-4 text-oro-600" aria-hidden="true" />
                            {reserva.mesa_number}
                          </p>
                        </div>
                        <div>
                          <p className="stat-label">Personas</p>
                          <p className="inline-flex items-center gap-1.5 font-serif text-2xl italic text-verde-700">
                            <Users className="h-4 w-4 text-oro-600" aria-hidden="true" />
                            {reserva.guest_count}
                          </p>
                        </div>
                        {reserva.status === 'pendiente' && (
                          <Button size="sm" onClick={() => handleConfirm(reserva.id)}>
                            <Check className="h-4 w-4" aria-hidden="true" />
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
