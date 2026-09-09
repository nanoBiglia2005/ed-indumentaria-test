// Helpers SQL y de parseo genericos para los modulos *Consulta.js
// (articulosConsulta.js, remitosConsulta.js): traducen un filtro de columna
// del frontend (components/tabla/tipos.ts) a un fragmento de Prisma.sql, y
// parsean/validan la query cruda de la request contra la lista blanca de cada
// modulo. Todo se compone con Prisma.sql, asi que los valores del usuario
// viajan SIEMPRE como parametros.
const { Prisma } = require('../generated/prisma/client');
const { HttpError } = require('./http');

const SIEMPRE = Prisma.sql`TRUE`;
const NUNCA = Prisma.sql`FALSE`;

// Espejo de SIN_ASIGNAR_ID de frontend/src/components/tabla/tipos.ts.
const SIN_ASIGNAR_ID = -1;

/**
 * Seleccion sobre una FK nullable: los ids elegidos, mas la condicion de "Sin
 * asignar" cuando esa opcion (id -1) esta tildada. Sin ningun id no pasa
 * ninguna fila.
 *
 * `idFicticio` dice si el -1 es SOLO la opcion "Sin asignar" (no existe una fila
 * real con ese id) o si ademas es un id real que hay que dejar en el IN (ver
 * el caso de "grupos" en articulosConsulta.js, donde -1 tambien es el id del
 * grupo real "No Asignado").
 */
const seleccionFk = (columna, ids, sinAsignar, { idFicticio = true } = {}) => {
  const reales = idFicticio ? ids.filter((id) => id !== SIN_ASIGNAR_ID) : ids;
  const partes = [];
  if (reales.length > 0) partes.push(Prisma.sql`${columna} IN (${Prisma.join(reales)})`);
  if (ids.includes(SIN_ASIGNAR_ID)) partes.push(sinAsignar);
  return partes.length === 0 ? NUNCA : Prisma.sql`(${Prisma.join(partes, ' OR ')})`;
};

// Espejo de normalizarBusqueda() de frontend/src/utils/texto.tsx: minusculas y
// sin espacios, para que "camisa roja" encuentre "CamisaRoja".
const normalizar = (texto) => texto.toLowerCase().replace(/\s+/g, '');
const normalizarSql = (expr) => Prisma.sql`regexp_replace(lower(${expr}), '[[:space:]]', '', 'g')`;

// El termino del usuario es literal: % y _ se escapan para que no funcionen
// como comodines de LIKE (String.includes() tampoco los interpreta).
const patronLike = (termino) => `%${normalizar(termino).replace(/([\\%_])/g, '\\$1')}%`;

const contiene = (expr, termino) =>
  Prisma.sql`${normalizarSql(expr)} LIKE ${patronLike(termino)} ESCAPE '\\'`;

// Rango sobre una expresion numerica: los dos extremos son opcionales.
const rango = (expr, { desde, hasta }) => {
  const partes = [];
  if (desde !== null) partes.push(Prisma.sql`${expr} >= ${desde}::numeric`);
  if (hasta !== null) partes.push(Prisma.sql`${expr} <= ${hasta}::numeric`);
  return partes.length === 0 ? SIEMPRE : Prisma.sql`(${Prisma.join(partes, ' AND ')})`;
};

// Rango sobre una expresion de fecha: mismo patron que rango(), pero
// comparando como ::date en vez de ::numeric. `desde`/`hasta` son strings ISO
// (yyyy-mm-dd), como los entrega <input type="date">.
const rangoFecha = (expr, { desde, hasta }) => {
  const partes = [];
  if (desde !== null) partes.push(Prisma.sql`${expr} >= ${desde}::date`);
  if (hasta !== null) partes.push(Prisma.sql`${expr} <= ${hasta}::date`);
  return partes.length === 0 ? SIEMPRE : Prisma.sql`(${Prisma.join(partes, ' AND ')})`;
};

// ============================================================
//  PARSEO GENERICO DE LA QUERY
// ============================================================
// Comun a cualquier tabla paginada en la base: la forma de "filtros" y
// "orden" en la query string es siempre la misma (ver
// components/tabla/tipos.ts), lo unico que cambia por modulo es la lista
// blanca de claves aceptadas (TIPOS_DE_FILTRO / EXPRESIONES_ORDEN).

const error400 = (message) => new HttpError(400, { message });

