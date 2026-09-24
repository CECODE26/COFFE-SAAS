import React from 'react';
import { Link } from 'react-router-dom';
import { LegalLayout, LegalTable } from '../../components/LegalLayout';
import { SITE } from '../../config/site';

const { legal, contact } = SITE;

// Normativa vigente. Revisar periódicamente spdp.gob.ec y el Registro Oficial.
const NORMATIVA = [
  ['Mayo 2021', 'Ley Orgánica de Protección de Datos Personales (LOPDP)', 'Publicada en el Registro Oficial, Quinto Suplemento No. 459 (26/05/2021).'],
  ['Mayo 2023', 'Entrada en vigor del régimen sancionatorio de la LOPDP', 'Desde esta fecha la autoridad puede imponer sanciones.'],
  ['Noviembre 2023', 'Reglamento General a la LOPDP', 'Decreto Ejecutivo No. 904. Detalla procedimientos, plazos y obligaciones.'],
  ['Abril 2025', 'Normas SPDP sobre gestión de riesgos, delegados, auditorías y cláusulas contractuales', 'Resoluciones SPDP-SPD-2025-0003-R, 0004-R, 0005-R y 0006-R.'],
  ['Julio 2025', 'Reglamento del Delegado de Protección de Datos', 'Resolución SPDP-SPD-2025-0028-R: designación, funciones y registro del delegado.'],
  ['Enero 2026', 'Norma General de Transferencias o Comunicaciones de Datos', 'Resolución SPDP-SPD-2026-0004-R: requisitos para transferencias nacionales e internacionales.'],
  ['Febrero 2026', 'Norma General de Tratamiento de Datos a Gran Escala', 'Resolución SPDP-SPD-2026-0005-R.'],
  ['2026', 'Norma General de Protección de Datos en el uso de Inteligencia Artificial', 'Resolución SPDP-SPD-2026-0009-R.'],
];

const sections = [
  {
    id: 'marco',
    title: 'Marco legal que cumplimos',
    content: (
      <>
        <p>
          En Ecuador, la protección de datos personales es un derecho constitucional (art. 66, numeral 19). {SITE.name}{' '}
          cumple la siguiente normativa, que revisamos periódicamente para incorporar nuevas resoluciones de la
          Superintendencia de Protección de Datos Personales (SPDP):
        </p>
        <LegalTable head={['Fecha', 'Norma', 'Qué establece']} rows={NORMATIVA} />
        <p>
          También aplicamos, en lo pertinente, la Ley de Comercio Electrónico, Firmas Electrónicas y Mensajes de Datos y
          la Ley Orgánica de Defensa del Consumidor.
        </p>
      </>
    ),
  },
  {
    id: 'principios',
    title: 'Principios que aplicamos',
    content: (
      <ul>
        <li><strong>Licitud y transparencia:</strong> solo tratamos datos con una base legal y te explicamos cómo.</li>
        <li><strong>Finalidad:</strong> usamos los datos solo para lo que fueron recogidos.</li>
        <li><strong>Minimización:</strong> pedimos únicamente los datos necesarios para dar el servicio.</li>
        <li><strong>Exactitud:</strong> puedes corregir o actualizar tus datos en cualquier momento.</li>
        <li><strong>Conservación limitada:</strong> eliminamos los datos cuando ya no son necesarios.</li>
        <li><strong>Seguridad y confidencialidad:</strong> medidas técnicas y organizativas proporcionales al riesgo.</li>
        <li><strong>Responsabilidad proactiva:</strong> documentamos lo que hacemos para poder demostrarlo.</li>
      </ul>
    ),
  },
  {
    id: 'cafeterias',
    title: 'Si eres una cafetería: cómo te ayudamos a cumplir',
    content: (
      <>
        <p>
          Tu cafetería es la <strong>responsable</strong> de los datos de sus comensales y de su personal. {SITE.name}{' '}
          actúa como <strong>encargado del tratamiento</strong>. Al contratar el servicio, firmamos un acuerdo de encargo
          que incluye las cláusulas mínimas que exige la SPDP. En ese acuerdo nos comprometemos a:
        </p>
        <ul>
          <li>Tratar los datos solo para prestar el servicio y según tus instrucciones.</li>
          <li>Mantener la confidencialidad y exigirla a nuestro personal y proveedores.</li>
          <li>Aplicar medidas de seguridad adecuadas y avisarte de inmediato si ocurre un incidente.</li>
          <li>Ayudarte a responder las solicitudes de tus clientes (por ejemplo, borrar los datos de una reserva).</li>
          <li>Devolverte o eliminar los datos al terminar el contrato, a tu elección.</li>
          <li>No subcontratar a otros proveedores sin informarte.</li>
        </ul>
        <p>Recomendaciones para tu local:</p>
        <ul>
          <li>Informa a tus clientes, en tu local o en tu carta, que registras sus datos de reserva y para qué.</li>
          <li>Crea un usuario por persona de tu equipo y desactiva a quien ya no trabaje contigo.</li>
          <li>No escribas datos sensibles (salud, alergias con nombre y apellido, etc.) en las notas.</li>
        </ul>
      </>
    ),
  },
  {
    id: 'delegado',
    title: 'Delegado de Protección de Datos',
    content: (
      <p>
        Hemos designado a <strong>{legal.dpoName}</strong> como Delegado de Protección de Datos, conforme al Reglamento
        del Delegado (Resolución SPDP-SPD-2025-0028-R). Puedes contactarle en{' '}
        <a href={`mailto:${contact.privacyEmail}`}>{contact.privacyEmail}</a>.
      </p>
    ),
  },
  {
    id: 'plazos',
    title: 'Plazos que garantizamos',
    content: (
      <LegalTable
        head={['Situación', 'Plazo']}
        rows={[
          ['Responder una solicitud de derechos (acceso, eliminación, etc.)', '15 días desde que la recibimos'],
          ['Notificar a la SPDP una vulneración de seguridad', '5 días'],
          ['Avisar al titular si la vulneración pone en riesgo sus derechos', '3 días'],
          ['Avisar a la cafetería responsable de un incidente en sus datos', 'De inmediato, como máximo 2 días'],
          ['Eliminar los datos de una cafetería tras terminar el contrato', '30 días (salvo obligación legal de conservar)'],
        ]}
      />
    ),
  },
  {
    id: 'ejercer',
    title: 'Cómo ejercer tus derechos',
    content: (
      <p>
        Usa el formulario de <Link to="/legal/derechos">Ejercer mis derechos</Link>. Cada solicitud recibe un código de
        seguimiento y queda registrada con su fecha límite de respuesta. Si no estás conforme con la respuesta, puedes
        acudir a la SPDP (<a href="https://spdp.gob.ec" target="_blank" rel="noreferrer">spdp.gob.ec</a>).
      </p>
    ),
  },
];

export const ProteccionDatos = () => (
  <LegalLayout
    title="Protección de datos personales (LOPDP)"
    intro={`Cómo cumple ${SITE.name} la Ley Orgánica de Protección de Datos Personales del Ecuador y las normas de la Superintendencia de Protección de Datos Personales.`}
    sections={sections}
  />
);
