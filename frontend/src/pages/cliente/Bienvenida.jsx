import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import { ArrowRight, KeyRound, Receipt, RefreshCw, WifiOff } from 'lucide-react';
import { sonar } from '../../lib/avisos';
import {
  cliente,
  codigoError,
  guardarMesa,
  leerLocal,
  mensajeError,
  vaciarCarritos,
} from '../../services/clienteApi';
import { TazaPorcelana, ToldoFino } from '../../components/Decor';
import { fundirAlMenu } from '../../components/cliente/fundidoMenu';
import { HistoriaBienvenida, historiaPendiente } from '../../components/cliente/HistoriaBienvenida';
import { CLAVE_SESION } from '../../components/cliente/ComensalContext';
import { Aviso, Cargando, Filete, InsigniaMesa, MarcaLocal } from '../../components/cliente/ui';
import { etiquetaMesa } from '../../components/cliente/utils';

const MAX_NOMBRE = 50;
const aviso = { position: 'top-center' };
// Red lenta: si la mesa no carga en este tiempo se omite la historia (no se marca como vista)
const ESPERA_HISTORIA_MS = 3000;

// Ilustración: tarjeta de mesa con un código QR y el marco del lector
const IlustracionQR = () => (
  <svg viewBox="0 0 160 150" className="mx-auto h-36 w-auto" aria-hidden="true">
    <ellipse cx="80" cy="138" rx="58" ry="7" fill="#2A4520" opacity=".08" />
    {/* Tarjeta de mesa (tent card) */}
    <path d="M38 132 L52 26 H108 L122 132 Z" fill="#FFFBF1" stroke="#C39B45" strokeWidth="1.4" />
    <path d="M52 26 H108" stroke="#2A4520" strokeWidth="4" />
    {/* QR */}
    <g transform="translate(58 46)">
      <rect width="44" height="44" rx="3" fill="#FFFFFF" stroke="#DBE9CB" />
      <g fill="#2A4520">
        <rect x="4" y="4" width="12" height="12" rx="1.5" />
        <rect x="28" y="4" width="12" height="12" rx="1.5" />
        <rect x="4" y="28" width="12" height="12" rx="1.5" />
      </g>
      <g fill="#FFFFFF">
        <rect x="7" y="7" width="6" height="6" />
        <rect x="31" y="7" width="6" height="6" />
        <rect x="7" y="31" width="6" height="6" />
      </g>
      <g fill="#22409A">
        <rect x="20" y="5" width="4" height="4" />
        <rect x="20" y="13" width="4" height="4" />
        <rect x="20" y="21" width="4" height="4" />
        <rect x="28" y="21" width="4" height="4" />
        <rect x="36" y="25" width="4" height="4" />
        <rect x="24" y="29" width="4" height="4" />
        <rect x="32" y="33" width="4" height="4" />
        <rect x="20" y="35" width="4" height="4" />
        <rect x="36" y="36" width="4" height="4" />
        <rect x="5" y="20" width="4" height="4" />
        <rect x="12" y="22" width="4" height="4" />
      </g>
    </g>
    <text x="80" y="110" textAnchor="middle" fontFamily="'Playfair Display', serif" fontStyle="italic" fontSize="11" fill="#2A4520">
      Escanéame
    </text>
    <path d="M73 118 l7 -4 l7 4 l-7 4 Z" fill="#D8B45C" />
    {/* Marco del lector */}
    <g fill="none" stroke="#22409A" strokeWidth="2.4" strokeLinecap="round">
      <path d="M50 38 V30 H58" />
      <path d="M102 30 H110 V38" />
      <path d="M110 98 V106 H102" />
      <path d="M58 106 H50 V98" />
    </g>
    <line x1="48" y1="68" x2="112" y2="68" stroke="#C39B45" strokeWidth="1.2" opacity=".8" />
  </svg>
);

// Marco común de la bienvenida (sin la barra del panel ni la del comensal).
// data-hoja: la hoja que fundirAlMenu copia para fundirla con el menú al entrar.
const Marco = ({ children }) => (
  <div className="min-h-screen">
    <div
      data-hoja=""
      className="relative mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-crema sm:border-x sm:border-oro-200/80 sm:shadow-lift"
    >
      <ToldoFino />
      {/* tabIndex -1: recibe el foco al cerrar la historia (sin abrir el teclado del móvil) */}
      <main tabIndex={-1} className="flex flex-1 flex-col px-5 pb-6 pt-5 focus:outline-none">
        {children}
      </main>
      <footer className="px-5 pb-5 text-center text-[10.5px] text-verde-600/80">
        Pedidos por QR · COFFE-SAAS ·{' '}
        <Link to="/legal/privacidad" className="underline decoration-oro-300 underline-offset-2 hover:text-cobalto-500">
          Privacidad
        </Link>
      </footer>
    </div>
  </div>
);

