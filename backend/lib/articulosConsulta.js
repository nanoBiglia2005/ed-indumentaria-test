// Traduccion del estado de la tabla de articulos (filtros de pagina, busqueda
// global, filtros por columna y multi-orden) a SQL.
//
// Por que SQL crudo y no la API tipada de Prisma: la tabla filtra y ordena por
// el TEXTO QUE MUESTRA cada columna, no por el campo crudo. Eso implica cosas
// que `where`/`orderBy` no pueden expresar:
//   - el codigo de barras es una concatenacion condicional y se ordena por su
//     valor NUMERICO (los tails miden entre 1 y 5 digitos, asi que el orden
//     alfabetico no sirve);
//   - la busqueda ignora mayusculas Y espacios ("camisa roja" = "CamisaRoja");
//   - los nulos se muestran como "Sin Detalle", "No Asignado", etc., y se
//     filtran/ordenan por ese texto.
//
// Todo se compone con Prisma.sql, asi que los valores del usuario viajan SIEMPRE
// como parametros. Lo unico que se interpola como SQL literal (Prisma.raw) son
// palabras validadas contra una lista blanca (ASC/DESC).
const { Prisma } = require('../generated/prisma/client');
const { parseIdOpcional } = require('./validaciones');
const { IDS_GRUPOS_DE_CLIENTES } = require('../constants/agrupaciones');
const {
  SIEMPRE,
  NUNCA,
  SIN_ASIGNAR_ID,
  contiene,
  rango,
  seleccionFk,
  error400,
  parseEntero,
  parseFiltros,
  parseOrden,
} = require('./consultaSql');

const TAMANO_PAGINA_DEFECTO = 30;
const TAMANO_PAGINA_MAX = 200;

// Tipo de filtro de cada columna, en el mismo orden que columnas.tsx. Es la
// lista blanca de claves aceptadas: cualquier otra es un 400.
const TIPOS_DE_FILTRO = {
  codigo: 'texto',
  colegios: 'seleccion',
  linea: 'seleccion',
  grupos: 'seleccion',
  subgrupos: 'seleccion',
  detalle: 'texto',
  nombre: 'texto',
  talle: 'texto',
  cant: 'rango',
  precio: 'rango',
  cant_reservada: 'rango',
  stock_minimo: 'rango',
  vigente: 'seleccion',
};

// ============================================================
//  EXPRESIONES BASE (sobre el alias `a` de "ARTICULOS")
// ============================================================
// Los modelos no tienen @@map, asi que en SQL crudo las tablas van
// entrecomilladas para conservar las mayusculas.

// Espejo exacto de codigoBarcodeCompleto() de frontend/src/utils/barcode.ts.
// NULLIF(...,'') replica la "truthiness" de JS sobre el string vacio.
const CODIGO = Prisma.sql`NULLIF(a.barcode_tail, '')`;

// Texto que muestra cada columna, con el literal que la tabla usa cuando el
// campo esta vacio (ver los render() de features/articulos/columnas.tsx).
const TEXTO_CODIGO = Prisma.sql`COALESCE(${CODIGO}, 'No Asignado')`;
const TEXTO_DETALLE = Prisma.sql`COALESCE(a.detalle, 'Sin Detalle')`;
const TEXTO_NOMBRE = Prisma.sql`COALESCE(a.descripcion, 'Sin Nombre')`;
const TEXTO_TALLE = Prisma.sql`COALESCE(a.talle, 'Sin Talle')`;
const TEXTO_VIGENTE = Prisma.sql`CASE WHEN a.vigente THEN 'Vigente' ELSE 'No Vigente' END`;

