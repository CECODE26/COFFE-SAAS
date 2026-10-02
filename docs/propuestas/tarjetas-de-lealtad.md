# Propuesta: módulo de tarjetas de lealtad para COFFE-SAAS

Fecha: 26 de septiembre de 2026. Documento de propuesta, sin código. Las cifras de WhatsApp son las del tarifario vigente de Meta para Ecuador y pueden cambiar cada trimestre.

## 1. Resumen ejecutivo

Tu idea se puede hacer casi completa y encaja bien con lo que COFFE-SAAS ya tiene: el QR de la mesa, la sesión del cliente y el cobro.

- **Tarjeta de sellos:** cada visita pagada suma una estampita. Con 6 estampitas el cliente gana un café o té gratis (o un 5-10 % de descuento, según elija cada cafetería). Esta parte puede funcionar **dentro de la app del QR sin WhatsApp**, sin costo por mensaje y sin depender de Meta. Es la primera entrega.
- **WhatsApp:** el número se pide al escanear el QR, pero de forma opcional y sin frenar el pedido. Recomendamos que sea el cliente quien escriba primero al WhatsApp de la cafetería con un código ("Quiero mi tarjeta CAFE-4821"). Así queda verificado que el número es suyo y el mensaje "sumaste una estampita" sale gratis o por alrededor de un centavo.
- **Reenganche:** el mensaje "te extrañamos, tenemos estos postres" sí se puede, pero solo a quien aceptó recibir promociones. Meta lo cobra como marketing: **USD 0.074 por mensaje** en Ecuador. Es el costo principal del módulo.
- **Aviso por cercanía (200-300 m): no es posible tal como lo imaginaste.** Una página web abierta desde un QR no puede saber dónde está la persona después de cerrarla, y WhatsApp tampoco da la ubicación. Además, en Ecuador rastrear ubicación convierte el tratamiento en "gran escala" y dispara obligaciones legales pesadas. La alternativa es poner la tarjeta en Apple Wallet y Google Wallet con la ubicación del local: el propio teléfono la muestra al llegar, sin rastrear a nadie y sin costo por aviso.
- **Costo para una cafetería típica** (600 clientes inscritos, 1.500 visitas al mes, una campaña mensual): **unos USD 20 a 50 al mes en tarifas de Meta (USD 23 a 58 con IVA)**. Casi todo es la campaña de marketing; los sellos cuestan menos de USD 6 al mes. Meta se lo factura directamente a cada cafetería.
- **Legal:** es viable con la LOPDP si se piden consentimientos separados (tarjeta, promociones), con casillas desmarcadas, baja con una palabra y evidencia guardada.

Propuesta de fases: primero una corrección previa del cálculo de IVA con descuentos (F0), luego la tarjeta en el celular sin WhatsApp (F1), después WhatsApp para verificar y avisar estampitas (F2), reenganche y campañas (F3), antifraude y métricas (F4) y, opcional, Wallet con aviso de cercanía (F5).

## 2. Cómo funciona

**Para el cliente (desde su celular, sin instalar nada):**

1. Escanea el QR de la mesa y entra con su nombre, como hoy. Si ya es socio, ve "Hola Ana · 4 de 6 sellos".
2. En la carta ve una franja discreta: "Junta 6 sellos y gana un café o té". Si le interesa, toca "Unirme", marca las casillas que quiera y pulsa "Unirme por WhatsApp". Se abre WhatsApp con el mensaje ya escrito; solo toca enviar.
3. Al pedir la cuenta ve "Esta visita suma 1 sello". Si tiene recompensa, puede usarla ahí mismo.
4. Al pagar ve la animación de la estampita y recibe en WhatsApp: "Ana, sumaste un sello en Café X: 5 de 6".
5. Tiene una página "Mi tarjeta" con sus sellos, recompensas, vencimientos, preferencias y los botones para descargar o borrar sus datos.

**Para el personal:**

- El mesero ve junto a cada persona una insignia "4/6" o "Recompensa". Nunca ve el teléfono.
- En el cobro aparecen las recompensas disponibles y el sistema recalcula el total. El sello lo pone el sistema al cobrar: el mesero y el cajero no tienen botón para regalar sellos.
- En mostrador o para llevar, después de cobrar se muestra un QR de un solo uso que el cliente escanea para sumar su sello.