const BotonReintentar = ({ onClick, cargando }) => (
  <button type="button" onClick={onClick} disabled={cargando} className="btn-primary min-h-[44px] px-6 text-[12px] disabled:opacity-60">
    <RefreshCw className={`h-4 w-4 ${cargando ? 'animate-spin motion-reduce:animate-none' : ''}`} aria-hidden="true" />
    Intentar de nuevo
  </button>
);

// Opción de radio con aspecto de tarjeta
const OpcionGrupo = ({ nombre, valor, elegido, onElegir, titulo, detalle }) => (
  <label
    className={`flex cursor-pointer items-start gap-3 rounded-2xl border px-3 py-2.5 transition-colors focus-within:ring-2 focus-within:ring-cobalto-200 ${
      elegido ? 'border-verde-600 bg-pistacho-100' : 'border-oro-200/80 bg-marfil hover:border-oro-400'
    }`}
  >
    <input
      type="radio"
      name={nombre}
      value={valor}
      checked={elegido}
      onChange={() => onElegir(valor)}
      className="mt-1 h-4 w-4 shrink-0 accent-verde-700"
    />
    <span className="min-w-0">
      <span className="block break-words text-[13.5px] font-medium text-verde-800">{titulo}</span>
      <span className="block text-[11.5px] text-verde-600">— {detalle}</span>
    </span>
  </label>
);

