import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Plus, Power, PowerOff, RotateCw, Save, Trash2 } from 'lucide-react';
import { Button } from '../Button';
import { parseApiErrors } from '../Form';
import { ModalToldo, Aviso } from './ModalToldo';
import { ROLES_UN_LOCAL, ZONAS_BASE, mensajeError, mesasApi } from './utils';

const CAMPOS = ['number', 'capacity', 'min_capacity', 'location', 'description', 'cafeteria'];

const entero = (v) => (String(v).trim() === '' ? NaN : Number(v));

// Validación previa (el backend repite las mismas reglas y sus mensajes mandan)
const validar = (v, { conLocal, cafeteria }) => {
  const e = {};
  const numero = entero(v.number);
  if (Number.isNaN(numero)) e.number = 'Indica el número de la mesa.';
  else if (numero < 1) e.number = 'El número de mesa debe ser mayor a 0.';
  else if (!Number.isInteger(numero)) e.number = 'Usa un número entero (sin decimales).';
  else if (numero > 9999) e.number = 'El número de mesa no puede pasar de 9999.';

  const cap = entero(v.capacity);
  const min = entero(v.min_capacity);
  if (!Number.isInteger(cap) || cap < 1) e.capacity = 'La capacidad debe ser de al menos 1 persona.';
  else if (cap > 30) e.capacity = 'La capacidad no puede pasar de 30 personas.';
  if (!Number.isInteger(min) || min < 1) e.min_capacity = 'La capacidad debe ser de al menos 1 persona.';
  else if (min > 30) e.min_capacity = 'La capacidad no puede pasar de 30 personas.';
  else if (!e.capacity && min > cap) e.min_capacity = `La capacidad mínima (${min}) no puede ser mayor que la capacidad (${cap}).`;

  if (conLocal && !cafeteria) e.cafeteria = 'Elige el local de la mesa.';
  return e;
};

// Etiqueta y error compactos de cada campo
const Campo = ({ label, error, htmlFor, className = '', children }) => (
  <div className={className}>
    <label htmlFor={htmlFor} className="mb-1 block text-[10px] font-medium uppercase tracking-[0.18em] text-verde-600">
      {label}
    </label>
    {children}
    {error && <p className="mt-1 text-[11px] leading-snug text-terracotta-700">{error}</p>}
  </div>
);

const INPUT = 'input !rounded-xl !px-3 !py-2 text-sm';

