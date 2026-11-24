import express from 'express';
import rateLimit from 'express-rate-limit';
import * as usuarios from '../services/usuarios.service';
import { crearSesion, destruirSesion, obtenerSesion } from '../middleware/sesion';

const router = express.Router();

/** Mensaje único para cualquier login fallido (evita la enumeración de usuarios). */
const MENSAJE_LOGIN_FALLIDO = 'Usuario o contraseña incorrectos.';

/**
 * Protección contra fuerza bruta: como máximo 5 intentos FALLIDOS por IP cada
 * 15 minutos. Los logins correctos no cuentan (skipSuccessfulRequests), así
 * un usuario legítimo no se bloquea por entrar varias veces.
 */
const limiteLogin = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  skipSuccessfulRequests: true,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Demasiados intentos de inicio de sesión. Probá de nuevo en unos minutos.' },
});

/**
 * Inicio de sesión.
 *
 * CORREGIDO (Integrante 2):
 *  - Credenciales verificadas con consulta parametrizada + bcrypt (usuarios.service).
 *  - Mensaje de error genérico: no distingue "usuario inexistente" de
 *    "contraseña incorrecta" y no refleja la entrada del usuario.
 *  - Rate limiting sobre el endpoint (limiteLogin).
 *
 * Pendiente (Integrante 3): regenerar el identificador de sesión tras el login.
 */
router.post('/login', limiteLogin, async (req, res, next) => {
  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return res.status(400).json({ error: 'Falta usuario o contraseña.' });
    }

    const usuario = await usuarios.autenticar(username, password);

    if (!usuario) {
      return res.status(401).json({ error: MENSAJE_LOGIN_FALLIDO });
    }

    crearSesion(req, res, {
      id: usuario.id,
      username: usuario.username,
      rol: usuario.rol,
      nombre: usuario.nombre,
    });

    res.json({
      mensaje: `¡Bienvenido, ${usuario.nombre}!`,
      usuario: {
        id: usuario.id,
        username: usuario.username,
        rol: usuario.rol,
        nombre: usuario.nombre,
      },
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Cierre de sesión.
 *
 * CORREGIDO (Integrante 2): la sesión se borra del almacén del servidor
 * (destruirSesion) además de borrar la cookie del navegador. Así una cookie
 * copiada o robada deja de servir después del logout.
 */
router.post('/logout', (req, res) => {
  destruirSesion(req);
  res.clearCookie('sid', { path: '/' });
  res.json({ mensaje: 'Sesión cerrada.' });
});

/** Devuelve el usuario de la sesión actual. */
router.get('/yo', (req, res) => {
  const sesion = obtenerSesion(req);
  if (!sesion) {
    return res.status(401).json({ error: 'Necesitás iniciar sesión.' });
  }
  res.json({ usuario: sesion.usuario });
});

export default router;
