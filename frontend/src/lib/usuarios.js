// Quién puede tocar qué cuenta en Usuarios / Equipo. Espejo de apps/accounts/permissions.py:
// el backend vuelve a validar todo; aquí solo se decide qué botones se muestran.

// Personal que gestiona el admin de una cafetería (PERSONAL_DE_CAFETERIA en el backend)
const PERSONAL_DE_CAFETERIA = ['gerente', 'camarero', 'cajero', 'cocinero'];

// Activar / desactivar (CanManageUser): nunca sobre uno mismo
export const puedeGestionar = (yo, u) => {
  if (!yo || !u || u.id === yo.id) return false;
  if (yo.role === 'super_admin') return true;
  if (yo.role === 'distribuidor_admin') return !!yo.tenant && u.tenant === yo.tenant;
  if (yo.role === 'cafe_admin') {
    return (
      PERSONAL_DE_CAFETERIA.includes(u.role) &&
      !!yo.tenant &&
      u.tenant === yo.tenant &&
      !!u.cafeteria &&
      u.cafeteria === yo.cafeteria
    );
  }
  return false;
};

// Eliminar (CanDeleteUser + UserViewSet.destroy): solo el super admin y nunca su propia cuenta
export const puedeEliminar = (yo, u) => !!yo && !!u && yo.role === 'super_admin' && u.id !== yo.id;

// Tono del badge de cada rol (paleta "Pistacho y oro"; terracota queda para estados de error)
export const ROLE_TONE = {
  super_admin: 'slate',
  distribuidor_admin: 'brass',
  cafe_admin: 'honey',
  gerente: 'sage',
};

export const nombreDe = (u) => u?.full_name?.trim() || u?.email || 'esta cuenta';

const primerTexto = (valor) => {
  if (typeof valor === 'string') return valor;
  if (Array.isArray(valor)) return valor.length ? primerTexto(valor[0]) : null;
  if (valor && typeof valor === 'object') return primerTexto(Object.values(valor)[0]);
  return null;
};

// Mensaje del backend tal cual ({ detail }, { campo: [msg] }...) o uno genérico
export const mensajeError = (error, respaldo = 'No se pudo completar la acción. Inténtalo de nuevo.') => {
  if (!error?.response) return 'Sin conexión con el servidor. Revisa tu red e inténtalo de nuevo.';
  const data = error.response.data;
  if (!data || typeof data !== 'object') return respaldo;
  return primerTexto(data.detail) || primerTexto(data.error) || primerTexto(data) || respaldo;
};