**Para el dueño de la cafetería:**

- Configura el programa en tres pasos: cuántos sellos, qué recompensa y cuánto duran.
- Ve la lista de clientes (teléfono enmascarado), segmentos como "nuevos", "en riesgo" o "dormidos", y métricas: cuántos vuelven, cuántas recompensas se canjean y cuánto cuestan.
- Activa los mensajes automáticos y arma campañas ("nuevos postres") eligiendo productos con foto del menú. Antes de enviar ve cuántos destinatarios hay y cuánto costará.

## 3. Qué SÍ y qué NO es posible tal como lo imaginaste

| Lo que pediste | ¿Se puede? | Cómo queda |
|---|---|---|
| Estampita por visita; a la 5.ª o 6.ª, café, té o 5-10 % | Sí | Configurable por cafetería. Recomendamos 6 sellos y café o té gratis. |
| Pedir el WhatsApp al escanear el QR | Sí, con matiz | Se ofrece al escanear, pero es opcional: quien no quiera sigue pidiendo igual. El mejor momento para insistir es al pedir la cuenta. |
| Mensaje "tienes una estampita" al llegar | Sí, con matiz | Se envía cuando la visita se **paga**, no cuando la persona llega. Escanear sin consumir no suma, para evitar trampas. |
| "Tenemos estos postres que te pueden interesar" a quien no vuelve | Sí | Solo a quien aceptó promociones, con límite de frecuencia y baja con una palabra. Cuesta USD 0.074 por mensaje. |
| WhatsApp automático al pasar a 200-300 m | **No** | Ni la web ni WhatsApp pueden detectar la ubicación en segundo plano. Solo lo haría una app nativa con permiso de ubicación "Siempre", y aun así legalmente es muy costoso. |
| Alternativa al aviso por cercanía | Sí (parcial) | Tarjeta en Apple/Google Wallet con la ubicación del local: aparece sola al llegar (unos 100 m en iPhone), sin rastrear a nadie. No controlamos la distancia exacta ni el texto en Android. |

## 4. La tarjeta de sellos

**Qué cuenta como visita (1 sello):**

- Una cuenta **pagada** en la que el consumo propio de la persona llega a un mínimo (por defecto USD 3.00 sin IVA, configurable). Escanear el QR o pedir la cuenta no suma.
- En una cuenta grupal, cada persona se evalúa por lo que pidió ella. Quien no pidió nada no suma aunque el grupo pague.
- Máximo **1 sello por persona y por día** (hora de Ecuador). Lo garantiza la base de datos, no solo la pantalla.
- En mostrador o para llevar, el sello lo suma el propio cliente escaneando un QR de un solo uso que dura 30 minutos.
- Si el cliente no se unió a tiempo, el ticket trae un enlace "Reclamar el sello de esta visita" válido 24 horas.

**Recompensas (cada cafetería elige):**

- **Producto gratis:** café o té de ciertas categorías, con un tope de precio (por ejemplo USD 3.00). Si pide un latte de USD 4.00, paga USD 1.00.
- **Porcentaje:** 5 % o 10 % sobre su propio consumo de esa visita (no sobre toda la mesa), con un tope en dólares.
- **Monto fijo:** USD X de descuento con consumo mínimo.
- El panel muestra al dueño el costo real de cada recompensa, usando el costo de los productos que ya está en el menú.

**Vencimientos y reglas claras:**

- Al completar 6 sellos se genera la recompensa y la tarjeta vuelve a empezar. La recompensa se usa en una visita siguiente y vence a los 30 días (configurable de 15 a 90).
- Cada sello vence a los 180 días de ganado.
- Aviso 5 días antes de que venza una recompensa.
- Si el dueño cambia las reglas, los sellos ya ganados no se tocan (lo exige la Ley de Defensa del Consumidor).

**Cómo se evitan las trampas:**

