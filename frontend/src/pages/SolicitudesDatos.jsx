import React, { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout, PageHeader, Loader, EmptyState, Segmented } from '../components/Layout';
import { Card } from '../components/Card';
import { Badge } from '../components/StatusBadge';
import { Button } from '../components/Button';
import { Modal, Field, FormAlert, parseApiErrors } from '../components/Form';
import { ShieldCheck, Clock, Mail, Phone, Contact, Store, ExternalLink } from 'lucide-react';
import toast from 'react-hot-toast';
import api, { fetchAll } from '../services/api';

const ESTADOS = {
  recibida: ['honey', 'Recibida'],
  en_revision: ['slate', 'En revisión'],
  completada: ['sage', 'Completada'],
  rechazada: ['neutral', 'Rechazada'],
};

const ABIERTAS = ['recibida', 'en_revision'];

const daysLeft = (date) => Math.ceil((new Date(date) - new Date()) / 86400000);

const Plazo = ({ s }) => {
  if (!ABIERTAS.includes(s.estado)) {
    return <span className="text-xs text-verde-600">Resuelta {new Date(s.resuelta_at).toLocaleDateString('es-EC')}</span>;
  }
  const d = daysLeft(s.fecha_limite);
  const tone = d < 0 ? 'terracotta' : d <= 3 ? 'honey' : 'neutral';
  return (
    <Badge tone={tone} dot={false}>
      <Clock className="h-3 w-3" aria-hidden="true" /> {d < 0 ? `Vencida hace ${-d} d` : d === 0 ? 'Vence hoy' : `${d} días`}
    </Badge>
  );
};

