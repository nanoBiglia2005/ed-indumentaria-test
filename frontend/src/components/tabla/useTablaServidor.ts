import { useState } from 'react';
import type { ColumnaTabla, CriterioOrden, FiltroColumna, OpcionFiltro } from './tipos';
import { esFiltrable } from './tipos';

interface UseTablaServidorParams<T> {
  columnas: ColumnaTabla<T>[];
  /**
   * Opciones del filtro de seleccion abierto, resueltas contra la base por la
   * pagina. Se ignoran en las columnas que declaran `opcionesEstaticas`.
   */
  opciones: OpcionFiltro[];
  /**
   * Filtros con los que arranca la tabla (ej: Historial arranca acotado a los
   * ultimos 30 dias). Solo se lee en el render inicial, como cualquier
   * argumento de useState: cambiarlo despues del primer render no reaplica el
   * filtro.
   */
  filtrosIniciales?: Record<string, FiltroColumna>;
}

/**
 * Gemelo de useTablaFiltrable para tablas paginadas EN LA BASE: mantiene el
 * mismo estado de filtros por columna y multi-orden (y los mismos gestos en los
 * headers), pero no filtra ni ordena en memoria — ese estado se manda al
 * backend como parametros de la consulta.
 *
 * Click en el nombre del header: abre el filtro (o lo quita si ya habia).
 * Click en el icono de orden: apila la columna como criterio (asc -> desc ->
 * quitar); shift+click la vuelve el unico criterio.
 */
export function useTablaServidor<T>({ columnas, opciones, filtrosIniciales }: UseTablaServidorParams<T>) {
  const [filtrosColumna, setFiltrosColumna] = useState<Record<string, FiltroColumna>>(
    filtrosIniciales ?? {}
  );
  const [columnaFiltroAbierta, setColumnaFiltroAbierta] = useState<string | null>(null);
  // Lista de criterios de orden ordenada por prioridad: el primero es el
  // criterio principal, los siguientes desempatan en orden.
  const [ordenColumnas, setOrdenColumnas] = useState<CriterioOrden[]>([]);

  // Las columnas de solo lectura (valores derivados) no participan del motor:
  // no tienen filtroKey y la grilla les dibuja un header plano.
  const columnaAbierta =
    columnas.filter(esFiltrable).find((c) => c.filtroKey === columnaFiltroAbierta) ?? null;

  const opcionesFiltroAbierto =
    columnaAbierta?.filtro.tipo === 'seleccion'
      ? columnaAbierta.filtro.opcionesEstaticas ?? opciones
      : [];

  // Click en el header: abre el filtro, o lo quita si ya estaba puesto.
  const handleClickHeader = (columna: ColumnaTabla<T>) => {
    if (!esFiltrable(columna)) return;

    if (filtrosColumna[columna.filtroKey]) {
      setFiltrosColumna((prev) => {
        const siguiente = { ...prev };
        delete siguiente[columna.filtroKey];
        return siguiente;
      });
      return;
    }
    setColumnaFiltroAbierta(columna.filtroKey);
  };

  // Click normal: apila la columna como un criterio mas de orden (o cicla su
  // direccion / la quita si ya estaba). Shift+click: la vuelve el unico
  // criterio de orden, descartando los demas.
  const handleClickOrdenar = (columna: ColumnaTabla<T>, event: React.MouseEvent) => {
    if (!esFiltrable(columna)) return;

    setOrdenColumnas((prev) => {
      const indice = prev.findIndex((c) => c.key === columna.filtroKey);

      if (event.shiftKey) {
        if (indice === -1 || prev.length > 1) return [{ key: columna.filtroKey, direccion: 'asc' }];
        if (prev[indice].direccion === 'asc') return [{ key: columna.filtroKey, direccion: 'desc' }];
        return [];
      }

      if (indice === -1) return [...prev, { key: columna.filtroKey, direccion: 'asc' }];
      if (prev[indice].direccion === 'asc') {
        const siguiente = [...prev];
        siguiente[indice] = { key: columna.filtroKey, direccion: 'desc' };
        return siguiente;
      }
      return prev.filter((c) => c.key !== columna.filtroKey);
    });
  };

  const handleAplicarFiltro = (filtro: FiltroColumna | null) => {
    if (columnaFiltroAbierta === null) return;
    const key = columnaFiltroAbierta;
    setFiltrosColumna((prev) => {
      const siguiente = { ...prev };
      if (filtro === null) {
        delete siguiente[key];
      } else {
        siguiente[key] = filtro;
      }
      return siguiente;
    });
  };

  const resetear = () => {
    setFiltrosColumna({});
    setOrdenColumnas([]);
  };

  return {
    filtrosColumna,
    ordenColumnas,
    columnaFiltroAbierta,
    setColumnaFiltroAbierta,
    columnaAbierta,
    opcionesFiltroAbierto,
    handleClickHeader,
    handleClickOrdenar,
    handleAplicarFiltro,
    resetear,
  };
}
