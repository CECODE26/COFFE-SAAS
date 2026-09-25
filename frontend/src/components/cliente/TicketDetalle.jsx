import React from 'react';
import { money } from '../Stats';
import { MarcaLocal } from './ui';
import { etiquetaMesa, fechaHora, METODOS_PAGO } from './utils';

// Comprobante del consumo de UNA persona (lo que devuelve GET cliente/ticket/ o sesion.ticket).
// Se usa en el modal de "cuenta pagada" (compacto) y en la página imprimible.
export const TicketDetalle = ({ ticket, compacto = false }) => {
  if (!ticket) return null;
  const local = typeof ticket.local === 'object' && ticket.local ? ticket.local : { nombre: ticket.local };
  const mesa = ticket.mesa;
  const items = Array.isArray(ticket.items) ? ticket.items : [];
  const metodo = METODOS_PAGO[ticket.metodo_pago] || ticket.metodo_pago_nombre || ticket.metodo_pago;
  const folio = ticket.solicitud_id ? String(ticket.solicitud_id).replace(/-/g, '').slice(0, 8).toUpperCase() : '';
  const cuentaGrupal =
    ticket.tipo === 'grupal' && ticket.total_cobrado != null && Number(ticket.total_cobrado) !== Number(ticket.total);

  return (
    <div className={`text-verde-800 ${compacto ? '' : 'rounded-3xl border border-oro-200/80 bg-marfil px-5 py-6 shadow-soft print:rounded-none print:border-0 print:px-0 print:shadow-none'}`}>
      {!compacto && (
        <div className="flex flex-col items-center text-center">
          <MarcaLocal local={local} size={52} />
          {local.nombre && <p className="mt-2 font-serif text-xl italic text-verde-700">{local.nombre}</p>}
          {(local.razon_social || local.ruc) && (
            <p className="mt-0.5 text-[11px] text-verde-600">
              {[local.razon_social, local.ruc ? `RUC ${local.ruc}` : null].filter(Boolean).join(' · ')}
            </p>
          )}
          {(local.direccion || local.telefono) && (
            <p className="text-[11px] text-verde-600">{[local.direccion, local.telefono].filter(Boolean).join(' · ')}</p>
          )}
          <p className="eyebrow mt-2">Comprobante de consumo</p>
        </div>
      )}

      <dl className={`grid grid-cols-2 gap-x-3 gap-y-1.5 text-[12.5px] ${compacto ? '' : 'mt-5'}`}>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Cliente</dt>
          <dd className="font-medium">{ticket.alias}</dd>
        </div>
        <div className="text-right">
          <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Mesa</dt>
          <dd className="font-medium">{etiquetaMesa(mesa)}</dd>
        </div>
        <div>
          <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">Fecha</dt>
          <dd>{fechaHora(ticket.fecha)}</dd>
        </div>
        {folio && (
          <div className="text-right">
            <dt className="text-[10px] font-medium uppercase tracking-[0.16em] text-verde-600">N.º</dt>
            <dd className="font-mono text-[12px]">{folio}</dd>
          </div>
        )}
      </dl>

      {ticket.tipo === 'grupal' && Array.isArray(ticket.integrantes) && ticket.integrantes.length > 1 && (
        <p className="mt-2 text-[12px] text-verde-600">
          Cuenta del grupo: <span className="font-medium text-verde-800">{ticket.integrantes.join(', ')}</span>
        </p>
      )}

      <div className="my-4 border-t border-dashed border-oro-300" aria-hidden="true" />

      <table className="w-full text-[13px]">
        <caption className="sr-only">Productos consumidos</caption>
        <thead className="sr-only">
          <tr>
            <th scope="col">Producto</th>
            <th scope="col">Importe</th>
          </tr>
        </thead>
        <tbody>
          {items.length === 0 && (
            <tr>
              <td colSpan={2} className="py-2 text-center text-verde-600">
                Sin productos
              </td>
            </tr>
          )}
          {items.map((it, i) => (
            <tr key={`${it.nombre}-${i}`} className="align-top">
              <td className="py-1 pr-3">
                <span className="text-verde-600">{it.cantidad} ×</span> {it.nombre}
                <span className="block text-[11px] text-verde-600/80">{money(it.precio)} c/u</span>
              </td>
              <td className="whitespace-nowrap py-1 text-right font-medium">
                {money(it.total ?? Number(it.precio) * Number(it.cantidad))}
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <div className="my-4 border-t border-dashed border-oro-300" aria-hidden="true" />

      <div className="space-y-1 text-[13px]">
        <div className="flex justify-between">
          <span className="text-verde-600">Subtotal</span>
          <span>{money(ticket.subtotal)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-verde-600">IVA 15 %</span>
          <span>{money(ticket.iva)}</span>
        </div>
        <div className="flex items-baseline justify-between pt-1">
          <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-verde-700">
            {cuentaGrupal ? 'Tu consumo' : 'Total'}
          </span>
          <span className="font-serif text-2xl italic font-medium">{money(ticket.total)}</span>
        </div>
        {/* En una cuenta grupal el cobro fue por todo el grupo: se informa aparte, sin mezclarlo con su consumo */}
        {cuentaGrupal && (
          <div className="flex justify-between rounded-xl bg-pistacho-50 px-2.5 py-1.5 text-[12px]">
            <span className="text-verde-600">Cobrado a la cuenta del grupo</span>
            <span className="font-medium">{money(ticket.total_cobrado)}</span>
          </div>
        )}
        {metodo && (
          <div className="flex justify-between pt-1">
            <span className="text-verde-600">Pagado con</span>
            <span className="font-medium">{metodo}</span>
          </div>
        )}
      </div>

      {!compacto && (
        <>
          <p className="mt-6 text-center font-script text-2xl text-oro-600">Gracias por tu visita</p>
          <p className="mt-1 text-center text-[10.5px] text-verde-600/80">
            Documento informativo sin valor tributario. Solicita tu factura electrónica al personal.
          </p>
        </>
      )}
    </div>
  );
};
