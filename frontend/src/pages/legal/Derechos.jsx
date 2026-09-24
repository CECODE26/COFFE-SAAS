import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout } from '../../components/LegalLayout';
import { Field, FormAlert, parseApiErrors } from '../../components/Form';
import { SITE } from '../../config/site';
import { Eye, PencilLine, Trash2, Ban, Download, PauseCircle, Bot, HelpCircle, CheckCircle2 } from 'lucide-react';
import api from '../../services/api';

const DERECHOS = [
  { id: 'acceso', icon: Eye, title: 'Acceso', text: 'Saber qué datos tuyos tenemos y cómo los usamos.' },
  { id: 'rectificacion', icon: PencilLine, title: 'Rectificación', text: 'Corregir o actualizar datos inexactos o incompletos.' },
  { id: 'eliminacion', icon: Trash2, title: 'Eliminación', text: 'Pedir que borremos tus datos.' },
  { id: 'oposicion', icon: Ban, title: 'Oposición', text: 'Pedir que dejemos de usar tus datos para un fin concreto.' },
  { id: 'portabilidad', icon: Download, title: 'Portabilidad', text: 'Recibir tus datos en un formato que puedas llevar a otro servicio.' },
  { id: 'suspension', icon: PauseCircle, title: 'Suspensión', text: 'Pausar el tratamiento mientras se resuelve una reclamación.' },
  { id: 'decisiones_automatizadas', icon: Bot, title: 'Decisiones automatizadas', text: 'No ser objeto de decisiones tomadas solo por un sistema automático.' },
  { id: 'otro', icon: HelpCircle, title: 'Otra consulta', text: 'Cualquier otra pregunta sobre tus datos.' },
];

const RELACIONES = [
  ['comensal', 'Soy cliente de una cafetería que usa COFFE-SAAS'],
  ['usuario', 'Trabajo en una cafetería y tengo usuario en el sistema'],
  ['cliente', 'Soy dueño o distribuidor, cliente de COFFE-SAAS'],
  ['visitante', 'Visité el sitio web o les escribí'],
  ['otro', 'Otro'],
];

const EMPTY = {
  tipo: 'acceso',
  relacion: 'comensal',
  nombre: '',
  identificacion: '',
  email: '',
  telefono: '',
  cafeteria: '',
  detalle: '',
  declaracion_veracidad: false,
};

