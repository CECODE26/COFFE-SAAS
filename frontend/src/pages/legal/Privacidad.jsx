import React from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout, LegalTable } from '../../components/LegalLayout';
import { SITE } from '../../config/site';

const { legal, contact } = SITE;

const sections = [
  {
    id: 'responsable',
    title: 'Quién es el responsable',
    content: (
      <>
        <p>
          El responsable del tratamiento de los datos personales descritos en esta política es{' '}
          <strong>{legal.companyName}</strong>, con RUC {legal.ruc} y domicilio en {legal.address}, que opera la
          plataforma {SITE.name} (en adelante, “{SITE.name}”, “nosotros”).
        </p>
        <ul>
          <li>Correo para temas de privacidad: <a href={`mailto:${contact.privacyEmail}`}>{contact.privacyEmail}</a></li>
          <li>Delegado de Protección de Datos: {legal.dpoName}</li>
        </ul>
        <p>
          Esta política se rige por la Constitución de la República del Ecuador (art. 66, numeral 19), la Ley Orgánica
          de Protección de Datos Personales (LOPDP), su Reglamento General y las resoluciones de la Superintendencia de
          Protección de Datos Personales (SPDP). Puedes ver el detalle en{' '}
          <Link to="/legal/proteccion-de-datos">Protección de datos (LOPDP)</Link>.
        </p>
      </>
    ),
  },
  {
    id: 'roles',
    title: 'Nuestro papel: responsable y encargado',
    content: (
      <>
        <p>{SITE.name} trata datos personales en dos calidades distintas:</p>
        <ul>
          <li>
            <strong>Como responsable</strong>, de los datos de nuestros clientes (dueños de cafeterías y distribuidores),
            de las personas que nos contactan y de quienes visitan este sitio.
          </li>
          <li>
            <strong>Como encargado</strong>, de los datos que cada cafetería registra en el sistema para operar: su
            personal, las reservas y los pedidos de sus comensales. En ese caso, la cafetería es la responsable y
            nosotros tratamos esos datos solo siguiendo sus instrucciones, según el contrato de servicio.
          </li>
        </ul>
        <p>
          Si eres cliente de una cafetería que usa {SITE.name} y quieres ejercer tus derechos, puedes dirigirte a esa
          cafetería o escribirnos: te ayudaremos a canalizar tu solicitud.
        </p>
      </>
    ),
  },
  {
    id: 'datos',
    title: 'Qué datos tratamos',
    content: (
      <>
        <LegalTable
          head={['Categoría', 'Ejemplos', 'De quién']}
          rows={[
            ['Identificación y contacto', 'Nombre, apellido, correo, teléfono, cargo o rol', 'Clientes, personal de cafeterías, personas que nos contactan'],
            ['Datos del negocio', 'Razón social, RUC, direcciones de locales, horarios', 'Clientes'],
            ['Datos de cuenta', 'Correo de acceso, contraseña (guardada cifrada), rol, fecha del último acceso', 'Usuarios del sistema'],
            ['Datos operativos', 'Pedidos, mesas, montos y método de pago de un pedido', 'Cafeterías (como encargados)'],
            ['Reservas', 'Nombre, teléfono y correo del comensal, fecha, hora, número de personas y notas', 'Comensales (como encargados)'],
            ['Datos técnicos', 'Dirección IP, navegador, registros de acceso y de errores', 'Todas las personas que usan el sitio o el sistema'],
            ['Solicitudes de derechos', 'Nombre, cédula o pasaporte, correo y detalle de la solicitud', 'Titulares que ejercen sus derechos'],
          ]}
        />
        <p>
          No solicitamos <strong>datos sensibles</strong> (salud, origen étnico, creencias, datos biométricos, etc.).
          Pedimos a las cafeterías no registrar este tipo de información en campos de texto libre como las notas de
          reservas. Los datos de pago con tarjeta, cuando existan, los procesa directamente la pasarela de pagos; no
          los almacenamos.
        </p>
      </>
    ),
  },
  {
    id: 'finalidades',
    title: 'Para qué los usamos y con qué base legal',
    content: (
      <LegalTable
        head={['Finalidad', 'Base de legitimación (art. 7 LOPDP)']}
        rows={[
          ['Crear y administrar tu cuenta y prestar el servicio contratado', 'Ejecución del contrato'],
          ['Procesar datos de la cafetería (pedidos, mesas, reservas, personal)', 'Ejecución del contrato de encargo con la cafetería'],
          ['Facturar y cumplir obligaciones tributarias y contables', 'Cumplimiento de una obligación legal'],
          ['Dar soporte por WhatsApp, correo o llamada', 'Ejecución del contrato / consentimiento'],
          ['Responder consultas comerciales y solicitudes de demo', 'Consentimiento (al escribirnos)'],
          ['Proteger la seguridad del sistema y prevenir fraudes', 'Interés legítimo'],
          ['Atender solicitudes de derechos y reclamos', 'Cumplimiento de una obligación legal'],
          ['Enviar novedades del producto', 'Consentimiento, que puedes retirar cuando quieras'],
        ]}
      />
    ),
  },
  {
    id: 'conservacion',
    title: 'Cuánto tiempo los conservamos',
    content: (
      <ul>
        <li>Datos de cuenta y del servicio: mientras el contrato esté vigente.</li>
        <li>
          Al terminar el contrato: mantenemos los datos de la cafetería durante <strong>30 días</strong> para que
          puedas pedir una copia; luego los eliminamos o anonimizamos, salvo lo que la ley obligue a conservar.
        </li>
        <li>Facturas y registros contables: durante los plazos que exige la normativa tributaria del Ecuador.</li>
        <li>Registros técnicos de seguridad: hasta 12 meses.</li>
        <li>Solicitudes de derechos: el tiempo necesario para demostrar que las atendimos, hasta 5 años.</li>
      </ul>
    ),
  },
  {
    id: 'destinatarios',
    title: 'Con quién los compartimos',
    content: (
      <>
        <p>No vendemos datos personales. Solo los compartimos con:</p>
        <ul>
          <li>Proveedores que nos ayudan a prestar el servicio (alojamiento en la nube, correo electrónico, mensajería, pasarela de pagos), que actúan como encargados y firman acuerdos de confidencialidad y protección de datos.</li>
          <li>Autoridades competentes, cuando exista una obligación legal o una orden judicial.</li>
          <li>La cafetería a la que pertenecen los datos, en el caso de los datos que tratamos como encargados.</li>
        </ul>
        <p>Mantenemos una lista actualizada de nuestros proveedores, disponible a pedido en {contact.privacyEmail}.</p>
      </>
    ),
  },
  {
    id: 'transferencias',
    title: 'Transferencias internacionales',
    content: (
      <p>
        Algunos de nuestros proveedores pueden alojar datos fuera del Ecuador. Cuando eso ocurre, lo hacemos con las
        garantías que exigen la LOPDP y la Norma General de Transferencias o Comunicaciones de Datos Personales
        (Resolución SPDP-SPD-2026-0004-R): países con nivel adecuado de protección o, en su defecto, cláusulas
        contractuales tipo u otras garantías reconocidas por la SPDP.
      </p>
    ),
  },
  {
    id: 'seguridad',
    title: 'Cómo protegemos tus datos',
    content: (
      <ul>
        <li>Conexiones cifradas (HTTPS) y contraseñas guardadas con algoritmos de cifrado irreversible.</li>
        <li>Acceso por roles: cada persona solo ve lo que corresponde a su cafetería o distribuidor.</li>
        <li>Separación lógica entre los datos de cada cliente.</li>
        <li>Copias de seguridad periódicas y registros de acceso.</li>
        <li>Evaluación de riesgos antes de nuevos tratamientos, conforme a la normativa de la SPDP.</li>
      </ul>
    ),
  },
  {
    id: 'derechos',
    title: 'Tus derechos',
    content: (
      <>
        <p>
          Puedes ejercer tus derechos de <strong>acceso, rectificación y actualización, eliminación, oposición,
          portabilidad, suspensión del tratamiento</strong> y a no ser objeto de decisiones basadas únicamente en
          valoraciones automatizadas. También puedes retirar tu consentimiento en cualquier momento.
        </p>
        <p>
          Para hacerlo, completa el formulario de <Link to="/legal/derechos">Ejercer mis derechos</Link> o escríbenos a{' '}
          <a href={`mailto:${contact.privacyEmail}`}>{contact.privacyEmail}</a>. Responderemos en un plazo máximo de{' '}
          <strong>15 días</strong>. Podremos pedirte que verifiques tu identidad.
        </p>
        <p>
          Si no estás conforme con nuestra respuesta, puedes presentar un reclamo ante la Superintendencia de Protección
          de Datos Personales (<a href="https://spdp.gob.ec" target="_blank" rel="noreferrer">spdp.gob.ec</a>).
        </p>
      </>
    ),
  },
  {
    id: 'incidentes',
    title: 'Si ocurre un incidente de seguridad',
    content: (
      <p>
        Si detectamos una vulneración de seguridad que afecte datos personales, la notificaremos a la SPDP dentro de los
        plazos legales (cinco días) y, cuando exista un riesgo para tus derechos, te avisaremos sin demora. Si el
        incidente afecta datos que tratamos como encargados, avisaremos de inmediato a la cafetería responsable.
      </p>
    ),
  },
  {
    id: 'menores',
    title: 'Menores de edad',
    content: (
      <p>
        {SITE.name} es un servicio para empresas y no está dirigido a menores de edad. Si una cafetería registra datos de
        un menor (por ejemplo, en una reserva), debe contar con la autorización de su representante legal.
      </p>
    ),
  },
  {
    id: 'cambios',
    title: 'Cambios a esta política',
    content: (
      <p>
        Actualizaremos esta política cuando cambien nuestros tratamientos o la normativa. Publicaremos la nueva versión
        en esta página con su fecha y, si el cambio es importante, te avisaremos por correo o dentro del sistema.
      </p>
    ),
  },
];

export const Privacidad = () => (
  <LegalLayout
    title="Política de privacidad"
    intro={`Te explicamos qué datos personales tratamos en ${SITE.name}, para qué, por cuánto tiempo y cómo puedes ejercer tus derechos.`}
    sections={sections}
  />
);