export const SolicitudesDatos = () => {
  const [items, setItems] = useState([]);
  const [filter, setFilter] = useState('abiertas');
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState(null);
  const [draft, setDraft] = useState({ estado: '', respuesta: '' });
  const [errors, setErrors] = useState({ fields: {}, general: null });
  const [saving, setSaving] = useState(false);

  const load = () => fetchAll('/privacidad/solicitudes/').then(setItems);

  useEffect(() => {
    load()
      .catch(() => toast.error('Error cargando solicitudes'))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(
    () => items.filter((s) => (filter === 'abiertas' ? ABIERTAS.includes(s.estado) : filter === 'todas' ? true : s.estado === filter)),
    [items, filter]
  );

  const vencidas = items.filter((s) => ABIERTAS.includes(s.estado) && daysLeft(s.fecha_limite) < 0).length;

  const open = (s) => {
    setSelected(s);
    setDraft({ estado: s.estado, respuesta: s.respuesta || '' });
    setErrors({ fields: {}, general: null });
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.patch(`/privacidad/solicitudes/${selected.id}/`, draft);
      toast.success(`${selected.codigo} actualizada`);
      setSelected(null);
      await load();
    } catch (error) {
      setErrors(parseApiErrors(error));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout>
      {loading ? (
        <Loader />
      ) : (
        <>
          <PageHeader
            eyebrow="Protección de datos · LOPDP"
            title="Solicitudes de titulares"
            subtitle={`Pedidos de acceso, eliminación y otros derechos. Plazo legal: 15 días.${vencidas ? ` ${vencidas} vencida(s).` : ''}`}
            actions={
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: 'abiertas', label: 'Abiertas', count: items.filter((s) => ABIERTAS.includes(s.estado)).length },
                  { value: 'completada', label: 'Completadas', count: items.filter((s) => s.estado === 'completada').length },
                  { value: 'todas', label: 'Todas', count: items.length },
                ]}
              />
            }
          />

          {filtered.length === 0 ? (
            <EmptyState
              icon={ShieldCheck}
              title="Nada pendiente"
              description="Las solicitudes del formulario público aparecerán aquí."
            />
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-oro-200/60">
                {filtered.map((s) => {
                  const [tone, label] = ESTADOS[s.estado];
                  return (
                    <li key={s.id}>
                      <button
                        onClick={() => open(s)}
                        className="flex w-full flex-col gap-3 px-5 py-4 text-left transition-colors hover:bg-pistacho-50 focus-visible:bg-pistacho-50 focus-visible:outline-offset-[-3px] sm:flex-row sm:items-center sm:px-6"
                      >
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-xs text-verde-600">{s.codigo}</span>
                            <Badge tone="brass" dot={false}>{s.tipo_display}</Badge>
                          </div>
                          <p className="mt-1 font-serif text-lg italic font-medium leading-snug text-verde-700">{s.nombre}</p>
                          <p className="truncate text-sm text-verde-600">{s.detalle}</p>
                        </div>
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                          <Plazo s={s} />
                          <Badge tone={tone}>{label}</Badge>
                        </div>
                      </button>
                    </li>
                  );
                })}
              </ul>
            </Card>
          )}

          <p className="mt-6 flex flex-wrap items-center gap-x-2 text-sm text-verde-600">
            <span className="rombo" aria-hidden="true" />
            Formulario público:{' '}
            <Link
              to="/legal/derechos"
              className="inline-flex items-center gap-1 font-medium text-cobalto-500 underline decoration-oro-400 underline-offset-4 transition-colors hover:text-verde-700"
            >
              /legal/derechos <ExternalLink className="h-3.5 w-3.5" aria-hidden="true" />
            </Link>
          </p>
        </>
      )}

      <Modal
        open={!!selected}
        onClose={() => setSelected(null)}
        size="lg"
        eyebrow="Solicitud de titular"
        title={selected?.tipo_display || ''}
        subtitle={selected && `${selected.codigo} · Recibida el ${new Date(selected.created_at).toLocaleString('es-EC', { dateStyle: 'long', timeStyle: 'short' })}`}
        footer={
          <>
            <Button variant="ghost" onClick={() => setSelected(null)}>Cerrar</Button>
            <Button onClick={save} disabled={saving}>{saving ? 'Guardando…' : 'Guardar'}</Button>
          </>
        }
      >
        {selected && (
          <div className="space-y-6">
            <FormAlert>{errors.general}</FormAlert>
            <div className="grid gap-4 rounded-2xl border border-oro-200/80 bg-pistacho-50 p-4 text-sm sm:grid-cols-2 sm:p-5">
              <div>
                <p className="stat-label mb-1">Titular</p>
                <p className="font-serif text-lg italic font-medium leading-snug text-verde-700">{selected.nombre}</p>
                <p className="text-verde-600">{selected.relacion_display}</p>
              </div>
              <div className="min-w-0 space-y-1 text-verde-600">
                <p className="flex items-center gap-2">
                  <Contact className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" /> {selected.identificacion}
                </p>
                <p className="flex items-center gap-2">
                  <Mail className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" />{' '}
                  <a
                    href={`mailto:${selected.email}`}
                    className="min-w-0 break-all text-cobalto-500 underline decoration-oro-300 underline-offset-4 hover:decoration-cobalto-500"
                  >
                    {selected.email}
                  </a>
                </p>
                {selected.telefono && (
                  <p className="flex items-center gap-2">
                    <Phone className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" /> {selected.telefono}
                  </p>
                )}
                {selected.cafeteria && (
                  <p className="flex items-center gap-2">
                    <Store className="h-4 w-4 shrink-0 text-oro-600" aria-hidden="true" /> {selected.cafeteria}
                  </p>
                )}
              </div>
            </div>

            <div>
              <p className="stat-label mb-2">Solicitud</p>
              <p className="whitespace-pre-line leading-relaxed text-verde-700">{selected.detalle}</p>
              <div className="mt-3"><Plazo s={selected} /></div>
            </div>

            <Field label="Estado" error={errors.fields.estado}>
              <select className="input" value={draft.estado} onChange={(e) => setDraft((d) => ({ ...d, estado: e.target.value }))}>
                {Object.entries(ESTADOS).map(([v, [, l]]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </Field>
            <Field
              label="Respuesta / registro de lo actuado"
              error={errors.fields.respuesta}
              hint="Queda como evidencia de cumplimiento. Envía la respuesta al titular por correo."
            >
              <textarea
                className="input min-h-[120px] resize-y"
                value={draft.respuesta}
                onChange={(e) => setDraft((d) => ({ ...d, respuesta: e.target.value }))}
                placeholder="Ej.: Se verificó la identidad y se eliminaron los datos de la reserva del 12/09 en Café La Floresta."
              />
            </Field>
          </div>
        )}
      </Modal>
    </Layout>
  );
};
