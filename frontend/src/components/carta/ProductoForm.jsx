import React, { useEffect, useId, useState } from 'react';
import toast from 'react-hot-toast';
import { Undo2 } from 'lucide-react';
import { Modal, Field, FormAlert, parseApiErrors } from '../Form';
import { Button } from '../Button';
import { money } from '../Stats';
import { FotoProducto } from './FotoProducto';
import { CamposCategoria, useCategoriaForm } from './CategoriaForm';
import { ChipCasilla, Interruptor } from './ui';
import { aFormData, configMultipart, margen, mensajeError, normalizarDecimal, validarFoto } from './utils';
import { emojiCategoria } from '../cliente/utils';
import api from '../../services/api';

const NUEVA_CATEGORIA = '__nueva__';
const SIN_ERRORES = { fields: {}, general: null };
const SIN_FOTO = { archivo: null, preview: null, quitar: false, error: null };

const VACIO = {
  name: '',
  category: '',
  description: '',
  price: '',
  cost: '',
  preparation_time: '5',
  is_vegetarian: false,
  is_vegan: false,
  has_gluten: false,
  is_available: true,
  is_active: true,
};

const desdeItem = (item) => ({
  name: item.name || '',
  category: item.category || '',
  description: item.description || '',
  price: item.price ?? '',
  cost: item.cost ?? '',
  preparation_time: String(item.preparation_time ?? ''),
  is_vegetarian: !!item.is_vegetarian,
  is_vegan: !!item.is_vegan,
  has_gluten: !!item.has_gluten,
  is_available: !!item.is_available,
  is_active: !!item.is_active,
});

// Al editar se envía solo lo que cambió respecto del producto abierto: así no se pisa lo que otra persona
// cambió mientras tanto (p. ej. el gerente lo marcó «Agotado» y aquí solo se corrige la descripción)
const mismoValor = (clave, nuevo, actual) => {
  if (clave === 'price' || clave === 'cost') return Number(nuevo) === Number(actual ?? 0);
  if (clave === 'category') return (nuevo || null) === (actual || null);
  if (typeof nuevo === 'boolean') return nuevo === !!actual;
  return String(nuevo ?? '') === String(actual ?? '');
};

const soloCambios = (datos, item) =>
  Object.fromEntries(Object.entries(datos).filter(([clave, valor]) => !mismoValor(clave, valor, item[clave])));

// Validación rápida en el navegador (el backend valida igual y sus mensajes se muestran tal cual)
const validar = (form) => {
  const fields = {};
  if (!form.name.trim()) fields.name = 'Escribe un nombre.';
  const precio = normalizarDecimal(form.price);
  if (!precio || Number.isNaN(Number(precio))) fields.price = 'Escribe el precio, por ejemplo 2.50.';
  else if (Number(precio) <= 0) fields.price = 'El precio debe ser mayor a 0.';
  const costo = normalizarDecimal(form.cost);
  if (costo && Number.isNaN(Number(costo))) fields.cost = 'Escribe el costo, por ejemplo 0.90.';
  else if (costo && Number(costo) < 0) fields.cost = 'El costo no puede ser negativo.';
  const tiempo = form.preparation_time === '' ? 0 : Number(form.preparation_time);
  if (!Number.isInteger(tiempo) || tiempo < 0 || tiempo > 180) {
    fields.preparation_time = 'Entre 0 y 180 minutos.';
  }
  return fields;
};

