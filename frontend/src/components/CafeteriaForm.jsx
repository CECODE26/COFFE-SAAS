import React, { useEffect, useRef, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Modal, Field, FormAlert, parseApiErrors } from './Form';
import { Button } from './Button';
import { PLANES, PLAN_POR_DEFECTO, NOTA_IVA, precioMensual } from '../lib/planes';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

const EMPTY = {
  tenant: '',
  name: '',
  city: '',
  address: '',
  phone: '',
  email: '',
  ruc: '',
  capacity: 40,
  open_time: '07:00',
  close_time: '21:00',
  description: '',
  plan: PLAN_POR_DEFECTO,
};

// Lo que se puede cambiar de una cafetería existente (CafeteriaUpdateSerializer): el distribuidor y el RUC no
const EDITABLES = ['name', 'city', 'address', 'phone', 'email', 'capacity', 'open_time', 'close_time', 'description', 'plan'];

// Ficha de la API -> formulario (las horas llegan como "07:00:00")
const fromCafe = (c) => ({
  ...EMPTY,
  ...Object.fromEntries(EDITABLES.filter((k) => c[k] !== undefined && c[k] !== null).map((k) => [k, c[k]])),
  open_time: (c.open_time || EMPTY.open_time).slice(0, 5),
  close_time: (c.close_time || EMPTY.close_time).slice(0, 5),
});

const planName = (id) => PLANES.find((p) => p.id === id)?.name || id;

// Selector de plan: grupo de radios con una sola parada de Tab; flechas, Inicio y Fin cambian de plan
const PlanPicker = ({ value, onChange, error }) => {
  const refs = useRef({});
  const onKey = (e) => {
    const i = PLANES.findIndex((p) => p.id === value);
    const last = PLANES.length - 1;
    const next = {
      ArrowRight: i < last ? i + 1 : 0,
      ArrowDown: i < last ? i + 1 : 0,
      ArrowLeft: i > 0 ? i - 1 : last,
      ArrowUp: i > 0 ? i - 1 : last,
      Home: 0,
      End: last,
    }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    const id = PLANES[next].id;
    onChange(id);
    refs.current[id]?.focus();
  };

  return (
    <>
      <div
        className="grid gap-2 sm:grid-cols-2"
        role="radiogroup"
        aria-label="Plan"
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? 'cafe-plan-error' : 'cafe-plan-nota'}
        onKeyDown={onKey}
      >
        {PLANES.map((p) => {
          const on = value === p.id;
          return (
            <button
              key={p.id}
              ref={(el) => {
                refs.current[p.id] = el;
              }}
              type="button"
              role="radio"
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(p.id)}
              className={`flex flex-col items-start rounded-2xl border px-3.5 py-2.5 text-left transition-all ${
                on
                  ? 'border-cobalto-500 bg-cobalto-50 ring-4 ring-cobalto-100'
                  : 'border-oro-200 bg-marfil hover:border-oro-400 hover:bg-pistacho-50'
              }`}
            >
              <span className="flex w-full items-center justify-between gap-2">
                <span className={`font-serif text-[15px] italic font-medium leading-tight ${on ? 'text-cobalto-600' : 'text-verde-700'}`}>
                  {p.name}
                </span>
                {on && <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-oro-400" aria-hidden="true" />}
              </span>
              <span className="mt-0.5 text-sm font-medium text-verde-800">{precioMensual(p.price)}</span>
              <span className="mt-0.5 text-xs leading-snug text-verde-600">{p.incluye}</span>
            </button>
          );
        })}
      </div>
      {error ? (
        <p id="cafe-plan-error" role="alert" className="field-error mt-1.5 text-xs text-terracotta-700">{error}</p>
      ) : (
        <p id="cafe-plan-nota" className="field-hint mt-1.5 text-xs text-verde-600">Precio por local. {NOTA_IVA}</p>
      )}
    </>
  );
};

