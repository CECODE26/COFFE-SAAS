#!/usr/bin/env python
"""
Setup script para COFFE-SAAS
Ejecutar: python setup.py
"""

import os
import sys
import django
from pathlib import Path


def setup_environment():
    """Configurar environment variables"""
    print("\n🔧 Configurando variables de entorno...")

    env_file = Path('.env')
    if not env_file.exists():
        print("❌ Archivo .env no encontrado")
        print("📝 Creando desde .env.example...")
        os.system('cp .env.example .env')
        print("✅ Archivo .env creado")
        print("⚠️  Por favor, edita .env con tus configuraciones")
        return False
    return True


def run_migrations():
    """Ejecutar migraciones"""
    print("\n🗄️  Ejecutando migraciones...")
    os.system('python manage.py migrate')
    print("✅ Migraciones completadas")


def create_superuser_interactive():
    """Crear super usuario interactivamente"""
    print("\n👤 Crear Super Administrador")
    print("-" * 50)

    os.system('python manage.py createsuperuser')


def create_sample_tenant():
    """Crear tenant de ejemplo"""
    print("\n📦 Crear Distribuidor de Ejemplo? (s/n)")
    choice = input(">>> ").lower()

    if choice != 's':
        return

    print("\nIngresa datos del distribuidor:")
    name = input("Nombre del Distribuidor: ") or "Distribuidora Central"
    email = input("Email: ") or "distribuidor@coffe.com"
    ruc = input("RUC: ") or "1234567890"
    business_name = input("Razón Social: ") or "Distribuidora Central S.A."

    print(f"\nIngresa datos del Admin:")
    admin_email = input("Email del Admin: ") or "admin@distribuidor.com"
    first_name = input("Nombre: ") or "Juan"
    last_name = input("Apellido: ") or "Pérez"
    password = input("Contraseña: ") or "distribuidor123"

    # Setup Django
    os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'config.settings')
    django.setup()

    from apps.tenants.models import Tenant
    from apps.accounts.models import User

    try:
        tenant = Tenant.objects.create(
            name=name,
            slug=name.lower().replace(' ', '-'),
            email=email,
            ruc=ruc,
            business_name=business_name,
            plan='pro',
            max_cafes=10,
            max_users=100,
        )

        user = User.objects.create_user(
            email=admin_email,
            first_name=first_name,
            last_name=last_name,
            password=password,
            role='distribuidor_admin',
            tenant=tenant,
        )

        print(f"\n✅ Distribuidor creado:")
        print(f"   Nombre: {tenant.name}")
        print(f"   ID: {tenant.id}")
        print(f"   Email Admin: {user.email}")
        print(f"   Contraseña: {password}")

    except Exception as e:
        print(f"\n❌ Error al crear distribuidor: {e}")


def main():
    print("\n" + "=" * 60)
    print("COFFE-SAAS Setup")
    print("=" * 60)

    # 1. Setup environment
    if not setup_environment():
        print("\n⚠️  Por favor, edita .env y ejecuta de nuevo")
        sys.exit(1)

    # 2. Run migrations
    run_migrations()

    # 3. Create superuser
    print("\n👤 ¿Crear Super Administrador?")
    choice = input("(s/n) >>> ").lower()
    if choice == 's':
        create_superuser_interactive()

    # 4. Create sample tenant
    create_sample_tenant()

    # 5. Final message
    print("\n" + "=" * 60)
    print("✅ Setup Completado!")
    print("=" * 60)
    print("\n📚 Próximos pasos:")
    print("1. Edita .env si es necesario")
    print("2. Ejecuta: python manage.py runserver")
    print("3. Accede a: http://localhost:8000/api/docs/")
    print("4. Panel admin: http://localhost:8000/admin/")
    print("\n📖 Documentación:")
    print("- README.md - Overview del proyecto")
    print("- ARCHITECTURE.md - Detalles técnicos")
    print("- QUICKSTART.md - Guía rápida")
    print("\n" + "=" * 60)


if __name__ == '__main__':
    main()
