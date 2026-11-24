import express from 'express';
import { requiereSesion, requiereRol } from '../middleware/auth';

const router = express.Router();

router.use(requiereSesion);
router.use(requiereRol('admin'));

router.get('/', (req, res) => {
  res.json({
    mensaje: 'Diagnóstico del servidor',
    version: '1.0.0',
    estado: 'ok',
  });
});

export default router;