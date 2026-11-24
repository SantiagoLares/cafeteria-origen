import path from 'path';
import { randomBytes } from 'crypto';

function exigirEnv(nombre: string): string {
  const valor = process.env[nombre];
  if (!valor) {
    throw new Error(`Falta la variable de entorno obligatoria: ${nombre}`);
  }
  return valor;
}

const nodeEnv = process.env.NODE_ENV || 'development';

export default {
  port: Number(process.env.PORT || 3000),
  nodeEnv,

  db: {
    host: process.env.DB_HOST || 'db',
    port: Number(process.env.DB_PORT || 5432),
    database: process.env.DB_NAME || 'origen',
    user: exigirEnv('DB_USER'),
    password: exigirEnv('DB_PASSWORD'),
  },

  sessionSecret:
    process.env.SESSION_SECRET ||
    (nodeEnv === 'production'
      ? exigirEnv('SESSION_SECRET')
      : randomBytes(32).toString('hex')),

  uploadsDir: process.env.UPLOADS_DIR || path.join(__dirname, '..', 'uploads'),
};