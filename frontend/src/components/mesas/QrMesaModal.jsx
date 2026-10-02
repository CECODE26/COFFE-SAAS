import React, { useEffect, useRef, useState } from 'react';
import QRCode from 'qrcode.react';
import toast from 'react-hot-toast';
import { AlertTriangle, Copy, Download, Printer, RefreshCw } from 'lucide-react';
import { Button } from '../Button';
import { ModalToldo, Aviso } from './ModalToldo';
import { TarjetaQr } from './TarjetaQr';
import { useImpresion } from './useImpresion';
import { comensalesApi, mensajeError, nombreMesa, urlQr } from './utils';

// Compone un PNG de la tarjeta (marca, mesa, QR y lema) a partir del QR dibujado en canvas
const componerPng = async (qrCanvas, { local, mesa, url }) => {
  try {
    await document.fonts?.ready;
  } catch (e) {
    /* sin API de fuentes */
  }
  const W = 1200;
  const H = 1560;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const ctx = c.getContext('2d');

  ctx.fillStyle = '#FFFBF1';
  ctx.fillRect(0, 0, W, H);
  // Toldo: franja verde bosque, filete de oro y rayas pistacho/marfil
  for (let x = 0, i = 0; x < W; x += 60, i += 1) {
    ctx.fillStyle = i % 2 ? '#FFFBF1' : '#BFD8A5';
    ctx.fillRect(x, 0, 60, 64);
  }
  ctx.fillStyle = '#2A4520';
  ctx.fillRect(0, 0, W, 18);
  ctx.fillStyle = '#C39B45';
  ctx.fillRect(0, 18, W, 4);
  ctx.fillRect(0, 62, W, 3);
  // Marco dorado
  ctx.strokeStyle = '#D8B45C';
  ctx.lineWidth = 3;
  ctx.strokeRect(24, 88, W - 48, H - 112);

  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = '#2A4520';
  if (local) {
    ctx.font = 'italic 500 52px "Playfair Display", Georgia, serif';
    ctx.fillText(local, W / 2, 190, W - 140);
  }
  ctx.font = 'italic 500 96px "Playfair Display", Georgia, serif';
  ctx.fillText(mesa, W / 2, 310, W - 140);

  // Rombo y filetes
  ctx.fillStyle = '#D8B45C';
  ctx.fillRect(W / 2 - 150, 351, 110, 2);
  ctx.fillRect(W / 2 + 40, 351, 110, 2);
  ctx.save();
  ctx.translate(W / 2, 352);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();

  // QR (el canvas ya trae su margen blanco de 4 módulos) con un filete dorado
  const lado = 880;
  const qx = (W - lado) / 2;
  const qy = 390;
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(qrCanvas, qx, qy, lado, lado);
  ctx.strokeStyle = '#EAD39A';
  ctx.lineWidth = 2;
  ctx.strokeRect(qx, qy, lado, lado);

  ctx.fillStyle = '#2A4520';
  ctx.font = '500 40px Jost, "Century Gothic", sans-serif';
  ctx.fillText('ESCANEA PARA VER LA CARTA Y PEDIR', W / 2, 1340, W - 140);
  ctx.fillStyle = '#4A6334';
  ctx.font = '26px Jost, "Century Gothic", sans-serif';
  ctx.fillText(url, W / 2, 1410, W - 120);

  return c.toDataURL('image/png');
};

const slug = (t = '') =>
  t
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');

