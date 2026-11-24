# Manual de Uso para el Personal — Panel PONGA

Este manual explica cómo usar el panel web de **PONGA** para administrar el establecimiento y controlar la música. No se requieren conocimientos técnicos.

---

## 1. Cómo ingresar al panel

1. Abre el navegador web (Chrome, Edge o Firefox) e ingresa a la dirección del panel (en pruebas locales: `http://localhost:3000/admin`).
2. Escribe tu **Usuario** y tu **Clave** entregados por el establecimiento.
3. Haz clic en **Entrar al panel**.
   - Si eres **Administrador**, verás todas las pestañas de configuración y también el control del DJ.
   - Si eres **DJ / operador**, irás directamente al **Control DJ** para manejar la música y consultar la cola.

---

## 2. Cómo consultar el estado de una sesión

1. En la parte superior derecha verás tres indicadores de colores:
   - **Sesión activa / cerrada:** indica si los clientes pueden entrar y pedir canciones.
   - **QR activo / inactivo:** indica si el código QR está habilitado en este momento.
   - **Dispositivos activos:** muestra cuántos celulares están conectados en el local.
2. En la pestaña **Resumen** puedes ver de un vistazo la canción que está sonando, el horario actual (Abierto/Cerrado) y la lista predeterminada.

---

## 3. Cómo activar y desactivar el código QR

1. Ve a la pestaña **Sesiones y QR** (o usa el botón rápido en **Resumen**).
2. Busca la sesión correspondiente.
3. Haz clic en **Activar QR** para permitir que los clientes escaneen el código desde su aplicación móvil, o en **Desactivar QR** para bloquear nuevos ingresos temporalmente.
   - *Nota:* El QR siempre abre la aplicación móvil del cliente. Si la sesión está cerrada, primero debes activarla.

---

## 4. Cómo configurar los horarios

1. Ve a la pestaña **Horarios y Pausa**.
2. En la tabla **Horario semanal**, marca la casilla **Activo** de los días en que abre el establecimiento y escribe la hora de **Apertura** y **Cierre** (si cierras después de medianoche, por ejemplo `18:00` a `02:00`, el sistema lo entiende automáticamente).
3. Haz clic en **Guardar horarios**.
4. Si hay un festivo o un cierre especial, usa **Agregar excepción** indicando la fecha, si estará cerrado o en horario especial, y el motivo.
5. Activa el botón **Activar modo automático** y elige la sesión principal: el sistema abrirá y cerrará la sesión y el QR automáticamente según el horario.

---

## 5. Cómo realizar una pausa manual

Si necesitas detener temporalmente la entrada de clientes por un anuncio o evento aunque el horario siga abierto:
1. Ve a **Horarios y Pausa**.
2. Escribe un motivo opcional (por ejemplo: *"Show en vivo"*).
3. Haz clic en **Pausa manual del QR**.
4. Cuando quieras volver a recibir solicitudes, haz clic en **Reanudar QR**.

---

## 6. Cómo realizar el mantenimiento de la cola

Al terminar una jornada o antes de empezar una nueva:
1. Ve a la pestaña **Mantenimiento**.
2. Haz clic en **Limpiar cola pendiente** (o **Limpiar cola y reiniciar lista**).
3. Esto retira las canciones que quedaron en espera para que no aparezcan en la siguiente sesión, **sin borrar el historial** de canciones reproducidas ni las estadísticas.

---

## 7. Cómo controlar la reproducción (DJ)

1. Ve a la pestaña **Control DJ**.
2. Verás el reproductor de video, la canción que está sonando y a la derecha la **Cola de solicitudes** ordenada por votos.
3. Usa los botones debajo del reproductor:
   - **Iniciar:** comienza a sonar la primera canción de la cola (o de la lista predeterminada si no hay pedidos).
   - **Pausar / Reanudar:** detiene o continúa la reproducción actual.
   - **Terminó / Siguiente:** pasa a la siguiente canción cuando la actual finaliza (también ocurre automáticamente al terminar el video).
   - **Reportar error:** si un video no carga o falla, márcalo con este botón para registrar el fallo y pasar inmediatamente a la siguiente canción.

---

## 8. Cómo saltar una canción

1. En **Control DJ**, haz clic en el botón **Saltar**.
2. La canción actual se detiene, queda registrada como saltada (no suma para los turnos de votación de los clientes) y comienza la siguiente canción disponible.

---

## 9. Cómo bloquear temporalmente una canción

Si una canción es inapropiada o no debe sonar durante la noche:
1. Ve a la pestaña **Bloqueos**.
2. Escribe el identificador de YouTube de la canción (11 caracteres), el **Motivo** y los **Minutos** que durará el bloqueo.
3. Haz clic en **Bloquear**. Si estaba en la cola de espera, se retirará automáticamente.
4. Para habilitarla antes de tiempo, haz clic en **Permitir de nuevo**.

---

## 10. Cómo administrar las listas predeterminadas

1. Ve a la pestaña **Listas por defecto**.
2. Escribe un nombre y haz clic en **Crear lista**.
3. Haz clic en **Abrir** sobre la lista para agregar canciones (con su ID de YouTube), quitar canciones o subirlas de orden con el botón **↑**.
4. Haz clic en **Usar por defecto** para que sea la lista de respaldo del local.
5. Si quieres que el sistema rote automáticamente entre tus listas activas al terminar una, activa **Rotación: ON**.

---

## 11. Cómo funciona la continuidad musical automática

- Cuando hay canciones pedidas por los clientes, **siempre tienen prioridad** y suenan primero según sus votos.
- Si la cola de pedidos queda vacía, el sistema toma automáticamente la siguiente canción de la **lista predeterminada** para que la música nunca se detenga.
- En cuanto un cliente vuelva a pedir una canción, esa solicitud vuelve a tener prioridad al terminar la canción que estaba sonando.
