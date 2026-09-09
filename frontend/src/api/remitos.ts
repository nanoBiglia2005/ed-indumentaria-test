import { request } from './cliente';
import type { RemitoConDetalles, RemitoCreado } from '@backend/types';
import type { CriterioOrden, FiltroColumna, OpcionFiltro } from '@/components/tabla/tipos';
import type { DatosClienteAPI } from './venta';

/** Historial o Ventas pendientes: cada uno pega a un endpoint distinto. */
export type TipoDeListaRemitos = 'historial' | 'pendientes';

const RUTA_BASE: Record<TipoDeListaRemitos, string> = {
  historial: '/api/remitos',
  pendientes: '/api/remitos/pendientes',
};

// --- Listado paginado (Historial / Ventas pendientes) ---
// Mismo mecanismo que api/articulos.ts: el backend resuelve filtros, orden y
// paginacion (ver lib/remitosConsulta.js), y devuelve una pagina + el total
// que coincide. A diferencia de Articulos, esto sigue alimentando una lista de
// RemitoCard, no un DataGrid.

/** Todo lo que define QUE remitos pide la pagina (sin la pagina en si). */
export interface ParamsRemitos {
  filtros: Record<string, FiltroColumna>;
  orden: CriterioOrden[];
}

export interface RespuestaRemitos {
  remitos: RemitoConDetalles[];
  total: number;
}

/** Los filtros viajan como JSON y el orden como "total:desc,codigo:asc". */
const querystring = (params: ParamsRemitos, extra: Record<string, number> = {}) => {
  const query = new URLSearchParams();

  if (Object.keys(params.filtros).length > 0) query.set('filtros', JSON.stringify(params.filtros));
  if (params.orden.length > 0) {
    query.set('orden', params.orden.map((c) => `${c.key}:${c.direccion}`).join(','));
  }
  for (const [clave, valor] of Object.entries(extra)) query.set(clave, String(valor));

  return query.toString();
};

/** Historial: todo menos los pendientes de cobro. */
export const listarRemitosPagina = (params: ParamsRemitos, pagina: number, tamano: number) =>
  request<RespuestaRemitos>(`/api/remitos?${querystring(params, { pagina, tamano })}`);

/** Remitos confirmados que todavia no se cobraron. */
export const listarRemitosPendientesPagina = (params: ParamsRemitos, pagina: number, tamano: number) =>
  request<RespuestaRemitos>(`/api/remitos/pendientes?${querystring(params, { pagina, tamano })}`);

export interface RespuestaOpcionesRemitos {
  opciones: OpcionFiltro[];
  haySinAsignar: boolean;
}

/**
 * Opciones de un filtro de seleccion (hoy solo "cliente"). El backend las
 * calcula sobre los remitos que pasan todos los DEMAS filtros, ignorando el de
 * esta misma columna — mismo patron que listarOpcionesColumna en
 * api/articulos.ts.
 */
export const listarOpcionesDeRemitos = (
  tipo: TipoDeListaRemitos,
  params: ParamsRemitos,
  columna: string
) =>
  request<RespuestaOpcionesRemitos>(
    `${RUTA_BASE[tipo]}/opciones?columna=${encodeURIComponent(columna)}&${querystring(params)}`
  );

/**
 * Registra la venta como pendiente de cobro con el cliente asignado.
 * `cliente` solo se manda si sus datos se editaron en pantalla: el backend los
 * actualiza en la misma transaccion en que crea el remito.
 */
export const crearRemito = (cuerpo: {
  detalles: { id_articulo: number; cantidad: number }[];
  imprimir: boolean;
  id_cliente: number | null;
  cliente?: DatosClienteAPI;
  /** A que impresora va el ticket. El backend lo ignora si el rol no puede elegir. */
  id_impresora?: number | null;
}) => request<RemitoCreado>('/api/remitos', { metodo: 'POST', cuerpo });

/**
 * Vuelve a imprimir el ticket de un remito ya guardado. Existe porque la
 * impresion de la venta es best-effort: si la impresora estaba desconectada, o
 * si se eligio la equivocada, no habia forma de reemitirlo.
 *
 * A diferencia de crearRemito, aca imprimir ES la accion: si falla, lanza.
 */
export const reimprimirRemito = (idRemito: number, idImpresora?: number | null) =>
  request<{ status: 'ok' }>(`/api/remitos/${idRemito}/reimprimir`, {
    metodo: 'POST',
    cuerpo: { id_impresora: idImpresora ?? null },
  });

/** Un metodo de pago con lo que se le imputa del precio de la venta. */
export interface PagoDeRemito {
  id_tipo_de_pago: number;
  monto_inicial: number;
}

/**
 * Cobra un remito pendiente. Se mandan TODOS los metodos de pago: los que van
 * en 0 los descarta el backend, que ademas recalcula cuanto se cobra por cada
 * uno (la pantalla no decide la plata que entra).
 */
export const facturarRemito = (idRemito: number, pagos: PagoDeRemito[]) =>
  request<RemitoConDetalles>(`/api/remitos/${idRemito}/facturar`, {
    metodo: 'PUT',
    cuerpo: { pagos },
  });

export const anularRemito = (idRemito: number) =>
  request<RemitoConDetalles>(`/api/remitos/${idRemito}/anular`, { metodo: 'PUT' });

/** Devuelve una venta ya cobrada: pasa a DEVUELTO (el backend exige FACTURADO). */
export const devolverRemito = (idRemito: number) =>
  request<RemitoConDetalles>(`/api/remitos/${idRemito}/devolver`, { metodo: 'PUT' });