// Modal con el QR de una mesa: vista previa de la tarjeta, imprimir solo esa tarjeta,
// descargar PNG y (roles admin) regenerar el QR.
export const QrMesaModal = ({ mesa, logo, esAdmin, onClose, onRegenerado }) => {
  const [qrCode, setQrCode] = useState(mesa.qr_code || null);
  const [cargando, setCargando] = useState(!mesa.qr_code);
  const [error, setError] = useState(null);
  const [confirmando, setConfirmando] = useState(false);
  const [regenerando, setRegenerando] = useState(false);
  const [descargando, setDescargando] = useState(false);
  const canvasRef = useRef(null);
  const { imprimir, imprimiendo, portal } = useImpresion();

  // Si la lista aún no trae el qr_code, se toma del detalle de la mesa
  useEffect(() => {
    if (mesa.qr_code) {
      setQrCode(mesa.qr_code);
      setCargando(false);
      return undefined;
    }
    let vivo = true;
    setCargando(true);
    comensalesApi
      .mesa(mesa.id)
      .then((d) => vivo && setQrCode(d.qr_code || null))
      .catch((e) => vivo && setError(mensajeError(e, 'No se pudo obtener el código QR de la mesa.')))
      .finally(() => vivo && setCargando(false));
    return () => {
      vivo = false;
    };
  }, [mesa.id, mesa.qr_code]);

  const url = qrCode ? urlQr(qrCode) : '';
  const titulo = nombreMesa(mesa.number, mesa.location);

  const handleImprimir = () => {
    imprimir(
      <div className="qr-impresion-sola">
        <TarjetaQr mesa={mesa} qrCode={qrCode} logo={logo} variante="impresion" />
      </div>
    );
  };

  const handleDescargar = async () => {
    const canvas = canvasRef.current?.querySelector('canvas');
    if (!canvas) return;
    setDescargando(true);
    try {
      const dataUrl = await componerPng(canvas, {
        local: mesa.cafeteria_name || '',
        mesa: titulo,
        url,
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `qr-mesa-${mesa.number}${mesa.cafeteria_name ? `-${slug(mesa.cafeteria_name)}` : ''}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
    } catch (e) {
      toast.error('No se pudo generar la imagen del QR.');
    } finally {
      setDescargando(false);
    }
  };

  const handleCopiar = async () => {
    try {
      await navigator.clipboard.writeText(url);
      toast.success('Enlace copiado');
    } catch (e) {
      toast.error('No se pudo copiar el enlace.');
    }
  };

  const handleRegenerar = async () => {
    setRegenerando(true);
    setError(null);
    try {
      const r = await comensalesApi.regenerarQr(mesa.id);
      let nuevo = r?.qr_code || r?.mesa?.qr_code;
      if (!nuevo) nuevo = (await comensalesApi.mesa(mesa.id)).qr_code;
      setQrCode(nuevo);
      setConfirmando(false);
      toast.success(r?.message || `QR de la mesa ${mesa.number} regenerado: imprime la tarjeta nueva.`, {
        duration: 6000,
        style: { borderRadius: '18px' },
      });
      onRegenerado?.(nuevo);
    } catch (e) {
      setError(mensajeError(e, 'No se pudo regenerar el QR.'));
    } finally {
      setRegenerando(false);
    }
  };

  const pie = confirmando ? (
    <>
      <Button variant="ghost" size="sm" onClick={() => setConfirmando(false)} disabled={regenerando}>
        Cancelar
      </Button>
      <Button variant="danger" size="sm" onClick={handleRegenerar} disabled={regenerando}>
        <RefreshCw className={`h-3.5 w-3.5 ${regenerando ? 'animate-spin' : ''}`} aria-hidden="true" />
        {regenerando ? 'Regenerando…' : 'Sí, regenerar'}
      </Button>
    </>
  ) : (
    <>
      {esAdmin && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setConfirmando(true)}
          disabled={!qrCode}
          className="mr-auto !px-3 !tracking-[0.12em] !text-terracotta-700 hover:!bg-terracotta-100"
        >
          <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
          Regenerar QR
        </Button>
      )}
      {/* Pie en una sola fila: textos cortos y botones compactos */}
      <Button
        variant="secondary"
        size="sm"
        onClick={handleDescargar}
        disabled={!qrCode || descargando}
        className="!px-3 !tracking-[0.12em]"
        title="Descargar la tarjeta en PNG"
      >
        <Download className="h-3.5 w-3.5" aria-hidden="true" />
        Descargar
      </Button>
      <Button size="sm" onClick={handleImprimir} disabled={!qrCode || imprimiendo} className="!px-3 !tracking-[0.12em]">
        <Printer className="h-3.5 w-3.5" aria-hidden="true" />
        Imprimir
      </Button>
    </>
  );

  return (
    <ModalToldo
      onClose={onClose}
      eyebrow={`Mesa ${mesa.number}`}
      titulo="Código QR de la mesa"
      subtitulo={mesa.cafeteria_name ? `${mesa.cafeteria_name}${mesa.location ? ` · ${mesa.location}` : ''}` : mesa.location}
      pie={pie}
      ancho="md"
    >
      {error && <Aviso icono={AlertTriangle} className="mb-3">{error}</Aviso>}

      {confirmando && (
        <Aviso tono="oro" icono={AlertTriangle} className="mb-3">
          <p className="font-medium">¿Regenerar el QR de la mesa {mesa.number}?</p>
          <p className="mt-0.5">El QR impreso actual dejará de funcionar: tendrás que imprimir y colocar la tarjeta nueva.</p>
        </Aviso>
      )}

      {cargando ? (
        <div className="flex h-72 items-center justify-center" role="status">
          <div className="h-8 w-8 animate-spin rounded-full border-2 border-pistacho-200 border-t-cobalto-500" />
          <span className="sr-only">Cargando QR…</span>
        </div>
      ) : qrCode ? (
        <>
          <div className="flex justify-center">
            <TarjetaQr mesa={mesa} qrCode={qrCode} logo={logo} variante="pantalla" />
          </div>
          <div className="mx-auto mt-3 flex max-w-[16.5rem] items-center gap-1.5">
            <p className="min-w-0 flex-1 truncate rounded-full bg-pistacho-50 px-3 py-1 text-[11px] text-verde-600 ring-1 ring-oro-200" title={url}>
              {url}
            </p>
            <button
              type="button"
              onClick={handleCopiar}
              className="shrink-0 rounded-full p-1.5 text-verde-600 ring-1 ring-oro-200 transition-colors hover:bg-pistacho-100 hover:text-cobalto-500"
              aria-label="Copiar enlace del QR"
              title="Copiar enlace"
            >
              <Copy className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
          {/* QR en canvas, oculto, solo para componer el PNG */}
          <div ref={canvasRef} className="hidden" aria-hidden="true">
            <QRCode value={url} renderAs="canvas" size={880} level="M" includeMargin fgColor="#1F3517" />
          </div>
        </>
      ) : (
        !error && <p className="py-10 text-center text-sm text-verde-600">Esta mesa todavía no tiene código QR.</p>
      )}
      {portal}
    </ModalToldo>
  );
};
