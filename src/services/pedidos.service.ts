import * as db from '../db';
import { calcularPrecio } from '../catalogo';
import {
  ESTADOS_PERMITIDOS,
  crearErrorHttp,
  esValorPermitido,
  parsearIdEntero,
  validarEnteroEnRango,
  validarIdEntero,
  validarTexto,
} from '../validacion';
import type { Pedido, PedidoConItems, PedidoItem, Producto } from '../tipos';

/** Un renglón del pedido, tal como llega en el cuerpo de la petición. */
export interface ItemPedido {
  productoId: number;
  cantidad: number;
}

/** Pedido nuevo, tal como llega en el cuerpo de la petición. */
export interface NuevoPedido {
  mesa: string;
  cliente: string;
  items: ItemPedido[];
}

/** Id tal como llega en la URL (texto) o ya convertido. */
type Id = number | string;

/**
 * Crea un pedido a partir de una lista de items { productoId, cantidad }.
 * Total = suma de calcularPrecio(producto) x cantidad
 */
const MAX_ITEMS_PEDIDO = 50;
const MAX_CANTIDAD_ITEM = 100;

export async function crear({ mesa, cliente, items }: NuevoPedido): Promise<PedidoConItems | null> {
  const mesaValida = validarTexto(mesa, 'mesa', 1, 10);
  const clienteValido = validarTexto(cliente, 'cliente', 2, 40);

  if (!Array.isArray(items) || items.length === 0) {
    throw crearErrorHttp('El pedido debe incluir al menos un producto.', 400);
  }
  if (items.length > MAX_ITEMS_PEDIDO) {
    throw crearErrorHttp(`El pedido no puede superar los ${MAX_ITEMS_PEDIDO} productos.`, 400);
  }

  const filas: { productoId: number; cantidad: number; precioUnitario: number }[] = [];

  for (const item of items) {
    if (!item || typeof item !== 'object') {
      throw crearErrorHttp('Cada ítem del pedido debe ser un objeto válido.', 400);
    }

    const productoId = validarIdEntero(item.productoId, 'productoId');
    const cantidad = validarEnteroEnRango(item.cantidad, 'cantidad', 1, MAX_CANTIDAD_ITEM);

    const producto = await buscarProducto(productoId);
    if (!producto) {
      throw crearErrorHttp('El producto indicado no existe.', 404);
    }

    const precioUnitario = calcularPrecio(producto);
    filas.push({
      productoId: producto.id,
      cantidad,
      precioUnitario,
    });
  }

  const total = filas.reduce(
    (acc, f) => acc + f.precioUnitario * f.cantidad,
    0
  );

  const { rows } = await db.query<Pedido>(
    `INSERT INTO pedidos (mesa, cliente, estado, total)
     VALUES ($1, $2, 'abierto', $3)
     RETURNING *`,
    [mesaValida, clienteValido, total]
  );
  const pedido = rows[0];

  for (const fila of filas) {
    await db.query(
      `INSERT INTO pedido_items (pedido_id, producto_id, cantidad, precio_unitario)
       VALUES ($1, $2, $3, $4)`,
      [pedido.id, fila.productoId, fila.cantidad, fila.precioUnitario]
    );
  }

  return obtenerConItems(pedido.id);
}

/** Busca un producto activo por id (helper interno). */
async function buscarProducto(productoId: number): Promise<Producto | null> {
  const { rows } = await db.query<Producto>(
    'SELECT * FROM productos WHERE id = $1 AND activo = true',
    [productoId]
  );
  return rows[0] || null;
}

/** Lista pedidos (con filtro opcional por mesa, parametrizado). */
export async function listar(mesa?: string): Promise<Pedido[]> {
  if (typeof mesa === 'string' && mesa.trim() !== '') {
    const { rows } = await db.query<Pedido>(
      'SELECT * FROM pedidos WHERE mesa = $1 ORDER BY id DESC',
      [mesa.trim()]
    );
    return rows;
  }

  const { rows } = await db.query<Pedido>('SELECT * FROM pedidos ORDER BY id DESC');
  return rows;
}

/** Devuelve un pedido con sus items. */
export async function obtenerConItems(id: Id): Promise<PedidoConItems | null> {
  const idValido = parsearIdEntero(id);
  if (idValido === null) return null;

  const { rows: pedidos } = await db.query<Pedido>(
    'SELECT * FROM pedidos WHERE id = $1',
    [idValido]
  );
  const pedido = pedidos[0];
  if (!pedido) return null;

  const { rows: items } = await db.query<PedidoItem>(
    `SELECT pi.*, pr.nombre AS producto_nombre
       FROM pedido_items pi
       JOIN productos pr ON pr.id = pi.producto_id
      WHERE pi.pedido_id = $1`,
    [idValido]
  );

  return { ...pedido, items };
}

/** Cambia el estado de un pedido validando el valor contra la lista blanca. */
export async function cambiarEstado(id: Id, estado: string): Promise<Pedido | null> {
  const idValido = parsearIdEntero(id);
  if (idValido === null) return null;

  if (!esValorPermitido(estado, ESTADOS_PERMITIDOS)) {
    throw crearErrorHttp('Estado de pedido no permitido.', 400);
  }

  const { rows } = await db.query<Pedido>(
    'UPDATE pedidos SET estado = $1 WHERE id = $2 RETURNING *',
    [estado, idValido]
  );
  return rows[0] || null;
}