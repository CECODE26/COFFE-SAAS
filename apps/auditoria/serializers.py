from rest_framework import serializers

from .models import SolicitudDatos


class SolicitudDatosPublicaSerializer(serializers.ModelSerializer):
    """Formulario público para ejercer derechos LOPDP"""

    class Meta:
        model = SolicitudDatos
        fields = [
            'codigo', 'tipo', 'relacion', 'nombre', 'identificacion', 'email',
            'telefono', 'cafeteria', 'detalle', 'declaracion_veracidad', 'fecha_limite',
        ]
        read_only_fields = ['codigo', 'fecha_limite']

    def validate_declaracion_veracidad(self, value):
        if not value:
            raise serializers.ValidationError('Debes declarar que la información es veraz.')
        return value

    def validate_detalle(self, value):
        if len(value.strip()) < 10:
            raise serializers.ValidationError('Cuéntanos un poco más sobre tu solicitud.')
        return value


class SolicitudDatosSerializer(serializers.ModelSerializer):
    """Gestión interna (Super Admin)"""
    tipo_display = serializers.CharField(source='get_tipo_display', read_only=True)
    relacion_display = serializers.CharField(source='get_relacion_display', read_only=True)

    class Meta:
        model = SolicitudDatos
        fields = [
            'id', 'codigo', 'tipo', 'tipo_display', 'relacion', 'relacion_display',
            'nombre', 'identificacion', 'email', 'telefono', 'cafeteria', 'detalle',
            'estado', 'respuesta', 'created_at', 'fecha_limite', 'resuelta_at',
        ]
        read_only_fields = [f for f in fields if f not in ('estado', 'respuesta')]