const nombreDeLinea = Prisma.sql`(SELECT l.nombre_linea FROM "LINEAS" l WHERE l.id_linea = a.id_linea)`;
const nombreDeSubgrupo = Prisma.sql`(SELECT s.nombre_subgrupo FROM "SUBGRUPOS_DE_VENTA" s WHERE s.id_subgrupo = a.id_subgrupo)`;
// Los grupos de Colegios/Clubes no se listan en GET /api/grupos, asi que la
// tabla los muestra como "Sin Grupo": aca quedan como NULL para que filtren y
// ordenen igual que un grupo ausente.
const nombreDeGrupo = Prisma.sql`
  (SELECT g.nombre_grupo FROM "GRUPOS_DE_VENTA" g
    WHERE g.id_grupo = a.id_grupo AND a.id_grupo NOT IN (${Prisma.join(IDS_GRUPOS_DE_CLIENTES)}))`;

const TEXTO_LINEA = Prisma.sql`COALESCE(${nombreDeLinea}, 'Sin Línea')`;
const TEXTO_GRUPO = Prisma.sql`COALESCE(${nombreDeGrupo}, 'Sin Grupo')`;
const TEXTO_SUBGRUPO = Prisma.sql`COALESCE(${nombreDeSubgrupo}, 'Sin Subgrupo')`;

// ============================================================
//  BUSQUEDA DE TEXTO
// ============================================================
// normalizar/contiene (regexp_replace + LIKE escapado) viven en consultaSql.js,
// compartidos con remitosConsulta.js.

// La busqueda global recorre las columnas de texto: codigo, los tres campos
// libres, la vigencia y los nombres de las relaciones. No incluye las columnas
// numericas (Cantidad, Precio, C. Reservada, C. Minima).
const condicionBusqueda = (termino) =>
  Prisma.sql`(
    ${contiene(TEXTO_CODIGO, termino)}
    OR ${contiene(TEXTO_DETALLE, termino)}
    OR ${contiene(TEXTO_NOMBRE, termino)}
    OR ${contiene(TEXTO_TALLE, termino)}
    OR ${contiene(TEXTO_VIGENTE, termino)}
    OR ${contiene(TEXTO_LINEA, termino)}
    OR ${contiene(TEXTO_GRUPO, termino)}
    OR ${contiene(TEXTO_SUBGRUPO, termino)}
    OR EXISTS (
      SELECT 1 FROM "ARTICULOS_X_CLIENTE" ax
        JOIN "CLIENTES_MAYORISTAS" c ON c.id_cliente = ax.id_cliente
        WHERE ax.id_articulo = a.id_articulo AND ${contiene(Prisma.sql`c.nombre`, termino)}
    )
  )`;

// ============================================================
//  FILTROS POR COLUMNA
// ============================================================

// SIEMPRE/NUNCA/rango/seleccionFk/SIN_ASIGNAR_ID viven en consultaSql.js,
// compartidos con remitosConsulta.js.

const existeCliente = (condicion) =>
  Prisma.sql`EXISTS (SELECT 1 FROM "ARTICULOS_X_CLIENTE" ax WHERE ax.id_articulo = a.id_articulo AND ${condicion})`;

// "Todos los colegios" / "todos los clubes": el articulo es de ALGUN cliente de
// esa agrupacion. La agrupacion de un cliente es su grupo de venta exclusivo.
const clienteDeAgrupacion = (idAgrupacion) => Prisma.sql`
  EXISTS (SELECT 1 FROM "CLIENTES_MAYORISTAS" c
    WHERE c.id_cliente = ax.id_cliente AND c.grupo_venta_exclusivo = ${idAgrupacion})`;

