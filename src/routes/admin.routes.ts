import express from 'express';
import fs from 'fs';
import path from 'path';
import { spawn } from 'child_process';

import config from '../config';
import * as catalogo from '../services/catalogo.service';
import * as usuarios from '../services/usuarios.service';
import { requiereSesion, requiereRol } from '../middleware/auth';
import type { Usuario } from '../tipos';

const router = express.Router();

/**
 * Rutas del panel de administración.
 * Se requiere una sesión válida y rol administrador.
 */
router.use(requiereSesion);
router.use(requiereRol('admin'));

/** GET /api/admin/usuarios */
router.get('/usuarios', async (req, res, next) => {
  try {
    res.json({ usuarios: await usuarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * PUT /api/admin/usuarios/:id
 * Se verifica el permiso del usuario antes de modificar roles.
 */
router.put('/usuarios/:id', async (req, res, next) => {
  try {
    const { username, nombre, rol, password } = req.body || {};
    const cambios: Partial<Usuario> = {};

    if (username !== undefined) cambios.username = username;
    if (nombre !== undefined) cambios.nombre = nombre;

    if (rol !== undefined) {
      if (!req.usuario || req.usuario.rol !== 'admin') {
        return res.status(403).json({
          error: 'No tenés permisos para modificar roles.',
        });
      }

      cambios.rol = rol;
    }

    if (password !== undefined) cambios.password = password;

    const usuario = await usuarios.actualizar(req.params.id, cambios);

    if (!usuario) {
      return res.status(404).json({
        error: 'Usuario no encontrado.',
      });
    }

    res.json(usuario);
  } catch (err) {
    next(err);
  }
});

/** POST /api/admin/productos */
router.post('/productos', async (req, res, next) => {
  try {
    const producto = await catalogo.crear(req.body || {});
    res.status(201).json(producto);
  } catch (err) {
    if ((err as { code?: string }).code === '23505') {
      return res.status(409).json({
        error: 'Ya existe un producto con ese nombre.',
      });
    }

    next(err);
  }
});

/** PUT /api/admin/productos/:id */
router.put('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.actualizar(
      req.params.id,
      req.body || {}
    );

    if (!producto) {
      return res.status(404).json({
        error: 'Producto no encontrado.',
      });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/admin/productos/:id
 * Pendiente: protección CSRF.
 */
router.delete('/productos/:id', async (req, res, next) => {
  try {
    const producto = await catalogo.eliminar(req.params.id);

    if (!producto) {
      return res.status(404).json({
        error: 'Producto no encontrado.',
      });
    }

    res.json(producto);
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/admin/cambiar-contrasena
 * Pendiente: protección CSRF y seguridad de contraseñas.
 */
router.post('/cambiar-contrasena', async (req, res, next) => {
  try {
    const { nueva } = req.body || {};

    if (!nueva) {
      return res.status(400).json({
        error: 'Falta la contraseña nueva.',
      });
    }

    const usuario = await usuarios.cambiarPassword(
      req.usuario!.id,
      nueva
    );

    res.json({
      mensaje: 'Contraseña actualizada.',
      usuario,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * Lista blanca de hosts permitidos.
 * Limitada al entorno local de la práctica.
 */
const HOSTS_PERMITIDOS = new Set([
  'localhost',
  '127.0.0.1',
]);

/**
 * POST /api/admin/probar-conexion
 *
 * Corrección VUL-22:
 * Se valida el host y se ejecuta el proceso con argumentos
 * separados, sin utilizar un intérprete de comandos.
 */
router.post('/probar-conexion', (req, res) => {
  const { host } = req.body || {};

  if (
    typeof host !== 'string' ||
    !HOSTS_PERMITIDOS.has(host)
  ) {
    return res.status(400).json({
      error: 'Host no permitido.',
    });
  }

  const proceso = spawn('ping', ['-c', '3', host], {
    shell: false,
    timeout: 10000,
  });

  let salida = '';
  let error = '';

  proceso.stdout.on('data', (data) => {
    salida += data.toString();
  });

  proceso.stderr.on('data', (data) => {
    error += data.toString();
  });

  proceso.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({
        error: 'No se pudo comprobar la conexión.',
      });
    }
  });

  proceso.on('close', (codigo) => {
    if (!res.headersSent) {
      res.json({
        comando: `ping -c 3 ${host}`,
        salida,
        error: error || (
          codigo !== 0
            ? 'No se pudo establecer la conexión.'
            : null
        ),
      });
    }
  });
});

/**
 * POST /api/admin/subir-archivo
 *
 * Pendiente VUL-12:
 * Validar extensión, contenido, tamaño y nombre del archivo.
 */
router.post('/subir-archivo', express.json({ limit: '8mb' }), (req, res, next) => {
  try {
    const { nombre, contenidoBase64 } = req.body || {};

    if (!nombre || !contenidoBase64) {
      return res.status(400).json({
        error: 'Falta el archivo.',
      });
    }

    const buffer = Buffer.from(contenidoBase64, 'base64');

    fs.mkdirSync(config.uploadsDir, { recursive: true });

    const destino = path.join(config.uploadsDir, nombre);

    fs.writeFileSync(destino, buffer);

    res.json({
      mensaje: 'Archivo subido.',
      url: `/uploads/${nombre}`,
      bytes: buffer.length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;