# TP4 – Redes y Seguridad

## Cafetería Origen – Integrante 4

### 1. Introducción

El trabajo asignado consistió en identificar y corregir cinco vulnerabilidades relacionadas con el panel de administración, la ejecución de comandos, la exposición de información sensible y la carga de archivos.

Se trabajó sobre la rama `fix/panel-admin`, utilizando Docker, PostgreSQL, Node.js y TypeScript.

Antes de realizar las modificaciones se ejecutaron los tests funcionales, los tests de seguridad y el checklist de seguridad para conocer el estado inicial del proyecto.

### 2. Vulnerabilidad #18 – Acceso no autorizado al panel administrativo (VUL-20)

**Archivo:** `src/routes/admin.routes.ts`

**Problema detectado:** Las rutas administrativas solamente verificaban que el usuario tuviera una sesión iniciada, pero no comprobaban su rol.

**Riesgo:** Un usuario sin permisos administrativos podía acceder a operaciones reservadas para administradores, como modificar o eliminar productos.

**Solución:** Se agregó el middleware `requiereRol('admin')` después de `requiereSesion`, protegiendo todas las rutas administrativas.

**Verificación:**

- Test de acceso administrativo sin rol autorizado: aprobado.
- Control AUTH-14: aprobado.

### 3. Vulnerabilidad #19 – Escalada de privilegios (VUL-21)

**Archivo:** `src/routes/admin.routes.ts`

**Problema detectado:** El endpoint de actualización de usuarios permitía modificar el campo `rol` sin verificar los permisos correspondientes.

**Riesgo:** Un usuario común podía modificar su propio rol y obtener privilegios administrativos.

**Solución:** Se restringió el acceso a las rutas administrativas y se agregó una comprobación explícita del rol antes de permitir su modificación. Si el usuario no es administrador, se devuelve una respuesta HTTP 403.

**Verificación:**

- Test de escalada de privilegios: aprobado.
- Control AUTH-15: aprobado.

### 4. Vulnerabilidad #21 – Exposición de información sensible (VUL-23)

**Archivo:** `src/routes/debug.routes.ts`

**Problema detectado:** El endpoint de diagnóstico exponía variables de entorno e información relacionada con la configuración interna del servidor y la base de datos.

**Riesgo:** Una persona sin autorización podía obtener información sensible del sistema.

**Solución:** Se agregaron los middlewares de autenticación y autorización administrativa. Además, se eliminaron las variables de entorno, las credenciales y los datos internos de la respuesta, dejando únicamente información general del diagnóstico.

**Verificación:**

- Solicitud sin autenticación a `/api/_diagnostico`: HTTP 401 Unauthorized.
- Test de seguridad correspondiente: aprobado.
- Controles CFG-03 y CFG-04: aprobados.

### 5. Vulnerabilidad #20 – Inyección de comandos (VUL-22)

**Archivo:** `src/routes/admin.routes.ts`

**Problema detectado:** El endpoint `/api/admin/probar-conexion` concatenaba directamente el host recibido del usuario dentro de un comando ejecutado mediante `exec`.

**Riesgo:** Una entrada maliciosa podía provocar la ejecución de comandos no autorizados dentro del servidor.

**Solución:** Se reemplazó `exec` por `spawn`, utilizando argumentos separados y deshabilitando el intérprete de comandos mediante `shell: false`.

También se implementó una lista blanca que permite únicamente `localhost` y `127.0.0.1`, junto con un tiempo máximo de ejecución de 10 segundos.

La lista blanca se limitó al entorno local utilizado durante el trabajo práctico.

**Verificación:**

- Test de prevención de inyección de comandos: aprobado.
- Test de prevención de ejecución de comandos encadenados: aprobado.
- Controles CMD-01, CMD-02 y CMD-03: aprobados.
- Comprobación manual desde la interfaz web: realizada.

### 6. Vulnerabilidad #10 – Subida de archivos sin restricciones (VUL-12)

**Archivo:** `src/routes/admin.routes.ts`

**Problema detectado:** El endpoint de subida de archivos no validaba la extensión, el contenido, el tamaño ni el nombre del archivo recibido.

**Riesgo:** Era posible almacenar archivos peligrosos o intentar escribir fuera del directorio de subidas mediante path traversal.

**Solución:** Se implementaron las siguientes medidas:

- Lista blanca de extensiones PNG, JPG y JPEG.
- Validación del formato Base64.
- Comprobación de firmas binarias.
- Límite máximo de 512 KB por archivo.
- Rechazo de nombres que contienen rutas o secuencias peligrosas.
- Generación de nombres aleatorios mediante `randomUUID`.
- Escritura exclusiva para evitar sobrescribir archivos existentes.

El límite de 512 KB se estableció teniendo en cuenta el límite global de 1 MB para las solicitudes JSON.

**Verificación:**

- Test de rechazo de archivos ejecutables y escritura fuera de uploads: aprobado.
- Controles VAL-04 y VAL-05: aprobados.
- Comprobación manual desde la interfaz web: realizada.

Como mejora futura, se recomienda utilizar una biblioteca especializada para decodificar y recodificar completamente las imágenes y evaluar su almacenamiento fuera del directorio servido públicamente.

### 7. Resultados obtenidos

| Indicador | Estado inicial | Estado final |
|---|---:|---:|
| Tests funcionales aprobados | 28/28 | 28/28 |
| Tests de seguridad globales aprobados | 1/29 | 7/29 |
| Tests de seguridad asignados aprobados | 0/6 | 6/6 |
| Controles de seguridad asignados aprobados | 0/9 | 9/9 |
| Vulnerabilidades asignadas corregidas | 0/5 | 5/5 |

Además, se verificó la compilación de TypeScript mediante `npx tsc --noEmit`, sin obtener errores.

Los 22 tests de seguridad globales que permanecen pendientes deben verificarse nuevamente después de integrar el trabajo de los demás integrantes.

### 8. Comandos de verificación

- `docker compose up -d --build`
- `docker compose restart app`
- `docker compose exec app npm test`
- `docker compose exec app npm run test:seguridad`
- `docker