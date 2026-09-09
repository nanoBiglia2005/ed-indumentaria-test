import type { ReactNode } from 'react';

// --- Filtros de columna (el valor elegido por el usuario) ---
export type FiltroTexto = { tipo: 'texto'; valor: string };
export type FiltroRango = { tipo: 'rango'; desde: number | null; hasta: number | null };
export type FiltroSeleccion = { tipo: 'seleccion'; ids: number[] };
/** Rango de fechas en formato ISO (yyyy-mm-dd), como lo entrega <input type="date">. */
export type FiltroFecha = { tipo: 'fecha'; desde: string | null; hasta: string | null };
export type FiltroColumna = FiltroTexto | FiltroRango | FiltroSeleccion | FiltroFecha;

export type OpcionFiltro = { id: number; nombre: string };

/** Id ficticio para la opcion "Sin asignar" de los filtros de seleccion. */
export const SIN_ASIGNAR_ID = -1;

// --- Definicion de filtro de una columna (como se filtra) ---
export type FiltroDefTexto = { tipo: 'texto' };
export type FiltroDefRango<T> = { tipo: 'rango'; getValor: (item: T) => number | null };
export type FiltroDefSeleccion<T> = {
  tipo: 'seleccion';
  getValores: (item: T) => OpcionFiltro[];
  opcionesEstaticas?: OpcionFiltro[];
};
export type FiltroDefFecha<T> = { tipo: 'fecha'; getValor: (item: T) => string | null };
export type FiltroDef<T> = FiltroDefTexto | FiltroDefRango<T> | FiltroDefSeleccion<T> | FiltroDefFecha<T>;

// --- Definicion de una columna del DataGrid ---
export type ColumnaTabla<T> = {
  header: string;
  /** Valor mostrado; tambien se usa (como string) para buscar y filtrar por texto. */
  render: (item: T) => ReactNode;
  /** Celda custom (chips, etc.); si falta se muestra render() con line-clamp. */
  renderCell?: (item: T) => ReactNode;
  extraClassName?: (item: T) => string;
  /** Click en la celda (p. ej. abrir el editor inline de ese campo). */
  onClick?: (item: T) => void;
  width: number;
  /**
   * Como se filtra y ordena la columna. Se omiten juntos en las columnas de
   * SOLO LECTURA: valores derivados que no existen como campo en la base (p. ej.
   * el precio con el recargo de un metodo de pago), que una tabla paginada en
   * la base no puede filtrar ni ordenar.
   */
  filtroKey?: string;
  filtro?: FiltroDef<T>;
  /**
   * Si se define, se usa para ordenar en lugar del criterio por defecto segun
   * el tipo de filtro (util cuando el texto mostrado no ordena bien, p. ej.
   * codigos numericos guardados como string).
   */
  ordenValor?: (item: T) => string | number | null;
};

/**
 * Columna que SI se puede filtrar y ordenar. El motor de la tabla trabaja solo
 * con estas: las de solo lectura se descartan en el borde, asi el resto del
 * codigo no tiene que preguntar por `filtroKey` en cada uso.
 */
export type ColumnaFiltrable<T> = ColumnaTabla<T> & {
  filtroKey: string;
  filtro: FiltroDef<T>;
};

export const esFiltrable = <T,>(columna: ColumnaTabla<T>): columna is ColumnaFiltrable<T> =>
  columna.filtroKey !== undefined && columna.filtro !== undefined;

export type CriterioOrden = { key: string; direccion: 'asc' | 'desc' };
