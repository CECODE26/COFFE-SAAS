import React, { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { Card } from './Card';
import { navFor, ROLE_LABELS } from '../lib/roles';
import { Coffee, LogOut, Menu, X } from 'lucide-react';

export const Brand = ({ light = false }) => (
  <div className="flex items-center gap-3">
    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${light ? 'bg-brass-400 text-espresso-900' : 'bg-espresso-800 text-brass-300'}`}>
      <Coffee className="h-5 w-5" strokeWidth={2.25} />
    </div>
    <div className="leading-tight">
      <p className={`font-serif text-xl font-semibold ${light ? 'text-cream' : 'text-espresso-800'}`}>Coffe</p>
      <p className={`text-[10px] font-semibold uppercase tracking-[0.25em] ${light ? 'text-brass-300' : 'text-brass-600'}`}>
        Casa de café
      </p>
    </div>
  </div>
);

const SidebarContent = ({ onNavigate }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const initials = (user?.first_name || user?.email || '?').slice(0, 1).toUpperCase();

  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pb-6 pt-7">
        <Brand light />
      </div>

      {user?.tenant_name && (
        <div className="mx-3 mb-6 rounded-xl border border-espresso-700 px-3 py-2.5">
          <p className="text-[10px] font-semibold uppercase tracking-[0.2em] text-espresso-400">
            {user.cafeteria_name ? 'Cafetería' : 'Distribuidor'}
          </p>
          <p className="truncate text-sm text-cream">{user.cafeteria_name || user.tenant_name}</p>
        </div>
      )}

      <nav className="flex-1 space-y-6 overflow-y-auto px-3">
        {navFor(user?.role).map((section) => (
          <div key={section.title}>
            <p className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-espresso-400">{section.title}</p>
            <div className="space-y-1">
              {section.links.map(({ path, label, icon: Icon }) => (
                <NavLink
                  key={path}
                  to={path}
                  onClick={onNavigate}
                  className={({ isActive }) =>
                    `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-espresso-700 text-cream'
                        : 'text-espresso-200 hover:bg-espresso-700/50 hover:text-cream'
                    }`
                  }
                >
                  {({ isActive }) => (
                    <>
                      <Icon className={`h-[18px] w-[18px] ${isActive ? 'text-brass-300' : 'text-espresso-300 group-hover:text-brass-200'}`} />
                      {label}
                      {isActive && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brass-300" />}
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        ))}
      </nav>

      <div className="m-3 rounded-2xl bg-espresso-700/60 p-3">
        <div className="flex items-center gap-3">
          <div className="flex h-9 w-9 items-center justify-center rounded-full bg-brass-200 font-serif font-semibold text-espresso-800">
            {initials}
          </div>
          <div className="min-w-0 flex-1 leading-tight">
            <p className="truncate text-sm font-medium text-cream">{user?.first_name || 'Usuario'}</p>
            <p className="truncate text-xs text-espresso-300">{ROLE_LABELS[user?.role] || 'Staff'}</p>
          </div>
          <button
            onClick={handleLogout}
            title="Cerrar sesión"
            className="rounded-lg p-2 text-espresso-300 transition-colors hover:bg-espresso-600 hover:text-cream"
          >
            <LogOut className="h-4 w-4" />
          </button>
        </div>
      </div>
    </div>
  );
};

export const Layout = ({ children }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <div className="min-h-screen lg:pl-64">
      {/* Sidebar escritorio */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 bg-espresso-800 lg:block">
        <SidebarContent />
      </aside>

      {/* Barra superior móvil */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b border-espresso-100/70 bg-cream/85 px-4 py-3 backdrop-blur lg:hidden">
        <Brand />
        <button
          onClick={() => setMenuOpen(true)}
          className="rounded-full p-2 text-espresso-600 hover:bg-foam"
          aria-label="Abrir menú"
        >
          <Menu className="h-6 w-6" />
        </button>
      </header>

      {/* Drawer móvil */}
      {menuOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-espresso-900/50 backdrop-blur-sm" onClick={() => setMenuOpen(false)} />
          <aside className="animate-fade-in absolute inset-y-0 left-0 w-72 bg-espresso-800 shadow-lift">
            <button
              onClick={() => setMenuOpen(false)}
              className="absolute right-3 top-7 rounded-full p-2 text-espresso-300 hover:text-cream"
              aria-label="Cerrar menú"
            >
              <X className="h-5 w-5" />
            </button>
            <SidebarContent onNavigate={() => setMenuOpen(false)} />
          </aside>
        </div>
      )}

      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-10 lg:py-12">{children}</main>
    </div>
  );
};

export const PageHeader = ({ eyebrow, title, subtitle, actions }) => (
  <div className="animate-fade-in mb-10 flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between">
    <div>
      {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
      <h1 className="text-4xl font-semibold text-espresso-800 sm:text-[2.75rem] sm:leading-[1.1]">{title}</h1>
      {subtitle && <p className="mt-2 max-w-xl text-espresso-400">{subtitle}</p>}
    </div>
    {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
  </div>
);

export const Loader = () => (
  <div className="flex h-[60vh] flex-col items-center justify-center gap-4">
    <div className="h-10 w-10 animate-spin rounded-full border-2 border-foam border-t-brass-500" />
    <p className="font-serif text-sm italic text-espresso-400">Preparando…</p>
  </div>
);

export const EmptyState = ({ icon: Icon = Coffee, title, description }) => (
  <Card className="flex flex-col items-center justify-center py-16 text-center">
    <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-foam text-brass-600">
      <Icon className="h-6 w-6" />
    </div>
    <p className="font-serif text-xl text-espresso-700">{title}</p>
    {description && <p className="mt-1 text-sm text-espresso-400">{description}</p>}
  </Card>
);

// Selector segmentado para filtros
export const Segmented = ({ options, value, onChange }) => (
  <div className="inline-flex rounded-full border border-espresso-100 bg-paper p-1 shadow-soft">
    {options.map((o) => (
      <button
        key={o.value}
        onClick={() => onChange(o.value)}
        className={`rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
          value === o.value ? 'bg-espresso-800 text-cream shadow-soft' : 'text-espresso-400 hover:text-espresso-700'
        }`}
      >
        {o.label}
        {o.count !== undefined && (
          <span className={`ml-1.5 text-xs ${value === o.value ? 'text-brass-300' : 'text-espresso-300'}`}>{o.count}</span>
        )}
      </button>
    ))}
  </div>
);