// Alta y edición de una mesa. Al crear, el backend genera el QR y responde con la fila completa.
// En edición el QR no se toca; desactivar/reactivar/borrar se confirman aparte (onAccion).
export const MesaForm = ({ mesa, rol, zonas = {}, onClose, onGuardada, onAccion }) => {
  const editando = !!mesa;
  const unLocal = ROLES_UN_LOCAL.includes(rol);
  const conLocal = !editando && !unLocal;
  const id = useId();
  const formId = `${id}-form`;
  const listaZonas = `${id}-zonas`;

  const [valores, setValores] = useState(() => ({
    number: editando ? String(mesa.number ?? '') : '',
    capacity: editando ? String(mesa.capacity ?? 4) : '4',
    min_capacity: editando ? String(mesa.min_capacity ?? 1) : '1',
    location: editando ? mesa.location || '' : '',
    description: editando ? mesa.description || '' : '',
  }));
  const [errores, setErrores] = useState({});
  const [general, setGeneral] = useState(null);
  const [enviando, setEnviando] = useState(false);

  // Local de la mesa nueva: distribuidor/super_admin lo eligen; cafe_admin/gerente usan el suyo
  const [locales, setLocales] = useState(null);
  const [cafeteria, setCafeteria] = useState('');
  // Local elegido y número sugerido (siguiente_numero); no hay tope de mesas
  const [info, setInfo] = useState(null);
  const [cargandoInfo, setCargandoInfo] = useState(!editando && unLocal);
  const [errorInfo, setErrorInfo] = useState(null);
  // Sube para volver a pedir el número sugerido (botón «Reintentar»)
  const [intento, setIntento] = useState(0);
  const numeroTocado = useRef(false);

  // Locales abiertos (solo roles con varios); con uno solo queda fijo
  useEffect(() => {
    if (!conLocal) return undefined;
    let vivo = true;
    mesasApi
      .locales()
      .then((lista) => {
        if (!vivo) return;
        setLocales(lista);
        if (lista.length === 1) setCafeteria(String(lista[0].id));
      })
      .catch((e) => vivo && setErrorInfo(mensajeError(e, 'No se pudieron cargar los locales.')));
    return () => {
      vivo = false;
    };
  }, [conLocal]);

  // Número sugerido para el local elegido
  useEffect(() => {
    if (editando || (conLocal && !cafeteria)) return undefined;
    let vivo = true;
    setCargandoInfo(true);
    setErrorInfo(null);
    setInfo(null);
    mesasApi
      .siguienteNumero(conLocal ? cafeteria : undefined)
      .then((d) => {
        if (!vivo) return;
        setInfo(d);
        if (!numeroTocado.current && d?.numero) setValores((v) => ({ ...v, number: String(d.numero) }));
      })
      .catch((e) => {
        if (!vivo) return;
        // cafe_admin/gerente: 404 = sin local asignado o local cerrado
        const sinLocal = unLocal && e?.response?.status === 404;
        setErrorInfo(
          sinLocal
            ? 'Tu local no está disponible (sin asignar o cerrado): pide al distribuidor que lo revise.'
            : mensajeError(e, 'No se pudo consultar el local.')
        );
      })
      .finally(() => vivo && setCargandoInfo(false));
    return () => {
      vivo = false;
    };
  }, [editando, conLocal, unLocal, cafeteria, intento]);

  const localId = editando ? mesa.cafeteria : info?.cafeteria || cafeteria;
  const nombreLocal = editando
    ? mesa.cafeteria_name
    : info?.cafeteria_name || locales?.find((l) => String(l.id) === String(cafeteria))?.name;

  // Zonas: primero las que ya usa el local, luego las de base (sin repetir)
  const sugerencias = useMemo(() => {
    const usadas = zonas[String(localId)] || [];
    const base = ZONAS_BASE.filter((z) => !usadas.some((u) => u.toLowerCase() === z.toLowerCase()));
    return [...usadas, ...base];
  }, [zonas, localId]);
  const zonaActual = valores.location.trim().toLowerCase();
  const chips = sugerencias.filter((z) => z.toLowerCase() !== zonaActual).slice(0, 5);

  // Sin tope de mesas: solo se espera el número sugerido y, si aplica, el local elegido
  const bloqueado = !editando && (cargandoInfo || (conLocal && !cafeteria));

  const set = (campo) => (e) => {
    const valor = e.target.value;
    if (campo === 'number') numeroTocado.current = true;
    setValores((v) => ({ ...v, [campo]: valor }));
    setErrores((prev) => (prev[campo] ? { ...prev, [campo]: undefined } : prev));
  };

  const elegirLocal = (e) => {
    setCafeteria(e.target.value);
    setInfo(null);
    setErrorInfo(null);
    setErrores((prev) => ({ ...prev, cafeteria: undefined }));
    setGeneral(null);
  };

  const guardar = async (e) => {
    e?.preventDefault();
    if (enviando) return;
    const errs = validar(valores, { conLocal, cafeteria });
    setErrores(errs);
    setGeneral(null);
    if (Object.keys(errs).length) return;

    const cuerpo = {
      number: Number(valores.number),
      capacity: Number(valores.capacity),
      min_capacity: Number(valores.min_capacity),
      location: valores.location.trim(),
      description: valores.description.trim(),
    };
    let envio = cuerpo;
    if (editando) {
      // Solo lo que cambió; sin cambios no hay nada que guardar
      envio = Object.fromEntries(
        Object.entries(cuerpo).filter(([k, val]) => String(val) !== String(mesa[k] ?? ''))
      );
      if (!Object.keys(envio).length) {
        onClose();
        return;
      }
    } else if (conLocal) {
      envio = { ...cuerpo, cafeteria };
    }

    setEnviando(true);
    try {
      const fila = editando ? await mesasApi.editar(mesa.id, envio) : await mesasApi.crear(envio);
      onGuardada(fila, editando ? 'editar' : 'crear');
    } catch (err) {
      const { fields, general: msg } = parseApiErrors(err);
      const propios = {};
      const otros = [];
      Object.entries(fields).forEach(([k, v]) => {
        if (CAMPOS.includes(k)) propios[k] = v;
        else otros.push(v);
      });
      setErrores(propios);
      setGeneral(msg || otros.find((o) => typeof o === 'string') || (Object.keys(propios).length ? null : mensajeError(err)));
      setEnviando(false);
    }
  };

  const subtitulo = editando ? (
    <span>
      {mesa.is_active === false && <span className="font-medium text-terracotta-700">Desactivada · </span>}
      {nombreLocal ? `${nombreLocal} · ` : ''}El código QR no cambia.
    </span>
  ) : (
    `${nombreLocal ? `${nombreLocal} · ` : ''}El código QR se genera al guardar.`
  );

  const pie = (
    <>
      {editando && (
        <div className="mr-auto flex items-center gap-1">
          {mesa.is_active === false ? (
            <Button variant="ghost" size="sm" onClick={() => onAccion('reactivar', mesa)} disabled={enviando} className="!px-3">
              <Power className="h-3.5 w-3.5" aria-hidden="true" />
              Reactivar
            </Button>
          ) : (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onAccion('desactivar', mesa)}
              disabled={enviando}
              className="!px-3 !text-terracotta-700 hover:!bg-terracotta-100"
            >
              <PowerOff className="h-3.5 w-3.5" aria-hidden="true" />
              Desactivar
            </Button>
          )}
          <button
            type="button"
            onClick={() => onAccion('borrar', mesa)}
            disabled={enviando}
            className="flex h-9 w-9 items-center justify-center rounded-full text-terracotta-700 transition-colors hover:bg-terracotta-100 disabled:opacity-50"
            aria-label={`Borrar la mesa ${mesa.number}`}
            title="Borrar mesa"
          >
            <Trash2 className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={onClose}
        disabled={enviando}
        className={`!px-3.5 ${editando ? 'hidden sm:inline-flex' : ''}`}
      >
        Cancelar
      </Button>
      <Button size="sm" type="submit" form={formId} disabled={enviando || bloqueado} className="!px-3.5">
        {editando ? <Save className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
        {enviando ? 'Guardando…' : editando ? 'Guardar' : 'Crear mesa'}
      </Button>
    </>
  );

  return (
    <ModalToldo
      onClose={enviando ? () => {} : onClose}
      eyebrow={editando ? `Mesa ${mesa.number}` : 'Salón'}
      titulo={editando ? 'Editar mesa' : 'Nueva mesa'}
      subtitulo={subtitulo}
      pie={pie}
      ancho={editando ? 'md' : 'sm'}
    >
      {general && (
        <Aviso icono={AlertTriangle} className="mb-3">
          {general}
        </Aviso>
      )}
      {errorInfo && (
        <Aviso icono={AlertTriangle} className="mb-3">
          {errorInfo}
          {!editando && !(conLocal && !cafeteria) && (
            <button
              type="button"
              onClick={() => setIntento((n) => n + 1)}
              disabled={cargandoInfo}
              className="ml-1.5 inline-flex items-center gap-1 font-medium underline decoration-terracotta-600/40 underline-offset-2 hover:text-terracotta-800 disabled:opacity-50"
            >
              <RotateCw className="h-3 w-3" aria-hidden="true" />
              Reintentar
            </button>
          )}
        </Aviso>
      )}

      <form id={formId} onSubmit={guardar} noValidate className="space-y-3">
        {conLocal && locales && locales.length > 1 && (
          <Campo label="Local" htmlFor={`${id}-local`} error={errores.cafeteria}>
            <select id={`${id}-local`} className={`${INPUT} !pr-10`} value={cafeteria} onChange={elegirLocal} disabled={enviando}>
              <option value="">Elige el local…</option>
              {locales.map((l) => (
                <option key={l.id} value={l.id}>
                  {l.name}
                  {rol === 'super_admin' && l.tenant_name ? ` · ${l.tenant_name}` : ''}
                </option>
              ))}
            </select>
          </Campo>
        )}
        {conLocal && locales && locales.length === 0 && (
          <Aviso icono={AlertTriangle}>No tienes locales abiertos donde agregar mesas.</Aviso>
        )}
        {!editando && errores.cafeteria && !(locales && locales.length > 1) && (
          <p className="text-[11px] text-terracotta-700">{errores.cafeteria}</p>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Campo label="Número" htmlFor={`${id}-numero`} error={errores.number}>
            <input
              id={`${id}-numero`}
              type="number"
              inputMode="numeric"
              min="1"
              max="9999"
              step="1"
              className={INPUT}
              value={valores.number}
              onChange={set('number')}
              placeholder={cargandoInfo ? '…' : '1'}
              disabled={enviando}
            />
          </Campo>
          <Campo label="Capacidad" htmlFor={`${id}-cap`} error={errores.capacity}>
            <input
              id={`${id}-cap`}
              type="number"
              inputMode="numeric"
              min="1"
              max="30"
              step="1"
              className={INPUT}
              value={valores.capacity}
              onChange={set('capacity')}
              disabled={enviando}
            />
          </Campo>
          <Campo label="Mínimo" htmlFor={`${id}-min`} error={errores.min_capacity}>
            <input
              id={`${id}-min`}
              type="number"
              inputMode="numeric"
              min="1"
              max="30"
              step="1"
              className={INPUT}
              value={valores.min_capacity}
              onChange={set('min_capacity')}
              disabled={enviando}
            />
          </Campo>
        </div>
        <p className="-mt-1.5 text-[10px] text-verde-600">Capacidad y mínimo en personas (de 1 a 30).</p>

        <Campo label="Zona" htmlFor={`${id}-zona`} error={errores.location}>
          <input
            id={`${id}-zona`}
            className={INPUT}
            value={valores.location}
            onChange={set('location')}
            list={listaZonas}
            maxLength={100}
            placeholder="Ventanal, Jardín, Terraza…"
            autoComplete="off"
            disabled={enviando}
          />
          <datalist id={listaZonas}>
            {sugerencias.map((z) => (
              <option key={z} value={z} />
            ))}
          </datalist>
          {chips.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {chips.map((z) => (
                <button
                  key={z}
                  type="button"
                  onClick={() => set('location')({ target: { value: z } })}
                  disabled={enviando}
                  className="rounded-full border border-oro-200 bg-marfil px-2 py-0.5 text-[11px] text-verde-600 transition-colors hover:border-cobalto-500 hover:text-cobalto-500"
                >
                  {z}
                </button>
              ))}
            </div>
          )}
        </Campo>

        <Campo label="Descripción (opcional)" htmlFor={`${id}-desc`} error={errores.description}>
          <textarea
            id={`${id}-desc`}
            rows={2}
            maxLength={500}
            className={`${INPUT} resize-y`}
            value={valores.description}
            onChange={set('description')}
            placeholder="Junto a la ventana, con enchufe…"
            disabled={enviando}
          />
        </Campo>
      </form>
    </ModalToldo>
  );
};