export const Derechos = () => {
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(null);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }));
  const err = (key) => errors.fields[key];

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSending(true);
    setErrors({ fields: {}, general: null });
    try {
      const { data } = await api.post('/privacidad/solicitar/', form);
      setDone(data);
      window.scrollTo({ top: document.getElementById('formulario')?.offsetTop - 100, behavior: 'smooth' });
    } catch (error) {
      if (error?.response?.status === 429) {
        setErrors({ fields: {}, general: 'Recibimos varias solicitudes desde tu conexión. Intenta de nuevo en una hora o escríbenos por correo.' });
      } else {
        setErrors(parseApiErrors(error));
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <LegalLayout
      title="Ejercer mis derechos"
      intro="Según la Ley Orgánica de Protección de Datos Personales, puedes pedirnos en cualquier momento acceder, corregir, eliminar o llevarte tus datos. Es gratis y te respondemos en máximo 15 días."
    >
      <div className="grid gap-3 sm:grid-cols-2">
        {DERECHOS.map(({ id, icon: Icon, title, text }) => (
          <button
            key={id}
            type="button"
            onClick={() => {
              setForm((f) => ({ ...f, tipo: id }));
              setDone(null);
              document.getElementById('formulario')?.scrollIntoView({ behavior: 'smooth' });
            }}
            className={`flex gap-4 rounded-2xl border p-4 text-left no-underline transition-all ${
              form.tipo === id ? 'border-clay-600 bg-white ring-4 ring-clay-500/10' : 'border-line bg-white hover:border-clay-500/40'
            }`}
          >
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-clay-600 text-white">
              <Icon className="h-4 w-4" />
            </span>
            <span>
              <span className="block font-semibold text-ink">{title}</span>
              <span className="mt-0.5 block text-sm text-muted">{text}</span>
            </span>
          </button>
        ))}
      </div>

      <section id="formulario" className="scroll-mt-28 !mt-14">
        <h2>Envía tu solicitud</h2>
        <p>
          Si tus datos los registró una cafetería (por ejemplo, en una reserva), también puedes pedírselo directamente a
          ella. Nosotros la ayudaremos a atender tu solicitud. ¿Prefieres el correo? Escribe a{' '}
          <a href={`mailto:${SITE.contact.privacyEmail}`}>{SITE.contact.privacyEmail}</a>.
        </p>

        {done ? (
          <div className="not-prose mt-8 rounded-3xl border border-emerald-200 bg-emerald-50 p-8">
            <CheckCircle2 className="h-8 w-8 text-emerald-600" />
            <p className="mt-4 font-display text-2xl font-bold text-ink">Recibimos tu solicitud</p>
            <p className="mt-2 text-muted">
              Tu código de seguimiento es <strong>{done.codigo}</strong>. Te responderemos a <strong>{done.email}</strong>{' '}
              a más tardar el{' '}
              <strong>
                {new Date(done.fecha_limite).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}
              </strong>
              . Guarda el código por si necesitas consultarnos.
            </p>
            <button
              type="button"
              className="btn-secondary mt-6 !py-2.5 text-sm"
              onClick={() => {
                setDone(null);
                setForm(EMPTY);
              }}
            >
              Enviar otra solicitud
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="card mt-8 space-y-5 p-6 sm:p-8">
            <FormAlert>{errors.general}</FormAlert>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Qué derecho quieres ejercer" required error={err('tipo')}>
                <select className="input" value={form.tipo} onChange={set('tipo')}>
                  {DERECHOS.map((d) => (
                    <option key={d.id} value={d.id}>{d.title}</option>
                  ))}
                </select>
              </Field>
              <Field label="Tu relación con nosotros" required error={err('relacion')}>
                <select className="input" value={form.relacion} onChange={set('relacion')}>
                  {RELACIONES.map(([v, l]) => (
                    <option key={v} value={v}>{l}</option>
                  ))}
                </select>
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Nombre completo" required error={err('nombre')}>
                <input className="input" value={form.nombre} onChange={set('nombre')} required autoComplete="name" />
              </Field>
              <Field label="Cédula o pasaporte" required error={err('identificacion')} hint="Para verificar que eres el titular.">
                <input className="input" value={form.identificacion} onChange={set('identificacion')} required />
              </Field>
            </div>

            <div className="grid gap-5 sm:grid-cols-2">
              <Field label="Correo electrónico" required error={err('email')} hint="Aquí te enviaremos la respuesta.">
                <input className="input" type="email" value={form.email} onChange={set('email')} required autoComplete="email" />
              </Field>
              <Field label="Teléfono" error={err('telefono')}>
                <input className="input" value={form.telefono} onChange={set('telefono')} autoComplete="tel" />
              </Field>
            </div>

            {(form.relacion === 'comensal' || form.relacion === 'usuario') && (
              <Field label="Cafetería relacionada" error={err('cafeteria')} hint="Nombre y ciudad del local, si lo sabes.">
                <input className="input" value={form.cafeteria} onChange={set('cafeteria')} placeholder="Ej.: Café La Floresta, Quito" />
              </Field>
            )}

            <Field label="Cuéntanos tu solicitud" required error={err('detalle')}>
              <textarea
                className="input min-h-[120px] resize-y"
                value={form.detalle}
                onChange={set('detalle')}
                required
                placeholder="Ej.: Hice una reserva el 12 de septiembre con este correo y quiero que eliminen mis datos."
              />
            </Field>

            <label className="flex cursor-pointer items-start gap-3 text-sm text-muted">
              <input
                type="checkbox"
                checked={form.declaracion_veracidad}
                onChange={set('declaracion_veracidad')}
                className="mt-0.5 h-4 w-4 rounded accent-clay-600"
                required
              />
              <span>
                Declaro que la información es verdadera y que soy el titular de los datos o su representante legal. Acepto
                que {SITE.name} use estos datos solo para atender esta solicitud, según su{' '}
                <Link to="/legal/privacidad">Política de privacidad</Link>.
              </span>
            </label>
            {err('declaracion_veracidad') && <p className="text-xs text-red-700">{err('declaracion_veracidad')}</p>}

            <div className="flex flex-col-reverse gap-3 border-t border-line pt-5 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-xs text-muted">Respuesta en máximo 15 días, sin costo.</p>
              <button type="submit" disabled={sending} className="btn-primary disabled:opacity-50">
                {sending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
      </section>

      <section className="!mt-14">
        <h2>¿No quedaste conforme?</h2>
        <p>
          Puedes presentar un reclamo ante la Superintendencia de Protección de Datos Personales en{' '}
          <a href="https://spdp.gob.ec" target="_blank" rel="noreferrer">spdp.gob.ec</a>.
        </p>
      </section>
    </LegalLayout>
  );
};
