/**
 * Gestión de sesiones.
 *
 * CORREGIDO (Integrante 3):
 *  - #14: el id de sesión es aleatorio (crypto.randomBytes) y se regenera en
 *    cada login (la sesión vieja de la petición se destruye).
 *  - #13: la cookie lleva HttpOnly, SameSite=Lax y Secure (en producción).
 *  - #15: las sesiones vencen por inactividad (30 min) y de forma absoluta (8 h).
 */

import { randomBytes } from 'crypto';
import type { Request, Response } from 'express';

import config from '../config';
import type { Sesion, UsuarioSesion } from '../tipos';

/** Vence si pasan 30 minutos sin usar la sesión (se renueva en cada uso). */
const TTL_INACTIVIDAD_MS = 30 * 60 * 1000;
/** Vence 8 horas después del login, aunque se use sin parar. */
const TTL_ABSOLUTO_MS = 8 * 60 * 60 * 1000;

export const sesiones = new Map<string, Sesion>();

/** Lee las cookies de la petición (parser mínimo, sin dependencias). */
export function leerCookies(req: Request): Record<string, string> {
  const cookies: Record<string, string> = {};
  const header = req.headers.cookie;
  if (!header) return cookies;
  for (const parte of header.split(';')) {
    const separador = parte.indexOf('=');
    if (separador < 0) continue;
    const nombre = parte.slice(0, separador).trim();
    const valor = parte.slice(separador + 1).trim();
    if (nombre) cookies[nombre] = decodeURIComponent(valor);
  }
  return cookies;
}

/** Crea una sesión nueva para el usuario y setea la cookie. */
export function crearSesion(req: Request, res: Response, usuario: UsuarioSesion): string {
  // Regenerar el id: si la petición traía una sesión vieja, deja de valer
  // (evita la fijación de sesión).
  destruirSesion(req);

  // Id aleatorio de 256 bits: no se puede adivinar.
  const id = randomBytes(32).toString('hex');

  const ahora = Date.now();
  sesiones.set(id, {
    usuario,
    creadaEn: ahora,
    expiraEn: ahora + TTL_INACTIVIDAD_MS,
  });

  res.cookie('sid', id, {
    httpOnly: true, // JavaScript no puede leerla (protege del robo por XSS)
    secure: config.nodeEnv === 'production', // solo HTTPS en producción
    sameSite: 'lax', // no se envía en POST desde otros sitios
    path: '/',
    maxAge: TTL_ABSOLUTO_MS,
  });

  return id;
}

/** Devuelve la sesión de la petición, si existe y no venció. */
export function obtenerSesion(req: Request): Sesion | null {
  const id = leerCookies(req).sid;
  if (!id) return null;

  const sesion = sesiones.get(id);
  if (!sesion) return null;

  const ahora = Date.now();
  if (ahora > sesion.expiraEn || ahora - sesion.creadaEn > TTL_ABSOLUTO_MS) {
    sesiones.delete(id); // vencida: se borra también del servidor
    return null;
  }

  sesion.expiraEn = ahora + TTL_INACTIVIDAD_MS; // renueva la inactividad
  return sesion;
}

/** Cierra la sesión en el servidor (se llama en el logout). */
export function destruirSesion(req: Request): void {
  const id = leerCookies(req).sid;
  if (id) sesiones.delete(id);
}