// Alta (sin `cafe`) o edición (con `cafe`, una fila de la lista) de una cafetería.
// Solo lo usan super admin y distribuidor: los dos eligen y cambian el plan. onSaved(ficha, { created }).
export const CafeteriaForm = ({ open, onClose, onSaved, cafe = null }) => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const editing = !!cafe;
  const [form, setForm] = useState(EMPTY);
  const [initialPlan, setInitialPlan] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    let vigente = true;
    setErrors({ fields: {}, general: null });
    if (cafe) {
      // Se pinta con la fila de la lista; la descripción (que la lista no trae) llega con la ficha
      // y solo se pone si nadie la escribió mientras tanto
      setForm(fromCafe(cafe));
      setInitialPlan(cafe.plan);
      api
        .get(`/cafeterias/${cafe.id}/`)
        .then(({ data }) => {
          if (vigente) setForm((f) => (f.description ? f : { ...f, description: data.description || '' }));
        })
        .catch(() => {});
    } else {
      setForm(EMPTY);
      setInitialPlan(null);
      if (isSuper) fetchAll('/tenants/').then((t) => vigente && setTenants(t)).catch(() => {});
    }
    return () => {
      vigente = false;
    };
  }, [open, isSuper, cafe]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => errors.fields[key];

  const setPlan = (plan) => {
    setForm((f) => ({ ...f, plan }));
    if (errors.fields.plan) setErrors((x) => ({ ...x, fields: { ...x.fields, plan: undefined } }));
  };

  const planChanged = editing && initialPlan && form.plan !== initialPlan;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({ fields: {}, general: null });
    try {
      if (editing) {
        const payload = Object.fromEntries(EDITABLES.map((k) => [k, form[k]]));
        payload.capacity = Number(form.capacity);
        const { data } = await api.patch(`/cafeterias/${cafe.id}/`, payload);
        toast.success(planChanged ? `${data.name}: plan ${data.plan_info?.nombre}` : `${data.name} actualizada`);
        onSaved?.(data, { created: false });
      } else {
        const payload = { ...form, capacity: Number(form.capacity) };
        if (!isSuper) delete payload.tenant;
        const { data } = await api.post('/cafeterias/', payload);
        toast.success(`${data.name} creada`);
        onSaved?.(data, { created: true });
      }
      onClose();
    } catch (error) {
      setErrors(parseApiErrors(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow={isSuper ? (editing ? cafe.tenant_name : 'Plataforma') : user?.tenant_name}
      title={editing ? 'Editar cafetería' : 'Nueva cafetería'}
      subtitle={editing ? 'Datos del local y su plan.' : 'Abre un nuevo local en la red.'}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="cafeteria-form" disabled={saving}>
            {saving ? 'Guardando…' : editing ? 'Guardar cambios' : 'Crear cafetería'}
          </Button>
        </>
      }
    >
      <form id="cafeteria-form" onSubmit={handleSubmit} className="space-y-5">
        <FormAlert>{errors.general}</FormAlert>

        {isSuper && !editing && (
          <Field label="Distribuidor" required error={err('tenant')}>
            <select className="input" value={form.tenant} onChange={set('tenant')} required>
              <option value="">Selecciona un distribuidor…</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </Field>
        )}

        <Field label="Nombre" required error={err('name')}>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Café La Carolina" required autoFocus />
        </Field>

        <div className="grid gap-5 sm:grid-cols-[1fr_2fr]">
          <Field label="Ciudad" required error={err('city')}>
            <input className="input" value={form.city} onChange={set('city')} placeholder="Quito" required />
          </Field>
          <Field label="Dirección" required error={err('address')}>
            <input className="input" value={form.address} onChange={set('address')} placeholder="Av. Amazonas N34-120" required />
          </Field>
        </div>

        <div className={`grid gap-5 ${editing ? 'sm:grid-cols-2' : 'sm:grid-cols-3'}`}>
          <Field label="Teléfono" error={err('phone')}>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+593 9…" />
          </Field>
          <Field label="Email" error={err('email')}>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="local@cafe.ec" />
          </Field>
          {!editing && (
            <Field label="RUC sucursal" error={err('ruc')}>
              <input className="input" value={form.ruc} onChange={set('ruc')} placeholder="1791234567001" />
            </Field>
          )}
        </div>

        <div className="rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2.5 font-serif text-lg italic font-medium text-verde-700">
            <span className="rombo" aria-hidden="true" />
            Plan
          </p>
          <PlanPicker value={form.plan} onChange={setPlan} error={err('plan')} />
          {planChanged && (
            <p className="mt-2 text-xs text-cobalto-600" role="status">
              Pasa de {planName(initialPlan)} a {planName(form.plan)} al guardar. El cambio queda registrado.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 sm:p-5">
          <p className="mb-4 flex items-center gap-2.5 font-serif text-lg italic font-medium text-verde-700">
            <span className="rombo" aria-hidden="true" />
            Capacidad y horario
          </p>
          <div className="grid grid-cols-2 gap-5 sm:grid-cols-3">
            <Field label="Personas" error={err('capacity')}>
              <input className="input" type="number" min="1" value={form.capacity} onChange={set('capacity')} />
            </Field>
            <Field label="Abre" error={err('open_time')}>
              <input className="input" type="time" value={form.open_time} onChange={set('open_time')} />
            </Field>
            <Field label="Cierra" error={err('close_time')}>
              <input className="input" type="time" value={form.close_time} onChange={set('close_time')} />
            </Field>
          </div>
        </div>

        <Field label="Descripción" error={err('description')}>
          <textarea
            className="input min-h-[90px] resize-y"
            value={form.description}
            onChange={set('description')}
            placeholder="Ambiente, especialidades, lo que la hace única…"
          />
        </Field>
      </form>
    </Modal>
  );
};
