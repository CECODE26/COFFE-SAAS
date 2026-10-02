import React, { useState } from 'react';
import { AlertTriangle, Power, PowerOff, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import { ModalToldo, Aviso } from './ModalToldo';
import { mensajeError, mesasApi } from './utils';

// Textos y petición de cada acción de gestión
const ACCIONES = {
  desactivar: {
    titulo: '¿Desactivar la mesa?',
    texto: 'Sale del salón y su QR impreso deja de funcionar. Conserva su historial y puedes reactivarla cuando quieras.',
    boton: 'Sí, desactivar',
    enCurso: 'Desactivando…',
    variante: 'danger',
    icono: PowerOff,
    llamar: (m) => mesasApi.desactivar(m.id),
  },
  reactivar: {
    titulo: '¿Reactivar la mesa?',
    texto: 'Vuelve al salón como disponible y su QR impreso vuelve a funcionar (es el mismo código).',
    boton: 'Sí, reactivar',
    enCurso: 'Reactivando…',
    variante: 'primary',
    icono: Power,
    llamar: (m) => mesasApi.reactivar(m.id),
  },
  borrar: {
    titulo: '¿Borrar la mesa?',
    texto: 'Se elimina para siempre junto con su QR. Solo se puede si nunca tuvo pedidos, clientes por QR ni reservas; si ya se usó, desactívala.',
    boton: 'Sí, borrar',
    enCurso: 'Borrando…',
    variante: 'danger',
    icono: Trash2,
    llamar: (m) => mesasApi.borrar(m.id).then(() => null),
  },
};

// Confirma desactivar, reactivar o borrar una mesa. Si el backend no lo permite se muestra su mensaje
// tal cual; si no se puede borrar por tener historial, ofrece desactivarla en su lugar.
export const AccionMesaDialog = ({ accion: accionInicial, mesa, onClose, onHecho }) => {
  const [accion, setAccion] = useState(accionInicial);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState(null);
  const a = ACCIONES[accion] || ACCIONES.desactivar;
  const Icono = a.icono;
  const ofrecerDesactivar = accion === 'borrar' && mesa.is_active !== false && error && /desact/i.test(error);

  const confirmar = async () => {
    if (enviando) return;
    setEnviando(true);
    setError(null);
    try {
      const r = await a.llamar(mesa);
      onHecho(accion, r);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo completar la acción.'));
      setEnviando(false);
    }
  };

  const cambiarADesactivar = () => {
    setAccion('desactivar');
    setError(null);
  };

  return (
    <ModalToldo
      onClose={enviando ? () => {} : onClose}
      eyebrow={`Mesa ${mesa.number}`}
      titulo={a.titulo}
      subtitulo={[mesa.cafeteria_name, mesa.location].filter(Boolean).join(' · ') || undefined}
      ancho="sm"
      pie={
        <>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={enviando} className="!px-3.5">
            Cancelar
          </Button>
          {ofrecerDesactivar ? (
            <Button variant="danger" size="sm" onClick={cambiarADesactivar} className="!px-3.5">
              <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
              Desactivarla
            </Button>
          ) : (
            <Button variant={a.variante} size="sm" onClick={confirmar} disabled={enviando}>
              <Icono className="h-3.5 w-3.5" aria-hidden="true" />
              {enviando ? a.enCurso : a.boton}
            </Button>
          )}
        </>
      }
    >
      {error && (
        <Aviso icono={AlertTriangle} className="mb-3">
          {error}
        </Aviso>
      )}
      <p className="text-center text-sm leading-relaxed text-verde-700">{a.texto}</p>
    </ModalToldo>
  );
};
