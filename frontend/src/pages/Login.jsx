import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Button } from '../components/Button';
import { Brand } from '../components/Layout';
import toast from 'react-hot-toast';
import { ArrowRight, Globe2, Network, Store } from 'lucide-react';
import { homeFor } from '../lib/roles';

const DEMO_ACCOUNTS = [
  { email: 'superadmin@coffe.com', password: 'admin123', label: 'Super Admin', hint: 'Toda la plataforma', icon: Globe2 },
  { email: 'distribuidor@coffe.com', password: 'admin123', label: 'Distribuidor', hint: 'Andes Coffee Group', icon: Network },
  { email: 'admin@coffe.com', password: 'admin', label: 'Cafetería', hint: 'Café La Floresta', icon: Store },
];

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
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      {/* Panel editorial */}
      <div className="relative hidden overflow-hidden bg-espresso-800 p-12 lg:flex lg:flex-col lg:justify-between">
        <div
          className="pointer-events-none absolute -right-40 -top-40 h-[520px] w-[520px] rounded-full opacity-40"
          style={{ background: 'radial-gradient(circle, rgba(220,174,100,0.35), transparent 65%)' }}
        />
        <div
          className="pointer-events-none absolute -bottom-32 -left-24 h-[420px] w-[420px] rounded-full border border-brass-400/15"
        />
        <div
          className="pointer-events-none absolute -bottom-16 -left-8 h-[300px] w-[300px] rounded-full border border-brass-400/10"
        />

        <Link to="/" className="relative w-fit">
          <Brand light />
        </Link>

        <div className="relative max-w-lg">
          <p className="eyebrow mb-6 text-brass-300">Sistema de gestión</p>
          <h1 className="font-serif text-5xl font-medium leading-[1.08] text-cream xl:text-6xl">
            Cada taza, <em className="font-normal text-brass-300">cada mesa</em>, en su punto.
          </h1>
          <p className="mt-6 text-lg leading-relaxed text-espresso-200">
            Pedidos, mesas, menú y reservas de tu cafetería en un solo lugar, con la calma de un buen espresso.
          </p>
        </div>

        <div className="relative flex gap-10 text-sm text-espresso-300">
          <div>
            <p className="font-serif text-3xl text-cream">5</p>
            <p>módulos integrados</p>
          </div>
          <div>
            <p className="font-serif text-3xl text-cream">24/7</p>
            <p>tu local bajo control</p>
          </div>
        </div>
      </div>

      {/* Formulario */}
      <div className="flex items-center justify-center p-6 sm:p-12">
        <div className="animate-fade-in w-full max-w-sm">
          <div className="mb-10 lg:hidden">
            <Link to="/"><Brand /></Link>
          </div>

          <p className="eyebrow mb-3">Bienvenido</p>
          <h2 className="text-4xl font-semibold text-espresso-800">Inicia sesión</h2>
          <p className="mt-2 text-espresso-400">Ingresa tus credenciales para abrir tu barra.</p>

          <form onSubmit={handleSubmit} className="mt-10 space-y-5">
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

            <Button type="submit" size="lg" disabled={loading} className="w-full">
              {loading ? 'Iniciando…' : (
                <>
                  Entrar
                  <ArrowRight className="h-4 w-4" />
                </>
              )}
            </Button>
          </form>

          <div className="mt-10">
            <p className="label">Cuentas demo</p>
            <div className="grid grid-cols-3 gap-2">
              {DEMO_ACCOUNTS.map((account) => {
                const Icon = account.icon;
                const active = email === account.email;
                return (
                  <button
                    key={account.email}
                    type="button"
                    onClick={() => fillDemo(account)}
                    className={`rounded-2xl border px-3 py-3 text-left transition-all ${
                      active
                        ? 'border-brass-400 bg-brass-50 ring-4 ring-brass-100'
                        : 'border-espresso-100 bg-paper hover:border-brass-200'
                    }`}
                  >
                    <Icon className={`mb-2 h-4 w-4 ${active ? 'text-brass-600' : 'text-espresso-300'}`} />
                    <p className="text-sm font-medium text-espresso-800">{account.label}</p>
                    <p className="truncate text-[11px] text-espresso-400">{account.hint}</p>
                  </button>
                );
              })}
            </div>
          </div>

          <p className="mt-10 text-center text-xs text-espresso-400">
            <Link to="/" className="hover:text-espresso-700">← Volver al sitio</Link>
            <span className="mx-2 text-espresso-200">·</span>
            <Link to="/legal/privacidad" className="hover:text-espresso-700">Privacidad</Link>
            <span className="mx-2 text-espresso-200">·</span>
            <Link to="/legal/terminos" className="hover:text-espresso-700">Términos</Link>
          </p>
        </div>
      </div>
    </div>
  );
};
