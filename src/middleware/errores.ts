/**
 * Manejo de errores.
 *
 * Corrección:
 * - No se exponen mensajes internos del servidor.
 * - No se envían stack traces al cliente.
 * - Los detalles completos se registran en el servidor.
 * - Las respuestas de error utilizan mensajes controlados.
 */

import type { NextFunction, Request, Response } from 'express';

import type { ErrorHttp } from '../tipos';

export function rutaNoEncontrada(
  req: Request,
  res: Response,
): void {
  res.status(404).json({
    error: 'Ruta no encontrada.',
  });
}


export function manejadorErrores(
  err: ErrorHttp,
  req: Request,
  res: Response,
  next: NextFunction,
): void {
  
  console.error('[error]', err);

  const status =
    err.status && err.status >= 400 && err.status < 600
      ? err.status
      : 500;

  res.status(status).json({
    error:
      status >= 500
        ? 'Error interno del servidor.'
        : 'No se pudo procesar la solicitud.',
  });
}
