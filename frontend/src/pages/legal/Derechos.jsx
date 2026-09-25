import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout } from '../../components/LegalLayout';
import { Separador } from '../../components/Decor';
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
      <div className="mb-5 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
        <span className="rombo" aria-hidden="true" />
        Elige el derecho que quieres ejercer
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {DERECHOS.map(({ id, icon: Icon, title, text }) => {
          const activo = form.tipo === id;
          return (
            <button
              key={id}
              type="button"
              aria-pressed={activo}
              onClick={() => {
                setForm((f) => ({ ...f, tipo: id }));
                setDone(null);
                document.getElementById('formulario')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className={`group flex gap-4 rounded-2xl border bg-marfil p-4 text-left transition-all duration-200 sm:p-5 ${
                activo
                  ? 'border-cobalto-500 ring-4 ring-cobalto-100'
                  : 'border-oro-300/70 hover:-translate-y-0.5 hover:border-cobalto-400 hover:shadow-soft'
              }`}
            >
              <span
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full ring-1 ring-oro-400 ring-offset-2 ring-offset-marfil transition-colors ${
                  activo ? 'bg-cobalto-500 text-marfil' : 'bg-verde-700 text-pistacho-200 group-hover:bg-cobalto-500'
                }`}
                aria-hidden="true"
              >
                <Icon className="h-[18px] w-[18px]" strokeWidth={1.6} />
              </span>
              <span className="min-w-0">
                <span className={`block font-serif text-lg italic font-medium leading-snug ${activo ? 'text-cobalto-500' : 'text-verde-700'}`}>
                  {title}
                </span>
                <span className="mt-1 block text-sm leading-relaxed text-verde-600">{text}</span>
              </span>
            </button>
          );
        })}
      </div>

      <Separador className="my-14" />

      <section id="formulario" className="scroll-mt-28">
        <h2>Envía tu solicitud</h2>
        <p>
          Si tus datos los registró una cafetería (por ejemplo, en una reserva), también puedes pedírselo directamente a
          ella. Nosotros la ayudaremos a atender tu solicitud. ¿Prefieres el correo? Escribe a{' '}
          <a href={`mailto:${SITE.contact.privacyEmail}`}>{SITE.contact.privacyEmail}</a>.
        </p>

        {done ? (
          <div role="status" className="mt-8 rounded-3xl border border-pistacho-400 bg-pistacho-100 p-6 sm:p-8">
            <span className="flex h-12 w-12 items-center justify-center rounded-full bg-verde-700 text-pistacho-200 ring-1 ring-oro-400 ring-offset-2 ring-offset-pistacho-100">
              <CheckCircle2 className="h-6 w-6" strokeWidth={1.6} />
            </span>
            <p className="mt-5 font-serif text-[1.75rem] italic font-medium !leading-tight !text-verde-700">Recibimos tu solicitud</p>
            <p className="!text-verde-700">
              Tu código de seguimiento es <strong>{done.codigo}</strong>. Te responderemos a <strong>{done.email}</strong>{' '}
              a más tardar el{' '}
              <strong>
                {new Date(done.fecha_limite).toLocaleDateString('es-EC', { day: 'numeric', month: 'long', year: 'numeric' })}
              </strong>
              . Guarda el código por si necesitas consultarnos.
            </p>
            <button
              type="button"
              className="btn-secondary mt-6"
              onClick={() => {
                setDone(null);
                setForm(EMPTY);
              }}
            >
              Enviar otra solicitud
            </button>
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="card mt-8 space-y-5 p-5 sm:p-8 [&_.field-error]:!text-terracotta-700 [&_.form-alert_p]:!text-terracotta-700"
          >
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

            <label className="flex cursor-pointer items-start gap-3 rounded-2xl border border-oro-200/80 bg-crema/60 p-4 text-sm leading-relaxed text-verde-600">
              <input
                type="checkbox"
                checked={form.declaracion_veracidad}
                onChange={set('declaracion_veracidad')}
                className="mt-1 h-4 w-4 shrink-0 rounded accent-verde-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cobalto-500"
                required
              />
              <span>
                Declaro que la información es verdadera y que soy el titular de los datos o su representante legal. Acepto
                que {SITE.name} use estos datos solo para atender esta solicitud, según su{' '}
                <Link to="/legal/privacidad">Política de privacidad</Link>.
              </span>
            </label>
            {err('declaracion_veracidad') && <p className="text-xs !text-terracotta-700">{err('declaracion_veracidad')}</p>}

            <div className="flex flex-col-reverse gap-4 border-t border-oro-200/80 pt-6 sm:flex-row sm:items-center sm:justify-between">
              <p className="flex items-center gap-2 text-xs text-verde-600">
                <span className="rombo shrink-0 scale-75" aria-hidden="true" />
                Respuesta en máximo 15 días, sin costo.
              </p>
              <button type="submit" disabled={sending} className="btn-primary disabled:pointer-events-none disabled:opacity-60">
                {sending ? 'Enviando…' : 'Enviar solicitud'}
              </button>
            </div>
          </form>
        )}
      </section>

      <Separador className="my-14" />

      <section>
        <h2>¿No quedaste conforme?</h2>
        <p>
          Puedes presentar un reclamo ante la Superintendencia de Protección de Datos Personales en{' '}
          <a href="https://spdp.gob.ec" target="_blank" rel="noreferrer">spdp.gob.ec</a>.
        </p>
      </section>
    </LegalLayout>
  );
};