// Una entrada por filtroKey de features/articulos/columnas.tsx.
const TRADUCTORES = {
  codigo: (f) => contiene(TEXTO_CODIGO, f.valor),
  detalle: (f) => contiene(TEXTO_DETALLE, f.valor),
  nombre: (f) => contiene(TEXTO_NOMBRE, f.valor),
  talle: (f) => contiene(TEXTO_TALLE, f.valor),

  cant: (f) => rango(Prisma.sql`a.cant`, f),
  precio: (f) => rango(Prisma.sql`a.precio`, f),
  stock_minimo: (f) => rango(Prisma.sql`a.stock_minimo`, f),
  // La columna trata el nulo como 0 (ver columnas.tsx).
  cant_reservada: (f) => rango(Prisma.sql`COALESCE(a.cant_reservada, 0)`, f),

  linea: (f) => seleccionFk(Prisma.sql`a.id_linea`, f.ids, Prisma.sql`a.id_linea IS NULL`),
  subgrupos: (f) => seleccionFk(Prisma.sql`a.id_subgrupo`, f.ids, Prisma.sql`a.id_subgrupo IS NULL`),
  // Unica columna donde el -1 NO es solo el id ficticio de "Sin asignar":
  // ID_GRUPO_NO_ASIGNADO tambien vale -1, o sea que es el id del grupo real
  // "No Asignado", que la tabla lista como una opcion mas. Por eso va
  // idFicticio: false — si se descartara el -1 del IN, tildar "No Asignado" no
  // traeria ninguno de sus articulos.
  // Ademas, "Sin Grupo" en la tabla son los grupos de Colegios/Clubes (los
  // unicos que no vienen en GET /api/grupos), asi que tildar esa opcion trae
  // las dos cosas, igual que el motor en memoria.
  grupos: (f) =>
    seleccionFk(
      Prisma.sql`a.id_grupo`,
      f.ids,
      Prisma.sql`a.id_grupo IN (${Prisma.join(IDS_GRUPOS_DE_CLIENTES)})`,
      { idFicticio: false }
    ),

  colegios: (f) => {
    const reales = f.ids.filter((id) => id !== SIN_ASIGNAR_ID);
    const partes = [];
    if (reales.length > 0) {
      partes.push(existeCliente(Prisma.sql`ax.id_cliente IN (${Prisma.join(reales)})`));
    }
    if (f.ids.includes(SIN_ASIGNAR_ID)) {
      partes.push(Prisma.sql`NOT ${existeCliente(SIEMPRE)}`);
    }
    return partes.length === 0 ? NUNCA : Prisma.sql`(${Prisma.join(partes, ' OR ')})`;
  },

  // La columna es Boolean? y el render trata NULL como "No Vigente".
  vigente: (f) => {
    const partes = [];
    if (f.ids.includes(1)) partes.push(Prisma.sql`a.vigente IS TRUE`);
    if (f.ids.includes(0)) partes.push(Prisma.sql`(a.vigente IS FALSE OR a.vigente IS NULL)`);
    return partes.length === 0 ? NUNCA : Prisma.sql`(${Prisma.join(partes, ' OR ')})`;
  },
};

// ============================================================
//  ORDEN
// ============================================================

// Expresion por la que ordena cada columna. Replica valorOrdenable() del motor:
// las columnas con ordenValor propio usan ese valor, las de seleccion el nombre
// de la opcion, y el resto el texto que muestran.
const EXPRESIONES_ORDEN = {
  // El codigo se guarda como string pero es un numero: 100 tiene que quedar
  // despues de 20. Los codigos no numericos (hoy no hay ninguno) caen a NULL en
  // el primer criterio y desempatan por el texto en el segundo.
  codigo: [Prisma.sql`CASE WHEN ${CODIGO} ~ '^[0-9]+$' THEN (${CODIGO})::numeric END`, CODIGO],
  colegios: [
    Prisma.sql`(SELECT min(c.nombre) FROM "ARTICULOS_X_CLIENTE" ax
       JOIN "CLIENTES_MAYORISTAS" c ON c.id_cliente = ax.id_cliente
       WHERE ax.id_articulo = a.id_articulo)`,
  ],
  linea: [nombreDeLinea],
  grupos: [nombreDeGrupo],
  subgrupos: [nombreDeSubgrupo],
  detalle: [TEXTO_DETALLE],
  nombre: [TEXTO_NOMBRE],
  talle: [TEXTO_TALLE],
  cant: [Prisma.sql`a.cant`],
  precio: [Prisma.sql`a.precio`],
  cant_reservada: [Prisma.sql`COALESCE(a.cant_reservada, 0)`],
  stock_minimo: [Prisma.sql`a.stock_minimo`],
  vigente: [TEXTO_VIGENTE],
};

