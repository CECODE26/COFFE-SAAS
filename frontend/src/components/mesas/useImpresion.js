import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Imprime solo el contenido indicado: lo monta en un portal (.qr-impresion) fuera de #root,
// marca <body> con .imprimiendo-qr (ver "Impresión de QR" en index.css) y abre el diálogo del navegador.
// Espera a que carguen las imágenes (logos) y las fuentes antes de imprimir.
export const useImpresion = () => {
  const [contenido, setContenido] = useState(null);
  const zonaRef = useRef(null);

  useEffect(() => {
    if (!contenido) return undefined;
    let vigente = true;
    let respaldo = null;
    const terminar = () => {
      document.body.classList.remove('imprimiendo-qr');
      if (vigente) setContenido(null);
    };

    const preparar = async () => {
      const imgs = Array.from(zonaRef.current?.querySelectorAll('img') || []);
      const cargas = imgs.map((img) =>
        img.complete
          ? null
          : new Promise((res) => {
              img.addEventListener('load', res, { once: true });
              img.addEventListener('error', res, { once: true });
            })
      );
      const espera = new Promise((res) => setTimeout(res, 2000));
      await Promise.race([Promise.all([...cargas, document.fonts?.ready]), espera]);
      if (!vigente) return;
      document.body.classList.add('imprimiendo-qr');
      window.addEventListener('afterprint', terminar, { once: true });
      window.print();
      // Respaldo por si el navegador no emite afterprint
      respaldo = setTimeout(terminar, 3000);
    };
    const t = setTimeout(preparar, 30);

    return () => {
      vigente = false;
      clearTimeout(t);
      clearTimeout(respaldo);
      window.removeEventListener('afterprint', terminar);
      document.body.classList.remove('imprimiendo-qr');
    };
  }, [contenido]);

  const imprimir = useCallback((nodo) => setContenido(() => nodo), []);

  const portal = contenido
    ? createPortal(
        <div ref={zonaRef} className="qr-impresion" aria-hidden="true">
          {contenido}
        </div>,
        document.body
      )
    : null;

  return { imprimir, imprimiendo: !!contenido, portal };
};
