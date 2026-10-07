import React, { useEffect, useRef, useState } from 'react';
import { Modal, Field, FormAlert, parseApiErrors } from './Form';
import { Button } from './Button';
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
};

const RUC_LEN = 13;

// Alta de un distribuidor (solo super admin). No tiene plan ni límites: el plan lo elige cada cafetería.
// Al terminar ofrece crear su administrador con `onCreateAdmin(tenant)`; quien lo usa abre el UserForm
// con ese distribuidor elegido.
export const TenantForm = ({ open, onClose, onCreated, onCreateAdmin }) => {
  const [form, setForm] = useState(EMPTY);
  const [created, setCreated] = useState(null);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);
  const rucRef = useRef(null);
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
          <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-[auto_1fr]">
            <div>
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-oro-600">RUC</dt>
              <dd className="tabular-nums text-verde-800">{created.ruc}</dd>
            </div>
            <div className="min-w-0">
              <dt className="text-[10px] font-medium uppercase tracking-[0.18em] text-oro-600">Email</dt>
              <dd className="truncate text-verde-800">{created.email}</dd>
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
      </form>
    </Modal>
  );
};
