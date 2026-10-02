import React, { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, Pencil, Plus, Trash2 } from 'lucide-react';
import { Modal } from '../Form';
import { Button } from '../Button';
import { CamposCategoria, useCategoriaForm } from './CategoriaForm';
import { BotonIcono, Interruptor } from './ui';
import { mensajeError } from './utils';
import { emojiCategoria } from '../cliente/utils';
import api from '../../services/api';

const productos = (n) => (n === 1 ? '1 producto' : `${n || 0} productos`);

// Gestión de categorías: crear, editar, mostrar/ocultar, reordenar y eliminar.
// `categorias` llega ya ordenada; los cambios se avisan al padre:
//   onGuardada(cat, nueva)  · onOrden(lista)  · onEliminada(cat)
export const CategoriasModal = ({ open, onClose, categorias, tenant, onGuardada, onOrden, onEliminada }) => {
  const [vista, setVista] = useState('lista');
  // id con una petición en curso ('orden' mientras se reordena)
  const [ocupado, setOcupado] = useState(null);
  const [confirmando, setConfirmando] = useState(null);
  const formId = useId();

  const cat = useCategoriaForm({
    tenant,
    onGuardada: (data, nueva) => {
      onGuardada(data, nueva);
      setVista('lista');
    },
  });

  useEffect(() => {
    if (!open) return;
    setVista('lista');
    setConfirmando(null);
  }, [open]);

  const abrirForm = (categoria) => {
    cat.reiniciar(categoria);
    setConfirmando(null);
    setVista('form');
  };

  // Reordenar: se mueve al instante y se confirma con el backend (si falla, vuelve como estaba)
  const mover = async (indice, delta) => {
    const destino = indice + delta;
    if (ocupado || destino < 0 || destino >= categorias.length) return;
    const anteriores = categorias;
    const nuevas = [...categorias];
    [nuevas[indice], nuevas[destino]] = [nuevas[destino], nuevas[indice]];
    onOrden(nuevas.map((c, i) => ({ ...c, order: i })));
    setOcupado('orden');
    try {
      const { data } = await api.post('/menu/categories/reordenar/', { ids: nuevas.map((c) => c.id) });
      onOrden(data);
    } catch (error) {
      onOrden(anteriores);
      toast.error(mensajeError(error, 'No se pudo cambiar el orden.'));
    } finally {
      setOcupado(null);
    }
  };

  const alternar = async (categoria) => {
    const visible = !categoria.is_active;
    setOcupado(categoria.id);
    onGuardada({ ...categoria, is_active: visible }, false);
    try {
      const { data } = await api.patch(`/menu/categories/${categoria.id}/`, { is_active: visible });
      onGuardada(data, false);
      toast.success(visible ? `«${data.name}» vuelve a la carta` : `«${data.name}» quedó oculta`);
    } catch (error) {
      onGuardada(categoria, false);
      toast.error(mensajeError(error, 'No se pudo cambiar la categoría.'));
    } finally {
      setOcupado(null);
    }
  };

  const eliminar = async (categoria) => {
    setOcupado(categoria.id);
    try {
      const { data } = await api.delete(`/menu/categories/${categoria.id}/`);
      toast.success(data?.detail || 'Categoría eliminada.', { duration: data?.productos_desactivados ? 7000 : 4000 });
      setConfirmando(null);
      onEliminada(categoria);
    } catch (error) {
      toast.error(mensajeError(error, 'No se pudo eliminar la categoría.'));
    } finally {
      setOcupado(null);
    }
  };

  // Cerrar desde el formulario vuelve a la lista
  const cerrar = () => {
    if (cat.saving) return;
    if (vista === 'form') setVista('lista');
    else onClose();
  };

  if (vista === 'form') {
    const editando = cat.categoria;
    return (
      <Modal
        open={open}
        onClose={cerrar}
        eyebrow="Categorías"
        title={editando ? `Editar «${editando.name}»` : 'Nueva categoría'}
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setVista('lista')} disabled={cat.saving}>
              Volver
            </Button>
            <Button size="sm" type="submit" form={formId} disabled={cat.saving}>
              {cat.saving ? 'Guardando…' : editando ? 'Guardar cambios' : 'Crear categoría'}
            </Button>
          </>
        }
      >
        <CamposCategoria formId={formId} {...cat} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      eyebrow="Tu carta"
      title="Categorías"
      subtitle="Ordénalas como quieres que aparezcan en la carta."
      footer={
        <>
          <Button size="sm" variant="secondary" onClick={() => abrirForm(null)}>
            <Plus className="h-4 w-4" aria-hidden="true" /> Nueva categoría
          </Button>
          <Button size="sm" onClick={onClose}>
            Listo
          </Button>
        </>
      }
    >
      {categorias.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-oro-300 bg-pistacho-50 px-4 py-6 text-center">
          <p className="font-serif text-lg italic text-verde-700">Aún no hay categorías</p>
          <p className="mt-1 text-sm text-verde-600">Crea la primera para ordenar tu carta: bebidas, panadería, postres…</p>
        </div>
      ) : (
        <ul className="divide-y divide-oro-200/70 overflow-hidden rounded-2xl border border-oro-200/80 bg-marfil">
          {categorias.map((c, i) => (
            <li key={c.id} className={`px-2 py-1.5 sm:px-3 ${c.is_active ? '' : 'bg-crema/70'}`}>
              {confirmando === c.id ? (
                <div className="flex flex-wrap items-center gap-2 py-1" role="group" aria-label={`Eliminar ${c.name}`}>
                  <p className="min-w-0 flex-1 text-sm text-verde-700">
                    ¿Eliminar «{c.name}»?{' '}
                    <span className="text-verde-600">
                      {!c.items_count
                        ? 'No tiene productos.'
                        : c.is_active
                        ? `${c.items_count === 1 ? 'Su producto seguirá' : `Sus ${c.items_count} productos seguirán`} en la carta, sin categoría. Si solo quieres esconderla, ocúltala.`
                        : `Como está oculta, ${c.items_count === 1 ? 'su producto quedará desactivado' : `sus ${c.items_count} productos quedarán desactivados`} y sin categoría: no aparecerán en la carta.`}
                    </span>
                  </p>
                  <div className="flex gap-1.5">
                    <Button size="sm" variant="ghost" onClick={() => setConfirmando(null)} disabled={ocupado === c.id}>
                      Cancelar
                    </Button>
                    <Button size="sm" variant="danger" onClick={() => eliminar(c)} disabled={ocupado === c.id}>
                      {ocupado === c.id ? 'Eliminando…' : 'Eliminar'}
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5 sm:gap-2">
                  <div className="flex shrink-0 flex-col">
                    <button
                      type="button"
                      onClick={() => mover(i, -1)}
                      disabled={i === 0 || !!ocupado}
                      aria-label={`Subir ${c.name}`}
                      className="flex h-5 w-7 items-center justify-center rounded-md text-verde-600 hover:bg-pistacho-100 hover:text-cobalto-500 disabled:opacity-25"
                    >
                      <ChevronUp className="h-4 w-4" aria-hidden="true" />
                    </button>
                    <button
                      type="button"
                      onClick={() => mover(i, 1)}
                      disabled={i === categorias.length - 1 || !!ocupado}
                      aria-label={`Bajar ${c.name}`}
                      className="flex h-5 w-7 items-center justify-center rounded-md text-verde-600 hover:bg-pistacho-100 hover:text-cobalto-500 disabled:opacity-25"
                    >
                      <ChevronDown className="h-4 w-4" aria-hidden="true" />
                    </button>
                  </div>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-pistacho-100 text-lg ring-1 ring-oro-300 ${
                      c.is_active ? '' : 'opacity-60 grayscale'
                    }`}
                    aria-hidden="true"
                  >
                    {emojiCategoria(c.icon) || <span className="rombo" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className={`truncate font-serif text-[15px] italic font-medium ${c.is_active ? 'text-verde-700' : 'text-verde-600'}`}>
                      {c.name}
                    </p>
                    <p className="text-[11px] text-verde-600">
                      {productos(c.items_count)}
                      {!c.is_active && ' · oculta'}
                    </p>
                  </div>
                  <Interruptor
                    activo={c.is_active}
                    onChange={() => alternar(c)}
                    etiqueta={`${c.name}: visible en la carta`}
                    textoSi="Visible"
                    textoNo="Oculta"
                    textoSoloEscritorio
                    disabled={ocupado === c.id}
                  />
                  <BotonIcono icon={Pencil} etiqueta={`Editar ${c.name}`} onClick={() => abrirForm(c)} />
                  <BotonIcono icon={Trash2} etiqueta={`Eliminar ${c.name}`} tono="peligro" onClick={() => setConfirmando(c.id)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
};