- **Varias sesiones o reescanear:** el sello se ata a la persona (su número verificado), no a la sesión, y el tope de 1 por día corta lo demás.
- **Varios números:** cada número se verifica por WhatsApp, cada sello exige consumo real y un mismo celular puede vincular como máximo 2 números en 30 días.
- **Personal que regala sellos:** meseros y cajeros no pueden sellar. Solo el administrador o el gerente puede poner un sello manual, con motivo, tope diario y registro en la auditoría. Se bloquean y se alertan los sellos a números que coinciden con el teléfono de alguien del personal.
- **Canjear la tarjeta de otro:** solo se canjea una recompensa de alguien vinculado a esa misma cuenta.
- **1 canje por visita**, y por defecto no se acumula con otros descuentos.
- Queda algo de fraude posible (varias SIM, complicidad del personal). Una recompensa pequeña y las alertas por empleado lo mantienen bajo control.

## 5. El número de WhatsApp

**Cuándo se pide.** No en la pantalla de bienvenida: hoy solo pide el nombre y añadir un campo haría que entre menos gente. Se ofrece así:

1. En la carta, con una franja que se puede cerrar.
2. **Al pedir la cuenta**, el momento clave: "Esta visita suma 1 sello". Ahí el cliente valora más la recompensa.
3. En la cuenta pagada y en el ticket, con el enlace "Reclamar el sello de esta visita".

Nadie está obligado. El QR sigue funcionando solo con el nombre.

**Verificación (recomendada): el cliente escribe primero.**

1. Marca sus casillas y toca "Unirme por WhatsApp".
2. Se abre WhatsApp con el texto "Quiero mi tarjeta CAFE-4821" (código de un solo uso que vence en 10 minutos).
3. Al enviarlo, el sistema recibe el número real, activa la tarjeta y responde: "¡Listo, Ana! Tu tarjeta de Café X está activa".

Ventajas: el cliente no teclea su número (no hay errores), queda probado que el número es suyo, y como él escribió primero, la respuesta sale gratis o casi. La alternativa, para quien no pueda abrir WhatsApp, es escribir el número y recibir un código (unos USD 0.01 por código).

La próxima vez, su celular lo reconoce (una cookie segura que dura 12 meses). Si cambia de teléfono, basta verificar de nuevo el mismo número.

**Consentimientos separados.** Todas las casillas empiezan **desmarcadas** y el texto nombra a la cafetería como responsable (razón social y RUC):

- **Tarjeta de lealtad** (necesaria solo para tener tarjeta): guardar visitas y sellos y recibir avisos de la tarjeta (sello sumado, recompensa lista o por vencer).
- **Promociones por WhatsApp** (opcional, nunca condiciona la tarjeta): novedades, postres, "te extrañamos".
- **Cumpleaños** (opcional): solo día y mes.
- Declaración "Soy mayor de 18 años".

Cada consentimiento se guarda con fecha y hora, versión exacta del texto, canal y mesa. Retirarlo es igual de fácil: escribir "BAJA" o usar el interruptor en "Mi tarjeta".

**Importante:** no se inscribe ni se escribe a los teléfonos que ya existen en pedidos anteriores. Fueron dados para otro fin y usarlos sería una infracción grave.

## 6. Mensajes de WhatsApp y cuánto cuestan

Meta cobra **por mensaje entregado**, según su tipo. Ecuador está en la región "Resto de Latinoamérica" (tarifario vigente, consultado el 25-sep-2026):

| Mensaje | Tipo para Meta | Costo por mensaje |
|---|---|---|
| "Listo, tu tarjeta está activa" (respuesta al código) | Servicio (respuesta dentro de 24 h) | Hoy USD 0; desde el **1-oct-2026**, USD 0.0113 (algunos proveedores reportan 1.000 gratis al mes por número; Meta aún no lo confirma en su página) |
| "Sumaste un sello: 5 de 6" | Servicio si el cliente escribió en las últimas 24 h; si no, plantilla **utility** neutral | USD 0 a 0.0113 |
| "Completaste tu tarjeta: tienes un café de cortesía" | Mejor dentro de la misma respuesta del 6.º sello. Enviada días después, Meta suele tratarla como **marketing** | 0.0113 o 0.074 |
| "Te extrañamos / tenemos postres nuevos" | **Marketing** | **USD 0.074** |
| "Estás cerca" | Marketing (y técnicamente no viable, ver §8) | — |
| Código de verificación (alternativa) | Authentication | USD 0.0113 |

