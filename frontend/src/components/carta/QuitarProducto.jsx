import React, { useEffect, useState } from 'react';
import { Modal, FormAlert } from '../Form';
import { Button } from '../Button';
import { mensajeError } from './utils';

// Confirmación para quitar un producto de la carta.
// El backend decide: sin pedidos lo borra; con pedidos lo desactiva (y lo explica en su mensaje).
// onQuitar(item) y onAgotar(item) devuelven promesas; si fallan, el error se muestra aquí.
export const QuitarProducto = ({ item, onClose, onQuitar, onAgotar }) => {
  const [enCurso, setEnCurso] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setEnCurso(null);
    setError(null);
  }, [item]);

  const ejecutar = async (accion, fn) => {
    setEnCurso(accion);
    setError(null);
    try {
      await fn(item);
      onClose();
    } catch (err) {
      setError(mensajeError(err, 'No se pudo completar. Inténtalo de nuevo.'));
      setEnCurso(null);
    }
  };

  const cerrar = () => !enCurso && onClose();
  // Alternativa más suave si solo se acabó por hoy
  const puedeAgotar = item?.is_active && item?.is_available && onAgotar;

  return (
    <Modal
      open={!!item}
      onClose={cerrar}
      eyebrow="Quitar de la carta"
      title={item ? `¿Quitar «${item.name}»?` : ''}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={cerrar} disabled={!!enCurso}>
            Cancelar
          </Button>
          {puedeAgotar && (
            <Button size="sm" variant="secondary" onClick={() => ejecutar('agotar', onAgotar)} disabled={!!enCurso}>
              {enCurso === 'agotar' ? 'Marcando…' : 'Solo marcar agotado'}
            </Button>
          )}
          <Button size="sm" variant="danger" onClick={() => ejecutar('quitar', onQuitar)} disabled={!!enCurso}>
            {enCurso === 'quitar' ? 'Quitando…' : 'Quitar'}
          </Button>
        </>
      }
    >
      <FormAlert>{error}</FormAlert>
      <div className="space-y-2 text-sm text-verde-700">
        <p>Deja de aparecer en la carta de los clientes y en la toma de pedidos.</p>
        <p className="text-verde-600">
          Si ya tiene pedidos registrados no se borra: se desactiva para conservar el historial y puedes reactivarlo
          cuando quieras.
        </p>
        {puedeAgotar && (
          <p className="text-verde-600">
            ¿Solo se acabó por hoy? Márcalo como <strong className="font-medium text-verde-700">agotado</strong> y
            vuelve a activarlo mañana.
          </p>
        )}
      </div>
    </Modal>
  );
};
