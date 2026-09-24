import React from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout, LegalTable } from '../../components/LegalLayout';
import { SITE } from '../../config/site';

const sections = [
  {
    id: 'que-son',
    title: 'Qué son las cookies y el almacenamiento local',
    content: (
      <p>
        Las cookies y el almacenamiento local (localStorage) son pequeños archivos que el navegador guarda en tu
        dispositivo. Permiten, por ejemplo, que no tengas que iniciar sesión cada vez que abres el sistema.
      </p>
    ),
  },
  {
    id: 'que-usamos',
    title: 'Qué usamos',
    content: (
      <>
        <p>
          {SITE.name} usa <strong>únicamente almacenamiento técnico necesario</strong> para que el sistema funcione. No
          usamos cookies de publicidad ni de seguimiento.
        </p>
        <LegalTable
          head={['Nombre', 'Tipo', 'Para qué', 'Duración']}
          rows={[
            ['access_token', 'Almacenamiento local · necesario', 'Mantener tu sesión iniciada de forma segura', 'Hasta 1 hora (se renueva)'],
            ['refresh_token', 'Almacenamiento local · necesario', 'Renovar la sesión sin pedirte la contraseña', 'Hasta 7 días o hasta cerrar sesión'],
            ['user', 'Almacenamiento local · necesario', 'Recordar tu nombre y rol para mostrar el panel correcto', 'Hasta cerrar sesión'],
          ]}
        />
      </>
    ),
  },
  {
    id: 'terceros',
    title: 'Servicios de terceros',
    content: (
      <ul>
        <li>
          <strong>Google Fonts:</strong> cargamos las tipografías del sitio desde servidores de Google, que reciben tu
          dirección IP para entregarlas.
        </li>
        <li>
          <strong>WhatsApp:</strong> los botones de contacto abren WhatsApp (Meta). Lo que escribas allí se rige por la
          política de privacidad de WhatsApp.
        </li>
      </ul>
    ),
  },
  {
    id: 'consentimiento',
    title: 'Consentimiento',
    content: (
      <p>
        El almacenamiento técnico necesario no requiere tu consentimiento porque sin él el servicio no puede funcionar.
        Si en el futuro incorporamos cookies de analítica o marketing, te pediremos permiso antes de activarlas y podrás
        rechazarlas.
      </p>
    ),
  },
  {
    id: 'control',
    title: 'Cómo borrarlas',
    content: (
      <p>
        Al cerrar sesión borramos los datos de sesión. También puedes eliminarlos desde la configuración de tu navegador.
        Más información en nuestra <Link to="/legal/privacidad">Política de privacidad</Link>.
      </p>
    ),
  },
];

export const Cookies = () => (
  <LegalLayout
    title="Política de cookies"
    intro="Qué guardamos en tu navegador y por qué."
    sections={sections}
  />
);