Reglas para no pagar de más ni perder el número:

- El aviso del sello va **sin publicidad** ("Registramos tu visita en Café X: 5 de 6 sellos"). Si se le agrega "¡vuelve pronto!" o una oferta, Meta la reclasifica como marketing.
- **Un número por cafetería**, conectado desde el panel con el registro integrado de Meta (Embedded Signup v4). Así el cliente ve el nombre de su cafetería, cada una tiene sus propios límites y reputación, y **Meta le cobra directo con su tarjeta**. La cafetería puede seguir usando su app WhatsApp Business en el mismo número (coexistencia), aunque pierde las listas de difusión.
- COFFE-SAAS se registra como **Tech Provider** de Meta con la API oficial directa, sin intermediarios. Un proveedor como Twilio agregaría unos USD 18 al mes por cafetería; 360dialog, desde €49 por número.
- Un número nuevo solo puede escribir a **250 personas distintas cada 24 h** hasta que la cafetería verifique su negocio en Meta; después sube a 2.000. Una campaña a 600 clientes sin verificar se reparte en 3 días.
- Si Meta avisa que una persona recibe demasiado marketing (error 131049), no se reintenta antes de 24 h.
- Los números de EE. UU. (+1) no reciben marketing por WhatsApp.

## 7. Reenganche: "te extrañamos" y campañas

Solo para quien marcó la casilla de promociones. Cada regla tiene interruptor y el dueño puede bajar sus límites, nunca subirlos:

- **Te falta 1 sello:** si no vino en 7 días. Máximo 1 por tarjeta.
- **Te extrañamos:** si no viene desde hace 21 días o el doble de su ritmo habitual (lo que sea mayor). Máximo 1 cada 30 días; después de 2 sin respuesta pasa a "dormido" y no se le escribe más hasta que vuelva. Puede mostrar 1 a 3 productos con foto: los que elija el dueño o los de categorías que esa persona ya pidió.
- **Recompensa por vencer:** 5 días antes.
- **Cumpleaños** (solo con esa casilla): 3 días antes.
- **Campaña manual** ("nuevos postres"): el dueño elige productos del menú con su foto y un grupo (nuevos, en riesgo, dormidos). Antes de enviar ve "84 destinatarios · costo estimado USD 6.22".

Límites fijos para no molestar ni quemar el número:

- Marketing: máximo 1 por semana y 3 al mes por cliente. Nunca dos mensajes el mismo día. Nada de marketing en las 72 h después de una visita.
- Solo de 09:00 a 19:30 y dentro del horario del local, para que la persona todavía pueda ir.
- **Baja con una palabra:** "BAJA" corta las promociones al instante y la tarjeta sigue activa. "BORRAR" (con confirmación) elimina sus datos. "ALTA" las reactiva. También hay un botón de baja en cada mensaje de marketing.
- **Presupuesto mensual** por cafetería: al llegar al tope se pausa el marketing; los avisos de sellos siguen.
- Si baja la calidad del número en Meta o las bajas de una campaña superan el 2 %, se pausan las campañas y se avisa al dueño.

## 8. El aviso por cercanía (200–300 m)

**Tal como lo imaginaste no se puede, y no conviene intentarlo:**

- Una página web (lo que abre el QR) solo sabe la ubicación mientras está abierta en pantalla. Ningún navegador permite "avisar al pasar cerca" con la página cerrada.
- WhatsApp no sabe dónde está la persona; solo recibe una ubicación si ella la envía.
- Solo una **app instalada** con permiso de ubicación "Siempre" lo lograría: hay que construirla y mantenerla (Apple US$99 al año; Google US$25), convencer al cliente de dar ese permiso, y los avisos llegan con 2 a 6 minutos de retraso. Además, cada "estás cerca" por WhatsApp costaría USD 0.074.
- **Legalmente es lo más pesado:** la SPDP considera "tratamiento a gran escala" cualquier geolocalización de personas (Res. SPDP-SPD-2026-0005-R, art. 14.4). Eso obliga a evaluación de impacto previa, delegado de protección de datos, registro de actividades, auditoría e informes anuales.

