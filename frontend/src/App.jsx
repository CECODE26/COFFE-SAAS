import React from 'react';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider } from './context/AuthContext';
import { DataProvider } from './context/DataContext';
import { PrivateRoute, RoleHome } from './components/PrivateRoute';

// Pages
import { Login } from './pages/Login';
import { Dashboard } from './pages/Dashboard';
import { Mesas } from './pages/Mesas';
import { Pedidos } from './pages/Pedidos';
import { Menu } from './pages/Menu';
import { Reservas } from './pages/Reservas';
import { Plataforma } from './pages/Plataforma';
import { Distribuidor } from './pages/Distribuidor';
import { Cafeterias } from './pages/Cafeterias';
import { Usuarios } from './pages/Usuarios';
import { SolicitudesDatos } from './pages/SolicitudesDatos';
import { Landing } from './pages/Landing';
import { Privacidad } from './pages/legal/Privacidad';
import { ProteccionDatos } from './pages/legal/ProteccionDatos';
import { Terminos } from './pages/legal/Terminos';
import { Cookies } from './pages/legal/Cookies';
import { Derechos } from './pages/legal/Derechos';

const ADMINS = ['super_admin', 'distribuidor_admin'];

const routes = [
  // Super Admin
  { path: '/plataforma', element: <Plataforma />, roles: ['super_admin'] },
  { path: '/solicitudes-datos', element: <SolicitudesDatos />, roles: ['super_admin'] },
  // Distribuidor
  { path: '/distribuidor', element: <Distribuidor />, roles: ['distribuidor_admin'] },
  // Compartidas entre administradores
  { path: '/cafeterias', element: <Cafeterias />, roles: ADMINS },
  { path: '/usuarios', element: <Usuarios />, roles: ADMINS },
  // Operación de cafetería
  { path: '/dashboard', element: <Dashboard /> },
  { path: '/mesas', element: <Mesas /> },
  { path: '/pedidos', element: <Pedidos /> },
  { path: '/menu', element: <Menu /> },
  { path: '/reservas', element: <Reservas /> },
];

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <DataProvider>
          <Toaster
            position="top-right"
            toastOptions={{
              style: {
                background: '#2A4520',
                color: '#FFFBF1',
                borderRadius: '999px',
                padding: '10px 18px',
                fontSize: '14px',
                fontFamily: 'Jost, sans-serif',
                boxShadow: 'inset 0 0 0 3px #2A4520, inset 0 0 0 4px #C9A64F, 0 12px 28px -12px rgba(42,69,32,.45)',
              },
              success: { iconTheme: { primary: '#D8B45C', secondary: '#2A4520' } },
              error: { iconTheme: { primary: '#E07A62', secondary: '#FFFBF1' } },
            }}
          />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/legal/privacidad" element={<Privacidad />} />
            <Route path="/legal/proteccion-de-datos" element={<ProteccionDatos />} />
            <Route path="/legal/terminos" element={<Terminos />} />
            <Route path="/legal/cookies" element={<Cookies />} />
            <Route path="/legal/derechos" element={<Derechos />} />

            {/* Protected Routes */}
            {routes.map(({ path, element, roles }) => (
              <Route key={path} path={path} element={<PrivateRoute roles={roles}>{element}</PrivateRoute>} />
            ))}

            {/* Redirect al inicio según el rol */}
            <Route path="*" element={<RoleHome />} />
          </Routes>
        </DataProvider>
      </AuthProvider>
    </BrowserRouter>
  );
}

export default App;
