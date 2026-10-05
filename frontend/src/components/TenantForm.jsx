import React, { useEffect, useRef, useState } from 'react';
import { Modal, Field, FormAlert, parseApiErrors } from './Form';
import { Button } from './Button';
import { PLAN_LABELS, PLAN_LIMITS, PLANES_DE_PAGO, limitsText } from '../lib/roles';
import { UserPlus } from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../services/api';

const EMPTY = {
  name: '',
  business_name: '',
  ruc: '',
  email: '',
  phone: '',
  city: '',
  address: '',
  plan: 'basic',
};

const RUC_LEN = 13;

const planLimits = (plan) => limitsText(PLAN_LIMITS[plan].cafes, PLAN_LIMITS[plan].users);

// Alta de un distribuidor (solo super admin). Al terminar ofrece crear su administrador
// con `onCreateAdmin(tenant)`; quien lo usa abre el UserForm con ese distribuidor elegido.
export const TenantForm = ({ open, onClose, onCreated, onCreateAdmin }) => {
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);
  const rucRef = useRef(null);
  const planRefs = useRef({});
  // Tras pintar el error del RUC se lleva el foco al campo (así el lector de pantalla lo lee)
  const [focusRuc, setFocusRuc] = useState(0);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setCreated(null);
    setErrors({ fields: {}, general: null });
  }, [open]);

  useEffect(() => {
    if (focusRuc) rucRef.current?.focus();
  }, [focusRuc]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => errors.fields[key];

  // El RUC solo admite dígitos (máximo 13). Sin maxLength en el input: así, al pegar
  // "1790012345-001", primero se quitan guiones y espacios y luego se recorta.
  // El aviso de error se limpia al corregirlo.
  const setRuc = (e) => {
    const ruc = e.target.value.replace(/\D/g, '').slice(0, RUC_LEN);
    setForm((f) => ({ ...f, ruc }));
    if (errors.fields.ruc) setErrors((x) => ({ ...x, fields: { ...x.fields, ruc: undefined } }));
  };

  const setPlan = (plan) => {
    setForm((f) => ({ ...f, plan }));
    if (errors.fields.plan) setErrors((x) => ({ ...x, fields: { ...x.fields, plan: undefined } }));
  };

  // Grupo de radios: una sola parada de Tab y las flechas (o Inicio/Fin) cambian de plan
  const onPlanKey = (e) => {
    const i = PLANES_DE_PAGO.indexOf(form.plan);
    const last = PLANES_DE_PAGO.length - 1;
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
    const plan = PLANES_DE_PAGO[next];
    setPlan(plan);
    planRefs.current[plan]?.focus();
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (form.ruc.length !== RUC_LEN) {
      setErrors({ fields: { ruc: `El RUC debe tener exactamente ${RUC_LEN} dígitos (tiene ${form.ruc.length}).` }, general: null });
      setFocusRuc((n) => n + 1);
      return;
    }
    setSaving(true);
    setErrors({ fields: {}, general: null });
    try {
      const { data } = await api.post('/tenants/', form);
      toast.success(`${data.name} ya forma parte de la red`);
      setCreated(data);
      onCreated?.(data);
    } catch (error) {
      setErrors(parseApiErrors(error));
    } finally {
      setSaving(false);
    }
  };

  if (created) {
    return (
      <Modal
        open={open}
        onClose={onClose}
        eyebrow="Plataforma"
        title="Distribuidor creado"
        subtitle="Falta su administrador: quien entra al panel del distribuidor y da de alta a los admins de sus cafeterías."
        footer={
          <>
            <Button variant="ghost" onClick={onClose}>Listo</Button>
            <Button onClick={() => onCreateAdmin?.(created)} autoFocus>
              <UserPlus className="h-4 w-4" aria-hidden="true" /> Crear su administrador
            </Button>
          </>
        }
      >
        <div className="rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 sm:p-5">
          <p className="font-serif text-xl italic font-medium text-verde-700">{created.name}</p>
          <p className="text-sm text-verde-600">{created.business_name}</p>
          <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-3 text-sm sm:grid-cols-[1fr_auto_auto]">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-oro-600">RUC</dt>
              <dd className="tabular-nums text-verde-800">{created.ruc}</dd>
            </div>
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-oro-600">Plan</dt>
              <dd className="text-verde-800">{PLAN_LABELS[created.plan]}</dd>
            </div>
            <div className="col-span-2 sm:col-span-1">
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-oro-600">Límites</dt>
              <dd className="text-verde-800">{limitsText(created.max_cafes, created.max_users)}</dd>
            </div>
          </dl>
        </div>
      </Modal>
    );
  }

  return (
    <Modal
      open={open}
      onClose={onClose}
      size="lg"
      eyebrow="Plataforma"
      title="Nuevo distribuidor"
      subtitle="Suma una cadena de cafeterías a la red."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="tenant-form" disabled={saving}>
            {saving ? (
              'Guardando…'
            ) : (
              <>
                {/* En móvil basta "Crear" (el título ya dice qué): así el pie cabe en una fila */}
                <span className="sm:hidden">Crear</span>
                <span className="hidden sm:inline">Crear distribuidor</span>
              </>
            )}
          </Button>
        </>
      }
    >
      <form id="tenant-form" onSubmit={handleSubmit} className="space-y-5">
        <FormAlert>{errors.general}</FormAlert>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre comercial" required error={err('name')}>
            <input className="input" value={form.name} onChange={set('name')} placeholder="Andes Coffee Group" required autoFocus />
          </Field>
          <Field label="Razón social" required error={err('business_name')}>
            <input className="input" value={form.business_name} onChange={set('business_name')} placeholder="Andes Coffee Group S.A." required />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field
            label="RUC"
            required
            error={err('ruc')}
            hint={form.ruc && form.ruc.length < RUC_LEN ? `${form.ruc.length} de ${RUC_LEN} dígitos` : `${RUC_LEN} dígitos`}
          >
            <input
              ref={rucRef}
              className="input tabular-nums"
              value={form.ruc}
              onChange={setRuc}
              inputMode="numeric"
              autoComplete="off"
              placeholder="1790012345001"
              required
            />
          </Field>
          <Field label="Email" required error={err('email')}>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="contacto@cadena.ec" required />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-[1fr_1fr_2fr]">
          <Field label="Teléfono" error={err('phone')}>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+593 2…" />
          </Field>
          <Field label="Ciudad" error={err('city')}>
            <input className="input" value={form.city} onChange={set('city')} placeholder="Quito" />
          </Field>
          <Field label="Dirección" error={err('address')}>
            <input className="input" value={form.address} onChange={set('address')} placeholder="Av. Amazonas N34-183" />
          </Field>
        </div>

        <div className="rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 sm:p-5">
          <p className="mb-3 flex items-center gap-2.5 font-serif text-lg italic font-medium text-verde-700">
            <span className="rombo" aria-hidden="true" />
            Plan
          </p>
          <div
            className="grid gap-2 sm:grid-cols-3"
            role="radiogroup"
            aria-label="Plan"
            aria-invalid={err('plan') ? true : undefined}
            aria-describedby={err('plan') ? 'tenant-plan-error' : undefined}
            onKeyDown={onPlanKey}
          >
            {PLANES_DE_PAGO.map((plan) => (
              <button
                key={plan}
                ref={(el) => { planRefs.current[plan] = el; }}
                type="button"
                role="radio"
                aria-checked={form.plan === plan}
                tabIndex={form.plan === plan ? 0 : -1}
                onClick={() => setPlan(plan)}
                className={`flex min-h-[56px] flex-col items-start justify-center rounded-2xl border px-3.5 py-2.5 text-left transition-all ${
                  form.plan === plan
                    ? 'border-cobalto-500 bg-cobalto-50 text-cobalto-600 ring-4 ring-cobalto-100'
                    : 'border-oro-200 bg-marfil text-verde-700 hover:border-oro-400 hover:bg-pistacho-50'
                }`}
              >
                <span className="flex w-full items-center justify-between gap-2">
                  <span className="font-serif text-[15px] italic font-medium leading-tight">{PLAN_LABELS[plan]}</span>
                  {form.plan === plan && <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-oro-400" aria-hidden="true" />}
                </span>
                <span className="mt-0.5 text-xs text-verde-600">{planLimits(plan)}</span>
              </button>
            ))}
          </div>
          {err('plan') && (
            <p id="tenant-plan-error" role="alert" className="field-error mt-1.5 text-xs text-terracotta-700">
              {err('plan')}
            </p>
          )}
        </div>
      </form>
    </Modal>
  );
};
