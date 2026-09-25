import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { PublicLayout } from '../components/PublicLayout';
import { Reveal, Stagger, StaggerItem, CountUp, Float, Tilt, useMouseParallax, useLayer, EASE } from '../components/Motion';
import { HeroShowcase } from '../components/HeroShowcase';
import { OrderFlowDemo } from '../components/OrderFlowDemo';
import { Vitrina, SelloGiratorio, TazaPorcelana, CintaFirma, CintaCarta, LogoSello, Separador } from '../components/Decor';
import { SITE, PLANS, whatsappLink } from '../config/site';
import {
  Armchair, Receipt, BookOpen, CalendarDays, Store, BarChart3, QrCode, ChefHat,
  Check, MessageCircle, ShieldCheck, Smartphone, Plus, Minus, Headphones, Clock3, X,
} from 'lucide-react';

// Funciones que desfilan en la cinta cobalto bajo la portada
const CINTA = ['Mesas con QR', 'Pedidos en vivo', 'Carta digital', 'Reservas', 'Varios locales', 'Reportes', 'Soporte por WhatsApp'];

const GARANTIAS = [
  { icon: Smartphone, text: 'Celular, tablet y PC' },
  { icon: Headphones, text: 'Soporte en español' },
  { icon: ShieldCheck, text: 'Conforme a la LOPDP' },
];

const CIFRAS = [
  { to: 1, prefix: '< ', suffix: ' día', label: 'para empezar a operar' },
  { to: 0, suffix: '', label: 'instalaciones necesarias' },
  { to: 15, suffix: ' días', label: 'plazo LOPDP garantizado' },
  { to: 24, suffix: '/7', label: 'tu local bajo control' },
];

const FEATURES = [
  { icon: QrCode, title: 'Mesas con QR', text: 'Cada mesa con su código. Estado en vivo: libre, ocupada, reservada o en limpieza.' },
  { icon: Receipt, title: 'Pedidos en tiempo real', text: 'Del camarero a la barra y a la cocina, con estados claros hasta el cobro.' },
  { icon: BookOpen, title: 'Menú digital', text: 'Categorías, precios, tiempos y etiquetas de vegano, vegetariano o gluten.' },
  { icon: CalendarDays, title: 'Reservas', text: 'Agenda por mesa, notas del cliente y confirmación en un toque.' },
  { icon: Store, title: 'Varios locales', text: 'Todas tus cafeterías en un panel: equipo, ocupación y ventas de cada una.' },
  { icon: BarChart3, title: 'Reportes claros', text: 'Ventas, ocupación y pedidos en curso. Decide con números, no a ojo.' },
];

const STEPS = [
  { n: '01', title: 'Nos escribes', text: 'Por WhatsApp te mostramos el sistema con una cafetería de ejemplo.' },
  { n: '02', title: 'Configuramos tu local', text: 'Cargamos tu menú, tus mesas y tu equipo. Te enviamos los QR listos para imprimir.' },
  { n: '03', title: 'Empiezas a atender', text: 'Desde el celular, la tablet o la computadora del local. Sin instalar nada.' },
];

const ROLES = [
  { icon: Store, title: 'Dueño', text: 'Ventas y ocupación de todos tus locales.' },
  { icon: Armchair, title: 'Camarero', text: 'Sienta clientes y toma pedidos desde la mesa.' },
  { icon: ChefHat, title: 'Cocina', text: 'Ve qué preparar y marca lo que está listo.' },
  { icon: Receipt, title: 'Caja', text: 'Cobra y registra el método de pago.' },
];

const FAQ = [
  { q: '¿Necesito instalar algo?', a: 'No. COFFE-SAAS funciona en el navegador de cualquier celular, tablet o computadora con internet.' },
  { q: '¿El precio es por cafetería?', a: `Sí. Cada plan se cobra por local al mes. ${SITE.taxNote} Si tienes varios locales, escríbenos y te preparamos una propuesta.` },
  { q: '¿Cómo contrato un plan?', a: 'Escríbenos por WhatsApp desde el botón del plan que te interese. Te enviamos los datos de pago, activamos tu cuenta y te ayudamos a configurar tu local.' },
  { q: '¿Cuándo estará la facturación electrónica?', a: 'Estamos desarrollando la facturación electrónica autorizada por el SRI para el plan Mensual Pro. Si la necesitas, cuéntanos por WhatsApp y te avisamos apenas esté disponible.' },
  { q: '¿Mis datos y los de mis clientes están protegidos?', a: 'Sí. Tratamos los datos según la Ley Orgánica de Protección de Datos Personales del Ecuador: acceso por roles, contraseñas cifradas y conexiones seguras. Los datos de tu cafetería son tuyos.' },
  { q: '¿Qué pasa si quiero dejar de usar el sistema?', a: 'Nos avisas y dejamos de cobrarte desde el siguiente período. Si lo pides, te entregamos una copia de tus datos y luego los eliminamos.' },
];

