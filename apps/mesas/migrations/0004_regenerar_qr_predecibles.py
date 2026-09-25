"""
Regenera los QR predecibles que creaba el seed_demo anterior (f'{cafe.id.hex[:8]}-M{num:02d}'): con el QR de
una mesa se deducían los de todas las demás del local (-M01 … -M20). Las tarjetas QR de esas mesas hay que
reimprimirlas. Los QR aleatorios (uuid4 de la API anterior o token_urlsafe actual) no se tocan.
"""
import secrets

from django.db import migrations

FORMATO_SEED_ANTERIOR = r'^[0-9a-f]{8}-M[0-9]{2}$'


def regenerar_qr_predecibles(apps, schema_editor):
    Mesa = apps.get_model('mesas', 'Mesa')
    for mesa in Mesa.objects.filter(qr_code__regex=FORMATO_SEED_ANTERIOR).only('pk'):
        # Igual que apps.mesas.models.generar_token_qr (en una migración no se importa el código vivo)
        nuevo = secrets.token_urlsafe(16)
        while Mesa.objects.filter(qr_code=nuevo).exists():
            nuevo = secrets.token_urlsafe(16)
        Mesa.objects.filter(pk=mesa.pk).update(qr_code=nuevo)


class Migration(migrations.Migration):

    dependencies = [
        ('mesas', '0003_mesa_nota_cierre_alter_mesa_qr_code'),
    ]

    operations = [
        migrations.RunPython(regenerar_qr_predecibles, migrations.RunPython.noop),
    ]
