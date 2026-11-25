# Integrante 2 — Login y autenticación

**Responsable:** _Completar_ · **Rama:** `fix/autenticacion`

Fallas corregidas: #1 (VUL-01), #11 (VUL-13), #12 (VUL-14), #17 (VUL-19) y #16 (VUL-18).
La #17 también corrige la parte de `auth.routes.ts` del XSS reflejado (#5, VUL-06).
VUL-27 (credenciales por defecto, opcional) no se aborda en esta rama.

Archivos modificados:

- `src/services/usuarios.service.ts`
- `src/inicializar.ts`
- `src/routes/auth.routes.ts`

> Las líneas de "Dónde está" son las del repo original; las de "Cómo se corrige" son
> las de la rama `fix/autenticacion`.

---

## #1 (VUL-01) — Inyección SQL en el login

### Qué es y por qué importa

Es una inyección SQL (OWASP A03:2021 — Inyección) en la consulta que verifica las
credenciales. Permite entrar al sistema sin conocer ninguna contraseña, incluso
como administrador. Es la falla más grave del login: abre la puerta a todo lo demás.

### Dónde está

`src/services/usuarios.service.ts:42`

```ts
const sql = `SELECT * FROM usuarios WHERE username = '${username}' AND password = '${password}'`;
const { rows } = await db.query<Usuario>(sql);
```

### Cómo se observa

Contra `http://localhost:8080/admin.html`:

1. Usuario `' OR 1=1 --`, contraseña `cualquiera` → entra.
2. Usuario `admin'--`, contraseña `cualquiera` → entra como `admin` sin su contraseña.

### Por qué ocurre

El usuario y la contraseña se **concatenan** al texto SQL. La `'` que abre la cadena
en el código se cierra con la `'` que escribe el atacante, y el resto de lo que
escribe pasa a ser SQL. Con `' OR 1=1 --` la condición queda siempre verdadera y
`--` comenta el chequeo de la contraseña; con `admin'--` se comenta directamente
el `AND password = ...`.

### Cómo se corrige

