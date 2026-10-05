import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Modal, Field, FormAlert, parseApiErrors } from './Form';
import { Button } from './Button';
import { ROLE_LABELS } from '../lib/roles';
import { Eye, EyeOff, Wand2, Network, Plus, Store } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

// Quién crea a quién: mismas reglas que UserCreateSerializer.ASSIGNABLE_ROLES en el backend.
// El distribuidor solo da de alta Admin Cafetería y este, el personal de su local.
const ASSIGNABLE = {
  super_admin: ['super_admin', 'distribuidor_admin', 'cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero', 'usuario'],
  distribuidor_admin: ['cafe_admin'],
  cafe_admin: ['gerente', 'camarero', 'cajero', 'cocinero'],
};
const CAFE_ROLES = ['cafe_admin', 'gerente', 'camarero', 'cajero', 'cocinero'];

const ROLE_HINTS = {
  super_admin: 'Acceso total a la plataforma',
  distribuidor_admin: 'Gestiona las cafeterías de su red y crea sus administradores',
  cafe_admin: 'Administra su cafetería: carta, mesas, pedidos y su personal',
  gerente: 'Supervisa la operación del local',
  camarero: 'Mesas y pedidos',
  cajero: 'Cobros y pagos',
  cocinero: 'Cocina y preparación',
  usuario: 'Acceso básico',
};

// Qué puede crear cada creador, dicho en una línea (subtítulo del formulario)
const CREATOR_SUBTITLES = {
  distribuidor_admin: 'Crea el administrador de una de tus cafeterías; esa persona dará de alta a su personal.',
  cafe_admin: 'Da acceso a alguien de tu equipo.',
};

// Rol inicial: el pedido (si se puede asignar), si no camarero, si no el primero disponible
const defaultRole = (assignable, wanted) => {
  if (wanted && assignable.includes(wanted)) return wanted;
  if (assignable.includes('camarero')) return 'camarero';
  return assignable[0] || '';
};

const EMPTY = {
  tenant: '',
  role: '',
  cafeteria: '',
  first_name: '',
  last_name: '',
  email: '',
  phone: '',
  password: '',
  password2: '',
};

const randomPassword = () => {
  const chars = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
};

