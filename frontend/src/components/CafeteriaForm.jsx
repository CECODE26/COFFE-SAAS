import React, { useEffect, useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { Modal, Field, FormAlert, parseApiErrors } from './Form';
import { Button } from './Button';
import { PLAN_LABELS, isUnlimited } from '../lib/roles';
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
};

export const CafeteriaForm = ({ open, onClose, onCreated }) => {
  const { user } = useAuth();
  const isSuper = user?.role === 'super_admin';
  const [form, setForm] = useState(EMPTY);
  const [tenants, setTenants] = useState([]);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm(EMPTY);
    setErrors({ fields: {}, general: null });
    if (isSuper) fetchAll('/tenants/').then(setTenants).catch(() => {});
  }, [open, isSuper]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const err = (key) => errors.fields[key];

  const selectedTenant = tenants.find((t) => t.id === form.tenant);
  const tenantFull = selectedTenant && selectedTenant.active_cafes_count >= selectedTenant.max_cafes;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({ fields: {}, general: null });
    const payload = { ...form, capacity: Number(form.capacity) };
    if (!isSuper) delete payload.tenant;
    try {
      const { data } = await api.post('/cafeterias/', payload);
      toast.success(`${data.name} creada`);
      onCreated?.(data);
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
      eyebrow={isSuper ? 'Plataforma' : user?.tenant_name}
      title="Nueva cafetería"
      subtitle="Abre un nuevo local en la red."
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="cafeteria-form" disabled={saving || tenantFull}>
            {saving ? 'Guardando…' : 'Crear cafetería'}
          </Button>
        </>
      }
    >
      <form id="cafeteria-form" onSubmit={handleSubmit} className="space-y-5">
        <FormAlert>{errors.general}</FormAlert>

        {isSuper && (
          <Field
            label="Distribuidor"
            required
            error={
              err('tenant') ||
              (tenantFull && `Sin cupo: el plan ${PLAN_LABELS[selectedTenant.plan]} permite ${selectedTenant.max_cafes}. Sube su plan desde la consola.`)
            }
            hint={
              selectedTenant &&
              `Plan ${PLAN_LABELS[selectedTenant.plan]} · ${selectedTenant.active_cafes_count} ${
                isUnlimited(selectedTenant.max_cafes) ? 'cafeterías · ilimitado' : `de ${selectedTenant.max_cafes} cafeterías`
              }`
            }
          >
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

        <div className="grid gap-5 sm:grid-cols-3">
          <Field label="Teléfono" error={err('phone')}>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+593 9…" />
          </Field>
          <Field label="Email" error={err('email')}>
            <input className="input" type="email" value={form.email} onChange={set('email')} placeholder="local@cafe.ec" />
          </Field>
          <Field label="RUC sucursal" error={err('ruc')}>
            <input className="input" value={form.ruc} onChange={set('ruc')} placeholder="1791234567001" />
          </Field>
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