El usuario se busca con una **consulta parametrizada** (`$1`): el valor viaja
separado del SQL y el motor nunca lo interpreta como código. La contraseña se
compara contra el hash con `bcrypt.compare` (ver #11).

`src/services/usuarios.service.ts:48-56`

```ts
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  const usuario = await buscarPorUsername(username); // 'SELECT * FROM usuarios WHERE username = $1'
  if (!usuario) return null;

  const coincide = await bcrypt.compare(password, usuario.password);
  return coincide ? usuario : null;
}
```

### Cómo se verifica

- Tests (`seguridad-login.test.ts`): "el login NO acepta el bypass con payload SQL" y
  "el login NO acepta el payload que comenta la contraseña" → **aprobados**.
- `check:security`: SQLI-02 y AUTH-03 **en verde**. En la rama, SQLI-01 sigue en
  rojo solo por `catalogo`, `pedidos` y `reportes` (Integrante 1); el login ya no
  aparece en ese control.
- Manual, contra la API en `localhost:8080`:

```
POST /api/auth/login  {"username":"' OR 1=1 --","password":"x"}
→ 401 {"error":"Usuario o contraseña incorrectos."}

POST /api/auth/login  {"username":"admin'--","password":"x"}
→ 401 {"error":"Usuario o contraseña incorrectos."}

POST /api/auth/login  {"username":"admin","password":"admin"}
→ 200 {"mensaje":"¡Bienvenido, Administración!", ...}
```

### Reflexión

En un proyecto real no se debería armar SQL concatenando texto **nunca**, ni siquiera
"en una sola consulta". Usar siempre consultas parametrizadas o un ORM/query
builder, y tener una regla de lint o revisión de código que rechace SQL con
template strings.

---

## #11 (VUL-13) — Contraseñas en texto plano

### Qué es y por qué importa

Es almacenamiento inseguro de credenciales (OWASP A02:2021 — Fallas criptográficas).
Las contraseñas se guardan tal cual en la tabla `usuarios`. Si la base se filtra
(una inyección SQL como VUL-04, un backup, un dump), **todas las cuentas caen de
inmediato**. Además, como la gente reutiliza contraseñas, el daño sale del sistema.

### Dónde está

- `src/services/usuarios.service.ts:42` (comparación en texto plano dentro del SQL)
- `src/inicializar.ts:24-48` (la carga inicial inserta `usuario.password` sin hashear)
- `cambiarPassword()` en el mismo servicio también guardaba la nueva contraseña en claro.

### Cómo se observa

```bash
docker compose exec db psql -U postgres -d origen -c "SELECT username, password FROM usuarios;"
```

Se leen a simple vista: `admin | admin`, `valentina | origen2024`, …

### Por qué ocurre

El código nunca transforma la contraseña: se inserta y se compara el mismo texto
que escribe el usuario.

### Cómo se corrige

Se usa **bcrypt** (`bcryptjs`, ya instalado), que genera un salt distinto por
usuario y es lento a propósito (costo 12), lo que encarece la fuerza bruta offline.

1. Utilidades en `src/services/usuarios.service.ts:28-39`:

```ts
export const COSTO_BCRYPT = 12;

export function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

export function esHashBcrypt(valor: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(valor);
}
```

2. El login compara con `bcrypt.compare` (ver #1).

3. `cambiarPassword()` y `actualizar()` (cuando el cambio trae `password`) hashean
   antes de guardar, así una contraseña cambiada desde el panel tampoco queda en claro.

4. La carga inicial (`src/inicializar.ts:56-80`) inserta el hash y, además, **migra**
   las contraseñas que hayan quedado en texto plano de una base anterior (así no
   hace falta borrar el volumen de la base):

```ts
for (const usuario of USUARIOS_INICIALES) {
  const hash = await bcrypt.hash(usuario.password, COSTO_BCRYPT);
  await db.query(
    `INSERT INTO usuarios (username, password, rol, nombre)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (username) DO NOTHING`,
    [usuario.username, hash, usuario.rol, usuario.nombre]
  );
}

// Migración: las contraseñas en texto plano se reemplazan por su hash bcrypt.
const { rows: guardados } = await db.query<{ id: number; password: string }>(
  'SELECT id, password FROM usuarios'
);
for (const guardado of guardados) {
  if (typeof guardado.password === 'string' && !esHashBcrypt(guardado.password)) {
    await db.query('UPDATE usuarios SET password = $1 WHERE id = $2', [
      await bcrypt.hash(guardado.password, COSTO_BCRYPT),
      guardado.id,
    ]);
  }
}
```

Las contraseñas de prueba **no cambian** (solo se guardan hasheadas), para no romper
los tests.

### Cómo se verifica

- Test: "las contraseñas NO se guardan en texto plano" (`seguridad.test.ts`) → **aprobado**.
- `check:security`: AUTH-01, AUTH-02 y AUTH-03 **en verde**.
- Manual: la misma consulta de psql (se muestran los primeros 12 caracteres):

```
 username  |   password
-----------+--------------
 admin     | $2a$12$O8irT
 valentina | $2a$12$GjqCw
 barista   | $2a$12$Zm1Ro
 mozo      | $2a$12$osh9z
 cliente   | $2a$12$7jrN/
```

### Reflexión

Las contraseñas no se guardan, se guarda algo que permite **verificarlas**. En un
proyecto real hay que definir desde el primer día el algoritmo de hash (bcrypt,
argon2) y no tener nunca una columna de contraseñas en claro, ni "temporalmente".

---

## #12 (VUL-14) — Sin protección contra fuerza bruta

### Qué es y por qué importa

Es una falla de autenticación (OWASP A07:2021 — Fallas de identificación y
autenticación). El endpoint de login acepta intentos fallidos ilimitados, así que
un atacante puede probar contraseñas sin límite hasta acertar.

### Dónde está

`src/routes/auth.routes.ts:18`: `router.post('/login', ...)` sin ningún límite.

### Cómo se observa

En el panel, probar a mano unas pocas contraseñas para `admin` (`password`,
`123456`, …): no hay bloqueo, retardo ni aviso; todas responden 401.

### Por qué ocurre

No hay ningún middleware que cuente los intentos.

### Cómo se corrige

`express-rate-limit` (ya instalado) sobre `POST /api/auth/login`: como máximo
**5 intentos fallidos por IP cada 15 minutos**. Con `skipSuccessfulRequests: true`
los logins correctos no cuentan, así un usuario legítimo no se bloquea.

`src/routes/auth.routes.ts:16-23` y `:36`

```ts
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

router.post('/login', limiteLogin, async (req, res, next) => { /* ... */ });
```

### Cómo se verifica

- Tests (`seguridad-fuerza-bruta.test.ts`, aislado en su propio archivo porque el
  contador es en memoria): "el login bloquea o limita los intentos repetidos" y
  "el login correcto sigue funcionando después de un bloqueo" → **aprobados**.
- `check:security`: AUTH-04 **en verde**.
- Manual: después de 5 intentos fallidos, el siguiente responde:

```
→ 429 {"error":"Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos."}
```

El contador vive en la memoria del proceso: `docker compose restart app` lo reinicia.

### Reflexión

Todo endpoint que verifica un secreto (login, recuperación de contraseña, códigos)
tiene que tener límite de intentos desde el diseño. En producción conviene además
limitar por cuenta (no solo por IP) y usar un almacén compartido (por ejemplo
Redis) si hay más de una instancia del servidor.

---

## #17 (VUL-19) — Enumeración de usuarios

### Qué es y por qué importa

Es una falla de autenticación (OWASP A07:2021). El login responde distinto si el
usuario no existe o si la contraseña es incorrecta, así que un atacante puede
**saber qué cuentas existen** antes de atacarlas (y concentrar la fuerza bruta en
ellas).

En la misma línea, el mensaje devolvía el `username` recibido sin escapar: es la
parte del servidor del XSS reflejado (#5, VUL-06).

### Dónde está

`src/routes/auth.routes.ts:39` (y la rama de "La contraseña es incorrecta" justo arriba)

```ts
const existe = await usuarios.buscarPorUsername(username);
if (existe) {
  return res.status(401).json({ error: 'La contraseña es incorrecta.' });
}
return res.status(401).json({ error: `El usuario "${username}" no existe en el sistema.` });
```

### Cómo se observa

En el login: usuario `fantasma` → "El usuario "fantasma" no existe en el sistema.";
usuario `valentina` con contraseña incorrecta → "La contraseña es incorrecta.".

### Por qué ocurre

Ante un login fallido el código hace una consulta extra para saber si el usuario
existe y elige el mensaje según el resultado. Además arma el mensaje interpolando
la entrada del usuario.

### Cómo se corrige

Un único mensaje para cualquier login fallido, que tampoco refleja la entrada.

`src/routes/auth.routes.ts:9` y `:46-48`

```ts
const MENSAJE_LOGIN_FALLIDO = 'Usuario o contraseña incorrectos.';

if (!usuario) {
  return res.status(401).json({ error: MENSAJE_LOGIN_FALLIDO });
}
```

### Cómo se verifica

- Tests: "los mensajes de login son genéricos (sin enumeración de usuarios)"
  (`seguridad-login.test.ts`) y "el login NO devuelve HTML sin escapar en el
  mensaje de error" (`seguridad.test.ts`) → **aprobados**.
- `check:security`: AUTH-12 **en verde**.
- Manual:

```
POST /api/auth/login  {"username":"fantasma","password":"x"}
→ 401 {"error":"Usuario o contraseña incorrectos."}

POST /api/auth/login  {"username":"valentina","password":"mal"}
→ 401 {"error":"Usuario o contraseña incorrectos."}
```

### Reflexión

Los mensajes de error también son información para el atacante. En un proyecto
real hay que acordar mensajes genéricos para login, registro y recuperación de
contraseña, y no meter nunca la entrada del usuario dentro de un mensaje sin escaparla.

---

## #16 (VUL-18) — El logout no invalida la sesión en el servidor

### Qué es y por qué importa

Es una falla de gestión de sesiones (OWASP A07:2021). Al cerrar sesión solo se
borra la cookie del navegador: la sesión **sigue viva en el servidor**. Si la
cookie fue robada o copiada, "cerrar sesión" no sirve de nada: el atacante sigue
operando con ella.

### Dónde está

`src/routes/auth.routes.ts:69-72`

```ts
router.post('/logout', (req, res) => {
  res.clearCookie('sid', { path: '/' });   // sólo borra la cookie del cliente
  res.json({ mensaje: 'Sesión cerrada.' });
});
```

### Cómo se observa

1. Iniciar sesión en el panel y copiar el valor de la cookie `sid`
   (devtools → Application → Cookies).
2. Cerrar sesión.
3. Volver a crear la cookie `sid` con el valor copiado (devtools) y abrir
   `http://localhost:8080/api/auth/yo` → sigue devolviendo el usuario.

### Por qué ocurre

La función `destruirSesion()` existe en `src/middleware/sesion.ts` (y estaba
importada en `auth.routes.ts`), pero el logout nunca la llamaba: la entrada en el
`Map` de sesiones nunca se borraba.

### Cómo se corrige

`src/routes/auth.routes.ts:78-82`

```ts
router.post('/logout', (req, res) => {
  destruirSesion(req);                     // borra la sesión del almacén del servidor
  res.clearCookie('sid', { path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});
```

Regenerar el identificador después del login (#14, VUL-16) corresponde al
Integrante 3 (sesiones).

### Cómo se verifica

- Test: "el logout invalida la sesión en el servidor" (`seguridad.test.ts`) → **aprobado**.
- `check:security`: AUTH-11 **en verde**.
- Manual, usando siempre la misma cookie `sid`:

```
GET  /api/auth/yo      → 200 {"usuario":{"username":"barista", ...}}
POST /api/auth/logout  → 200 {"mensaje":"Sesión cerrada."}
GET  /api/auth/yo      → 401 {"error":"Necesitás iniciar sesión."}
```

### Reflexión

Cerrar sesión es una operación del **servidor**, no del navegador. En un proyecto
real conviene usar una librería de sesiones probada (que ya resuelve invalidación,
expiración y regeneración) en lugar de implementarlas a mano.

---

## Verificación de la rama

Ejecutado sobre `fix/autenticacion` con `docker compose up -d --build`.

| Comando | Resultado |
|---|---|
| `docker compose exec app npm test` | 28/28 aprobados |
| `docker compose exec app npm run test:seguridad` | 8/8 tests asignados al Integrante 2 aprobados. Los que fallan corresponden a otros integrantes (14/29 en total en la rama). |
| `docker compose exec app npm run check:security` | 7/7 controles asignados en verde: SQLI-02, AUTH-01, AUTH-02, AUTH-03, AUTH-04, AUTH-11 y AUTH-12. SQLI-01 sigue en rojo solo por `catalogo`, `pedidos` y `reportes` (Integrante 1). |
| `npx tsc --noEmit` | sin errores |

Tests de seguridad asignados:

| Test | Archivo | Resultado |
|---|---|---|
| el login NO acepta el bypass con payload SQL | `seguridad-login.test.ts` | aprobado |
| el login NO acepta el payload que comenta la contraseña | `seguridad-login.test.ts` | aprobado |
| los mensajes de login son genéricos (sin enumeración de usuarios) | `seguridad-login.test.ts` | aprobado |
| el login bloquea o limita los intentos repetidos | `seguridad-fuerza-bruta.test.ts` | aprobado |
| el login correcto sigue funcionando después de un bloqueo | `seguridad-fuerza-bruta.test.ts` | aprobado |
| las contraseñas NO se guardan en texto plano | `seguridad.test.ts` | aprobado |
| el logout invalida la sesión en el servidor | `seguridad.test.ts` | aprobado |
| el login NO devuelve HTML sin escapar en el mensaje de error | `seguridad.test.ts` | aprobado |