**La alternativa recomendada (fase opcional): la tarjeta en Apple Wallet y Google Wallet.**

- El cliente toca "Agregar a Wallet" y su tarjeta de sellos queda en el teléfono, junto a sus tarjetas bancarias.
- La tarjeta lleva la ubicación de la cafetería (hasta 10 locales). **El propio teléfono la muestra al acercarse**: en iPhone aparece en la pantalla de bloqueo a unos 100 m; en Android, Google Wallet puede avisar si la persona le dio permiso de ubicación.
- La cafetería **nunca recibe la ubicación**: no hay rastreo, no hay costo por aviso y el riesgo legal es mucho menor.
- Además, los sellos se actualizan en la tarjeta con aviso gratis ("Llevas 5 de 6").
- Límites honestos: no controlamos la distancia exacta (son ~100 m, no 300) ni el texto en Android, y Apple no permite usar esos avisos para promociones.
- Complemento sin rastreo: el "te extrañamos" se envía a la **hora habitual** en que esa persona suele venir.

## 9. Requisitos legales en Ecuador

Resumen práctico (esto no reemplaza la revisión de un abogado):

- **Roles:** la cafetería es la **responsable** de los datos de sus clientes; COFFE-SAAS es el **encargado** (LOPDP art. 34; Reglamento arts. 41-47). Hay que actualizar el contrato de encargo con cada cafetería. COFFE-SAAS no puede usar esos datos para fines propios ni cruzar clientes entre cafeterías.
- **Informar al pedir el número** (LOPDP art. 12): quién es el responsable (razón social y RUC de la cafetería), para qué se usan los datos, cuánto tiempo se guardan, que se usa WhatsApp de Meta con procesamiento fuera de Ecuador, y cómo darse de baja o reclamar ante la cafetería o la SPDP.
- **Consentimientos separados y desmarcados** (Reglamento art. 5: el silencio no vale): tarjeta, promociones y cumpleaños. La ubicación queda fuera.
- **Solo mayores de 18 años** para promociones.
- **Guardar la prueba** de cada consentimiento y de cada baja (versión del texto, fecha, canal).
- **Baja gratuita en cada mensaje comercial**, aplicada al instante y solo para esa cafetería (Ley de Comercio Electrónico art. 50; Res. SPDP-SPD-2025-0041-R art. 11).
- **Meta como proveedor:** según la Res. SPDP-SPD-2026-0004-R, art. 23, un encargo no es transferencia internacional, pero hay que informarlo al cliente y tener la cadena de contratos.
- **Defensa del Consumidor:** publicar las condiciones del programa (beneficio, duración, vencimientos) antes de que el cliente se una (LODC art. 46). Los sellos ya ganados no se pueden quitar cambiando las reglas (art. 43). Un premio fijo a la 6.ª visita no es un sorteo y no necesita permiso.
- **SRI:** se emite comprobante aunque el producto sea gratis, y el descuento debe constar en la factura (Reglamento de Comprobantes arts. 8 y 19). Hay que confirmar con un contador cómo se trata el IVA de un producto 100 % gratis.
- **Conservación:** anonimizar a quien lleve 24 meses sin venir; "Eliminar mi tarjeta" disponible en todo momento.
- **Multas por incumplir:** de 0,1 % a 1 % del volumen de negocio (LOPDP arts. 71-73).

## 10. Cómo encaja en COFFE-SAAS

Casi todo se apoya en lo que ya existe:

- **El QR y la sesión del cliente:** la persona sigue entrando solo con su nombre. Si su celular ya es socio, se le reconoce ("Hola Ana · 4 de 6").
- **El cobro de mesa:** el sello se pone automáticamente **cuando se cobra** la cuenta (no al escanear), y la recompensa se canjea en el mismo panel de cobro que ya usa el personal. El total se recalcula antes de cobrar.
- **La carta:** las recompensas se definen con las categorías y productos del menú (café o té hasta USD 3.00), y las campañas usan las fotos que ya subes.
- **La auditoría:** cada sello manual, anulación o canje queda registrado.

