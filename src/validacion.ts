import type { ErrorHttp, TipoProducto, Variedad } from './tipos';

export const TIPOS_PERMITIDOS: readonly TipoProducto[] = [
  'espresso',
  'filtrado',
  'pasteleria',
];

export const VARIEDADES_PERMITIDAS: readonly Variedad[] = [
  'Brasil',
  'Colombia',
  'Etiopía',
];

export const ESTADOS_PERMITIDOS = [
  'abierto',
  'preparando',
  'listo',
  'entregado',
] as const;

export type EstadoPedido = (typeof ESTADOS_PERMITIDOS)[number];

export function crearErrorHttp(mensaje: string, status = 400): ErrorHttp {
  const err: ErrorHttp = new Error(mensaje);
  err.status = status;
  return err;
}

/**
 * Convierte un id (número o string numérico como llega desde req.params o data-id)
 * en un entero positivo. Devuelve null si no es válido.
 */
export function parsearIdEntero(valor: unknown): number | null {
  if (typeof valor === 'number') {
    return Number.isInteger(valor) && valor > 0 ? valor : null;
  }
  if (typeof valor === 'string' && /^\d+$/.test(valor.trim())) {
    const numero = Number(valor.trim());
    return Number.isSafeInteger(numero) && numero > 0 ? numero : null;
  }
  return null;
}

export function validarIdEntero(valor: unknown, campo = 'id'): number {
  const numero = parsearIdEntero(valor);
  if (numero === null) {
    throw crearErrorHttp(`El campo ${campo} debe ser un entero positivo.`, 400);
  }
  return numero;
}

export function validarEnteroEnRango(
  valor: unknown,
  campo: string,
  min: number,
  max: number
): number {
  if (typeof valor !== 'number' || !Number.isInteger(valor)) {
    throw crearErrorHttp(`El campo ${campo} debe ser un número entero.`, 400);
  }
  if (valor < min || valor > max) {
    throw crearErrorHttp(`El campo ${campo} debe estar entre ${min} y ${max}.`, 400);
  }
  return valor;
}

export function validarTexto(
  valor: unknown,
  campo: string,
  min: number,
  max: number
): string {
  if (typeof valor !== 'string') {
    throw crearErrorHttp(`El campo ${campo} debe ser texto.`, 400);
  }
  const limpio = valor.trim();
  if (limpio.length < min || limpio.length > max) {
    throw crearErrorHttp(
      `El campo ${campo} debe tener entre ${min} y ${max} caracteres.`,
      400
    );
  }
  return limpio;
}

export function esValorPermitido<T extends string>(
  valor: unknown,
  listaBlanca: readonly T[]
): valor is T {
  return (
    typeof valor === 'string' &&
    (listaBlanca as readonly string[]).includes(valor)
  );
}