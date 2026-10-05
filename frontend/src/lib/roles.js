import {
  LayoutGrid, Armchair, Receipt, BookOpen, CalendarDays, Globe2, Store, Users, Network, ShieldCheck,
} from 'lucide-react';

export const ROLE_LABELS = {
  super_admin: 'Super Admin',
  distribuidor_admin: 'Distribuidor',
  cafe_admin: 'Admin Cafetería',
  gerente: 'Gerente',
  camarero: 'Camarero',
  cajero: 'Cajero',
  cocinero: 'Cocinero',
  usuario: 'Usuario',
};

export const PLAN_LABELS = {
  free: 'Gratis',
  basic: 'Básico',
  pro: 'Pro',
  enterprise: 'Empresa',
};

// Espejo de LIMITES_POR_PLAN (apps/tenants/models.py). 999 o más se muestra como ilimitado.
export const PLAN_LIMITS = {
  free: { cafes: 1, users: 10 },
  basic: { cafes: 5, users: 50 },
  pro: { cafes: 20, users: 500 },
  enterprise: { cafes: 999, users: 9999 },
};

// Planes que se venden (no hay plan gratis; 'free' queda solo por cuentas antiguas)
export const PLANES_DE_PAGO = ['basic', 'pro', 'enterprise'];

// 999 o más se lee como ilimitado (igual que UsageBar en la tabla de Plataforma)
export const isUnlimited = (n) => n >= 999;

// Límites de un plan en una línea, corta para caber en la tarjeta del plan:
// "5 cafeterías · 50 usuarios" o "Ilimitado" (la misma palabra que la tabla de Plataforma)
export const limitsText = (cafes, users) => {
  if (isUnlimited(cafes) && isUnlimited(users)) return 'Ilimitado';
  const c = isUnlimited(cafes) ? 'cafeterías ilimitadas' : `${cafes} ${cafes === 1 ? 'cafetería' : 'cafeterías'}`;
  const u = isUnlimited(users) ? 'usuarios ilimitados' : `${users} ${users === 1 ? 'usuario' : 'usuarios'}`;
  return `${c} · ${u}`;
};

const OPERACION = [
  { path: '/dashboard', label: 'Resumen', icon: LayoutGrid },
  { path: '/mesas', label: 'Mesas', icon: Armchair },
  { path: '/pedidos', label: 'Pedidos', icon: Receipt },
  { path: '/menu', label: 'Menú', icon: BookOpen },
  { path: '/reservas', label: 'Reservas', icon: CalendarDays },
];

// Secciones del menú lateral según el rol
export const navFor = (role) => {
  if (role === 'super_admin') {
    return [
      {
        title: 'Plataforma',
        links: [
          { path: '/plataforma', label: 'Consola', icon: Globe2 },
          { path: '/cafeterias', label: 'Cafeterías', icon: Store },
          { path: '/usuarios', label: 'Usuarios', icon: Users },
          { path: '/solicitudes-datos', label: 'Privacidad', icon: ShieldCheck },
        ],
      },
      // Mesas y Menú: el super_admin también los gestiona (elige el local o el distribuidor en cada página)
      { title: 'Operación global', links: OPERACION.slice(1) },
    ];
  }
  if (role === 'distribuidor_admin') {
    return [
      {
        title: 'Mi red',
        links: [
          { path: '/distribuidor', label: 'Panel', icon: Network },
          { path: '/cafeterias', label: 'Cafeterías', icon: Store },
          { path: '/usuarios', label: 'Equipo', icon: Users },
        ],
      },
      { title: 'Operación', links: OPERACION },
    ];
  }
  if (role === 'cafe_admin') {
    // El admin de la cafetería también gestiona a su personal
    return [
      { title: 'Gestión', links: OPERACION },
      { title: 'Mi cafetería', links: [{ path: '/usuarios', label: 'Equipo', icon: Users }] },
    ];
  }
  return [{ title: 'Gestión', links: OPERACION }];
};

export const homeFor = (role) => {
  if (role === 'super_admin') return '/plataforma';
  if (role === 'distribuidor_admin') return '/distribuidor';
  return '/dashboard';
};
