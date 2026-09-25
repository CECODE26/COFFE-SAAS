import React from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { ComensalProvider } from '../../components/cliente/ComensalContext';
import { ClienteLayout } from '../../components/cliente/ClienteLayout';
import { MenuCliente } from './MenuCliente';
import { MisPedidos } from './MisPedidos';
import { Cuenta } from './Cuenta';
import { Ticket } from './Ticket';

// App del comensal (pública, sin JWT): /mesa, /mesa/pedidos, /mesa/cuenta, /mesa/ticket.
// El proveedor vive por encima de las rutas para que el polling y el carrito sobrevivan al cambiar de pestaña.
export const ClienteApp = () => (
  <ComensalProvider>
    <ClienteLayout>
      <Routes>
        <Route index element={<MenuCliente />} />
        <Route path="pedidos" element={<MisPedidos />} />
        <Route path="cuenta" element={<Cuenta />} />
        <Route path="ticket" element={<Ticket />} />
        <Route path="*" element={<Navigate to="/mesa" replace />} />
      </Routes>
    </ClienteLayout>
  </ComensalProvider>
);
