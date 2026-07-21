# Plan de mejoras del panel administrativo

Este documento reúne las mejoras propuestas para administrar productos, categorías y pedidos de Solnatura. Las fases están ordenadas por impacto, riesgo y dependencia técnica.

## Implementado

- [x] Resumen del catálogo con total de productos, vigentes, sin stock, stock bajo y ofertas.
- [x] Filtros combinables por texto, vigencia, stock, categoría y oferta.
- [x] Búsqueda por nombre, código y descripción.
- [x] Ordenamiento por fecha, nombre, precio y stock.
- [x] Paginación de 12 productos conservando los filtros en la URL.
- [x] Paginación compacta con accesos a primera y última página.
- [x] Caché temporal de resultados administrativos en bloques de 10 páginas.
- [x] Retorno a la misma página, filtros y orden después de editar o cancelar.
- [x] Acceso rápido desde los contadores a filtros frecuentes.
- [x] Activación y desactivación rápida desde cada tarjeta.
- [x] Indicador diagonal para productos no vigentes.
- [x] Colores de alerta para productos sin stock o con stock bajo.
- [x] Estado vacío cuando una combinación de filtros no devuelve productos.

## Mejora reciente — navegación del catálogo administrativo

Rama de implementación: `mejora/catalogo-paginacion-retorno`.

### Paginación y experiencia de uso

- El catálogo administrativo continúa mostrando 12 productos por página.
- El paginador muestra un máximo de cinco números y accesos directos a la primera y última página.
- En escritorio, la página actual y el paginador se ubican a la izquierda; el total de productos encontrados se alinea a la derecha bajo los filtros.
- En móvil, el total aparece primero y la navegación queda centrada. Las pantallas muy estrechas permiten desplazamiento horizontal sin ocultar controles.
- La página, búsqueda, filtros y orden permanecen en la URL para que la navegación pueda restaurarse.

### Caché por bloques

- Cada combinación de búsqueda, filtros y orden carga hasta 10 páginas en una sola consulta: 120 productos como máximo.
- El bloque, el total filtrado y el resumen administrativo se mantienen en memoria durante 60 segundos.
- La caché admite hasta 120 entradas para limitar el consumo de memoria.
- Solicitudes simultáneas para el mismo bloque comparten la consulta que ya está en curso.
- La caché se invalida inmediatamente al crear, editar o eliminar productos; modificar stock o vigencia; aplicar acciones masivas; procesar stock de pedidos; o crear, editar y eliminar categorías.
- La caché es local al proceso de Node.js. Si la aplicación usa varias instancias, cada una conserva su propia caché por un máximo de 60 segundos.

### Retorno después de editar

- El enlace `Editar` envía la ubicación actual mediante `returnTo`.
- `Volver al catálogo`, `Cancelar` y un guardado exitoso regresan a la misma página con sus filtros y orden.
- Los errores de archivo o validación conservan `returnTo` dentro del formulario.
- Sólo se aceptan destinos internos que comienzan con `/mode`; cualquier valor inválido vuelve a `/mode` para evitar redirecciones externas.
- Después de guardar se invalida la caché antes de redirigir, por lo que el catálogo muestra la información actualizada.

### Significado de los filtros de estado

- `Sin stock` selecciona productos con cantidad igual o inferior a cero.
- `No vigente` selecciona productos desactivados, aunque todavía puedan conservar unidades.
- Al llegar a cero unidades, el producto se marca automáticamente como no vigente.
- Por lo tanto, un producto sin stock también queda no vigente, pero un producto no vigente no necesariamente está sin stock.

### Verificación realizada

- Comprobación de sintaxis de las rutas y del servicio de caché con `node --check`.
- Renderizado EJS de paginación inicial, intermedia y última.
- Prueba focalizada de reutilización e invalidación de caché.
- Prueba de retorno desde una página con filtros y ordenamiento.
- Comprobación de formato mediante `git diff --check`.

## Fase 1 — Seguridad del panel

Prioridad: crítica.

- [x] Incorporar inicio y cierre de sesión para administradores.
- [x] Proteger `/mode`, `/modecat`, `/upload`, `/update` y todas las acciones de modificación.
- [x] Guardar contraseñas con hash seguro; nunca en texto plano.
- [x] Agregar protección CSRF a formularios administrativos.
- [x] Cambiar eliminaciones que usan `GET` por `POST` o `DELETE`.
- [x] Incorporar limitación de intentos de inicio de sesión.
- [x] Configurar cookies `httpOnly`, `secure` y `sameSite` para producción.
- [x] Registrar quién realizó cada modificación.

Criterio de término: un visitante sin sesión no puede ver ni modificar información administrativa.

## Fase 2 — Calidad y validación de productos

Prioridad: alta.

- [ ] Corregir el interruptor de vigencia del formulario de edición para que refleje `image.estado`.
- [ ] Exigir nombre, código, precio, stock y categoría.
- [ ] Impedir precios y cantidades negativas.
- [ ] Validar que `precioAnterior` sea mayor al precio actual antes de mostrar una oferta.
- [ ] Hacer único el código de producto.
- [ ] Normalizar códigos y categorías, por ejemplo, usando mayúsculas y eliminando espacios externos.
- [ ] Validar tipo MIME de las imágenes además de su tamaño.
- [ ] Eliminar archivos temporales incluso cuando Cloudinary falle.
- [ ] Mostrar errores de validación junto al campo correspondiente.
- [ ] Solicitar confirmación antes de eliminar un producto o una categoría.