// Desempate final: replica desempateTalle de ArticulosPage (los talles vacios
// primero, por el `?? ''`) y cierra con el id para que el orden sea TOTAL. Sin
// el id, dos filas equivalentes pueden repetirse o desaparecer entre paginas.
const DESEMPATE = Prisma.sql`COALESCE(a.talle, '') ASC, a.id_articulo ASC`;

/**
 * ORDER BY completo a partir de los criterios apilados en los headers.
 * Los vacios van siempre al final, en asc y en desc, igual que el motor.
 */
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
 * WHERE completo. `excluirFiltro` omite el filtro de una columna: es lo que
 * necesita el calculo de opciones de un filtro de seleccion, que se hace sobre
 * las filas que pasan todos los DEMAS filtros.
 */
const construirWhere = (consulta, { excluirFiltro = null } = {}) => {
  const { busqueda, idGrupo, idSubgrupo, idCliente, idAgrupacion, idLinea, filtros } = consulta;
  // Los tres ultimos NO salen de la query: los fija la ruta. El recorrido de
  // venta solo vende articulos vigentes, de algun colegio o club, y sin los que
  // ya estan en el carrito; la tabla de Articulos no los usa y quedan apagados.
  const { soloVigentes = false, exigeCliente = false, excluirIds = [] } = consulta;
  const partes = [];

  if (idGrupo !== null) partes.push(Prisma.sql`a.id_grupo = ${idGrupo}`);
  // El subgrupo solo filtra si hay un grupo elegido (igual que ArticulosPage).
  if (idGrupo !== null && idSubgrupo !== null) partes.push(Prisma.sql`a.id_subgrupo = ${idSubgrupo}`);
  if (idLinea !== null) partes.push(Prisma.sql`a.id_linea = ${idLinea}`);

  // Los tres son el mismo filtro con distinto alcance, de mas a menos acotado:
  // un colegio/club puntual, una agrupacion entera, o cualquiera.
  if (idCliente !== null) partes.push(existeCliente(Prisma.sql`ax.id_cliente = ${idCliente}`));
  else if (idAgrupacion !== null) partes.push(existeCliente(clienteDeAgrupacion(idAgrupacion)));
  // Sin nada elegido pero exigiendo cliente: "Todos los colegios y clubes" trae
  // lo que sea de ALGUNO, no el stock que no esta asociado a ninguno.
  else if (exigeCliente) partes.push(existeCliente(SIEMPRE));

  if (soloVigentes) partes.push(Prisma.sql`a.vigente IS TRUE`);
  if (excluirIds.length > 0) {
    partes.push(Prisma.sql`a.id_articulo NOT IN (${Prisma.join(excluirIds)})`);
  }
  if (busqueda !== '') partes.push(condicionBusqueda(busqueda));

  for (const [key, filtro] of Object.entries(filtros)) {
    if (key === excluirFiltro) continue;
    partes.push(TRADUCTORES[key](filtro));
  }

  return partes.length === 0 ? SIEMPRE : Prisma.join(partes, ' AND ');
};

// ============================================================
//  PARSEO DE LA QUERY
// ============================================================

// error400/parseEntero/parseFiltros/parseOrden viven en consultaSql.js,
// compartidos con remitosConsulta.js: el shape de "filtros"/"orden" en la
// query string es el mismo para cualquier tabla paginada en la base, lo unico
// que cambia por modulo es la lista blanca (TIPOS_DE_FILTRO/EXPRESIONES_ORDEN).

