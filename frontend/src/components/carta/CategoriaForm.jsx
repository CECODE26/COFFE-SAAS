import React, { useCallback, useState } from 'react';
import toast from 'react-hot-toast';
import { Field, FormAlert, parseApiErrors } from '../Form';
import { Interruptor } from './ui';
import { EMOJIS } from './utils';
import api from '../../services/api';

const VACIA = { name: '', icon: EMOJIS[0], description: '', is_active: true };
const SIN_ERRORES = { fields: {}, general: null };

// Estado y guardado de una categoría. Lo usan el modal de categorías y el de producto («Nueva categoría…»).
// `tenant` solo lo pasa el super_admin (el resto de roles usa el suyo).
export const useCategoriaForm = ({ tenant, onGuardada }) => {
  const [categoria, setCategoria] = useState(null);
  const [form, setForm] = useState(VACIA);
  const [errors, setErrors] = useState(SIN_ERRORES);
  const [saving, setSaving] = useState(false);

  // Prepara el formulario para crear (null) o editar una categoría
  const reiniciar = useCallback((cat) => {
    setCategoria(cat || null);
    setForm(
      cat ? { name: cat.name, icon: cat.icon || '', description: cat.description || '', is_active: cat.is_active } : VACIA
    );
    setErrors(SIN_ERRORES);
  }, []);

  const guardar = async (e) => {
    e?.preventDefault();
    if (saving) return;
    const name = form.name.trim();
    if (!name) {
      setErrors({ fields: { name: 'Escribe un nombre.' }, general: null });
      return;
    }
    const datos = { name, icon: form.icon.trim(), description: form.description.trim(), is_active: form.is_active };
    setSaving(true);
    setErrors(SIN_ERRORES);
    try {
      const { data } = categoria
        ? await api.patch(`/menu/categories/${categoria.id}/`, datos)
        : await api.post('/menu/categories/', tenant ? { ...datos, tenant } : datos);
      toast.success(categoria ? `Categoría «${data.name}» actualizada` : `Categoría «${data.name}» creada`);
      onGuardada?.(data, !categoria);
    } catch (error) {
      const parsed = parseApiErrors(error);
      if (parsed.fields.tenant) parsed.general = parsed.fields.tenant;
      setErrors(parsed);
    } finally {
      setSaving(false);
    }
  };

  return { categoria, form, setForm, errors, saving, reiniciar, guardar };
};

// Campos del formulario (el botón de guardar va en el pie del modal con form={formId})
export const CamposCategoria = ({ formId, form, setForm, errors, saving, guardar }) => {
  const set = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }));
  const propio = form.icon && !EMOJIS.includes(form.icon) ? form.icon : '';

  return (
    <form id={formId} onSubmit={guardar} noValidate className="space-y-4">
      <FormAlert>{errors.general}</FormAlert>

      <Field label="Nombre" required error={errors.fields.name}>
        <input
          className="input !py-2.5"
          value={form.name}
          onChange={set('name')}
          placeholder="Postres"
          maxLength={100}
          autoFocus
          disabled={saving}
        />
      </Field>

      <fieldset>
        <legend className="label">Ícono</legend>
        <div className="flex flex-wrap items-center gap-1.5">
          {EMOJIS.map((emoji) => {
            const elegido = form.icon === emoji;
            return (
              <button
                key={emoji}
                type="button"
                onClick={() => setForm((f) => ({ ...f, icon: emoji }))}
                aria-pressed={elegido}
                aria-label={`Usar ${emoji}`}
                className={`flex h-9 w-9 items-center justify-center rounded-xl text-lg transition ${
                  elegido ? 'bg-verde-700 ring-2 ring-oro-300' : 'bg-marfil ring-1 ring-oro-200 hover:bg-pistacho-100'
                }`}
              >
                {emoji}
              </button>
            );
          })}
          <input
            className="input !w-[4.5rem] !rounded-xl !px-2 !py-1.5 text-center text-lg"
            value={propio}
            onChange={set('icon')}
            placeholder="Otro"
            maxLength={8}
            aria-label="Otro ícono (pega o escribe un emoji)"
          />
          <button
            type="button"
            onClick={() => setForm((f) => ({ ...f, icon: '' }))}
            aria-pressed={!form.icon}
            className={`min-h-[36px] rounded-full px-3 text-[10.5px] font-medium uppercase tracking-[0.12em] transition-colors ${
              !form.icon ? 'bg-verde-700 text-marfil' : 'text-verde-600 hover:bg-pistacho-100'
            }`}
          >
            Sin ícono
          </button>
        </div>
        {errors.fields.icon && <p className="mt-1.5 text-xs text-terracotta-700">{errors.fields.icon}</p>}
      </fieldset>

      <Field label="Descripción" hint="Opcional. Una línea que acompaña a la categoría." error={errors.fields.description}>
        <textarea
          className="input min-h-[64px] resize-y !py-2.5"
          rows={2}
          value={form.description}
          onChange={set('description')}
          placeholder="Hechos cada mañana en casa."
        />
      </Field>

      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-oro-200/80 bg-pistacho-50 px-3.5 py-2.5">
        <div className="min-w-0">
          <p className="text-sm font-medium text-verde-700">Visible en la carta</p>
          <p className="text-[11px] text-verde-600">Si la ocultas, sus productos salen de la carta: no los ven los clientes ni el personal al tomar pedidos.</p>
        </div>
        <Interruptor
          activo={form.is_active}
          onChange={(v) => setForm((f) => ({ ...f, is_active: v }))}
          etiqueta="Visible en la carta"
          textoSi="Visible"
          textoNo="Oculta"
        />
      </div>
    </form>
  );
};
