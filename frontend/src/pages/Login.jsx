import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { CintaCarta, CintaFirma, LogoSello, SelloGiratorio, TazaPorcelana, Toldo, Vitrina } from '../components/Decor';
import toast from 'react-hot-toast';
import { ArrowRight, Globe2, Network, Store } from 'lucide-react';
import { homeFor } from '../lib/roles';

const DEMO_ACCOUNTS = [
  { email: 'superadmin@coffe.com', password: 'admin123', label: 'Super Admin', hint: 'Toda la plataforma', icon: Globe2 },
  { email: 'distribuidor@coffe.com', password: 'admin123', label: 'Distribuidor', hint: 'Andes Coffee Group', icon: Network },
  { email: 'admin@coffe.com', password: 'admin', label: 'Cafetería', hint: 'Café La Floresta', icon: Store },
];

const CINTA = ['Mesas con QR', 'Pedidos en tiempo real', 'Carta digital', 'Reservas', 'Tu equipo'];

const enlacePie =
  'inline-flex min-h-[40px] items-center text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600 underline decoration-oro-400 decoration-1 underline-offset-[6px] transition-colors hover:text-cobalto-500';

export const Login = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const { login } = useAuth();
  const navigate = useNavigate();

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const userData = await login(email, password);
      toast.success('¡Bienvenido de vuelta!');
      navigate(homeFor(userData?.role));
    } catch (error) {
      toast.error('Email o contraseña inválidos');
    } finally {
      setLoading(false);
    }
  };

  const fillDemo = (account) => {
    setEmail(account.email);
    setPassword(account.password);
  };

  return (
    <div className="flex min-h-screen flex-col overflow-x-hidden">
      <Toldo />

      <main className="mx-auto grid w-full max-w-[1360px] flex-1 grid-cols-1 items-center gap-12 px-5 pb-14 pt-10 sm:px-8 lg:grid-cols-[minmax(0,1fr)_420px] lg:gap-14 lg:px-10 lg:pt-8 xl:grid-cols-[minmax(0,1fr)_440px] xl:gap-16">
        {/* Panel editorial (escritorio) */}
        <section
          aria-label="Presentación de COFFE-SAAS"
          className="hidden lg:flex lg:flex-col lg:items-center xl:flex-row xl:items-center xl:justify-between xl:gap-12"
        >
          {/* Texto */}
          <div className="mt-10 max-w-md text-center xl:mt-0 xl:max-w-none xl:flex-1 xl:text-left">
            <p className="font-script text-[30px] leading-none text-oro-600 xl:ml-1 xl:text-[34px]">Maison de gestión</p>
            <p className="mt-3 font-serif text-[2.75rem] italic font-medium leading-[1.02] text-verde-700 xl:text-[3.25rem] 2xl:text-[3.75rem]">
              <span className="xl:block">Bienvenido </span>
              <span className="xl:block xl:pl-[0.8em]">
                a tu <span className="text-cobalto-500">maison</span>
              </span>
            </p>
            <p className="mt-5 font-serif text-[1.45rem] leading-snug text-verde-700 xl:text-[1.6rem]">
              Cada taza, cada mesa, <em className="italic text-cobalto-500">en su punto</em>.
            </p>
            <p className="mt-4 hidden max-w-sm leading-relaxed text-verde-600 xl:block">
              Pedidos, mesas, menú y reservas de tu cafetería en un solo lugar, con la calma de un buen espresso.
            </p>

            <div className="mt-8 hidden items-center gap-6 xl:flex">
              <div>
                <p className="font-serif text-4xl italic text-verde-700">5</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">módulos integrados</p>
              </div>
              <span className="rombo" aria-hidden="true" />
              <div>
                <p className="font-serif text-4xl italic text-verde-700">24/7</p>
                <p className="mt-1 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">tu local bajo control</p>
              </div>
            </div>
          </div>

          {/* Vitrina en arco con sello y taza */}
          <div className="relative order-first w-[240px] shrink-0 xl:order-none xl:w-[270px] 2xl:w-[310px]">
            <Vitrina
              src="/img/croissant.jpg"
              alt=""
              objectPosition="54% 50%"
              className="!aspect-[254/330] xl:!aspect-[412/720]"
            />
            <SelloGiratorio className="absolute -left-[17%] top-[8%] w-[38%] xl:top-[12%] xl:w-[36%]" />
            <TazaPorcelana detallada={false} className="absolute -right-[20%] bottom-[-8%] w-[48%] xl:-right-[16%] xl:bottom-[3%] xl:w-[44%]" />
          </div>
        </section>

        {/* Formulario */}
        <div className="mx-auto w-full max-w-[440px] lg:mx-0">
          <div className="animate-fade-in relative rounded-[2rem] border border-oro-300/80 bg-marfil px-6 pb-8 pt-12 shadow-[inset_0_0_0_6px_#FFFBF1,inset_0_0_0_7px_rgba(195,155,69,.35),0_16px_36px_-12px_rgba(42,69,32,.22)] sm:px-9 sm:pb-9">
            <div className="absolute -top-[15px] left-1/2 w-max -translate-x-1/2 whitespace-nowrap">
              <CintaFirma etiqueta="Acceso al panel" />
            </div>

            <Link to="/" aria-label="COFFE-SAAS, volver al inicio" className="flex w-fit items-center gap-3 rounded-full">
              <LogoSello size={48} />
              <span className="leading-none">
                <span className="block font-serif text-xl italic font-medium text-verde-700">COFFE-SAAS</span>
                <span className="mt-1.5 block text-[10px] font-medium uppercase tracking-[0.24em] text-verde-600">Gestión de cafeterías</span>
              </span>
            </Link>

            <div className="my-7 flex items-center gap-3" aria-hidden="true">
              <span className="h-px flex-1 bg-oro-300/80" />
              <span className="rombo" />
              <span className="h-px flex-1 bg-oro-300/80" />
            </div>

            <p className="font-script text-[28px] leading-none text-oro-600">Bienvenido</p>
            <h1 className="mt-1 font-serif text-[2.4rem] italic font-medium leading-tight text-verde-700">Inicia sesión</h1>
            <p className="mt-2 text-verde-600">Ingresa tus credenciales para abrir tu barra.</p>

            <form onSubmit={handleSubmit} className="mt-8 space-y-5">
              <div>
                <label className="label" htmlFor="email">Email</label>
                <input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input"
                  placeholder="tu@cafeteria.com"
                  autoComplete="email"
                  required
                />
              </div>

              <div>
                <label className="label" htmlFor="password">Contraseña</label>
                <input
                  id="password"
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input"
                  placeholder="••••••••"
                  autoComplete="current-password"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="btn-primary !mt-7 w-full disabled:pointer-events-none disabled:opacity-60"
              >
                {loading ? 'Iniciando…' : (
                  <>
                    Entrar
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-9">
              <p className="mb-3 flex items-center gap-3 text-[11px] font-medium uppercase tracking-[0.2em] text-verde-600">
                Cuentas demo
                <span className="h-px flex-1 bg-oro-300/70" aria-hidden="true" />
              </p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {DEMO_ACCOUNTS.map((account) => {
                  const Icon = account.icon;
                  const active = email === account.email;
                  return (
                    <button
                      key={account.email}
                      type="button"
                      onClick={() => fillDemo(account)}
                      aria-pressed={active}
                      className={`flex items-center gap-3 rounded-2xl border px-3 py-3 text-left transition-all duration-200 sm:flex-col sm:items-start sm:gap-0 ${
                        active
                          ? 'border-cobalto-500 bg-cobalto-50 ring-2 ring-cobalto-100'
                          : 'border-oro-300/70 bg-crema/70 hover:-translate-y-0.5 hover:border-cobalto-400'
                      }`}
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ring-1 ring-oro-400 sm:mb-2 ${
                          active ? 'bg-cobalto-500 text-marfil' : 'bg-pistacho-100 text-verde-700'
                        }`}
                        aria-hidden="true"
                      >
                        <Icon className="h-4 w-4" strokeWidth={1.7} />
                      </span>
                      <span className="block min-w-0">
                        <span className={`block text-[13px] font-medium ${active ? 'text-cobalto-500' : 'text-verde-800'}`}>{account.label}</span>
                        <span className="block truncate text-[11px] text-verde-600">{account.hint}</span>
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>

          <p className="mt-6 flex flex-wrap items-center justify-center gap-x-4 gap-y-1">
            <Link to="/" className={enlacePie}>← Volver al sitio</Link>
            <span className="h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
            <Link to="/legal/privacidad" className={enlacePie}>Privacidad</Link>
            <span className="h-1.5 w-1.5 rotate-45 bg-oro-400" aria-hidden="true" />
            <Link to="/legal/terminos" className={enlacePie}>Términos</Link>
          </p>
        </div>
      </main>

      <CintaCarta items={CINTA} speed={42} />
    </div>
  );
};
