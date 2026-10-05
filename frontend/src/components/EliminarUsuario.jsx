import React, { useCallback, useEffect, useState } from 'react';
import { Trash2, PowerOff } from 'lucide-react';
import { Modal, FormAlert } from './Form';
import { Button } from './Button';
import { Badge } from './StatusBadge';
import { Avatar } from './Stats';
import { ROLE_LABELS } from '../lib/roles';
import { ROLE_TONE, mensajeError, nombreDe } from '../lib/usuarios';
import api from '../services/api';

const ADMINS = ['super_admin', 'distribuidor_admin', 'cafe_admin'];
const ANCHO_BOTON = 'w-full sm:w-auto';

// Confirmación para eliminar una cuenta (solo super admin). Si el backend no lo permite
// (p. ej. es el último super admin activo) se muestra su mensaje tal cual.
// "Mejor desactivar" ofrece la salida reversible sin cerrar el diálogo a ciegas.
export const EliminarUsuario = ({ usuario, onClose, onEliminado, onDesactivado }) => {
  const [enCurso, setEnCurso] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setEnCurso(null);
    setError(null);
  }, [usuario]);

  const cerrar = useCallback(() => {
    if (!enCurso) onClose();
  }, [enCurso, onClose]);

  const ejecutar = async (accion, peticion, alTerminar) => {
    if (enCurso) return;
    setEnCurso(accion);
    setError(null);
    try {
      await peticion();
      alTerminar(usuario);
    } catch (err) {
      setError(mensajeError(err));
      setEnCurso(null);
    }
  };

  const eliminar = () => ejecutar('eliminar', () => api.delete(`/auth/users/${usuario.id}/`), onEliminado);
  const desactivar = () =>
    ejecutar('desactivar', () => api.post(`/auth/users/${usuario.id}/deactivate/`), onDesactivado);

  return (
    <Modal
      open={!!usuario}
      onClose={cerrar}
      eyebrow="Eliminar cuenta"
      title={usuario ? `¿Eliminar a ${nombreDe(usuario)}?` : ''}
      footer={
        // En el celular, botones a lo ancho y apilados: Eliminar arriba y Cancelar abajo, junto al pulgar.
        // El foco entra en Cancelar (data-autofocus): Enter por inercia no borra nada.
        <div className="flex w-full flex-col-reverse gap-2 sm:w-auto sm:flex-row sm:justify-end">
          <Button size="sm" variant="ghost" onClick={cerrar} disabled={!!enCurso} className={ANCHO_BOTON} data-autofocus>
            Cancelar
          </Button>
          {usuario?.is_active && (
            <Button size="sm" variant="secondary" onClick={desactivar} disabled={!!enCurso} className={ANCHO_BOTON}>
              <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
              {enCurso === 'desactivar' ? 'Desactivando…' : 'Mejor desactivar'}
            </Button>
          )}
          <Button
            size="sm"
            variant="danger"
            onClick={eliminar}
            disabled={!!enCurso}
            aria-busy={enCurso === 'eliminar'}
            className={ANCHO_BOTON}
          >
            <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
            {enCurso === 'eliminar' ? 'Eliminando…' : 'Eliminar'}
          </Button>
        </div>
      }
    >
      {usuario && (
        <>
          <FormAlert>{error}</FormAlert>
          <div className="flex items-center gap-3 rounded-2xl border border-oro-200/80 bg-crema/60 px-4 py-3">
            <Avatar name={nombreDe(usuario)} size="sm" dark={ADMINS.includes(usuario.role)} />
            <div className="min-w-0 flex-1">
              <p className="truncate font-medium text-verde-800">{nombreDe(usuario)}</p>
              <p className="truncate text-xs text-verde-600">{usuario.email}</p>
            </div>
            <Badge tone={ROLE_TONE[usuario.role] || 'neutral'} dot={false}>
              {ROLE_LABELS[usuario.role] || usuario.role}
            </Badge>
          </div>
          <p className="mt-4 text-sm font-medium text-terracotta-700">
            Esta acción no se puede deshacer. Sus pedidos y cobros se conservan sin su nombre; la auditoría guarda quién era.
          </p>
          {usuario.is_active && (
            <p className="mt-1.5 text-sm text-verde-600">
              Si solo debe dejar de entrar, desactívala: podrás reactivarla cuando quieras.
            </p>
          )}
        </>
      )}
    </Modal>
  );
};