// Enlace dentro de un párrafo: cobalto con subrayado dorado
const ENLACE_TEXTO = 'font-medium text-cobalto-500 underline decoration-oro-400 decoration-1 underline-offset-4 transition-colors hover:decoration-cobalto-500';

// ---------- Piezas de sección ----------

// Antetítulo en mayúsculas espaciadas con rombo dorado
const Eyebrow = ({ children, light = false, center = false }) => (
  <p
    className={`mb-4 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.24em] sm:text-xs ${center ? 'justify-center' : ''} ${
      light ? 'text-oro-300' : 'text-oro-600'
    }`}
  >
    <span className="rombo" aria-hidden="true" />
    {children}
    {center && <span className="rombo" aria-hidden="true" />}
  </p>
);

// Palabra destacada dentro de un título (cobalto sobre claro, oro sobre verde)
const Enfasis = ({ children, light = false }) => <em className={`italic ${light ? 'text-oro-200' : 'text-cobalto-500'}`}>{children}</em>;

const SectionTitle = ({ eyebrow, title, text, center = false, light = false }) => (
  <div className={`max-w-2xl ${center ? 'mx-auto text-center' : ''}`}>
    <Eyebrow light={light} center={center}>{eyebrow}</Eyebrow>
    <h2 className={`font-serif text-[2.15rem] font-medium italic leading-[1.08] sm:text-5xl ${light ? 'text-marfil' : 'text-verde-700'}`}>{title}</h2>
    {text && <p className={`mt-4 text-lg leading-relaxed ${light ? 'text-verde-100' : 'text-verde-600'}`}>{text}</p>}
  </div>
);

// Filete dorado con rombo al centro
const Filete = ({ className = '' }) => (
  <div className={`flex items-center gap-3 ${className}`} aria-hidden="true">
    <span className="h-px flex-1 bg-oro-300/70" />
    <span className="rombo" />
    <span className="h-px flex-1 bg-oro-300/70" />
  </div>
);

const FaqItem = ({ q, a }) => {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-oro-300/60">
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-center justify-between gap-6 py-5 text-left" aria-expanded={open}>
        <span className="font-serif text-lg font-medium italic text-verde-700 sm:text-xl">{q}</span>
        <motion.span
          animate={{ rotate: open ? 180 : 0 }}
          className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-oro-300 bg-marfil text-cobalto-500"
          aria-hidden="true"
        >
          {open ? <Minus className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.p
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: EASE }}
            className="max-w-2xl overflow-hidden leading-relaxed text-verde-600"
          >
            <span className="block pb-6">{a}</span>
          </motion.p>
        )}
      </AnimatePresence>
    </div>
  );
};