Se agregan dos módulos nuevos: **Lealtad** (programa, clientes, sellos, recompensas y consentimientos) y **Mensajería** (WhatsApp y más adelante email o SMS). Pantallas nuevas:

- **Cliente:** franja "Únete" en la carta, mini tarjeta en la Cuenta, animación del sello al pagar, línea "Recompensa −USD 2.80" en el ticket y la página **"Mi tarjeta"**, con sus sellos, preferencias y los botones para descargar o borrar sus datos.
- **Personal:** insignias "4/6" y "Recompensa" en el detalle de la mesa, y casillas de recompensas en el cobro. El personal nunca ve el teléfono del cliente.
- **Dueño:** nueva sección **Lealtad** con el asistente de 3 pasos, la lista de clientes (teléfono enmascarado), los mensajes y campañas con su costo, y métricas: cuántos vuelven, cada cuánto, recompensas canjeadas y cuánto consumen los socios frente a los que no lo son.

**Dos correcciones previas necesarias:**

1. Hoy el sistema calcula el IVA **antes** de restar el descuento. Para el SRI, el descuento reduce la base: con el cálculo actual, un café gratis de USD 2.80 cobraría igual USD 0.42 de IVA.
2. Programar las tareas automáticas (avisos, vencimientos, campañas diarias). La herramienta (Celery) está instalada pero todavía no configurada.

## 11. Fases propuestas

| Fase | Qué entrega | Tamaño |
|---|---|---|
| **F0** Correcciones previas | IVA calculado después del descuento, descuento visible en cuenta y ticket, tareas automáticas configuradas | S |
| **F1** Tarjeta de sellos en el celular, **sin WhatsApp** | Programa configurable, sellos automáticos al cobrar (1 por día, consumo mínimo), recompensas canjeables en el cobro, "Mi tarjeta", insignias para el personal, panel del dueño con métricas básicas, textos legales | L |
| **F2** WhatsApp para verificar y avisar sellos | Conectar el número de cada cafetería, verificación con el código, avisos de sello y recompensa, BAJA/BORRAR/ALTA, costo de cada mensaje registrado, QR de sello para mostrador y "reclamar sello" desde el ticket | L |
| **F3** Reenganche y campañas | Reglas automáticas (te falta 1, te extrañamos, por vencer, cumpleaños), campañas con fotos de la carta, límites, horarios, presupuesto y medición de visitas que trajo cada campaña | L |
| **F4** Antifraude y métricas avanzadas | Alertas por empleado, varios números en un celular, sellos manuales auditados, segmentos avanzados, anonimización a los 24 meses | M |
| **F5** (opcional) Cercanía con Wallet | Tarjeta en Apple y Google Wallet con la ubicación del local y sellos actualizados | L |

La **F1 ya da valor por sí sola**: la cafetería tiene clientes frecuentes y métricas de recurrencia sin pagar un centavo a Meta.

## 12. Costos

- **Mensajes de WhatsApp** (los paga cada cafetería directo a Meta), para una cafetería con 600 socios, 1.500 visitas al mes y una campaña mensual:
  - Sellos y verificación: menos de USD 6 al mes.
  - Campaña a los 600: USD 44.40. Segmentada a 200 inactivos: USD 14.80.
  - **Total: unos USD 20 a 50 al mes, más IVA (USD 23 a 58).**
- **Wallet (solo si se hace F5):** cuenta de desarrollador de Apple, US$99 al año (la paga COFFE-SAAS una vez para todas las cafeterías). Google Wallet no cobra.
- **Sin intermediarios:** con la API oficial de Meta no hay comisión por mensaje. Con un proveedor como Twilio se sumarían unos USD 18 al mes por cafetería.

## 13. Cómo venderlo

- **Plan Mensual ($70):** incluye la **tarjeta de sellos en el celular (F1)**. Es un gancho fuerte y no te genera costos variables.
- **Plan Mensual Pro ($90):** suma **WhatsApp, reenganche y campañas (F2 y F3)**, y más adelante la tarjeta en Wallet. El costo de los mensajes lo paga cada cafetería directo a Meta, y el panel se lo muestra siempre antes de enviar.
- Mensaje comercial: *"Tus clientes vuelven más: tarjeta de sellos digital sin imprimir cartoncitos, avisos por WhatsApp y campañas a quienes dejaron de venir, midiendo cuánto te trae cada una."*

