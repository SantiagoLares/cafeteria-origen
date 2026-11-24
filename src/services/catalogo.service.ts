import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import {
  TIPOS_PERMITIDOS,
  VARIEDADES_PERMITIDAS,
  esValorPermitido,
  parsearIdEntero,
} from '../validacion';
import type { DatosProducto, Producto, ProductoConPrecio } from '../tipos';

/** Filtros del menú, tal como llegan en la query string. */
export interface FiltrosCatalogo {
  tipo?: string;
  variedad?: string;
  q?: string;
}

/** Datos que manda el panel de administración al crear o editar. */
export type DatosProductoEntrada = Partial<DatosProducto> & { activo?: boolean };

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

/** Lista productos aplicando los filtros del menú de forma parametrizada. */
export async function listar(filtros: FiltrosCatalogo = {}): Promise<ProductoConPrecio[]> {
  const { tipo, variedad, q } = filtros;

  const condiciones: string[] = ['activo = true'];
  const valores: unknown[] = [];

  if (tipo) {
    if (!esValorPermitido(tipo, TIPOS_PERMITIDOS)) {
      return [];
    }
    valores.push(tipo);
    condiciones.push('tipo = $' + valores.length);
  }

  if (variedad) {
    if (!esValorPermitido(variedad, VARIEDADES_PERMITIDAS)) {
      return [];
    }
    valores.push(variedad);
    condiciones.push('variedad = $' + valores.length);
  }

  if (typeof q === 'string' && q.trim() !== '') {
    valores.push('%' + q.trim() + '%');
    const indice = valores.length;
    condiciones.push('(nombre ILIKE $' + indice + ' OR descripcion ILIKE $' + indice + ')');
  }

  const sql =
    'SELECT * FROM productos WHERE ' +
    condiciones.join(' AND ') +
    ' ORDER BY tipo, variedad NULLS FIRST, id';

  const { rows } = await db.query<Producto>(sql, valores);

  return rows.map((p) => ({ ...p, precio: calcularPrecio(p) }));
}

/** Obtiene un producto por id validando que sea un entero positivo. */
export async function obtener(id: Id): Promise<ProductoConPrecio | null> {
  const idValido = parsearIdEntero(id);
  if (idValido === null) return null;

  const { rows } = await db.query<Producto>(
    'SELECT * FROM productos WHERE id = $1',
    [idValido]
  );
  if (!rows[0]) return null;
  return { ...rows[0], precio: calcularPrecio(rows[0]) };
}

/** Crea un producto nuevo. */
export async function crear(datos: DatosProductoEntrada): Promise<Producto> {
  const { rows } = await db.query<Producto>(
    `INSERT INTO productos (nombre, tipo, variedad, tamano, gramos, precio_base, precio_por_gramo, descripcion)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
     RETURNING *`,
    [
      datos.nombre,
      datos.tipo,
      datos.variedad || null,
      datos.tamano || null,
      datos.gramos ?? null,
      datos.precio_base ?? 0,
      datos.precio_por_gramo ?? 0,
      datos.descripcion || '',
    ]
  );
  return rows[0];
}

/** Actualiza un producto. */
export async function actualizar(id: Id, datos: DatosProductoEntrada): Promise<Producto | null> {
  const idValido = parsearIdEntero(id);
  if (idValido === null) return null;

  const { rows } = await db.query<Producto>(
    `UPDATE productos
        SET nombre = $1, tipo = $2, variedad = $3, tamano = $4, gramos = $5,
            precio_base = $6, precio_por_gramo = $7, descripcion = $8, activo = $9
      WHERE id = $10
      RETURNING *`,
    [
      datos.nombre,
      datos.tipo,
      datos.variedad || null,
      datos.tamano || null,
      datos.gramos ?? null,
      datos.precio_base ?? 0,
      datos.precio_por_gramo ?? 0,
      datos.descripcion || '',
      datos.activo !== false,
      idValido,
    ]
  );
  return rows[0] || null;
}

/** Elimina (desactiva) un producto. */
export async function eliminar(id: Id): Promise<Producto | null> {
  const idValido = parsearIdEntero(id);
  if (idValido === null) return null;

  const { rows } = await db.query<Producto>(
    'UPDATE productos SET activo = false WHERE id = $1 RETURNING *',
    [idValido]
  );
  return rows[0] || null;
}

/** Lista las variedades disponibles en el catálogo. */
export async function variedades(): Promise<string[]> {
  const { rows } = await db.query<{ variedad: string }>(
    'SELECT DISTINCT variedad FROM productos WHERE variedad IS NOT NULL ORDER BY variedad'
  );
  return rows.map((r) => r.variedad);
}