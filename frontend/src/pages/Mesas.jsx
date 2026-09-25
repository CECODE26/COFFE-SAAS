import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { ToldoFino } from '../components/Decor';
import { StatusBadge, statusTone } from '../components/StatusBadge';
import { Users, Armchair, MapPin, Minus, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

// Franja superior de la tarjeta según el estado de la mesa
const ACCENT = {
  sage: 'bg-pistacho-500',
  terracotta: 'bg-terracotta-600',
  honey: 'bg-oro-400',
  slate: 'bg-cobalto-500',
  brass: 'bg-oro-500',
  neutral: 'bg-verde-200',
};

export const Mesas = () => {
  const { mesas, fetchMesas, occupyMesa, freeMesa } = useData();
  const [selectedMesa, setSelectedMesa] = useState(null);
  const [guestCount, setGuestCount] = useState(2);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadMesas = async () => {
      setLoading(true);
      try {
        await fetchMesas();
      } catch (error) {
        toast.error('Error cargando mesas');
      } finally {
        setLoading(false);
      }
    };

    loadMesas();
  }, [fetchMesas]);

  const handleOccupy = async () => {
    if (!selectedMesa) return;

    try {
      await occupyMesa(selectedMesa.id, guestCount);
      toast.success(`Mesa ${selectedMesa.number} ocupada`);
      setSelectedMesa(null);
    } catch (error) {
      toast.error('Error al ocupar mesa');
    }
  };

  const handleFree = async (mesaId) => {
    try {
      await freeMesa(mesaId);
      toast.success('Mesa liberada');
    } catch (error) {
      toast.error('Error al liberar mesa');
    }
  };

  const multiCafe = new Set(mesas.map((m) => m.cafeteria)).size > 1;
  const countBy = (s) => mesas.filter((m) => m.status === s).length;
  const filtered = filter === 'all' ? mesas : mesas.filter((m) => m.status === filter);

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Salón"
            title="Mesas"
            subtitle={`${countBy('disponible')} de ${mesas.length} mesas listas para recibir clientes.`}
            actions={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'all', label: 'Todas', count: mesas.length },
                  { value: 'disponible', label: 'Libres', count: countBy('disponible') },
                  { value: 'ocupada', label: 'Ocupadas', count: countBy('ocupada') },
                ]}
              />
            }
          />

          {filtered.length === 0 ? (
            <EmptyState icon={Armchair} title="Sin mesas aquí" description="Prueba con otro filtro." />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {filtered.map((mesa, i) => (
                <Card
                  key={mesa.id}
                  padded={false}
                  className="animate-fade-in group relative overflow-hidden hover:shadow-lift"
                  style={{ animationDelay: `${i * 40}ms` }}
                >
                  <span className={`absolute inset-x-0 top-0 h-1.5 ${ACCENT[statusTone(mesa.status)]}`} aria-hidden="true" />
                  <span className="absolute inset-x-0 top-1.5 h-px bg-oro-300/80" aria-hidden="true" />
                  <div className="p-6 pt-7">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="stat-label truncate">{mesa.cafeteria_name && multiCafe ? mesa.cafeteria_name : 'Mesa'}</p>
                        <p className="mt-2 font-serif text-[3.25rem] italic font-medium leading-none text-verde-700">{mesa.number}</p>
                      </div>
                      <StatusBadge status={mesa.status} className="shrink-0" />
                    </div>

                    <div className="mt-6 flex flex-wrap items-center gap-x-5 gap-y-2 border-t border-dashed border-oro-300/70 pt-4 text-sm text-verde-600">
                      {mesa.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-oro-600" aria-hidden="true" />
                          {mesa.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-oro-600" aria-hidden="true" />
                        {mesa.status === 'ocupada' ? `${mesa.guest_count} / ${mesa.capacity}` : `${mesa.capacity} pers.`}
                      </span>
                    </div>
                  </div>

                  {(mesa.status === 'disponible' || mesa.status === 'ocupada') && (
                    <div className="border-t border-oro-200/70 bg-crema/70 px-6 py-3">
                      {mesa.status === 'disponible' ? (
                        <Button
                          size="sm"
                          onClick={() => {
                            setGuestCount(Math.min(mesa.capacity, Math.max(mesa.min_capacity || 1, 2)));
                            setSelectedMesa(mesa);
                          }}
                          className="w-full"
                        >
                          Sentar clientes
                        </Button>
                      ) : (
                        <Button size="sm" variant="secondary" onClick={() => handleFree(mesa.id)} className="w-full">
                          Liberar mesa
                        </Button>
                      )}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          )}

          {/* Modal para ocupar mesa */}
          {selectedMesa && selectedMesa.status === 'disponible' && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
              <div
                className="absolute inset-0 bg-verde-900/50 backdrop-blur-sm"
                onClick={() => setSelectedMesa(null)}
                aria-hidden="true"
              />
              <Card
                padded={false}
                className="animate-fade-in relative w-full max-w-sm overflow-hidden text-center shadow-lift"
                role="dialog"
                aria-modal="true"
                aria-labelledby="ocupar-mesa-titulo"
              >
                <ToldoFino />
                <button
                  onClick={() => setSelectedMesa(null)}
                  className="absolute right-3 top-8 rounded-full p-2 text-verde-600 transition-colors hover:bg-pistacho-100 hover:text-verde-800"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" aria-hidden="true" />
                </button>

                <div className="px-6 pb-8 pt-6 sm:px-8">
                  <p className="font-script text-[26px] leading-none text-oro-600">Mesa {selectedMesa.number}</p>
                  <h2 id="ocupar-mesa-titulo" className="mt-2 font-serif text-3xl italic font-medium text-verde-700">
                    ¿Cuántos llegan?
                  </h2>
                  <div className="mt-4 flex items-center justify-center gap-3" aria-hidden="true">
                    <span className="h-px w-10 bg-oro-300" />
                    <span className="rombo" />
                    <span className="h-px w-10 bg-oro-300" />
                  </div>

                  <div className="my-7 flex items-center justify-center gap-6">
                    <button
                      onClick={() => setGuestCount(Math.max(selectedMesa.min_capacity || 1, guestCount - 1))}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-oro-400/70 bg-marfil text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                      aria-label="Menos"
                    >
                      <Minus className="h-5 w-5" aria-hidden="true" />
                    </button>
                    <span
                      className="min-w-[4rem] text-center font-serif text-6xl italic font-medium leading-none text-verde-700"
                      aria-live="polite"
                    >
                      {guestCount}
                    </span>
                    <button
                      onClick={() => setGuestCount(Math.min(selectedMesa.capacity, guestCount + 1))}
                      className="flex h-12 w-12 items-center justify-center rounded-full border border-oro-400/70 bg-marfil text-verde-700 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                      aria-label="Más"
                    >
                      <Plus className="h-5 w-5" aria-hidden="true" />
                    </button>
                  </div>
                  <p className="mb-8 text-[11px] font-medium uppercase tracking-[0.18em] text-verde-600">
                    Capacidad {selectedMesa.min_capacity || 1} – {selectedMesa.capacity} personas
                  </p>

                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={() => setSelectedMesa(null)} className="flex-1">
                      Cancelar
                    </Button>
                    <Button onClick={handleOccupy} className="flex-1">
                      Confirmar
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          )}
        </>
      )}
    </Layout>
  );
};
