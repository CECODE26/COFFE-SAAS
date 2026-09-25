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
      { title: 'Operación global', links: [OPERACION[2], OPERACION[4]] },
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
  return [{ title: 'Gestión', links: OPERACION }];
};

export const homeFor = (role) => {
  if (role === 'super_admin') return '/plataforma';
  if (role === 'distribuidor_admin') return '/distribuidor';
  return '/dashboard';
};