// initialRole / initialTenant (opcionales): valores con los que se abre, p. ej. el administrador
// de un distribuidor recién creado en Plataforma.
export const UserForm = ({ open, onClose, onCreated, initialRole, initialTenant }) => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const isSuper = user?.role === 'super_admin';
  const isCafeAdmin = user?.role === 'cafe_admin';
  const assignable = useMemo(() => ASSIGNABLE[user?.role] || [], [user?.role]);
  const [form, setForm] = useState(EMPTY);
  const [tenants, setTenants] = useState([]);
  const [cafes, setCafes] = useState([]);
  // Se marca cuando cada lista llega bien: así el aviso de "no hay distribuidores/cafeterías" no parpadea
  // (ni sale por un error de red)
  const [loaded, setLoaded] = useState({ tenants: false, cafes: false });
  const [showPwd, setShowPwd] = useState(false);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setForm({
      ...EMPTY,
      role: defaultRole(assignable, initialRole),
      tenant: isSuper && initialTenant ? initialTenant : '',
    });
    setShowPwd(false);
    setErrors({ fields: {}, general: null });
    setLoaded({ tenants: false, cafes: false });
    // El admin de cafetería no elige local: su personal va siempre a su cafetería
    if (!isCafeAdmin) {
      fetchAll('/cafeterias/')
        .then((data) => {
          setCafes(data);
          setLoaded((l) => ({ ...l, cafes: true }));
        })
        .catch(() => {});
    }
    if (isSuper) {
      fetchAll('/tenants/')
        .then((data) => {
          setTenants(data);
          setLoaded((l) => ({ ...l, tenants: true }));
        })
        .catch(() => {});
    }
  }, [open, isSuper, isCafeAdmin, assignable, initialRole, initialTenant]);

  const needsCafe = CAFE_ROLES.includes(form.role);
  const needsTenant = isSuper && form.role !== 'super_admin';
  // Sin distribuidores no se puede crear nada que dependa de uno: se avisa en lugar de un select vacío
  const noTenants = needsTenant && loaded.tenants && tenants.length === 0;
  // Sin distribuidores tampoco se muestra la cafetería: dependería de un selector que no está
  const pickCafe = needsCafe && !isCafeAdmin && !noTenants;

  // El super admin ve solo las cafeterías del distribuidor elegido
  const cafeOptions = useMemo(
    () => cafes.filter((c) => c.is_active && (!isSuper || c.tenant === form.tenant)),
    [cafes, isSuper, form.tenant]
  );
  const noCafes = pickCafe && loaded.cafes && cafeOptions.length === 0 && (!isSuper || !!form.tenant);
  const selectedTenant = tenants.find((t) => t.id === form.tenant);

  const goCreateTenant = () => {
    onClose();
    navigate('/plataforma?nuevo=distribuidor');
  };

  const set = (key) => (e) => {
    const value = e.target.value;
    setForm((f) => ({
      ...f,
      [key]: value,
      // Al cambiar de distribuidor, la cafetería elegida deja de ser válida
      ...(key === 'tenant' ? { cafeteria: '' } : {}),
    }));
  };
  const err = (key) => errors.fields[key];

  const generate = () => {
    const pwd = randomPassword();
    setForm((f) => ({ ...f, password: pwd, password2: pwd }));
    setShowPwd(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSaving(true);
    setErrors({ fields: {}, general: null });
    const payload = { ...form, cafeteria: pickCafe ? form.cafeteria || null : null };
    if (!needsTenant) delete payload.tenant;
    // El backend pone la cafetería del admin de cafetería
    if (isCafeAdmin) delete payload.cafeteria;
    try {
      const { data } = await api.post('/auth/users/', payload);
      toast.success(`${data.first_name} ya tiene acceso`);
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
      eyebrow={isSuper ? 'Plataforma' : user?.cafeteria_name || user?.tenant_name}
      title="Nuevo usuario"
      subtitle={
        isSuper && form.role === 'distribuidor_admin' && selectedTenant
          ? `Acceso para quien administrará ${selectedTenant.name}.`
          : CREATOR_SUBTITLES[user?.role] || 'Dale acceso a alguien de tu equipo.'
      }
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancelar</Button>
          <Button type="submit" form="user-form" disabled={saving || noTenants || noCafes || !assignable.length}>
            {saving ? 'Guardando…' : 'Crear usuario'}
          </Button>
        </>
      }
    >
      <form id="user-form" onSubmit={handleSubmit} className="space-y-5">
        <FormAlert>{errors.general}</FormAlert>

        {/* Rol: con una sola opción (distribuidor) se muestra fija, sin selector */}
        <Field label="Rol" required error={err('role')}>
          {assignable.length === 1 ? (
            <div className="flex min-h-[48px] items-center justify-between gap-2 rounded-2xl border border-cobalto-500 bg-cobalto-50 px-3.5 py-2.5 text-cobalto-600">
              <span className="font-serif text-[15px] italic font-medium leading-tight">{ROLE_LABELS[assignable[0]]}</span>
              <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-oro-400" aria-hidden="true" />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {assignable.map((role) => (
                <button
                  key={role}
                  type="button"
                  aria-pressed={form.role === role}
                  onClick={() => setForm((f) => ({ ...f, role }))}
                  className={`flex min-h-[48px] items-center justify-between gap-2 rounded-2xl border px-3.5 py-2.5 text-left transition-all ${
                    form.role === role
                      ? 'border-cobalto-500 bg-cobalto-50 text-cobalto-600 ring-4 ring-cobalto-100'
                      : 'border-oro-200 bg-marfil text-verde-700 hover:border-oro-400 hover:bg-pistacho-50'
                  }`}
                >
                  <span className="font-serif text-[15px] italic font-medium leading-tight">{ROLE_LABELS[role]}</span>
                  {form.role === role && <span className="h-1.5 w-1.5 shrink-0 rotate-45 bg-oro-400" aria-hidden="true" />}
                </button>
              ))}
            </div>
          )}
          <p className="mt-2 text-xs text-verde-600">{ROLE_HINTS[form.role]}</p>
        </Field>

        {noTenants && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-oro-300/80 bg-pistacho-50 px-4 py-3">
            <p className="flex items-center gap-2.5 text-sm text-verde-700">
              <Network className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
              Todavía no hay distribuidores. Crea uno primero en Plataforma.
            </p>
            {isSuper && (
              <Button size="sm" variant="secondary" onClick={goCreateTenant}>
                <Plus className="h-4 w-4" aria-hidden="true" /> Crear distribuidor
              </Button>
            )}
          </div>
        )}

        {isCafeAdmin && needsCafe && (
          <p className="flex items-center gap-2.5 rounded-2xl border border-oro-200/80 bg-pistacho-50 px-4 py-3 text-sm text-verde-700">
            <Store className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />
            <span>
              Trabajará en <span className="font-serif italic font-medium">{user?.cafeteria_name || 'tu cafetería'}</span>
            </span>
          </p>
        )}

        {((needsTenant && !noTenants) || pickCafe) && (
          <div className="grid gap-5 sm:grid-cols-2">
            {needsTenant && !noTenants && (
              <Field label="Distribuidor" required error={err('tenant')}>
                <select className="input" value={form.tenant} onChange={set('tenant')} required>
                  <option value="">Selecciona…</option>
                  {tenants.map((t) => (
                    <option key={t.id} value={t.id}>{t.name}</option>
                  ))}
                </select>
              </Field>
            )}
            {pickCafe && (
              <Field
                label="Cafetería"
                required
                error={
                  err('cafeteria') ||
                  (noCafes &&
                    (isSuper
                      ? 'Este distribuidor aún no tiene cafeterías activas.'
                      : 'Aún no tienes cafeterías activas. Crea una primero en Cafeterías.'))
                }
                hint={isSuper && !form.tenant ? 'Primero elige el distribuidor' : undefined}
              >
                <select
                  className="input"
                  value={form.cafeteria}
                  onChange={set('cafeteria')}
                  disabled={isSuper && !form.tenant}
                  required
                >
                  <option value="">Selecciona…</option>
                  {cafeOptions.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </Field>
            )}
          </div>
        )}

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Nombre" required error={err('first_name')}>
            <input className="input" value={form.first_name} onChange={set('first_name')} required autoComplete="off" />
          </Field>
          <Field label="Apellido" required error={err('last_name')}>
            <input className="input" value={form.last_name} onChange={set('last_name')} required autoComplete="off" />
          </Field>
        </div>

        <div className="grid gap-5 sm:grid-cols-2">
          <Field label="Email" required error={err('email')}>
            <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="off" />
          </Field>
          <Field label="Teléfono" error={err('phone')}>
            <input className="input" value={form.phone} onChange={set('phone')} placeholder="+593 9…" />
          </Field>
        </div>

        <div className="rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 sm:p-5">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <p className="flex items-center gap-2.5 font-serif text-lg italic font-medium text-verde-700">
              <span className="rombo" aria-hidden="true" />
              Contraseña inicial
            </p>
            <button
              type="button"
              onClick={generate}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full px-2 text-[11px] font-medium uppercase tracking-[0.18em] text-cobalto-500 underline decoration-oro-400 underline-offset-4 transition-colors hover:text-verde-700"
            >
              <Wand2 className="h-4 w-4" aria-hidden="true" /> Generar
            </button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Field label="Contraseña" required error={err('password')} hint="Mínimo 8 caracteres">
              <div className="relative">
                <input
                  className="input pr-11"
                  type={showPwd ? 'text' : 'password'}
                  value={form.password}
                  onChange={set('password')}
                  minLength={8}
                  required
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd((v) => !v)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1.5 text-verde-600 transition-colors hover:text-cobalto-500"
                  aria-label={showPwd ? 'Ocultar' : 'Mostrar'}
                >
                  {showPwd ? <EyeOff className="h-4 w-4" aria-hidden="true" /> : <Eye className="h-4 w-4" aria-hidden="true" />}
                </button>
              </div>
            </Field>
            <Field label="Confirmar" required error={err('password2')}>
              <input
                className="input"
                type={showPwd ? 'text' : 'password'}
                value={form.password2}
                onChange={set('password2')}
                minLength={8}
                required
                autoComplete="new-password"
              />
            </Field>
          </div>
        </div>
      </form>
    </Modal>
  );
};
