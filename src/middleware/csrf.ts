/**
 * Protección anti-CSRF (Integrante 3) — patrón "double-submit cookie".
 *
 * El servidor entrega un token aleatorio de dos formas a la vez: en una cookie
 * `csrf` y en el JSON de GET /api/csrf-token. Toda petición que cambia estado
 * (POST, PUT, PATCH, DELETE) tiene que devolver ese mismo token en el cuerpo
 * (`_csrf`), en la cabecera `X-CSRF-Token` o en la URL (`?_csrf=`).
 *
 * Una página ajena puede hacer que el navegador mande la cookie, pero no puede
 * leer el token, así que no puede incluirlo en la petición.
 */
import { randomBytes, timingSafeEqual } from 'crypto';
import type { NextFunction, Request, Response } from 'express';

import config from '../config';
import { leerCookies } from './sesion';

const COOKIE_CSRF = 'csrf';
const METODOS_SEGUROS = new Set(['GET', 'HEAD', 'OPTIONS']);

// El login no exige token: los tests de seguridad inician sesión sin él y el
// riesgo de "login CSRF" es bajo.
const RUTAS_EXENTAS = new Set(['/api/auth/login']);

/** Entrega el token (reusa el de la cookie si ya hay uno, para varias pestañas). */
export function emitirToken(req: Request, res: Response): string {
    const actual = leerCookies(req)[COOKIE_CSRF];
    const token =
        actual && /^[a-f0-9]{64}$/.test(actual) ? actual : randomBytes(32).toString('hex');

    res.cookie(COOKIE_CSRF, token, {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: 'lax',
        path: '/',
    });
    return token;
}

/** Compara en tiempo constante (evita ataques por tiempo de respuesta). */
function iguales(a: string, b: string): boolean {
    const ba = Buffer.from(a);
    const bb = Buffer.from(b);
    return ba.length === bb.length && timingSafeEqual(ba, bb);
}

/** Rechaza (403) toda petición que cambia estado sin un token CSRF válido. */
export function verificarCsrf(req: Request, res: Response, next: NextFunction) {
    if (METODOS_SEGUROS.has(req.method)) return next();
    if (RUTAS_EXENTAS.has(req.originalUrl.split('?')[0])) return next();

    const cookie = leerCookies(req)[COOKIE_CSRF];
    const enviado = req.body?._csrf ?? req.headers['x-csrf-token'] ?? req.query._csrf;

    if (!cookie || typeof enviado !== 'string' || !iguales(cookie, enviado)) {
        return res.status(403).json({ error: 'Token CSRF inválido o ausente.' });
    }
    next();
}