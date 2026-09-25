import React from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { homeFor } from '../lib/roles';

export const PrivateRoute = ({ children, roles }) => {
  const { user, isAuthenticated, loading } = useAuth();

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="h-10 w-10 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500" />
      </div>
    );
  }

  if (!isAuthenticated) return <Navigate to="/login" />;

  // Si el rol no tiene acceso a esta pantalla, lo mandamos a su inicio
  if (roles && !roles.includes(user?.role)) return <Navigate to={homeFor(user?.role)} replace />;

  return children;
};

export const RoleHome = () => {
  const { user, isAuthenticated } = useAuth();
  return <Navigate to={isAuthenticated ? homeFor(user?.role) : '/login'} replace />;
};
