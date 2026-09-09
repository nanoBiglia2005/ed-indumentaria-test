// Traduccion del estado de filtros/orden de Ventas e Historial (multi-filtro +
// multi-orden, resuelto en la base) a SQL. Mismo mecanismo que
// articulosConsulta.js: primero se sacan los `id_remito` de la pagina con
// WHERE/ORDER BY/LIMIT/OFFSET, despues se trae la fila completa con
// remitosInclude (ver routes/remitos.js). A diferencia de Articulos, esto NO
// alimenta un DataGrid: las filas siguen siendo RemitoCard, la barra de
// filtros/orden vive arriba de la lista (FiltrosVentasToolbar).
const { Prisma } = require('../generated/prisma/client');
const {
  contiene,
  rango,
  rangoFecha,
  parseEntero,
  parseFiltros,
  parseOrden,
} = require('./consultaSql');

const TAMANO_PAGINA_DEFECTO = 30;
const TAMANO_PAGINA_MAX = 200;

// Lista blanca de claves aceptadas en "filtros" (ver
// frontend/src/features/ventas/campos.ts, que declara las mismas claves).
const TIPOS_DE_FILTRO = {
  codigo: 'texto',
  cliente: 'texto',
  estado: 'seleccion',
  fecha_emision: 'fecha',
  fecha_creacion: 'fecha',
  total: 'rango',
};

// ============================================================
//  EXPRESIONES BASE (sobre el alias `r` de "REMITOS")
// ============================================================

// El codigo visible es "cod_mes-cod_remito_final" (ver RemitoCard.tsx). Ambos
// campos son NOT NULL en la practica: los pone el trigger trg_cod_remito_final
// ANTES de cada insert.
const TEXTO_CODIGO = Prisma.sql`(r.cod_mes::text || '-' || r.cod_remito_final::text)`;

// Nombre completo del cliente, por subquery (igual que nombreDeLinea/
// nombreDeGrupo en articulosConsulta.js): evita un JOIN en el FROM base.
const nombreDeCliente = Prisma.sql`
  (SELECT c.nombre || ' ' || COALESCE(c.apellido, '') FROM "CLIENTES" c WHERE c.id_cliente = r.id_cliente)`;
const TEXTO_CLIENTE = Prisma.sql`COALESCE(${nombreDeCliente}, 'No Asignado')`;

// Monto que muestra la card: el final si ya esta facturado, si no el de
// efectivo (ver RemitoCard.tsx: `remito.total_final ?? remito.total_efectivo`).
const MONTO = Prisma.sql`COALESCE(r.total_final, r.total_efectivo)`;

// ============================================================
//  FILTROS POR COLUMNA
// ============================================================

const TRADUCTORES = {
  codigo: (f) => contiene(TEXTO_CODIGO, f.valor),
  cliente: (f) => contiene(TEXTO_CLIENTE, f.valor),
  // Los 4 estados (constants/ventas.js) siempre existen: no hace falta el
  // manejo de "sin asignar" que tiene seleccionFk en articulos.
  estado: (f) =>
    f.ids.length === 0 ? Prisma.sql`FALSE` : Prisma.sql`r.id_estado IN (${Prisma.join(f.ids)})`,
  fecha_emision: (f) => rangoFecha(Prisma.sql`r.fecha_de_emision`, f),
  fecha_creacion: (f) => rangoFecha(Prisma.sql`r.fecha_de_creacion`, f),
  total: (f) => rango(MONTO, f),
};

// ============================================================
//  ORDEN
// ============================================================

const EXPRESIONES_ORDEN = {
  // Se ordena por el par NUMERICO, no por el texto concatenado: "10-2" no
  // puede quedar antes que "9-30" por orden alfabetico.
  codigo: [Prisma.sql`r.cod_mes`, Prisma.sql`r.cod_remito_final`],
  cliente: [TEXTO_CLIENTE],
  estado: [Prisma.sql`r.id_estado`],
  fecha_emision: [Prisma.sql`r.fecha_de_emision`],
  fecha_creacion: [Prisma.sql`r.fecha_de_creacion`],
  total: [MONTO],
};

// Desempate final: cierra con el id para que el orden sea TOTAL (sin esto, dos
// remitos empatados pueden repetirse o desaparecer entre paginas).
const DESEMPATE = Prisma.sql`r.id_remito DESC`;

const construirOrderBy = (orden) => {
  const partes = [];
  for (const { key, direccion } of orden) {
    const direccionSql = Prisma.raw(direccion === 'desc' ? 'DESC' : 'ASC');
    for (const expr of EXPRESIONES_ORDEN[key]) {
      partes.push(Prisma.sql`${expr} ${direccionSql} NULLS LAST`);
    }
  }
  partes.push(DESEMPATE);
  return Prisma.join(partes, ', ');
};

/**
 * WHERE completo. `estadoFijo` es la condicion de base que fija cada ruta
 * (excluir CONFIRMADO en el historial, exigirlo en pendientes) — no sale de la
 * query del usuario, igual que `soloVigentes`/`exigeCliente` en
 * articulosConsulta.js.
 */
const construirWhere = ({ estadoFijo, filtros }) => {
  const partes = [estadoFijo];
  for (const [key, filtro] of Object.entries(filtros)) {
    partes.push(TRADUCTORES[key](filtro));
  }
  return Prisma.join(partes, ' AND ');
};

/** Lee y valida los parametros de paginacion/filtro/orden de la consulta. */
const parsearConsultaRemitos = (query) => ({
  pagina: query.pagina === undefined ? 1 : parseEntero(query.pagina, 'La pagina debe ser un numero mayor a 0.'),
  tamano:
    query.tamano === undefined
      ? TAMANO_PAGINA_DEFECTO
      : Math.min(parseEntero(query.tamano, 'El tamaño de pagina debe ser un numero mayor a 0.'), TAMANO_PAGINA_MAX),
  filtros: parseFiltros(query.filtros, TIPOS_DE_FILTRO),
  orden: parseOrden(query.orden, EXPRESIONES_ORDEN),
});

module.exports = {
  TAMANO_PAGINA_DEFECTO,
  parsearConsultaRemitos,
  construirWhere,
  construirOrderBy,
};
