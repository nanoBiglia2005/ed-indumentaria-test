// Campos filtrables/ordenables de Ventas/Historial, analogos a
// features/articulos/columnas.tsx pero SIN alimentar un DataGrid: se usan con
// useTablaServidor + FiltrosVentasToolbar, que reusan el mismo motor y el
// mismo ColumnFilterModal sin las columnas de una grilla (la lista sigue
// siendo RemitoCard). `render`/`width` quedan sin uso fuera de un DataGrid,
// pero se completan igual porque ColumnaTabla<T> los exige y documentan que
// muestra cada campo.
import type { RemitoConDetalles } from '@backend/types';
import { ESTADO_FACTURADO, ESTADO_ANULADO, ESTADO_DEVUELTO } from '@backend/types';
import type { ColumnaTabla, OpcionFiltro } from '@/components/tabla/tipos';
import { formatearFecha, formatearPesos } from '@/utils/formato';

// Sin Confirmada: CAMPO_ESTADO solo se usa en camposHistorial (mas abajo), y
// esa pagina fija `estadoFijo: r.id_estado != ESTADO_CONFIRMADO` en el
// backend (routes/remitos.js) — un remito Confirmado no puede existir ahi por
// construccion. Ofrecerla como opcion de filtro sería un checkbox que siempre
// da 0 resultados.
const OPCIONES_ESTADO: OpcionFiltro[] = [
  { id: ESTADO_FACTURADO, nombre: 'Paga' },
  { id: ESTADO_ANULADO, nombre: 'Anulada' },
  { id: ESTADO_DEVUELTO, nombre: 'Devuelta' },
];
const NOMBRE_POR_ESTADO = new Map(OPCIONES_ESTADO.map((o) => [o.id, o.nombre]));

const nombreCliente = (remito: RemitoConDetalles) =>
  remito.CLIENTES ? `${remito.CLIENTES.nombre} ${remito.CLIENTES.apellido ?? ''}`.trim() : 'No Asignado';

/** Monto que muestra la card: el final si ya esta facturado, si no el de efectivo. */
const monto = (remito: RemitoConDetalles) => remito.total_final ?? remito.total_efectivo;

/**
 * Fecha en yyyy-mm-dd UTC, como la espera el filtro de tipo "fecha" (y como la
 * entrega <input type="date">). Las columnas de REMITOS son @db.Date
 * (medianoche UTC): toISOString() ya da esa fecha sin corrimiento de zona
 * horaria (ver el comentario de formatearFecha en utils/formato.ts).
 */
const fechaISO = (fecha: Date | string | null): string | null =>
  fecha ? new Date(fecha).toISOString().slice(0, 10) : null;

const CAMPO_CODIGO: ColumnaTabla<RemitoConDetalles> = {
  header: 'Código',
  render: (r) => `${r.cod_mes}-${r.cod_remito_final}`,
  width: 90,
  filtroKey: 'codigo',
  filtro: { tipo: 'texto' },
};

const CAMPO_CLIENTE: ColumnaTabla<RemitoConDetalles> = {
  header: 'Cliente',
  render: nombreCliente,
  width: 160,
  filtroKey: 'cliente',
  filtro: {
    tipo: 'seleccion',
    // Las opciones reales las calcula el backend (GET /api/remitos/opciones,
    // ver useOpcionesDeFiltro): no hay lista fija como en Estado. getValores
    // solo lo exige el tipo de FiltroDefSeleccion; el motor no lo usa aca.
    getValores: (r) => (r.CLIENTES ? [{ id: r.CLIENTES.id_cliente, nombre: nombreCliente(r) }] : []),
  },
};

const CAMPO_ESTADO: ColumnaTabla<RemitoConDetalles> = {
  header: 'Estado',
  render: (r) => NOMBRE_POR_ESTADO.get(r.id_estado ?? ESTADO_FACTURADO) ?? 'Desconocido',
  width: 100,
  filtroKey: 'estado',
  filtro: {
    tipo: 'seleccion',
    getValores: (r) => {
      const nombre = NOMBRE_POR_ESTADO.get(r.id_estado ?? ESTADO_FACTURADO);
      return nombre ? [{ id: r.id_estado ?? ESTADO_FACTURADO, nombre }] : [];
    },
    opcionesEstaticas: OPCIONES_ESTADO,
  },
};

const CAMPO_FECHA_EMISION: ColumnaTabla<RemitoConDetalles> = {
  header: 'Fecha de Emisión',
  render: (r) => formatearFecha(r.fecha_de_emision),
  width: 110,
  filtroKey: 'fecha_emision',
  filtro: { tipo: 'fecha', getValor: (r) => fechaISO(r.fecha_de_emision) },
};

const CAMPO_FECHA_CREACION: ColumnaTabla<RemitoConDetalles> = {
  header: 'Fecha de Creación',
  render: (r) => formatearFecha(r.fecha_de_creacion),
  width: 110,
  filtroKey: 'fecha_creacion',
  filtro: { tipo: 'fecha', getValor: (r) => fechaISO(r.fecha_de_creacion) },
};

const CAMPO_TOTAL: ColumnaTabla<RemitoConDetalles> = {
  header: 'Total',
  render: (r) => formatearPesos(monto(r)),
  width: 100,
  filtroKey: 'total',
  filtro: { tipo: 'rango', getValor: monto },
};

/** Historial: los 6 campos. */
export const camposHistorial: ColumnaTabla<RemitoConDetalles>[] = [
  CAMPO_CODIGO,
  CAMPO_ESTADO,
  CAMPO_TOTAL,
  CAMPO_FECHA_EMISION,
  CAMPO_FECHA_CREACION,
  CAMPO_CLIENTE,
];

/**
 * Ventas (pendientes de cobro): sin Estado (siempre CONFIRMADO) ni Fecha de
 * emision (siempre null hasta que se factura o anula/devuelve, ver
 * trg_fecha_de_emision en la migracion 0_init).
 */
export const camposVentasPendientes: ColumnaTabla<RemitoConDetalles>[] = [
  CAMPO_CODIGO,
  CAMPO_TOTAL,
  CAMPO_FECHA_CREACION,
  CAMPO_CLIENTE,
];
