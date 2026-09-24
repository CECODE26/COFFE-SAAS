import React from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout } from '../../components/LegalLayout';
import { SITE, PLANS } from '../../config/site';

const { legal, contact } = SITE;

const sections = [
  {
    id: 'objeto',
    title: 'Objeto',
    content: (
      <p>
        Estos términos regulan el uso de {SITE.name}, un software en la nube para gestionar cafeterías (mesas, pedidos,
        menú, reservas y equipo), prestado por <strong>{legal.companyName}</strong>, RUC {legal.ruc}. Al contratar o
        usar el servicio aceptas estos términos y nuestra <Link to="/legal/privacidad">Política de privacidad</Link>.
      </p>
    ),
  },
  {
    id: 'cuentas',
    title: 'Cuentas y usuarios',
    content: (
      <ul>
        <li>El cliente (dueño o distribuidor) es responsable de las cuentas que crea para su equipo y de los permisos que les asigna.</li>
        <li>Cada usuario debe mantener su contraseña en reserva y avisarnos si sospecha un acceso no autorizado.</li>
        <li>La información que registras debe ser veraz y debes contar con base legal para tratar los datos de tus clientes y empleados.</li>
      </ul>
    ),
  },
  {
    id: 'planes',
    title: 'Planes, precios y pagos',
    content: (
      <>
        <ul>
          {PLANS.map((p) => (
            <li key={p.id}>
              <strong>{p.name}:</strong> USD {p.price} por local al mes, más IVA.
            </li>
          ))}
        </ul>
        <ul>
          <li>El servicio se paga por mes adelantado, por cada local activo.</li>
          <li>Emitimos factura electrónica por cada pago.</li>
          <li>Si un pago no se recibe dentro de los 5 días siguientes a su vencimiento, podremos suspender el acceso hasta regularizarlo. Tus datos no se borran durante la suspensión.</li>
          <li>Podemos cambiar los precios avisándote con al menos 30 días de anticipación. El nuevo precio se aplica desde el siguiente período.</li>
          <li>Las funciones marcadas como “próximamente” no están incluidas hasta que se lancen.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'uso',
    title: 'Uso aceptable',
    content: (
      <>
        <p>No está permitido:</p>
        <ul>
          <li>Usar el servicio para actividades ilícitas o para tratar datos sin base legal.</li>
          <li>Intentar acceder a datos de otros clientes o vulnerar la seguridad del sistema.</li>
          <li>Revender, copiar o descompilar el software sin autorización escrita.</li>
          <li>Cargar contenido que infrinja derechos de terceros.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Tus datos',
    content: (
      <p>
        Los datos que registras (menú, pedidos, clientes, equipo) <strong>son tuyos</strong>. Nosotros los tratamos
        como encargados, solo para prestarte el servicio, según la{' '}
        <Link to="/legal/proteccion-de-datos">política de protección de datos</Link>. Puedes pedir una copia en
        cualquier momento.
      </p>
    ),
  },
  {
    id: 'disponibilidad',
    title: 'Disponibilidad y soporte',
    content: (
      <ul>
        <li>Trabajamos para que el servicio esté disponible de forma continua, pero puede haber interrupciones por mantenimiento o por causas fuera de nuestro control.</li>
        <li>Avisaremos con anticipación los mantenimientos programados.</li>
        <li>El soporte se brinda por WhatsApp y correo en horario laboral de Ecuador.</li>
      </ul>
    ),
  },
  {
    id: 'propiedad',
    title: 'Propiedad intelectual',
    content: (
      <p>
        El software, la marca {SITE.name}, el diseño y la documentación son de {legal.companyName}. La suscripción te da
        una licencia de uso no exclusiva e intransferible mientras esté vigente.
      </p>
    ),
  },
  {
    id: 'responsabilidad',
    title: 'Limitación de responsabilidad',
    content: (
      <p>
        En la medida que lo permita la ley, nuestra responsabilidad total frente al cliente se limita al valor pagado por
        el servicio en los últimos tres meses. No respondemos por pérdidas indirectas o lucro cesante. Esta limitación
        no afecta los derechos que la Ley Orgánica de Defensa del Consumidor reconoce a los consumidores.
      </p>
    ),
  },
  {
    id: 'terminacion',
    title: 'Terminación',
    content: (
      <ul>
        <li>Puedes cancelar tu suscripción en cualquier momento avisándonos por escrito. Dejamos de cobrarte desde el siguiente período.</li>
        <li>Podemos terminar el servicio si incumples estos términos, avisándote previamente cuando sea posible.</li>
        <li>Al terminar, tienes 30 días para pedir una copia de tus datos. Después los eliminamos, salvo obligación legal de conservarlos.</li>
      </ul>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a estos términos',
    content: (
      <p>
        Si modificamos estos términos, te avisaremos con al menos 15 días de anticipación. Si no estás de acuerdo, puedes
        cancelar el servicio antes de que entren en vigor.
      </p>
    ),
  },
  {
    id: 'ley',
    title: 'Ley aplicable y controversias',
    content: (
      <p>
        Estos términos se rigen por las leyes de la República del Ecuador. Cualquier controversia se intentará resolver
        primero de forma directa; de no llegar a un acuerdo, las partes podrán acudir a mediación o a los jueces
        competentes de {contact.city}.
      </p>
    ),
  },
  {
    id: 'contacto',
    title: 'Contacto',
    content: (
      <p>
        {legal.companyName} · {legal.address} · <a href={`mailto:${contact.email}`}>{contact.email}</a>
      </p>
    ),
  },
];

export const Terminos = () => (
  <LegalLayout
    title="Términos y condiciones"
    intro={`Las reglas de uso de ${SITE.name}: qué incluye el servicio, cómo se paga y qué derechos y obligaciones tenemos cada parte.`}
    sections={sections}
  />
);
