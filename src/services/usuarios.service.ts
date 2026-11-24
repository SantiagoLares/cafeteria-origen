import bcrypt from 'bcryptjs';
import * as db from '../db';
import type { Usuario } from '../tipos';

/**
 * Servicio de usuarios.
 *
 * -----------------------------------------------------------------------------
 * CORREGIDO — Inyección SQL y almacenamiento de contraseñas (Integrante 2)
 * -----------------------------------------------------------------------------
 * - El login busca al usuario con una consulta parametrizada ($1): la entrada
 *   viaja como dato y nunca se interpreta como SQL.
 * - Las contraseñas se guardan hasheadas con bcrypt (salt por usuario) y se
 *   comparan con bcrypt.compare. Nunca se guarda ni se compara el texto plano.
 * - El mensaje genérico de error y el rate limiting están en auth.routes.ts.
 * -----------------------------------------------------------------------------
 */

/** Busca un usuario por nombre de usuario exacto (query parametrizada). */
export async function buscarPorUsername(username: string): Promise<Usuario | null> {
  const { rows } = await db.query<Usuario>(
    'SELECT * FROM usuarios WHERE username = $1',
    [username]
  );
  return rows[0] || null;
}

/** Costo de bcrypt (cantidad de rondas = 2^COSTO_BCRYPT). */
export const COSTO_BCRYPT = 12;

/** Devuelve el hash bcrypt (con salt propio) de una contraseña. */
export function hashearPassword(password: string): Promise<string> {
  return bcrypt.hash(password, COSTO_BCRYPT);
}

/** Indica si un valor guardado ya es un hash bcrypt ($2a$ / $2b$ / $2y$). */
export function esHashBcrypt(valor: string): boolean {
  return /^\$2[aby]\$\d{2}\$/.test(valor);
}

/**
 * Autentica a un usuario comparando usuario y contraseña.
 * Devuelve el usuario o null.
 *
 * Corrección: el usuario se busca con una consulta parametrizada ($1) y la
 * contraseña se compara contra el hash guardado con bcrypt.compare.
 */
export async function autenticar(username: string, password: string): Promise<Usuario | null> {
  if (typeof username !== 'string' || typeof password !== 'string') return null;

  const usuario = await buscarPorUsername(username);
  if (!usuario) return null;

  const coincide = await bcrypt.compare(password, usuario.password);
  return coincide ? usuario : null;
}

/** Lista todos los usuarios (para el panel de administración). */
export async function listar(): Promise<Usuario[]> {
  const { rows } = await db.query<Usuario>('SELECT * FROM usuarios ORDER BY id');
  return rows;
}

/**
 * Actualiza un usuario.
 * FALLA — Asignación masiva / escalada de privilegios: se actualiza el rol
 * sin verificar que quien llama tenga permiso para hacerlo.
 */
export async function actualizar(id: number | string, cambios: Partial<Usuario>): Promise<Usuario | null> {
  const campos: string[] = [];
  const valores: unknown[] = [];
  let i = 1;
  for (const [campo, valor] of Object.entries(cambios)) {
    campos.push(`${campo} = $${i}`);
    valores.push(valor);
    i += 1;
  }
  if (campos.length === 0) return null;
  // La contraseña nunca se guarda en texto plano: se hashea antes del UPDATE.
  const posPassword = Object.keys(cambios).indexOf('password');
  if (posPassword >= 0) {
    valores[posPassword] = await hashearPassword(String(valores[posPassword]));
  }
  valores.push(id);
  const { rows } = await db.query<Usuario>(
    `UPDATE usuarios SET ${campos.join(', ')} WHERE id = $${i} RETURNING *`,
    valores
  );
  return rows[0] || null;
}

/** Cambia la contraseña de un usuario (se guarda hasheada con bcrypt). */
export async function cambiarPassword(id: number, nuevaPassword: string): Promise<Usuario | null> {
  const hash = await hashearPassword(nuevaPassword);
  const { rows } = await db.query<Usuario>(
    'UPDATE usuarios SET password = $1 WHERE id = $2 RETURNING *',
    [hash, id]
  );
  return rows[0] || null;
}
