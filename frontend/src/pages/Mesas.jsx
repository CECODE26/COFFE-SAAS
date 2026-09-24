import React, { useEffect, useState } from 'react';
import { useData } from '../hooks/useData';
import { Navbar } from '../components/Navbar';
import { Card } from '../components/Card';
import { Button } from '../components/Button';
import { Users, Check, AlertCircle } from 'lucide-react';
import toast from 'react-hot-toast';

export const Mesas = () => {
  const { mesas, fetchMesas, occupyMesa, freeMesa } = useData();
  const [selectedMesa, setSelectedMesa] = useState(null);
  const [guestCount, setGuestCount] = useState(2);
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

  const getStatusColor = (status) => {
    const colors = {
      disponible: 'bg-green-100 border-green-500 text-green-900',
      ocupada: 'bg-red-100 border-red-500 text-red-900',
      reservada: 'bg-yellow-100 border-yellow-500 text-yellow-900',
      limpiando: 'bg-blue-100 border-blue-500 text-blue-900',
      mantenimiento: 'bg-gray-100 border-gray-500 text-gray-900',
    };
    return colors[status] || colors.disponible;
  };

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
          <h1 className="text-3xl font-bold text-gray-900">Mesas</h1>
          <div className="text-sm text-gray-600">
            Total: {mesas.length} | Disponibles: {mesas.filter(m => m.status === 'disponible').length}
          </div>
        </div>

        {/* Mesas Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-8">
          {mesas.map((mesa) => (
            <Card
              key={mesa.id}
              className={`cursor-pointer border-2 ${getStatusColor(mesa.status)} transition-all hover:shadow-lg`}
              onClick={() => setSelectedMesa(mesa)}
            >
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h3 className="text-2xl font-bold">Mesa {mesa.number}</h3>
                  <p className="text-sm opacity-75">{mesa.location}</p>
                </div>
                <div className="text-right">
                  <span className="inline-block px-3 py-1 rounded-full text-xs font-semibold bg-white bg-opacity-50">
                    {mesa.status}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <p className="opacity-75">Capacidad</p>
                  <p className="font-semibold text-lg">{mesa.capacity}</p>
                </div>
                {mesa.status === 'ocupada' && (
                  <div>
                    <p className="opacity-75">Clientes</p>
                    <p className="font-semibold text-lg flex items-center gap-1">
                      <Users className="w-4 h-4" />
                      {mesa.guest_count}
                    </p>
                  </div>
                )}
              </div>

              <div className="mt-4 pt-4 border-t border-current border-opacity-20 flex gap-2">
                {mesa.status === 'disponible' && (
                  <Button
                    size="sm"
                    variant="success"
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelectedMesa(mesa);
                    }}
                    className="flex-1"
                  >
                    Ocupar
                  </Button>
                )}
                {mesa.status === 'ocupada' && (
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFree(mesa.id);
                    }}
                    className="flex-1"
                  >
                    Liberar
                  </Button>
                )}
              </div>
            </Card>
          ))}
        </div>

        {/* Modal para ocupar mesa */}
        {selectedMesa && selectedMesa.status === 'disponible' && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
            <Card className="max-w-md w-full">
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Ocupar Mesa {selectedMesa.number}
              </h2>

              <div className="mb-6">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Número de Clientes
                </label>
                <div className="flex items-center gap-4">
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setGuestCount(Math.max(selectedMesa.min_capacity, guestCount - 1))}
                  >
                    -
                  </Button>
                  <span className="text-3xl font-bold text-gray-900 min-w-12 text-center">
                    {guestCount}
                  </span>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => setGuestCount(Math.min(selectedMesa.capacity, guestCount + 1))}
                  >
                    +
                  </Button>
                </div>
                <p className="text-xs text-gray-600 mt-2">
                  Capacidad: {selectedMesa.min_capacity} - {selectedMesa.capacity}
                </p>
              </div>

              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  onClick={() => setSelectedMesa(null)}
                  className="flex-1"
                >
                  Cancelar
                </Button>
                <Button
                  variant="success"
                  onClick={handleOccupy}
                  className="flex-1"
                >
                  Ocupar
                </Button>
              </div>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
};
