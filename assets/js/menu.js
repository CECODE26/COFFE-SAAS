// Menú desplegable del celular: abre y cierra la navegación principal.
document.addEventListener('DOMContentLoaded', function () {
  var cabecera = document.querySelector('.cabecera');
  var boton = document.querySelector('.boton-menu');
  if (!cabecera || !boton) return;

  function cerrar() {
    cabecera.classList.remove('menu-abierto');
    boton.setAttribute('aria-expanded', 'false');
    boton.setAttribute('aria-label', 'Abrir menú');
  }

  boton.addEventListener('click', function () {
    var abierto = cabecera.classList.toggle('menu-abierto');
    boton.setAttribute('aria-expanded', abierto ? 'true' : 'false');
    boton.setAttribute('aria-label', abierto ? 'Cerrar menú' : 'Abrir menú');
  });

  cabecera.querySelectorAll('.menu__enlace').forEach(function (enlace) {
    enlace.addEventListener('click', cerrar);
  });

  document.addEventListener('keydown', function (evento) {
    if (evento.key === 'Escape' && cabecera.classList.contains('menu-abierto')) {
      cerrar();
      boton.focus();
    }
  });

  document.addEventListener('click', function (evento) {
    if (!cabecera.contains(evento.target)) cerrar();
  });
});