Criterio de término: no es posible guardar un producto incompleto, inconsistente o con valores negativos.

## Fase 3 — Operación diaria del catálogo

Prioridad: alta.

- [ ] Edición rápida de precio y stock desde la tarjeta.
- [ ] Botones `+1`, `-1` y ajuste directo de inventario.
- [ ] Duplicar un producto como borrador.
- [ ] Selección múltiple de productos.
- [ ] Activación y desactivación masiva.
- [ ] Cambio masivo de categoría.
- [ ] Ajuste masivo de precios por monto o porcentaje.
- [ ] Exportación del catálogo a CSV o Excel.
- [ ] Importación controlada desde CSV con vista previa de errores.
- [ ] Recordar la última combinación de filtros usada por el administrador.
- [ ] Permitir configurar el límite considerado como stock bajo.

Criterio de término: las operaciones frecuentes se realizan sin abrir individualmente cada producto.

## Fase 4 — Modelo de datos e historial

Prioridad: media-alta.

- [ ] Activar `timestamps` en productos para disponer de `createdAt` y `updatedAt`.
- [ ] Reemplazar la categoría guardada como texto por una referencia a `Categoria`.
- [ ] Evitar eliminar categorías que todavía tienen productos asociados.
- [ ] Agregar un historial de cambios de stock, precio, vigencia y categoría.
- [ ] Registrar motivo del ajuste de inventario.
- [ ] Incorporar borrado lógico para productos en vez de eliminarlos inmediatamente.
- [ ] Crear índices de MongoDB para código, estado, categoría y búsquedas frecuentes.
- [ ] Definir una migración para productos existentes antes de cambiar el esquema.

Criterio de término: cada cambio importante puede rastrearse y los datos mantienen integridad referencial.

## Fase 5 — Pedidos

Prioridad: media-alta.

Actualmente el carrito solo genera un mensaje de WhatsApp y no guarda el pedido.

- [ ] Crear modelos `Pedido` y `PedidoItem`.
- [ ] Guardar una copia del nombre, código, precio y cantidad al confirmar el pedido.
- [ ] Generar un número de pedido legible.
- [ ] Solicitar nombre y teléfono del cliente antes de enviar a WhatsApp.
- [ ] Mantener el envío por WhatsApp después de guardar el pedido.
- [ ] Crear la pantalla administrativa `/pedidos`.
- [ ] Incorporar estados: nuevo, confirmado, preparando, entregado y cancelado.
- [ ] Filtrar pedidos por fecha, estado, cliente y número.
- [ ] Mostrar totales de venta y productos solicitados.
- [ ] Descontar stock solo cuando el pedido sea confirmado.
- [ ] Evitar descontar dos veces el mismo pedido.
- [ ] Permitir restaurar stock al cancelar.

Criterio de término: cada pedido queda registrado y puede seguirse desde su creación hasta la entrega o cancelación.

## Fase 6 — Experiencia pública y consistencia de stock

Prioridad: media.

- [ ] Aplicar el filtro `cantidad > 0` también en categorías y búsqueda pública.
- [ ] Impedir agregar al carrito más unidades que el stock disponible.
- [ ] Actualizar precios y stock antes de confirmar un pedido.
- [ ] Mostrar un aviso cuando un producto del carrito ya no esté disponible.
- [ ] Mover el número de WhatsApp a una variable de entorno.
- [ ] Evitar construir contenido del carrito con `innerHTML` usando datos sin sanitizar.
- [ ] Mejorar mensajes para catálogos sin resultados.
- [ ] Añadir imágenes alternativas y estados de error de Cloudinary.

Criterio de término: el catálogo y el carrito muestran información consistente y no permiten pedir cantidades imposibles.

## Fase 7 — Pruebas, observabilidad y despliegue

Prioridad: media.

- [ ] Agregar pruebas unitarias para filtros, validaciones y cálculo de pedidos.
- [ ] Agregar pruebas de integración para rutas administrativas.
- [ ] Usar una base de datos aislada para pruebas.
- [ ] Incorporar lint y formateo automático.
- [ ] Crear un flujo de CI para ejecutar pruebas antes de desplegar.
- [ ] Mejorar el manejo de errores de MongoDB y Cloudinary.
- [ ] Iniciar el servidor HTTP solo después de conectar correctamente a MongoDB.
- [ ] Agregar una ruta de salud para el proveedor de hosting.
- [ ] Configurar logs estructurados sin exponer secretos.
- [ ] Documentar las variables de entorno en `.env.example`.
- [ ] Actualizar `README.md` y reemplazar la plantilla actual de `SECURITY.md`.

Criterio de término: cada cambio se valida automáticamente y los fallos de producción pueden diagnosticarse con rapidez.

## Orden recomendado

1. Seguridad del panel.
2. Validación de productos y corrección de eliminaciones.
3. Acciones rápidas y masivas.
4. Integridad de datos e historial.
5. Registro y seguimiento de pedidos.
6. Consistencia del catálogo público.
7. Pruebas, observabilidad y automatización del despliegue.

## Decisiones pendientes

- Definir cuántos administradores existirán y si necesitan roles diferentes.
- Decidir si el pedido debe reservar stock al crearse o descontarlo al confirmarse.
- Definir si los pedidos se pagarán fuera de la aplicación o requerirán integración de pagos.
- Acordar cuánto tiempo conservar el historial de cambios y pedidos.
- Definir el valor predeterminado de stock bajo; la primera versión usa 5 unidades.