/** Lee y valida todos los parametros de la consulta de articulos. */
const parsearConsultaArticulos = (query) => ({
  pagina: query.pagina === undefined ? 1 : parseEntero(query.pagina, 'La pagina debe ser un numero mayor a 0.'),
  tamano:
    query.tamano === undefined
      ? TAMANO_PAGINA_DEFECTO
      : Math.min(parseEntero(query.tamano, 'El tamaño de pagina debe ser un numero mayor a 0.'), TAMANO_PAGINA_MAX),
  busqueda: typeof query.busqueda === 'string' ? query.busqueda.trim() : '',
  idGrupo: parseIdOpcional(query.id_grupo, 'El id del grupo debe ser un numero.'),
  idSubgrupo: parseIdOpcional(query.id_subgrupo, 'El id del subgrupo debe ser un numero.'),
  idCliente: parseIdOpcional(query.id_cliente, 'El id del cliente debe ser un numero.'),
  // Solo la usa el recorrido de venta ("todos los colegios" / "todos los
  // clubes"); si viaja junto con id_cliente, el cliente puntual manda.
  idAgrupacion: parseIdOpcional(query.id_agrupacion, 'El id de la agrupación debe ser un numero.'),
  idLinea: parseIdOpcional(query.id_linea, 'El id de la linea debe ser un numero.'),
  filtros: parseFiltros(query.filtros, TIPOS_DE_FILTRO),
  orden: parseOrden(query.orden, EXPRESIONES_ORDEN),
});

// ============================================================
//  OPCIONES DE LOS FILTROS DE SELECCION
// ============================================================
// Cada columna de seleccion ofrece solo los valores presentes en el conjunto ya
// filtrado (sin su propio filtro), mas "Sin asignar" si hay filas sin valor.
// `vigente` no esta aca: tiene opciones fijas en el frontend.
const OPCIONES_POR_COLUMNA = {
  grupos: {
    opciones: (where) => Prisma.sql`
      SELECT DISTINCT g.id_grupo AS id, g.nombre_grupo AS nombre
        FROM "ARTICULOS" a JOIN "GRUPOS_DE_VENTA" g ON g.id_grupo = a.id_grupo
        WHERE ${where} AND a.id_grupo NOT IN (${Prisma.join(IDS_GRUPOS_DE_CLIENTES)})
        ORDER BY nombre ASC`,
    sinAsignar: Prisma.sql`a.id_grupo IN (${Prisma.join(IDS_GRUPOS_DE_CLIENTES)})`,
  },
  subgrupos: {
    opciones: (where) => Prisma.sql`
      SELECT DISTINCT s.id_subgrupo AS id, s.nombre_subgrupo AS nombre
        FROM "ARTICULOS" a JOIN "SUBGRUPOS_DE_VENTA" s ON s.id_subgrupo = a.id_subgrupo
        WHERE ${where}
        ORDER BY nombre ASC`,
    sinAsignar: Prisma.sql`a.id_subgrupo IS NULL`,
  },
  linea: {
    opciones: (where) => Prisma.sql`
      SELECT DISTINCT l.id_linea AS id, l.nombre_linea AS nombre
        FROM "ARTICULOS" a JOIN "LINEAS" l ON l.id_linea = a.id_linea
        WHERE ${where}
        ORDER BY nombre ASC`,
    sinAsignar: Prisma.sql`a.id_linea IS NULL`,
  },
  colegios: {
    opciones: (where) => Prisma.sql`
      SELECT DISTINCT c.id_cliente AS id, c.nombre AS nombre
        FROM "ARTICULOS" a
        JOIN "ARTICULOS_X_CLIENTE" axc ON axc.id_articulo = a.id_articulo
        JOIN "CLIENTES_MAYORISTAS" c ON c.id_cliente = axc.id_cliente
        WHERE ${where}
        ORDER BY nombre ASC`,
    sinAsignar: Prisma.sql`NOT EXISTS (SELECT 1 FROM "ARTICULOS_X_CLIENTE" ax WHERE ax.id_articulo = a.id_articulo)`,
  },
};

const parseColumnaDeOpciones = (valor) => {
  const definicion = OPCIONES_POR_COLUMNA[valor];
  if (!definicion) throw error400(`La columna "${valor}" no tiene opciones de filtro.`);
  return definicion;
};

module.exports = {
  TAMANO_PAGINA_DEFECTO,
  SIN_ASIGNAR_ID,
  parsearConsultaArticulos,
  parseColumnaDeOpciones,
  construirWhere,
  construirOrderBy,
};
