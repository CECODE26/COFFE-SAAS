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