// Crear o editar un producto de la carta, con su foto.
// `tenant` solo lo pasa el super_admin; `categoriaInicial` preselecciona la categoría al crear.
export const ProductoForm = ({ open, onClose, item, categorias, tenant, categoriaInicial = '', onGuardado, onCategoriaGuardada }) => {
  const [form, setForm] = useState(VACIO);
  const [errors, setErrors] = useState(SIN_ERRORES);
  const [saving, setSaving] = useState(false);
  const [progreso, setProgreso] = useState(null);
  const [foto, setFoto] = useState(SIN_FOTO);
  // 'producto' o 'categoria' (crear una categoría sin perder lo escrito)
  const [vista, setVista] = useState('producto');
  const formId = useId();
  const catFormId = useId();

  const cat = useCategoriaForm({
    tenant,
    onGuardada: (data) => {
      onCategoriaGuardada?.(data, true);
      setForm((f) => ({ ...f, category: data.id }));
      setVista('producto');
    },
  });

  useEffect(() => {
    // Al abrir (y al cerrar) se reinicia todo; cambiar `foto` libera la vista previa anterior
    setForm(item ? desdeItem(item) : { ...VACIO, category: categoriaInicial || '' });
    setErrors(SIN_ERRORES);
    setProgreso(null);
    setVista('producto');
    setFoto(SIN_FOTO);
  }, [open, item, categoriaInicial]);

  // Libera la URL temporal de la vista previa cuando cambia o se desmonta
  useEffect(
    () => () => {
      if (foto.preview) URL.revokeObjectURL(foto.preview);
    },
    [foto.preview]
  );

  const set = (clave) => (e) => setForm((f) => ({ ...f, [clave]: e.target.value }));
  const setValor = (clave) => (valor) => setForm((f) => ({ ...f, [clave]: valor }));
  const err = (clave) => errors.fields[clave];

  const cambiarCategoria = (e) => {
    if (e.target.value === NUEVA_CATEGORIA) {
      cat.reiniciar(null);
      setVista('categoria');
      return;
    }
    setForm((f) => ({ ...f, category: e.target.value }));
  };

  const elegirFoto = (archivo) => {
    const problema = validarFoto(archivo);
    if (problema) {
      setFoto((f) => ({ ...f, error: problema }));
      return;
    }
    setFoto({ archivo, preview: URL.createObjectURL(archivo), quitar: false, error: null });
    setErrors((e) => ({ ...e, fields: { ...e.fields, image: undefined } }));
  };

  // Lo que se ve es lo que se guarda: quitar deja el producto sin foto
  const quitarFoto = () => setFoto({ ...SIN_FOTO, quitar: !!item?.image });

  const srcFoto = foto.preview || (!foto.quitar && item ? item.image_thumb || item.image : null) || null;

  const guardar = async (e) => {
    e.preventDefault();
    if (saving) return;
    const invalidos = validar(form);
    if (Object.keys(invalidos).length) {
      setErrors({ fields: invalidos, general: null });
      return;
    }

    const costo = normalizarDecimal(form.cost);
    let datos = {
      name: form.name.trim(),
      category: form.category || null,
      description: form.description.trim(),
      price: normalizarDecimal(form.price),
      cost: costo || '0',
      preparation_time: form.preparation_time === '' ? 0 : Number(form.preparation_time),
      is_vegetarian: form.is_vegetarian,
      is_vegan: form.is_vegan,
      has_gluten: form.has_gluten,
      is_available: form.is_available,
    };
    if (item) {
      datos.is_active = form.is_active;
      datos = soloCambios(datos, item);
    } else if (tenant) {
      datos.tenant = tenant;
    }

    const quitarActual = !!(item && foto.quitar && !foto.archivo && item.image);
    // Sin cambios: nada que guardar
    if (item && !foto.archivo && !quitarActual && Object.keys(datos).length === 0) {
      onClose();
      return;
    }

    const url = item ? `/menu/items/${item.id}/` : '/menu/items/';
    const metodo = item ? 'patch' : 'post';
    setSaving(true);
    setErrors(SIN_ERRORES);
    let guardado = item;
    try {
      if (foto.archivo) {
        setProgreso(0);
        ({ data: guardado } = await api[metodo](url, aFormData({ ...datos, image: foto.archivo }), configMultipart(setProgreso)));
      } else if (!item || Object.keys(datos).length) {
        ({ data: guardado } = await api[metodo](url, datos));
      }
    } catch (error) {
      const parsed = parseApiErrors(error);
      if (parsed.fields.tenant) parsed.general = parsed.fields.tenant;
      if (parsed.fields.image) setFoto((f) => ({ ...f, error: parsed.fields.image }));
      if (!parsed.general && Object.keys(parsed.fields).length === 0) parsed.general = mensajeError(error);
      setErrors(parsed);
      setSaving(false);
      setProgreso(null);
      return;
    }

    // Quitar la foto actual es otra petición: si falla, lo demás ya quedó guardado
    if (quitarActual) {
      try {
        ({ data: guardado } = await api.delete(`/menu/items/${item.id}/imagen/`));
      } catch (error) {
        const soloFoto = Object.keys(datos).length === 0;
        toast.error(mensajeError(error, soloFoto ? 'No se pudo quitar la foto.' : 'Se guardaron los cambios, pero no se pudo quitar la foto.'));
        if (soloFoto) {
          setSaving(false);
          return;
        }
      }
    }

    toast.success(item ? `«${guardado.name}» actualizado` : `«${guardado.name}» agregado a la carta`);
    setSaving(false);
    setProgreso(null);
    onGuardado?.(guardado, !item);
    onClose();
  };

  // Mientras se guarda no se cierra; desde «Nueva categoría» se vuelve al producto
  const cerrar = () => {
    if (saving || cat.saving) return;
    if (vista === 'categoria') setVista('producto');
    else onClose();
  };

  const m = margen(form.price, form.cost);
  const ganancia = Number(normalizarDecimal(form.price)) - Number(normalizarDecimal(form.cost) || 0);

  const textoGuardar = !saving
    ? item
      ? 'Guardar cambios'
      : 'Agregar a la carta'
    : progreso === null
    ? 'Guardando…'
    : progreso < 100
    ? `Subiendo ${progreso} %`
    : 'Procesando foto…';

  if (vista === 'categoria') {
    return (
      <Modal
        open={open}
        onClose={cerrar}
        eyebrow={item ? item.name : 'Nuevo producto'}
        title="Nueva categoría"
        subtitle="Al crearla vuelves al producto con la categoría ya elegida."
        footer={
          <>
            <Button size="sm" variant="ghost" onClick={() => setVista('producto')} disabled={cat.saving}>
              Volver al producto
            </Button>
            <Button size="sm" type="submit" form={catFormId} disabled={cat.saving}>
              {cat.saving ? 'Creando…' : 'Crear categoría'}
            </Button>
          </>
        }
      >
        <CamposCategoria formId={catFormId} {...cat} />
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={cerrar}
      size="lg"
      eyebrow={item ? 'Editar producto' : 'Tu carta'}
      title={item ? item.name : 'Nuevo producto'}
      footer={
        <>
          <Button size="sm" variant="ghost" onClick={cerrar} disabled={saving}>
            Cancelar
          </Button>
          <Button size="sm" type="submit" form={formId} disabled={saving}>
            {textoGuardar}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={guardar} noValidate className="space-y-4">
        <FormAlert>{errors.general}</FormAlert>

        {item && !item.is_active && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-oro-300/70 bg-oro-50 px-3.5 py-2.5">
            <p className="min-w-0 flex-1 text-sm text-oro-700">
              Este producto está desactivado: no aparece en la carta ni se puede pedir.
            </p>
            <Interruptor
              activo={form.is_active}
              onChange={setValor('is_active')}
              etiqueta="Activo en la carta"
              textoSi="Activo"
              textoNo="Desactivado"
              disabled={saving}
            />
          </div>
        )}

        <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
          <div>
            <FotoProducto
              src={srcFoto}
              onArchivo={elegirFoto}
              onQuitar={quitarFoto}
              error={foto.error || err('image')}
              progreso={progreso}
              disabled={saving}
            />
            {foto.quitar && (
              <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[11px] text-oro-700">
                La foto actual se quitará al guardar.
                <button
                  type="button"
                  onClick={() => setFoto(SIN_FOTO)}
                  className="inline-flex items-center gap-1 font-medium text-cobalto-500 underline decoration-oro-400 underline-offset-2"
                >
                  <Undo2 className="h-3 w-3" aria-hidden="true" /> Deshacer
                </button>
              </p>
            )}
          </div>

          <div className="space-y-3.5">
            <Field label="Nombre" required error={err('name')}>
              <input
                className="input !py-2.5"
                value={form.name}
                onChange={set('name')}
                placeholder="Cappuccino"
                maxLength={200}
                autoFocus={!item}
                disabled={saving}
              />
            </Field>

            <Field label="Categoría" error={err('category')}>
              <select className="input !py-2.5" value={form.category} onChange={cambiarCategoria} disabled={saving}>
                <option value="">Sin categoría</option>
                {categorias.map((c) => (
                  <option key={c.id} value={c.id}>
                    {emojiCategoria(c.icon) ? `${c.icon}  ` : ''}
                    {c.name}
                    {c.is_active ? '' : ' (oculta)'}
                  </option>
                ))}
                <option value={NUEVA_CATEGORIA}>＋ Nueva categoría…</option>
              </select>
            </Field>

            <div className="grid grid-cols-3 gap-2.5">
              <Field label="Precio $" required error={err('price')}>
                <input
                  className="input !px-3 !py-2.5"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.price}
                  onChange={set('price')}
                  placeholder="2.50"
                  disabled={saving}
                />
              </Field>
              <Field label="Costo $" error={err('cost')}>
                <input
                  className="input !px-3 !py-2.5"
                  inputMode="decimal"
                  autoComplete="off"
                  value={form.cost}
                  onChange={set('cost')}
                  placeholder="0.90"
                  disabled={saving}
                />
              </Field>
              <Field label="Minutos" error={err('preparation_time')}>
                <input
                  className="input !px-3 !py-2.5"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="180"
                  step="1"
                  value={form.preparation_time}
                  onChange={set('preparation_time')}
                  placeholder="5"
                  aria-label="Tiempo de preparación en minutos"
                  disabled={saving}
                />
              </Field>
            </div>

            {/* Margen en vivo: solo lo ve quien gestiona la carta */}
            <p className="-mt-1 min-h-[1.25rem] text-xs" aria-live="polite">
              {m === null ? (
                <span className="text-verde-600">Con el costo te mostramos el margen de ganancia.</span>
              ) : m < 0 ? (
                <span className="text-terracotta-700">
                  Margen <strong className="font-semibold">{Math.round(m)} %</strong> · pierdes {money(-ganancia)} por unidad
                </span>
              ) : (
                <span className={m < 30 ? 'text-oro-700' : 'text-verde-600'}>
                  Margen <strong className="font-semibold">{Math.round(m)} %</strong> · ganas {money(ganancia)} por unidad
                </span>
              )}
            </p>
          </div>
        </div>

        <Field label="Descripción" error={err('description')}>
          <textarea
            className="input min-h-[64px] resize-y !py-2.5"
            rows={2}
            value={form.description}
            onChange={set('description')}
            placeholder="Espresso con leche texturizada y espuma sedosa."
            disabled={saving}
          />
        </Field>

        <div className="flex flex-wrap items-end justify-between gap-3">
          <fieldset>
            <legend className="label">Etiquetas</legend>
            <div className="flex flex-wrap gap-1.5">
              <ChipCasilla
                checked={form.is_vegetarian}
                disabled={saving}
                // Sin vegetariano no hay vegano
                onChange={(v) => setForm((f) => ({ ...f, is_vegetarian: v, is_vegan: v ? f.is_vegan : false }))}
              >
                Vegetariano
              </ChipCasilla>
              <ChipCasilla
                checked={form.is_vegan}
                disabled={saving}
                // Vegano implica vegetariano
                onChange={(v) => setForm((f) => ({ ...f, is_vegan: v, is_vegetarian: v ? true : f.is_vegetarian }))}
              >
                Vegano
              </ChipCasilla>
              <ChipCasilla checked={form.has_gluten} disabled={saving} onChange={setValor('has_gluten')}>
                Con gluten
              </ChipCasilla>
            </div>
          </fieldset>
          <Interruptor
            activo={form.is_available}
            onChange={setValor('is_available')}
            etiqueta="Disponible para pedir"
            textoSi="Disponible"
            textoNo="Agotado"
            disabled={saving}
          />
        </div>
      </form>
    </Modal>
  );
};