## 14. Decisiones para ti

1. **¿Cuántos sellos y qué premio por defecto?** Opciones: 5 o 6 sellos; café o té gratis, o 5-10 % de descuento. **Recomendación:** 6 sellos y café o té gratis hasta USD 3.00, configurable por cafetería.
2. **¿Tarjeta por cadena o por local?** **Recomendación:** por cadena por defecto (vale en todos los locales del distribuidor), y por local cuando los locales tengan dueños distintos.
3. **¿Consumo mínimo para ganar sello?** **Recomendación:** USD 3.00 sin IVA, configurable.
4. **¿Número de WhatsApp propio de cada cafetería o uno de COFFE-SAAS?** **Recomendación:** propio de cada cafetería, facturado por Meta directo a ella. Uno compartido solo para un piloto.
5. **¿Quién paga los mensajes?** **Recomendación:** cada cafetería, directo a Meta, con presupuesto mensual y costo visible. Alternativa: incluir una bolsa de mensajes en el plan Pro.
6. **¿Hacemos la tarjeta en Wallet (aviso al acercarse)?** **Recomendación:** sí, pero después de F1 a F3, y probándola antes en teléfonos reales.
7. **¿Promociones con "interés legítimo" (sin casilla)?** La ley lo permite con condiciones, pero WhatsApp exige consentimiento. **Recomendación:** solo con consentimiento.
8. **¿Arrancamos por F0 y F1?** **Recomendación:** sí. Es la base de todo y no depende de Meta.

## 15. Riesgos

- **Dependencia de Meta:** verificar el negocio, aprobar plantillas y registrarse como Tech Provider toma días o semanas, y al inicio solo se pueden conectar 10 cafeterías por semana. Las tarifas cambian cada trimestre, y el 1-oct-2026 empiezan a cobrarse las respuestas.
- **Que lo sientan como spam:** si los clientes bloquean el número, baja su calidad y afecta también a los avisos de sellos. Por eso los límites vienen estrictos y las campañas se pausan solas.
- **Fricción:** ir a WhatsApp y volver al navegador puede perder gente. Hay que medir cuántos se inscriben y probar en iPhone y Android.
- **Fraude residual:** varias SIM o complicidad del personal. El consumo mínimo, el tope diario, la auditoría y las alertas lo limitan, pero no lo eliminan. Una recompensa pequeña reduce el incentivo.
- **IVA:** corregir el cálculo cambia los totales de pedidos con descuento; hay que confirmar con el contador cómo facturar el producto gratis.
- **Wallet:** Apple y Google deciden cuándo mostrar la tarjeta; no se puede prometer un aviso exacto.

## 16. Fuentes principales

- Precios de WhatsApp: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing y el tarifario oficial https://whatsappbusiness.com/products/platform-pricing/
- Cobro de mensajes de servicio desde el 1-oct-2026: https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing/non-template-messages y https://360dialog.com/blog/whatsapp-service-message-charging-october-2026/
- Consentimiento (opt-in): https://developers.facebook.com/documentation/business-messaging/whatsapp/getting-opt-in
- Categorías de plantillas: https://developers.facebook.com/documentation/business-messaging/whatsapp/templates/template-categorization
- Límites de mensajería: https://developers.facebook.com/documentation/business-messaging/whatsapp/messaging-limits
- Registro integrado para varias cafeterías (Embedded Signup): https://developers.facebook.com/documentation/business-messaging/whatsapp/embedded-signup/overview/
- Tarjetas de Apple Wallet: https://developer.apple.com/library/archive/documentation/UserExperience/Conceptual/PassKit_PG/Creating.html
- Google Wallet (Nearby Passes, octubre de 2025): https://developers.google.com/wallet/docs/release-notes
- LOPDP y su Reglamento: https://www.gob.ec/regulaciones/ley-organica-proteccion-datos-personales
- Resoluciones de la SPDP (2025-0041-R, 2026-0004-R, 2026-0005-R): https://spdp.gob.ec
