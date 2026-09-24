import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { StatusBadge, statusTone } from '../components/StatusBadge';
import { Users, Armchair, MapPin, Minus, Plus, X } from 'lucide-react';
import toast from 'react-hot-toast';

const ACCENT = {
  sage: 'bg-sage-600',
  terracotta: 'bg-terracotta-600',
  honey: 'bg-honey-600',
  slate: 'bg-slate-600',
  brass: 'bg-brass-500',
  neutral: 'bg-espresso-200',
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
                  <span className={`absolute inset-x-0 top-0 h-1 ${ACCENT[statusTone(mesa.status)]}`} />
                  <div className="p-6">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="stat-label">{mesa.cafeteria_name && multiCafe ? mesa.cafeteria_name : 'Mesa'}</p>
                        <p className="font-serif text-5xl font-medium leading-none text-espresso-800">{mesa.number}</p>
                      </div>
                      <StatusBadge status={mesa.status} />
                    </div>

                    <div className="mt-6 flex items-center gap-5 text-sm text-espresso-500">
                      {mesa.location && (
                        <span className="inline-flex items-center gap-1.5">
                          <MapPin className="h-4 w-4 text-brass-500" />
                          {mesa.location}
                        </span>
                      )}
                      <span className="inline-flex items-center gap-1.5">
                        <Users className="h-4 w-4 text-brass-500" />
                        {mesa.status === 'ocupada' ? `${mesa.guest_count} / ${mesa.capacity}` : `${mesa.capacity} pers.`}
                      </span>
                    </div>
                  </div>

                  {(mesa.status === 'disponible' || mesa.status === 'ocupada') && (
                    <div className="border-t border-foam bg-cream/40 px-6 py-3">
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
              <div className="absolute inset-0 bg-espresso-900/50 backdrop-blur-sm" onClick={() => setSelectedMesa(null)} />
              <Card className="animate-fade-in relative w-full max-w-sm p-8 shadow-lift">
                <button
                  onClick={() => setSelectedMesa(null)}
                  className="absolute right-4 top-4 rounded-full p-1.5 text-espresso-300 hover:bg-foam hover:text-espresso-700"
                  aria-label="Cerrar"
                >
                  <X className="h-5 w-5" />
                </button>
                <p className="eyebrow">Mesa {selectedMesa.number}</p>
                <h2 className="mt-1 text-3xl font-medium text-espresso-800">¿Cuántos llegan?</h2>

                <div className="my-8 flex items-center justify-center gap-6">
                  <button
                    onClick={() => setGuestCount(Math.max(selectedMesa.min_capacity || 1, guestCount - 1))}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-espresso-100 text-espresso-600 transition hover:bg-foam"
                    aria-label="Menos"
                  >
                    <Minus className="h-5 w-5" />
                  </button>
                  <span className="min-w-[4rem] text-center font-serif text-6xl font-medium text-espresso-800">{guestCount}</span>
                  <button
                    onClick={() => setGuestCount(Math.min(selectedMesa.capacity, guestCount + 1))}
                    className="flex h-12 w-12 items-center justify-center rounded-full border border-espresso-100 text-espresso-600 transition hover:bg-foam"
                    aria-label="Más"
                  >
                    <Plus className="h-5 w-5" />
                  </button>
                </div>
                <p className="mb-8 text-center text-xs text-espresso-400">
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
              </Card>
            </div>
          )}
        </>
      )}
    </Layout>
  );
};