// Barra de contacto que aparece al hacer scroll
const StickyCta = () => {
  const [show, setShow] = useState(false);
  const [closed, setClosed] = useState(false);
  useEffect(() => {
    const onScroll = () => setShow(window.scrollY > 700 && window.scrollY < document.body.scrollHeight - window.innerHeight - 500);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  return (
    <AnimatePresence>
      {show && !closed && (
        <motion.div
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ duration: 0.5, ease: EASE }}
          className="fixed inset-x-0 bottom-5 z-50 flex justify-center px-4"
        >
          <div className="card flex items-center gap-3 rounded-full py-2 pl-5 pr-2 shadow-lift">
            <span className="hidden font-serif text-lg italic text-verde-700 sm:block">¿Lo vemos en tu cafetería?</span>
            <a href={whatsappLink('Hola, quiero una demo de COFFE-SAAS.')} target="_blank" rel="noreferrer" className="btn-primary min-h-[44px] px-5 text-[12px]">
              <MessageCircle className="h-4 w-4" aria-hidden="true" /> Demo por WhatsApp
            </a>
            <button
              type="button"
              onClick={() => setClosed(true)}
              className="flex h-10 w-10 items-center justify-center rounded-full text-verde-600 transition-colors hover:bg-pistacho-100 hover:text-verde-800"
              aria-label="Cerrar"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};

// ---------- Portada ----------

// Escena de 3 columnas como la plantilla: [texto] [vitrina en arco] [firma].
// --arco y --firma reproducen los tamaños fluidos de la plantilla; por debajo de 1100px todo se apila.
const ESCENA = [
  'relative mx-auto grid w-full max-w-[1440px] flex-1 grid-cols-1 content-start justify-items-center px-5 pt-0.5',
  '[--arco:clamp(236px,65vw,340px)] [--firma:clamp(220px,20.5vw,296px)]',
  'min-[1100px]:grid-cols-[minmax(0,1fr)_var(--arco)_var(--firma)] min-[1100px]:content-normal min-[1100px]:items-center min-[1100px]:justify-items-stretch',
  'min-[1100px]:gap-x-4 min-[1100px]:px-[clamp(20px,6.67vw,96px)] min-[1100px]:pt-6',
  'min-[1100px]:[--arco:clamp(300px,min(28.6vw,calc((100svh_-_250px)_*_0.572)),412px)]',
].join(' ');

const Hero = () => {
  const reduce = useReducedMotion();
  const parallax = useMouseParallax();
  const capaSello = useLayer(parallax, 10);
  const capaTaza = useLayer(parallax, 16);

  // Entrada suave (desactivada con "reducir movimiento")
  const entra = (delay = 0, y = 22) => ({
    initial: reduce ? false : { opacity: 0, y },
    animate: { opacity: 1, y: 0 },
    transition: { duration: 0.9, ease: EASE, delay },
  });

  return (
    // En escritorio ocupa la pantalla junto con el toldo y la cabecera (161px) de PublicLayout
    <section
      aria-label="Inicio"
      onMouseMove={parallax.onMouseMove}
      className="relative flex flex-col overflow-hidden min-[1100px]:min-h-[calc(100svh_-_161px)]"
    >
      <div className={ESCENA}>
        {/* Texto principal */}
        <div className="relative z-[2] order-3 flex w-full max-w-[520px] flex-col items-center pb-5 pt-5 text-center min-[1100px]:order-1 min-[1100px]:max-w-none min-[1100px]:items-start min-[1100px]:self-center min-[1100px]:pb-10 min-[1100px]:pt-4 min-[1100px]:text-left">
          <motion.p {...entra(0.1, 12)} className="ml-1 hidden font-script text-[clamp(26px,2.36vw,34px)] leading-none text-oro-600 min-[1100px]:block">
            Maison de gestión
          </motion.p>
          <h1 className="font-serif text-[clamp(44px,13vw,76px)] font-medium italic leading-none tracking-[-0.01em] text-verde-700 min-[1100px]:-ml-[0.04em] min-[1100px]:mt-1 min-[1100px]:text-[clamp(54px,min(5.8vw,10.5svh),90px)] min-[1100px]:leading-[0.96]">
            <motion.span {...entra(0.2, 28)} className="block">
              Tu cafetería,
            </motion.span>
            <motion.span {...entra(0.32, 28)} className="block min-[1100px]:pl-[0.9em]">
              en su punto.
            </motion.span>
          </h1>
          <motion.p
            {...entra(0.5, 14)}
            className="mt-3.5 font-serif text-[clamp(22px,6.15vw,28px)] leading-[1.2] text-verde-700 min-[1100px]:mt-[0.9em] min-[1100px]:text-[clamp(24px,min(2.36vw,3.8svh),34px)] min-[1100px]:leading-[1.18]"
          >
            Mesas, pedidos y carta,
            <br />
            en <em className="italic text-cobalto-500">un solo sistema</em>.
          </motion.p>
          <motion.p
            {...entra(0.62, 14)}
            className="mt-3 max-w-[310px] text-[15px] leading-normal text-verde-600 min-[1100px]:mt-4 min-[1100px]:max-w-[430px] min-[1100px]:text-[17px] min-[1100px]:leading-[1.55]"
          >
            Software para cafeterías en Ecuador: tu equipo atiende tranquilo
            <span className="hidden min-[1100px]:inline"> y tú ves el negocio desde el celular</span>.
          </motion.p>
          <motion.div
            {...entra(0.74, 14)}
            className="mt-[22px] flex w-full max-w-[420px] flex-col items-stretch gap-1.5 min-[1100px]:mt-[30px] min-[1100px]:w-auto min-[1100px]:max-w-none min-[1100px]:flex-row min-[1100px]:flex-wrap min-[1100px]:items-center min-[1100px]:gap-x-8 min-[1100px]:gap-y-4"
          >
            <a
              href={whatsappLink('Hola, quiero una demo de COFFE-SAAS para mi cafetería.')}
              target="_blank"
              rel="noreferrer"
              className="btn-primary min-h-[56px] px-6 min-[1100px]:min-h-[58px] min-[1100px]:px-[38px] min-[1100px]:text-sm"
            >
              Pedir una demo
            </a>
            <Link to="/#planes" className="enlace self-center px-3 min-[1100px]:px-0 min-[1100px]:text-sm">
              Ver planes
            </Link>
          </motion.div>
        </div>

        {/* Vitrina en arco con la foto, sello giratorio y (en móvil) la taza superpuesta */}
        <motion.div {...entra(0.15, 30)} className="relative order-1 w-[var(--arco)] min-[1100px]:order-2 min-[1100px]:self-end">
          <Vitrina
            src="/img/croissant.jpg"
            alt="Croissant de mantequilla recién horneado sobre una bandeja, con fondo verde desenfocado"
            objectPosition="54% 50%"
            className="w-full max-[1099px]:aspect-[254/330]"
          />
          <motion.div
            style={capaSello}
            className="absolute left-[-15.4%] top-[6.7%] w-[37.8%] min-[1100px]:left-[-13.6%] min-[1100px]:top-[12.2%] min-[1100px]:w-[36%]"
          >
            <motion.div
              initial={reduce ? false : { opacity: 0, scale: 0.8, rotate: -20 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 1.1, ease: EASE, delay: 0.45 }}
            >
              <SelloGiratorio texto="HECHO PARA CAFETERÍAS · ECUADOR ·" className="w-full" />
            </motion.div>
          </motion.div>
          <div className="absolute left-[72.8%] top-[49.7%] w-[48.8%] min-[1100px]:hidden" aria-hidden="true">
            <TazaPorcelana detallada={false} className="h-auto w-full" />
          </div>
        </motion.div>

        {/* La firma de la casa */}
        <aside
          aria-label="La firma de la casa"
          className="relative z-[2] order-2 -mt-9 flex flex-col items-center min-[1100px]:order-3 min-[1100px]:mt-0 min-[1100px]:self-center min-[1100px]:pb-10"
        >
          <motion.div style={capaTaza} className="hidden w-full min-[1100px]:block">
            <motion.div
              initial={reduce ? false : { opacity: 0, y: 20, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              transition={{ duration: 1, ease: EASE, delay: 0.35 }}
            >
              <TazaPorcelana className="h-auto w-full" />
            </motion.div>
          </motion.div>
          <motion.div {...entra(0.55, 10)} className="flex flex-col items-center">
            <CintaFirma etiqueta="La firma de la casa" className="mt-3.5 hidden min-[1100px]:inline-flex" />
            <CintaFirma etiqueta="La firma" nombre="Pedidos en vivo" className="min-[1100px]:hidden" />
            <p className="mt-4 hidden text-center font-serif text-[clamp(26px,2.22vw,32px)] font-medium italic leading-[1.1] text-verde-700 min-[1100px]:block">
              Pedidos en vivo
            </p>
            <p className="mt-2 hidden max-w-[230px] text-center text-sm leading-normal text-verde-600 min-[1100px]:block">
              De la mesa a la cocina y a la caja, al instante y sin papelitos.
            </p>
          </motion.div>
        </aside>
      </div>

      {/* Cinta cobalto con las funciones */}
      <CintaCarta items={CINTA} speed={46} className="flex-none" />
    </section>
  );
};

// ---------- Demo en vivo ----------

const Demo = () => {
  const parallax = useMouseParallax();
  return (
    <section id="demo" onMouseMove={parallax.onMouseMove} className="scroll-mt-28 border-y border-oro-200/80 bg-pistacho-50/70 py-24 sm:py-28">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <Reveal className="flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <SectionTitle
            eyebrow="Míralo en acción"
            title={<>Así fluye un <Enfasis>pedido</Enfasis></>}
            text="Cada tarjeta avanza sola: así lo ve tu equipo en el local, sin refrescar la pantalla."
          />
          <span className="inline-flex items-center gap-2 self-start rounded-full border border-oro-300 bg-marfil px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-700 md:self-auto">
            <span className="relative flex h-2 w-2" aria-hidden="true">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-pistacho-400 opacity-75 motion-reduce:animate-none" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-verde-500" />
            </span>
            Simulación en vivo
          </span>
        </Reveal>

        <Reveal delay={0.1} className="mt-12">
          <p className="mb-4 font-script text-[28px] leading-none text-oro-600">En la pantalla del local</p>
          <OrderFlowDemo />
        </Reveal>

        <div className="mt-20 grid gap-10 xl:grid-cols-[minmax(0,0.75fr)_minmax(0,1.6fr)] xl:items-center">
          <Reveal>
            <p className="font-script text-[28px] leading-none text-oro-600">Para el dueño</p>
            <h3 className="mt-2 font-serif text-3xl font-medium italic text-verde-700 sm:text-4xl">
              Tu negocio, <Enfasis>desde el celular</Enfasis>
            </h3>
            <p className="mt-3 max-w-md leading-relaxed text-verde-600">
              Ventas del día, ocupación de las mesas y lo que sale de cocina, al momento y estés donde estés.
            </p>
          </Reveal>
          <Reveal delay={0.1}>
            <HeroShowcase parallax={parallax} />
          </Reveal>
        </div>
      </div>
    </section>
  );
};

// ---------- Página ----------

export const Landing = () => (
  <PublicLayout>
    <Hero />

    {/* Garantías + cifras animadas */}
    <section aria-label="En cifras" className="mx-auto max-w-6xl px-5 pt-16 sm:px-8 sm:pt-20">
      <Reveal>
        <ul className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600 sm:text-xs">
          {GARANTIAS.map(({ icon: Icon, text }) => (
            <li key={text} className="inline-flex items-center gap-2">
              <Icon className="h-4 w-4 text-cobalto-500" aria-hidden="true" /> {text}
            </li>
          ))}
        </ul>
      </Reveal>
      <Reveal delay={0.05} className="mt-8 grid grid-cols-2 gap-px overflow-hidden rounded-3xl border border-oro-200/80 bg-oro-200/80 shadow-soft md:grid-cols-4">
        {CIFRAS.map((s) => (
          <div key={s.label} className="bg-marfil px-4 py-8 text-center sm:px-6">
            <p className="font-serif text-4xl font-medium italic text-verde-700 sm:text-5xl">
              <CountUp to={s.to} prefix={s.prefix} suffix={s.suffix} />
            </p>
            <p className="stat-label mt-2">{s.label}</p>
          </div>
        ))}
      </Reveal>
    </section>

    {/* Funciones */}
    <section id="funciones" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 sm:px-8 sm:py-28">
      <Reveal>
        <SectionTitle
          eyebrow="Funciones"
          title={<>Todo lo del día a día, <Enfasis>en un solo lugar</Enfasis></>}
          text="Desde que el cliente se sienta hasta que paga la cuenta."
        />
      </Reveal>
      <Stagger className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {/* Bloque destacado: taza de porcelana en un arco dorado */}
        <StaggerItem className="sm:col-span-2 lg:col-span-1 lg:row-span-2">
          <div className="relative flex h-full flex-col overflow-hidden rounded-3xl bg-verde-700 p-7 text-marfil shadow-lift sm:flex-row sm:items-center sm:gap-10 sm:p-9 lg:flex-col lg:items-stretch lg:gap-0 lg:p-7">
            <span className="pointer-events-none absolute inset-2.5 rounded-[16px] border border-oro-300/40" aria-hidden="true" />
            <div className="relative mx-auto w-full max-w-[220px] shrink-0 sm:mx-0 lg:mx-auto" aria-hidden="true">
              <div className="relative aspect-[4/5] rounded-arco border border-b-0 border-oro-300/70 bg-pistacho-300/15">
                <div className="absolute inset-x-[7%] bottom-0 top-[7%] rounded-arco border border-b-0 border-oro-300/30" />
                <TazaPorcelana className="absolute bottom-[3%] left-[6%] h-auto w-[88%]" />
              </div>
              <span className="block h-px bg-oro-300/70" />
            </div>
            <div className="relative mt-7 sm:mt-0 lg:mt-7">
              <p className="font-script text-[28px] leading-none text-oro-300">Sin prisa, sin pausa</p>
              <p className="mt-3 font-serif text-2xl font-medium italic leading-snug">Hecho para el ritmo de una cafetería</p>
              <p className="mt-2 text-sm leading-relaxed text-verde-100">Rápido de usar en hora pico, claro para todo el equipo.</p>
            </div>
          </div>
        </StaggerItem>
        {FEATURES.map(({ icon: Icon, title, text }) => (
          <StaggerItem key={title}>
            <Tilt className="card group h-full p-7">
              <motion.div
                whileHover={{ rotate: -8, scale: 1.06 }}
                className="mb-6 inline-flex h-12 w-12 items-center justify-center rounded-full border border-oro-300 bg-crema text-cobalto-500 shadow-[inset_0_0_0_3px_#FFFBF1]"
              >
                <Icon className="h-5 w-5" aria-hidden="true" />
              </motion.div>
              <h3 className="font-serif text-2xl font-medium italic text-verde-700">{title}</h3>
              <p className="mt-2 leading-relaxed text-verde-600">{text}</p>
            </Tilt>
          </StaggerItem>
        ))}
      </Stagger>
    </section>

    {/* Demo: flujo de un pedido + tarjetas en vivo */}
    <Demo />

    {/* Cómo funciona + roles */}
    <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-28 px-5 py-24 sm:px-8 sm:py-28">
      <div className="relative grid overflow-hidden rounded-[32px] bg-verde-700 text-marfil shadow-lift lg:grid-cols-2">
        <span className="pointer-events-none absolute inset-3 rounded-[22px] border border-oro-300/35" aria-hidden="true" />
        <Reveal className="relative p-8 sm:p-12">
          <SectionTitle light eyebrow="Cómo funciona" title={<>Listo para atender <Enfasis light>en pocos días</Enfasis></>} />
          <div className="relative mt-12">
            {/* Filete dorado que se dibuja al hacer scroll */}
            <svg className="absolute left-[7px] top-2 h-[calc(100%-1rem)] w-1" viewBox="0 0 4 100" preserveAspectRatio="none" aria-hidden="true">
              <motion.line
                x1="2" y1="0" x2="2" y2="100" stroke="#D8B45C" strokeWidth="1.5" strokeLinecap="round"
                initial={{ pathLength: 0 }} whileInView={{ pathLength: 1 }} viewport={{ once: true }} transition={{ duration: 1.6, ease: EASE }}
              />
            </svg>
            <Stagger as="ol" className="space-y-9" gap={0.25}>
              {STEPS.map((s) => (
                <StaggerItem as="li" key={s.n} className="relative flex gap-6 pl-9">
                  <span className="absolute left-[2px] top-2 h-3.5 w-3.5 rotate-45 bg-oro-300 ring-4 ring-verde-700" aria-hidden="true" />
                  <div>
                    <p className="text-[11px] font-medium uppercase tracking-[0.24em] text-oro-300">Paso {s.n}</p>
                    <p className="mt-1 font-serif text-2xl font-medium italic">{s.title}</p>
                    <p className="mt-1 leading-relaxed text-verde-100">{s.text}</p>
                  </div>
                </StaggerItem>
              ))}
            </Stagger>
          </div>
        </Reveal>
        <Reveal delay={0.15} className="relative border-t border-oro-300/25 p-8 sm:p-12 lg:border-l lg:border-t-0">
          <Eyebrow light>Roles</Eyebrow>
          <h3 className="font-serif text-3xl font-medium italic">Cada persona ve lo que necesita</h3>
          <Stagger className="mt-8 grid gap-3 sm:grid-cols-2" gap={0.1}>
            {ROLES.map(({ icon: Icon, title, text }) => (
              <StaggerItem key={title}>
                <motion.div
                  whileHover={{ y: -4 }}
                  className="h-full rounded-2xl border border-oro-300/25 bg-verde-800/50 p-5 transition-colors hover:border-oro-300/60"
                >
                  <span className="flex h-10 w-10 items-center justify-center rounded-full border border-oro-300/50 text-oro-300">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <p className="mt-3 font-serif text-xl font-medium italic">{title}</p>
                  <p className="mt-1 text-sm leading-relaxed text-verde-100">{text}</p>
                </motion.div>
              </StaggerItem>
            ))}
          </Stagger>
        </Reveal>
      </div>
    </section>

    {/* Planes */}
    <section id="planes" className="mx-auto max-w-6xl scroll-mt-28 px-5 pb-24 sm:px-8 sm:pb-28">
      <Reveal>
        <SectionTitle
          center
          eyebrow="Planes"
          title={<>Un precio claro, <Enfasis>por local</Enfasis></>}
          text="Elige tu plan y escríbenos por WhatsApp para activarlo."
        />
      </Reveal>

      <Stagger className="mx-auto mt-14 grid max-w-4xl gap-6 md:grid-cols-2" gap={0.15}>
        {PLANS.map((plan) => {
          const hl = plan.highlight;
          return (
            <StaggerItem key={plan.id}>
              <motion.div
                whileHover={{ y: -6 }}
                transition={{ duration: 0.4, ease: EASE }}
                className={`relative flex h-full flex-col rounded-[28px] p-8 sm:p-9 ${
                  hl
                    ? 'bg-verde-700 text-marfil shadow-[inset_0_0_0_6px_#2A4520,inset_0_0_0_7px_#C39B45,0_16px_36px_-12px_rgba(42,69,32,0.35)]'
                    : 'card text-verde-700'
                }`}
              >
                {hl && (
                  <span className="absolute -top-3.5 right-8 inline-flex items-center gap-2 rounded-full bg-cobalto-500 px-4 py-1.5 text-[11px] font-medium uppercase tracking-[0.2em] text-marfil shadow-[inset_0_0_0_2px_#22409A,inset_0_0_0_3px_#D8B45C]">
                    <span className="h-1.5 w-1.5 rotate-45 bg-oro-300" aria-hidden="true" />
                    Con facturación
                  </span>
                )}
                <p className="font-serif text-3xl font-medium italic">{plan.name}</p>
                <p className={`mt-1 text-sm ${hl ? 'text-verde-100' : 'text-verde-600'}`}>{plan.description}</p>
                <div className="mt-6 flex items-baseline gap-2">
                  <span className="font-serif text-6xl font-medium italic">
                    $<CountUp to={plan.price} duration={1.2} />
                  </span>
                  <span className={`text-sm ${hl ? 'text-verde-100' : 'text-verde-600'}`}>/ {plan.period}</span>
                </div>
                <p className={`mt-1 text-[11px] font-medium uppercase tracking-[0.18em] ${hl ? 'text-oro-200' : 'text-verde-600'}`}>+ IVA</p>

                <Filete className="my-7" />

                <ul className="flex-1 space-y-3">
                  {plan.features.map((f) => (
                    <li key={f} className={`flex items-start gap-3 text-sm ${hl ? 'text-verde-50' : 'text-verde-800'}`}>
                      <Check className={`mt-0.5 h-4 w-4 shrink-0 ${hl ? 'text-oro-300' : 'text-cobalto-500'}`} aria-hidden="true" />
                      <span>
                        {f}
                        {plan.soon?.includes(f) && (
                          <span
                            className={`ml-2 inline-block rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-[0.14em] ${
                              hl ? 'bg-marfil/10 text-oro-200 ring-1 ring-oro-300/40' : 'bg-oro-100 text-oro-700 ring-1 ring-oro-300/60'
                            }`}
                          >
                            Próximamente
                          </span>
                        )}
                      </span>
                    </li>
                  ))}
                </ul>

                <a
                  href={whatsappLink(`Hola, quiero contratar el plan ${plan.name} de COFFE-SAAS ($${plan.price}/mes + IVA). Mi cafetería se llama: `)}
                  target="_blank"
                  rel="noreferrer"
                  className={`mt-8 ${hl ? 'btn-light' : 'btn-primary'}`}
                >
                  <MessageCircle className="h-4 w-4" aria-hidden="true" /> {plan.cta}
                </a>
              </motion.div>
            </StaggerItem>
          );
        })}
      </Stagger>

      <p className="mt-8 text-center text-sm text-verde-600">
        {SITE.taxNote} ¿Tienes varios locales?{' '}
        <a href={whatsappLink('Hola, tengo varios locales y quiero una propuesta de COFFE-SAAS.')} target="_blank" rel="noreferrer" className={ENLACE_TEXTO}>
          Pide una propuesta
        </a>
        .
      </p>
    </section>

    <Separador className="mb-20" />

    {/* Preguntas */}
    <section id="preguntas" className="mx-auto grid max-w-6xl scroll-mt-28 gap-12 px-5 sm:px-8 lg:grid-cols-[1fr_1.5fr]">
      <Reveal>
        <SectionTitle eyebrow="Preguntas frecuentes" title={<>Lo que suelen <Enfasis>preguntarnos</Enfasis></>} />
        <p className="mt-4 text-verde-600">
          ¿Otra duda?{' '}
          <a href={whatsappLink('Hola, tengo una pregunta sobre COFFE-SAAS.')} target="_blank" rel="noreferrer" className={ENLACE_TEXTO}>
            Escríbenos
          </a>
          .
        </p>
        <Link
          to="/legal/privacidad"
          className="card card-hover mt-8 inline-flex min-h-[48px] items-center gap-2 rounded-full px-5 py-3 text-[12px] font-medium uppercase tracking-[0.18em] text-verde-700 hover:text-cobalto-500"
        >
          <ShieldCheck className="h-4 w-4 text-cobalto-500" aria-hidden="true" /> Cómo tratamos tus datos
        </Link>
      </Reveal>
      <Reveal delay={0.1} className="border-t border-oro-300/60">
        {FAQ.map((item) => (
          <FaqItem key={item.q} {...item} />
        ))}
      </Reveal>
    </section>

    {/* CTA final */}
    <section className="mx-auto max-w-6xl px-5 pt-24 sm:px-8 sm:pt-28">
      <Reveal className="relative overflow-hidden rounded-[32px] bg-cobalto-500 text-marfil shadow-lift">
        <span className="pointer-events-none absolute inset-3 rounded-[22px] border border-oro-300/50" aria-hidden="true" />
        <div className="relative grid items-center gap-10 px-8 py-16 sm:px-14 sm:py-20 md:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <div>
            <p className="font-script text-[32px] leading-none text-oro-300">Hablemos</p>
            <h2 className="mt-3 max-w-xl font-serif text-3xl font-medium italic leading-[1.1] sm:text-5xl">¿Te mostramos cómo funcionaría en tu cafetería?</h2>
            <p className="mt-4 max-w-md leading-relaxed text-cobalto-50">
              <Clock3 className="mr-1.5 inline h-4 w-4 text-oro-300" aria-hidden="true" />
              Una demo de 20 minutos por WhatsApp o videollamada, con tu menú.
            </p>
            <a href={whatsappLink('Hola, quiero agendar una demo de COFFE-SAAS.')} target="_blank" rel="noreferrer" className="btn-light mt-8 w-full !px-5 !tracking-[0.14em] sm:w-auto sm:!px-8 sm:!tracking-[0.2em]">
              <MessageCircle className="h-5 w-5 shrink-0" aria-hidden="true" /> Agendar demo por WhatsApp
            </a>
          </div>
          {/* Sello decorativo con el logo al centro */}
          <div className="relative mx-auto hidden w-full max-w-[240px] md:block" aria-hidden="true">
            <Float amplitude={6} duration={6}>
              <SelloGiratorio className="w-full">
                <LogoSello className="h-auto w-[46%]" />
              </SelloGiratorio>
            </Float>
            <div className="mt-6 flex items-center justify-center gap-3">
              <span className="h-px w-10 bg-oro-300/70" />
              <span className="rombo" />
              <span className="h-px w-10 bg-oro-300/70" />
            </div>
          </div>
        </div>
      </Reveal>
    </section>

    <StickyCta />
  </PublicLayout>
);