const parseEntero = (valor, mensaje, { minimo = 1 } = {}) => {
  const numero = Number(valor);
  if (!Number.isInteger(numero) || numero < minimo) throw error400(mensaje);
  return numero;
};

const parseListaDeIds = (valor, mensaje) => {
  if (!Array.isArray(valor) || valor.some((id) => !Number.isInteger(id))) throw error400(mensaje);
  return valor;
};

const parseNumeroONulo = (valor, mensaje) => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'number' || !Number.isFinite(valor)) throw error400(mensaje);
  return valor;
};

// Fecha ISO (yyyy-mm-dd), como la entrega <input type="date">.
const parseFechaONula = (valor, mensaje) => {
  if (valor === null || valor === undefined) return null;
  if (typeof valor !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(valor)) throw error400(mensaje);
  return valor;
};

/**
 * Parsea y valida el JSON de "filtros" contra una lista blanca
 * {filtroKey: tipo}. El shape de cada filtro (texto/rango/seleccion/fecha) es
 * siempre el mismo objeto Record<filtroKey, FiltroColumna> que mantiene
 * useTablaServidor en el frontend.
 */
const parseFiltros = (valor, tiposDeFiltro) => {
  if (valor === undefined || valor === '') return {};

  let crudo;
  try {
    crudo = JSON.parse(valor);
  } catch {
    throw error400('El parametro "filtros" debe ser un JSON valido.');
  }
  if (crudo === null || typeof crudo !== 'object' || Array.isArray(crudo)) {
    throw error400('El parametro "filtros" debe ser un objeto.');
  }

  const filtros = {};
  for (const [key, filtro] of Object.entries(crudo)) {
    const tipoEsperado = tiposDeFiltro[key];
    if (!tipoEsperado) throw error400(`El filtro "${key}" no existe.`);
    if (filtro === null || typeof filtro !== 'object' || filtro.tipo !== tipoEsperado) {
      throw error400(`El filtro "${key}" debe ser de tipo "${tipoEsperado}".`);
    }

    if (tipoEsperado === 'texto') {
      if (typeof filtro.valor !== 'string') throw error400(`El filtro "${key}" debe traer un texto.`);
      const valorTexto = filtro.valor.trim();
      if (valorTexto === '') continue;
      filtros[key] = { tipo: 'texto', valor: valorTexto };
    } else if (tipoEsperado === 'rango') {
      const desde = parseNumeroONulo(filtro.desde, `El filtro "${key}" debe traer numeros.`);
      const hasta = parseNumeroONulo(filtro.hasta, `El filtro "${key}" debe traer numeros.`);
      if (desde === null && hasta === null) continue;
      filtros[key] = { tipo: 'rango', desde, hasta };
    } else if (tipoEsperado === 'fecha') {
      const desde = parseFechaONula(filtro.desde, `El filtro "${key}" debe traer fechas (yyyy-mm-dd).`);
      const hasta = parseFechaONula(filtro.hasta, `El filtro "${key}" debe traer fechas (yyyy-mm-dd).`);
      if (desde === null && hasta === null) continue;
      filtros[key] = { tipo: 'fecha', desde, hasta };
    } else {
      filtros[key] = {
        tipo: 'seleccion',
        ids: parseListaDeIds(filtro.ids, `El filtro "${key}" debe traer una lista de ids.`),
      };
    }
  }
  return filtros;
};

// El orden viaja compacto: "codigo:asc,precio:desc", en orden de prioridad.
const parseOrden = (valor, expresionesOrden) => {
  if (valor === undefined || valor === '') return [];

  return valor.split(',').map((criterio) => {
    const [key, direccion] = criterio.split(':');
    if (!expresionesOrden[key]) throw error400(`No se puede ordenar por "${key}".`);
    if (direccion !== 'asc' && direccion !== 'desc') {
      throw error400(`La direccion de orden de "${key}" debe ser "asc" o "desc".`);
    }
    return { key, direccion };
  });
};

module.exports = {
  SIEMPRE,
  NUNCA,
  SIN_ASIGNAR_ID,
  normalizar,
  contiene,
  rango,
  rangoFecha,
  seleccionFk,
  error400,
  parseEntero,
  parseListaDeIds,
  parseNumeroONulo,
  parseFechaONula,
  parseFiltros,
  parseOrden,
};
