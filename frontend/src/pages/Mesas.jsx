import React, { useEffect, useMemo, useState } from 'react';
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

// Estados desde los que se puede sentar a clientes (abre el modal de "¿Cuántos llegan?")
const SEATABLE = ['disponible', 'reservada'];

// Mensaje del backend ({ error } o { detail }) o uno genérico si no lo hay
const apiError = (error, fallback) => {
  const data = error?.response?.data;
  const msg = data?.error || data?.detail;
  return typeof msg === 'string' ? msg : fallback;
};

// Orden estable: por local (nombre y, si empatan, id) y luego por número de mesa
const byCafeAndNumber = (a, b) =>
  (a.cafeteria_name || '').localeCompare(b.cafeteria_name || '', 'es') ||
  String(a.cafeteria ?? '').localeCompare(String(b.cafeteria ?? '')) ||
  (a.number || 0) - (b.number || 0);

export const Mesas = () => {
  const { mesas, fetchMesas, occupyMesa, freeMesa } = useData();
  const [selectedMesa, setSelectedMesa] = useState(null);
  const [guestCount, setGuestCount] = useState(2);
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  // Mesa con una petición en curso (evita dobles clics)
  const [busyId, setBusyId] = useState(null);

  // El modal de sentar está abierto si hay una mesa elegida que admite clientes
  const seating = !!selectedMesa && SEATABLE.includes(selectedMesa.status);

  // Cerrar el modal con Escape mientras está abierto
  useEffect(() => {
    if (!seating) return undefined;
    const onKey = (e) => e.key === 'Escape' && setSelectedMesa(null);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [seating]);

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

  // Abre el modal de sentar con un número de clientes razonable para la mesa
  const openSeat = (mesa) => {
    setGuestCount(Math.min(mesa.capacity, Math.max(mesa.min_capacity || 1, 2)));
    setSelectedMesa(mesa);
  };

  // Sienta clientes en una mesa libre o a los de una reserva (misma acción: occupy)
  const handleOccupy = async () => {
    if (!selectedMesa || busyId) return;

    setBusyId(selectedMesa.id);
    try {
      await occupyMesa(selectedMesa.id, guestCount);
      toast.success(
        selectedMesa.status === 'reservada'
          ? `Reserva sentada en la mesa ${selectedMesa.number}`
          : `Mesa ${selectedMesa.number} ocupada`
      );
      setSelectedMesa(null);
    } catch (error) {
      toast.error(apiError(error, 'Error al ocupar mesa'));
    } finally {
      setBusyId(null);
    }
  };

  // Deja la mesa disponible: al liberar una ocupada o al terminar de limpiarla
  const handleFree = async (mesaId, okMessage = 'Mesa liberada') => {
    setBusyId(mesaId);
    try {
      await freeMesa(mesaId);
      toast.success(okMessage);
    } catch (error) {
      toast.error(apiError(error, 'Error al liberar mesa'));
    } finally {
      setBusyId(null);
    }
  };

  // Acción principal de cada estado: etiqueta, variante del botón y qué hace al pulsar
  const mesaAction = (mesa) => {
    switch (mesa.status) {
      case 'disponible':
        return { label: 'Sentar clientes', variant: 'primary', onClick: () => openSeat(mesa) };
      case 'reservada':
        return { label: 'Sentar reserva', variant: 'primary', onClick: () => openSeat(mesa) };
      case 'limpiando':
        return { label: 'Mesa lista', variant: 'secondary', onClick: () => handleFree(mesa.id, 'Mesa lista') };
      case 'ocupada':
        return { label: 'Liberar mesa', variant: 'secondary', onClick: () => handleFree(mesa.id) };
      default:
        return null;
    }
  };

  const multiCafe = new Set(mesas.map((m) => m.cafeteria)).size > 1;
  const countBy = (s) => mesas.filter((m) => m.status === s).length;
  const sorted = useMemo(() => [...mesas].sort(byCafeAndNumber), [mesas]);
  const filtered = useMemo(
    () => (filter === 'all' ? sorted : sorted.filter((m) => m.status === filter)),
    [sorted, filter]
  );

  // Con varios locales, agrupa las mesas por cafetería (respetando el orden anterior)
  const groups = useMemo(() => {
    if (!multiCafe) return [{ key: 'all', name: null, mesas: filtered }];
    const acc = [];
    filtered.forEach((m) => {
      const last = acc[acc.length - 1];
      if (last && last.key === m.cafeteria) last.mesas.push(m);
      else acc.push({ key: m.cafeteria, name: m.cafeteria_name || 'Local', mesas: [m] });
    });
    return acc;
  }, [filtered, multiCafe]);

  // Posición de cada mesa en la lista visible, para escalonar la animación con tope
  const position = new Map(filtered.map((m, i) => [m.id, i]));

  const renderMesa = (mesa) => {
    const action = mesaAction(mesa);
    return (
      <Card
        key={mesa.id}
        padded={false}
        className="animate-fade-in group relative overflow-hidden hover:shadow-lift"
        style={{ animationDelay: `${Math.min(position.get(mesa.id) || 0, 10) * 40}ms` }}
      >
        <span className={`absolute inset-x-0 top-0 h-1.5 ${ACCENT[statusTone(mesa.status)]}`} aria-hidden="true" />
        <span className="absolute inset-x-0 top-1.5 h-px bg-oro-300/80" aria-hidden="true" />
        <div className="p-6 pt-7">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="stat-label truncate">Mesa</p>
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

        {action && (
          <div className="border-t border-oro-200/70 bg-crema/70 px-6 py-3">
            <Button
              size="sm"
              variant={action.variant}
              disabled={busyId === mesa.id}
              onClick={action.onClick}
              className="w-full"
            >
              {action.label}
            </Button>
          </div>
        )}
      </Card>
    );
  };

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
            <div className="space-y-10">
              {groups.map((g) => (
                <section key={g.key}>
                  {/* Encabezado del local (solo cuando hay varios): cursiva, filete y rombo dorado */}
                  {g.name && (
                    <div className="mb-4 flex flex-wrap items-center gap-x-4 gap-y-2">
                      <h2 className="min-w-0 font-serif text-2xl italic font-medium leading-tight text-verde-700">{g.name}</h2>
                      <span className="flex min-w-[3rem] flex-1 items-center gap-2" aria-hidden="true">
                        <span className="h-px flex-1 bg-oro-300" />
                        <span className="rombo" />
                        <span className="h-px w-5 bg-oro-300" />
                      </span>
                      <span className="text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
                        {g.mesas.length} {g.mesas.length === 1 ? 'mesa' : 'mesas'}
                      </span>
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">{g.mesas.map(renderMesa)}</div>
                </section>
              ))}
            </div>
          )}

          {/* Modal para sentar clientes (mesa libre o reservada); Escape lo cierra */}
          {seating && (
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
                  type="button"
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
                    <Button onClick={handleOccupy} disabled={busyId === selectedMesa.id} className="flex-1">
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
