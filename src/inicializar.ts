import * as db from './db';
import { CATALOGO } from './catalogo';
import bcrypt from 'bcryptjs';
import { COSTO_BCRYPT, esHashBcrypt } from './services/usuarios.service';
import type { Rol } from './tipos';

interface UsuarioInicial {
  username: string;
  password: string;
  rol: Rol;
  nombre: string;
}

/**
 * Carga los datos iniciales (usuarios y catálogo) si la base está vacía.
 *
 * CORREGIDO — Almacenamiento de credenciales (Integrante 2):
 * las contraseñas se guardan hasheadas con bcrypt (salt por usuario).
 * Si la base ya existía con contraseñas en texto plano, la carga inicial
 * las reemplaza por su hash (migración), sin cambiar la contraseña en sí.
 */

export const USUARIOS_INICIALES: UsuarioInicial[] = [
  {
    username: 'admin',
    password: 'admin',
    rol: 'admin',
    nombre: 'Administración',
  },
  {
    username: 'valentina',
    password: 'origen2024',
    rol: 'admin',
    nombre: 'Valentina',
  },
  {
    username: 'barista',
    password: 'cafe123',
    rol: 'barista',
    nombre: 'Barista',
  },
  {
    username: 'mozo',
    password: 'mozo123',
    rol: 'mozo',
    nombre: 'Mozo de sala',
  },
  {
    username: 'cliente',
    password: 'cliente',
    rol: 'cliente',
    nombre: 'Cliente',
  },
];

export async function inicializarBase(): Promise<void> {
  // --- Usuarios -------------------------------------------------------------
  for (const usuario of USUARIOS_INICIALES) {
    const hash = await bcrypt.hash(usuario.password, COSTO_BCRYPT);
    await db.query(
      `INSERT INTO usuarios (username, password, rol, nombre)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (username) DO NOTHING`,
      [usuario.username, hash, usuario.rol, usuario.nombre]
    );
  }

  // Migración: las contraseñas que hayan quedado en texto plano de una
  // versión anterior se reemplazan por su hash bcrypt.
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

  // --- Catálogo -------------------------------------------------------------
  for (const producto of CATALOGO) {
    await db.query(
      `INSERT INTO productos
         (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (nombre) DO NOTHING`,
      [
        producto.nombre,
        producto.tipo,
        producto.variedad,
        producto.tamano,
        producto.gramos,
        producto.precio_base,
        producto.precio_por_gramo,
        producto.descripcion,
      ]
    );
  }
}
