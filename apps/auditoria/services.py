from .models import RegistroAuditoria


def _tenant_id_de(objeto, usuario):
    """Tenant del objeto (o el objeto mismo si es un Tenant); si no tiene, el del usuario"""
    if objeto is not None:
        if objeto._meta.label == 'tenants.Tenant':
            return objeto.pk
        tenant_id = getattr(objeto, 'tenant_id', None)
        if tenant_id:
            return tenant_id
    if usuario is not None and getattr(usuario, 'is_authenticated', False):
        return getattr(usuario, 'tenant_id', None)
    return None


def conservar_autoria(usuario, lote=500):
    """Antes de eliminar una cuenta: sus registros quedarán con usuario=NULL (SET_NULL), igual que las acciones
    de un comensal o del sistema. Se anota en el detalle de cada uno quién era, para no perder la autoría.

    Llamar dentro de la misma transacción que el borrado. Devuelve cuántos registros se anotaron.
    """
    autor = {
        'id': str(usuario.pk),
        'email': usuario.email,
        'nombre': usuario.get_full_name(),
        'rol': usuario.role,
    }
    anotados = 0
    pendientes = []
    for registro in RegistroAuditoria.objects.filter(usuario=usuario).only('id', 'detalle').iterator(chunk_size=lote):
        detalle = registro.detalle if isinstance(registro.detalle, dict) else {'valor': registro.detalle}
        registro.detalle = {**detalle, 'usuario_eliminado': autor}
        pendientes.append(registro)
        if len(pendientes) >= lote:
            RegistroAuditoria.objects.bulk_update(pendientes, ['detalle'])
            anotados += len(pendientes)
            pendientes = []
    if pendientes:
        RegistroAuditoria.objects.bulk_update(pendientes, ['detalle'])
        anotados += len(pendientes)
    return anotados


def registrar(usuario, accion, objeto, **detalle):
    """Registra una acción en la bitácora de auditoría.

    usuario: quien la hizo (None o anónimo si fue un comensal o el sistema).
    objeto: instancia de modelo afectada (puede ser None).
    detalle: datos extra serializables a JSON (Decimal, UUID y fechas se convierten a texto).
    """
    if usuario is not None and not getattr(usuario, 'is_authenticated', False):
        usuario = None
    return RegistroAuditoria.objects.create(
        tenant_id=_tenant_id_de(objeto, usuario),
        usuario=usuario,
        accion=str(accion)[:60],
        objeto_tipo=objeto._meta.label[:60] if objeto is not None else '',
        objeto_id=str(objeto.pk)[:64] if objeto is not None and objeto.pk is not None else '',
        detalle=detalle,
    )
