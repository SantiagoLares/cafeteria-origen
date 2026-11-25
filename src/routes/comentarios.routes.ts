import express from 'express';
import * as comentarios from '../services/comentarios.service';

const router = express.Router();

const MAX_LONGITUD_RESEÑA = 1000;

router.get('/', async (req, res, next) => {
  try {
    res.json({ comentarios: await comentarios.listar() });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/comentarios
 *
 * FALLAS: sin token anti-CSRF, sin validación de longitud/rango y sin
 * sanitización (XSS almacenado).
 */
router.post('/', async (req, res, next) => {
  try {
    const { autor, texto, calificacion } = req.body || {};

  if (typeof texto !== 'string' || texto.length > MAX_LONGITUD_RESEÑA) {
  return res.status(400).json({
    error: 'La reseña supera la longitud máxima permitida.',
  });

  }

  const comentario = await comentarios.crear({
    autor,
    texto,
    calificacion,
  });
    res.status(201).json(comentario);
  } catch (err) {
    next(err);
  }
});

/** DELETE /api/comentarios/:id */
router.delete('/:id', async (req, res, next) => {
  try {
    // FALLA: sin verificación de rol — cualquiera puede borrar reseñas.
    const comentario = await comentarios.eliminar(req.params.id);
    if (!comentario) {
      return res.status(404).json({ error: 'Comentario no encontrado.' });
    }
    res.json(comentario);
  } catch (err) {
    next(err);
  }
});

export default router;