export const Bienvenida = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const qr = (params.get('mesa') || '').trim();

  const [datos, setDatos] = useState(null);
  const datosRef = useRef(null);
  datosRef.current = datos;
  const [cargando, setCargando] = useState(true);
  const [errorRed, setErrorRed] = useState(null);

  const [nombre, setNombre] = useState('');
  const [grupo, setGrupo] = useState('');
  const [errorNombre, setErrorNombre] = useState(null);
  const [errorGeneral, setErrorGeneral] = useState(null);
  const [enviando, setEnviando] = useState(false);
  const [continuando, setContinuando] = useState(false);

  // Recuperación con código del personal cuando el nombre ya está en uso
  const [nombreEnUso, setNombreEnUso] = useState(null);
  const [pidiendoCodigo, setPidiendoCodigo] = useState(false);
  const [codigo, setCodigo] = useState('');
  const [errorCodigo, setErrorCodigo] = useState(null);
  const [reconectando, setReconectando] = useState(false);

  // Historia de bienvenida (estilo Instagram), solo la primera vez por mesa en la sesión:
  // 'visible' → 'saliendo' (la página ya es operable mientras la historia se funde) → null
  const [historia, setHistoria] = useState(() => (historiaPendiente(qr) ? 'visible' : null));
  const pasarHistoria = useCallback(() => setHistoria((h) => (h === 'visible' ? 'saliendo' : h)), []);
  const quitarHistoria = useCallback(() => setHistoria(null), []);
  const paginaRef = useRef(null);
  const enfocarPagina = useCallback(() => {
    paginaRef.current?.querySelector('main')?.focus({ preventScroll: true });
  }, []);

  const nombreRef = useRef(null);
  const codigoRef = useRef(null);
  const nombreId = useId();
  const errorId = useId();
  const codigoId = useId();

  useEffect(() => {
    if (qr) guardarMesa(qr);
  }, [qr]);

  const cargar = useCallback(async () => {
    if (!qr) {
      setDatos({ variante: 'sin_mesa' });
      setCargando(false);
      return;
    }
    setCargando(true);
    setErrorRed(null);
    try {
      const { data } = await cliente.bienvenida(qr);
      setDatos(data);
    } catch (e) {
      if (e?.response?.status === 404) setDatos({ variante: 'sin_mesa', mensaje: e.response.data?.detail });
      else {
        const msg = mensajeError(e, 'No pudimos cargar la mesa.');
        setErrorRed(msg);
        // Al reintentar sobre una pantalla ya cargada, el error se avisa sin perderla
        if (datosRef.current) toast.error(msg, aviso);
      }
    } finally {
      setCargando(false);
    }
  }, [qr]);

  useEffect(() => {
    cargar();
  }, [cargar]);

  useEffect(() => {
    if (pidiendoCodigo) codigoRef.current?.focus();
  }, [pidiendoCodigo]);

  // Entró (o recuperó su sesión): carrito limpio salvo que sea la misma sesión de antes
  const entrarAlMenu = (data) => {
    const id = data?.sesion?.id;
    if (!id || id !== leerLocal(CLAVE_SESION)) vaciarCarritos();
    sonar('ok');
    if (data?.union_pendiente) {
      toast('Le pedimos a tu grupo que te acepte. Mientras tanto ya puedes pedir.', { ...aviso, icon: '🤝', duration: 5000 });
    }
    // La bienvenida se funde con el menú (la navegación no espera a la animación)
    fundirAlMenu(paginaRef.current?.querySelector('[data-hoja]'));
    navigate('/mesa', { replace: true });
  };

  // Errores comunes de entrar/reconectar que cambian la pantalla
  const errorDeMesa = (e) => {
    const c = codigoError(e);
    const d = e?.response?.data || {};
    if (c === 'en_cierre' || c === 'no_disponible') {
      setDatos((prev) => ({ ...(prev || {}), variante: c, mensaje: d.detail }));
      return true;
    }
    if (c === 'sin_mesa' || (e?.response?.status === 404 && !c)) {
      setDatos({ variante: 'sin_mesa', mensaje: d.detail });
      return true;
    }
    return false;
  };

  const entrar = async (e) => {
    e.preventDefault();
    if (enviando) return;
    const limpio = nombre.replace(/\s+/g, ' ').trim();
    setErrorGeneral(null);
    if (!limpio) {
      setErrorNombre('Escribe tu nombre para continuar');
      nombreRef.current?.focus();
      return;
    }
    setEnviando(true);
    setErrorNombre(null);
    setNombreEnUso(null);
    setPidiendoCodigo(false);
    try {
      const { data } = await cliente.entrar({ mesa: qr, nombre: limpio, grupo: grupo || undefined });
      entrarAlMenu(data);
    } catch (err) {
      const c = codigoError(err);
      const d = err?.response?.data || {};
      if (c === 'nombre_vacio') {
        setErrorNombre(d.detail || 'Escribe tu nombre para continuar');
        nombreRef.current?.focus();
      } else if (c === 'nombre_en_uso') {
        setErrorNombre(d.detail || 'Ese nombre ya está siendo usado en esta mesa');
        setNombreEnUso(d.nombre || limpio.toUpperCase());
        nombreRef.current?.focus();
      } else if (!errorDeMesa(err)) {
        setErrorGeneral(mensajeError(err, 'No pudimos entrar a la mesa. Inténtalo de nuevo.'));
      }
    } finally {
      setEnviando(false);
    }
  };

  // "Continuar como ANA": mismo dispositivo; el backend reutiliza la sesión activa de esta mesa
  const continuar = async () => {
    const actual = datos?.sesion_actual;
    if (!actual) return;
    if (actual.estado === 'pagada') {
      navigate('/mesa/ticket');
      return;
    }
    setContinuando(true);
    setErrorGeneral(null);
    try {
      const { data } = await cliente.entrar({ mesa: qr, nombre: actual.alias });
      entrarAlMenu(data);
    } catch (err) {
      if (codigoError(err) === 'nombre_en_uso') {
        setNombre(actual.alias);
        setErrorNombre(err.response.data?.detail || 'Ese nombre ya está siendo usado en esta mesa');
        setNombreEnUso(err.response.data?.nombre || actual.alias);
      } else if (!errorDeMesa(err)) {
        setErrorGeneral(mensajeError(err, 'No pudimos continuar. Inténtalo de nuevo.'));
      }
    } finally {
      setContinuando(false);
    }
  };

  const reconectar = async (e) => {
    e.preventDefault();
    if (reconectando) return;
    if (!/^\d{4}$/.test(codigo)) {
      setErrorCodigo('El código tiene 4 dígitos.');
      codigoRef.current?.focus();
      return;
    }
    setReconectando(true);
    setErrorCodigo(null);
    try {
      const { data } = await cliente.reconectar({ mesa: qr, nombre: nombreEnUso || nombre.trim(), codigo });
      toast.success('¡Listo! Recuperaste tu sesión.', aviso);
      entrarAlMenu(data);
    } catch (err) {
      const d = err?.response?.data || {};
      if (codigoError(err) === 'codigo_invalido') {
        const n = d.intentos_restantes;
        if (typeof n === 'number' && n > 0) {
          setErrorCodigo(`${d.detail || 'Ese código no es correcto.'} Te queda${n === 1 ? '' : 'n'} ${n} intento${n === 1 ? '' : 's'}.`);
        } else {
          setErrorCodigo(d.detail || 'Ese código ya no es válido. Pide uno nuevo al personal.');
        }
        setCodigo('');
        codigoRef.current?.focus();
      } else if (!errorDeMesa(err)) {
        setErrorCodigo(mensajeError(err, 'No pudimos validar el código.'));
      }
    } finally {
      setReconectando(false);
    }
  };

  const variante = datos?.variante || 'sin_mesa';
  const mesa = datos?.mesa;
  const local = mesa?.local;
  const actual = datos?.sesion_actual;

  // La historia espera a los datos (como Instagram): mientras carga solo tapa la página con el papel crema;
  // se muestra (y la barra empieza a contar) cuando hay una mesa válida con su local.
  // QR inválido o sin conexión: no hay historia, así que el verde nunca llega a verse.
  const esperandoDatos = cargando && !datos;
  const historiaLista = !!local && variante !== 'sin_mesa';
  const historiaActiva = historiaLista || esperandoDatos ? historia : null;
  const cubierta = historiaActiva === 'visible';

  useEffect(() => {
    if (historia !== 'visible' || historiaLista) return undefined;
    if (!esperandoDatos) {
      setHistoria(null); // cargó sin mesa válida (o falló): al reintentar no vuelve a salir
      return undefined;
    }
    const t = window.setTimeout(() => setHistoria((h) => (h === 'visible' ? null : h)), ESPERA_HISTORIA_MS);
    return () => window.clearTimeout(t);
  }, [historia, historiaLista, esperandoDatos]);

  // Al cerrarse la historia el foco pasa a la página: no se queda perdido en <body> ni en la ✕ que se va
  const cubiertaPrevia = useRef(cubierta);
  useEffect(() => {
    if (cubiertaPrevia.current && !cubierta) {
      const activo = document.activeElement;
      if (!activo || activo === document.body || activo.closest?.('[data-historia]')) enfocarPagina();
    }
    cubiertaPrevia.current = cubierta;
  }, [cubierta, enfocarPagina]);

  const renderPagina = () => {
    // ---------- Variantes ----------
    if (cargando && !datos) {
      return (
        <Marco>
          <Cargando texto="Buscando tu mesa…" className="flex-1" />
        </Marco>
      );
    }

    if (errorRed && !datos) {
      return (
        <Marco>
          <Aviso
            icon={WifiOff}
            titulo="No pudimos conectar"
            className="mt-8"
            accion={<BotonReintentar onClick={cargar} cargando={cargando} />}
          >
            {errorRed}
          </Aviso>
        </Marco>
      );
    }

    const Encabezado = (
      <div className="flex flex-col items-center text-center">
        {local && <MarcaLocal local={local} size={58} />}
        <p className="mt-2 font-script text-[22px] leading-none text-oro-600">Bienvenido</p>
        <h1 className="mt-1 font-serif text-[1.65rem] italic font-medium leading-tight text-verde-700">
          {local?.nombre || 'Tu mesa'}
        </h1>
        {mesa && <InsigniaMesa className="mt-2.5">{etiquetaMesa(mesa)}</InsigniaMesa>}
        {variante === 'normal' && datos?.mensaje && <p className="mt-2 text-[12.5px] text-verde-600">{datos.mensaje}</p>}
      </div>
    );

    if (variante === 'sin_mesa') {
      return (
        <Marco>
          <div className="flex flex-1 flex-col items-center justify-center text-center">
            <IlustracionQR />
            <p className="mt-4 font-script text-[22px] leading-none text-oro-600">Hola</p>
            <h1 className="mt-1 font-serif text-[1.7rem] italic font-medium leading-tight text-verde-700">Escanea el QR de tu mesa</h1>
            <Filete className="mx-auto mt-3 w-40" />
            {datos?.mensaje && !/escanea el qr de tu mesa/i.test(datos.mensaje) && (
              <p className="mt-3 max-w-xs text-sm font-medium text-verde-700">{datos.mensaje}</p>
            )}
            <p className="mt-3 max-w-xs text-sm text-verde-600">
              Lo encuentras en la tarjeta de tu mesa. Apunta la cámara de tu celular al código y abre el enlace para ver el
              menú y pedir.
            </p>
          </div>
        </Marco>
      );
    }

    if (variante === 'no_disponible' || variante === 'en_cierre') {
      const cierre = variante === 'en_cierre';
      return (
        <Marco>
          {Encabezado}
          <div className="mt-6 rounded-3xl border border-oro-200/80 bg-marfil px-5 py-6 text-center shadow-soft">
            {cierre && <TazaPorcelana className="mx-auto h-24 w-auto" detallada={false} />}
            <h2 className="mt-2 font-serif text-xl italic text-verde-700">
              {cierre ? 'Estamos preparando tu mesa' : 'Mesa no disponible'}
            </h2>
            <p className="mx-auto mt-1.5 max-w-xs text-sm text-verde-600" role="status">
              {/* El título ya dice "Estamos preparando tu mesa": no lo repetimos en el texto */}
              {cierre
                ? (datos?.mensaje || '').replace(/^estamos preparando tu mesa\.?\s*/i, '') ||
                  'Pide ayuda al personal o intenta en unos minutos.'
                : datos?.mensaje || 'Esta mesa no está disponible en este momento. Pide ayuda al personal.'}
            </p>
            <div className="mt-5 flex flex-col items-center gap-2">
              <BotonReintentar onClick={cargar} cargando={cargando} />
              {actual?.estado === 'pagada' && (
                <Link to="/mesa/ticket" className="enlace min-h-[40px] text-[11.5px]">
                  <Receipt className="mr-1.5 h-4 w-4" aria-hidden="true" />
                  Ver mi comprobante
                </Link>
              )}
            </div>
          </div>
        </Marco>
      );
    }

    // ---------- Variante normal ----------
    const grupos = Array.isArray(datos?.grupos) ? datos.grupos : [];

    return (
      <Marco>
        {Encabezado}

        {actual && (
          <div className="mt-5 rounded-2xl border border-oro-300/70 bg-marfil px-4 py-3 text-center shadow-soft">
            <p className="text-[13px] text-verde-600">
              {actual.estado === 'pagada' ? 'Tu cuenta ya fue pagada.' : 'Ya estabas en la mesa.'}
            </p>
            <button
              type="button"
              onClick={continuar}
              disabled={continuando}
              className="btn-cobalto mt-2 min-h-[44px] w-full px-5 text-[12px] disabled:opacity-60"
            >
              {actual.estado === 'pagada' ? 'Ver mi comprobante' : continuando ? 'Entrando…' : `Continuar como ${actual.alias}`}
              <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
            <p className="mt-2 text-[11px] uppercase tracking-[0.16em] text-verde-600/80">o entra con otro nombre</p>
          </div>
        )}

        <form onSubmit={entrar} noValidate className="mt-5 rounded-3xl border border-oro-200/80 bg-marfil px-4 py-5 shadow-soft">
          {errorGeneral && (
            <p role="alert" className="mb-4 rounded-2xl bg-terracotta-100/70 px-3 py-2 text-[13px] text-terracotta-700">
              {errorGeneral}
            </p>
          )}

          <label htmlFor={nombreId} className="label">
            Tu nombre <span className="text-oro-600">*</span>
          </label>
          <input
            id={nombreId}
            ref={nombreRef}
            type="text"
            className={`input py-2.5 text-[15px] ${errorNombre ? 'border-terracotta-600/60' : ''}`}
            value={nombre}
            onChange={(e) => {
              setNombre(e.target.value.slice(0, MAX_NOMBRE));
              if (errorNombre) setErrorNombre(null);
            }}
            maxLength={MAX_NOMBRE}
            autoComplete="given-name"
            autoCapitalize="characters"
            enterKeyHint="go"
            placeholder="Ej.: Ana"
            required
            aria-invalid={!!errorNombre}
            aria-describedby={errorNombre ? errorId : undefined}
          />
          {errorNombre ? (
            <p id={errorId} className="mt-1.5 text-xs text-terracotta-700" role="alert">
              {errorNombre}
            </p>
          ) : (
            <p className="mt-1.5 text-[11.5px] text-verde-600/80">Así te reconocerá el personal al llevar tu pedido.</p>
          )}

          {/* Recuperar la sesión con el código del personal */}
          {nombreEnUso && !pidiendoCodigo && (
            <button
              type="button"
              onClick={() => setPidiendoCodigo(true)}
              className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-medium text-cobalto-500 underline decoration-oro-300 underline-offset-4 hover:text-verde-700"
            >
              <KeyRound className="h-3.5 w-3.5" aria-hidden="true" />
              ¿Eres tú? Pide tu código al personal
            </button>
          )}

          {grupos.length > 0 && (
            <fieldset className="mt-5">
              <legend className="label mb-2">¿Vienes con alguien de la mesa?</legend>
              <div className="space-y-2">
                <OpcionGrupo
                  nombre="grupo"
                  valor=""
                  elegido={grupo === ''}
                  onElegir={setGrupo}
                  titulo="Vengo aparte"
                  detalle="Mi cuenta será independiente"
                />
                {grupos.map((g) => (
                  <OpcionGrupo
                    key={g.id}
                    nombre="grupo"
                    valor={String(g.id)}
                    elegido={grupo === String(g.id)}
                    onElegir={setGrupo}
                    titulo={`Vengo con: ${(g.nombres || []).join(', ')}`}
                    detalle="Podremos ver y pagar la cuenta juntos"
                  />
                ))}
              </div>
              <p className="mt-2 text-[11px] leading-snug text-verde-600/80">
                Si eliges un grupo, alguien del grupo debe aceptarte. Mientras tanto puedes pedir y tu cuenta va aparte.
              </p>
            </fieldset>
          )}

          <button type="submit" disabled={enviando} className="btn-primary mt-5 min-h-[48px] w-full px-6 text-[12.5px] disabled:opacity-60">
            {enviando ? 'Entrando…' : 'Ver menú'}
            {!enviando && <ArrowRight className="h-4 w-4" aria-hidden="true" />}
          </button>

          <p className="mt-3 text-center text-[10.5px] leading-snug text-verde-600/80">
            Usamos tu nombre solo para identificar tus pedidos durante esta visita.
          </p>
        </form>

        {nombreEnUso && pidiendoCodigo && (
          <form onSubmit={reconectar} noValidate className="mt-3 rounded-3xl border border-cobalto-200 bg-cobalto-50 px-4 py-4">
            <p className="font-serif text-[17px] italic text-verde-700">¿Eres {nombreEnUso}?</p>
            <p className="mt-0.5 text-[12.5px] text-verde-600">
              Pide al personal tu código de 4 dígitos para recuperar tu sesión en este celular.
            </p>
            <label htmlFor={codigoId} className="label mt-3">
              Código
            </label>
            <div className="flex gap-2">
              <input
                id={codigoId}
                ref={codigoRef}
                className="input w-32 py-2.5 text-center font-mono text-xl tracking-[0.5em]"
                value={codigo}
                onChange={(e) => {
                  setCodigo(e.target.value.replace(/\D/g, '').slice(0, 4));
                  if (errorCodigo) setErrorCodigo(null);
                }}
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9]{4}"
                maxLength={4}
                placeholder="····"
                aria-invalid={!!errorCodigo}
                aria-describedby={errorCodigo ? `${codigoId}-error` : undefined}
              />
              <button
                type="submit"
                disabled={reconectando || codigo.length !== 4}
                className="btn-cobalto min-h-[46px] flex-1 px-4 text-[11.5px] disabled:opacity-50"
              >
                {reconectando ? 'Validando…' : 'Recuperar'}
              </button>
            </div>
            {errorCodigo && (
              <p id={`${codigoId}-error`} className="mt-1.5 text-xs text-terracotta-700" role="alert">
                {errorCodigo}
              </p>
            )}
            <button
              type="button"
              onClick={() => {
                setPidiendoCodigo(false);
                setCodigo('');
                setErrorCodigo(null);
                nombreRef.current?.focus();
              }}
              className="mt-2 text-[12px] text-verde-600 underline decoration-oro-300 underline-offset-4 hover:text-cobalto-500"
            >
              No soy yo, usaré otro nombre
            </button>
          </form>
        )}
      </Marco>
    );
  };

  return (
    <>
      {/* La historia va antes en el DOM para que Tab llegue primero a su ✕ */}
      {historiaActiva && (
        <HistoriaBienvenida
          qr={qr}
          local={local}
          mesa={mesa}
          listo={historiaLista}
          saliendo={historiaActiva === 'saliendo'}
          alPasar={pasarHistoria}
          alSalir={quitarHistoria}
        />
      )}
      {/* Ya montada debajo e inert mientras la historia la cubre: Tab no llega a campos tapados
          ni Enter envía el formulario vacío. Al pasar queda operable al instante. */}
      <div ref={paginaRef} inert={cubierta ? '' : undefined}>
        {renderPagina()}
      </div>
    </>
  );
};
