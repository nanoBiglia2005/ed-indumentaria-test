// Tests de lib/remitosConsulta.js — traduccion de filtros/orden de
// Ventas/Historial a SQL (mismo mecanismo que articulosConsulta.js: WHERE +
// ORDER BY se arman en la base, no en memoria). Se inspecciona `.sql`/`.values`
// del fragmento Prisma.sql que devuelven construirWhere/construirOrderBy: no
// hay conexion a una base real en estos tests, son puramente de armado de SQL.
const test = require('node:test');
const assert = require('node:assert/strict');

const { Prisma } = require('../generated/prisma/client');
const { parsearConsultaRemitos, construirWhere, construirOrderBy } = require('../lib/remitosConsulta');
const { HttpError } = require('../lib/http');

const ESTADO_FIJO = Prisma.sql`r.id_estado != 1`;

const filtros = (query) => parsearConsultaRemitos({ filtros: JSON.stringify(query) }).filtros;
const where = (filtrosCrudos) => construirWhere({ estadoFijo: ESTADO_FIJO, filtros: filtros(filtrosCrudos) });

test('parsearConsultaRemitos rechaza una clave de filtro que no existe', () => {
  assert.throws(
    () => parsearConsultaRemitos({ filtros: JSON.stringify({ id_grupo: { tipo: 'texto', valor: 'x' } }) }),
    (error) => {
      assert.ok(error instanceof HttpError);
      assert.equal(error.status, 400);
      return true;
    }
  );
});

test('parsearConsultaRemitos rechaza orden por una clave que no existe', () => {
  assert.throws(
    () => parsearConsultaRemitos({ orden: 'inexistente:asc' }),
    (error) => error instanceof HttpError && error.status === 400
  );
});

test('el WHERE siempre incluye el estado fijo de la ruta, aunque no haya filtros', () => {
  const resultado = where({});
  assert.equal(resultado.sql, 'r.id_estado != 1');
  assert.deepEqual(resultado.values, []);
});

test('filtro de texto en codigo/cliente normaliza y escapa como LIKE', () => {
  const resultado = where({ cliente: { tipo: 'texto', valor: 'Juan Pérez' } });
  assert.ok(resultado.sql.includes('regexp_replace(lower('));
  assert.ok(resultado.sql.includes(`LIKE ? ESCAPE '\\'`));
  assert.equal(resultado.values.length, 1);
  // Sin mayusculas ni espacios, y comodines de LIKE escapados.
  assert.equal(resultado.values[0], '%juanpérez%');
});

test('filtro de rango sobre "total" usa COALESCE(total_final, total_efectivo)', () => {
  const resultado = where({ total: { tipo: 'rango', desde: 500, hasta: 1500 } });
  assert.match(resultado.sql, /COALESCE\(r\.total_final, r\.total_efectivo\) >= \?::numeric/);
  assert.match(resultado.sql, /COALESCE\(r\.total_final, r\.total_efectivo\) <= \?::numeric/);
  assert.deepEqual(resultado.values, [500, 1500]);
});

test('filtro de fecha construye un rango con ::date en vez de ::numeric', () => {
  const resultado = where({ fecha_creacion: { tipo: 'fecha', desde: '2026-01-01', hasta: null } });
  assert.match(resultado.sql, /r\.fecha_de_creacion >= \?::date/);
  assert.doesNotMatch(resultado.sql, /::numeric/);
  assert.deepEqual(resultado.values, ['2026-01-01']);
});

test('filtro de estado (seleccion) arma un IN con los ids elegidos', () => {
  const resultado = where({ estado: { tipo: 'seleccion', ids: [2, 3] } });
  assert.match(resultado.sql, /r\.id_estado IN \(\?,\?\)/);
  assert.deepEqual(resultado.values, [2, 3]);
});

test('filtro de estado sin ningun id elegido no deja pasar ninguna fila', () => {
  const resultado = where({ estado: { tipo: 'seleccion', ids: [] } });
  assert.match(resultado.sql, /FALSE/);
});

test('construirOrderBy sin criterios devuelve solo el desempate por id', () => {
  const resultado = construirOrderBy([]);
  assert.equal(resultado.sql, 'r.id_remito ASC');
});

test('construirOrderBy por codigo ordena por el par NUMERICO (cod_mes, cod_remito_final), no el texto', () => {
  const resultado = construirOrderBy([{ key: 'codigo', direccion: 'asc' }]);
  assert.equal(resultado.sql, 'r.cod_mes ASC NULLS LAST, r.cod_remito_final ASC NULLS LAST, r.id_remito ASC');
});

test('construirOrderBy apila varios criterios en orden de prioridad y siempre cierra con el desempate', () => {
  const resultado = construirOrderBy([
    { key: 'total', direccion: 'desc' },
    { key: 'fecha_creacion', direccion: 'asc' },
  ]);
  assert.equal(
    resultado.sql,
    'COALESCE(r.total_final, r.total_efectivo) DESC NULLS LAST, r.fecha_de_creacion ASC NULLS LAST, r.id_remito ASC'
  );
});
