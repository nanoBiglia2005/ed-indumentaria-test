import { useEffect, useRef } from 'react';
import { SIN_ASIGNAR_ID } from '@/components/tabla/tipos';
import type { ColumnaFiltrable, OpcionFiltro } from '@/components/tabla/tipos';
import type { RemitoConDetalles } from '@backend/types';
import { listarOpcionesDeRemitos } from '@/api/remitos';
import type { ParamsRemitos, TipoDeListaRemitos } from '@/api/remitos';

export interface OpcionesCargadas {
  columna: string;
  params: ParamsRemitos;
  valores: OpcionFiltro[];
}

/**
 * Opciones del filtro de seleccion recien abierto (hoy solo "cliente": Estado
 * tiene opciones fijas, ver campos.ts). El backend las calcula sobre los
 * remitos que pasan todos los DEMAS filtros — mismo patron que ArticulosPage.
 *
 * El estado (`opciones`/`setOpciones`) vive en la PAGINA, no aca: tiene que
 * existir ANTES de construir `tabla` (useTablaServidor necesita
 * `opciones?.valores` de entrada), pero este hook necesita `tabla.columnaAbierta`
 * de salida — pasar el estado por parametro rompe esa dependencia circular en
 * vez de esconderla. Por eso este hook no devuelve `valores`, solo `listas`
 * (si el modal ya puede abrirse, para no mostrar por un instante las opciones
 * de la consulta anterior); `opciones?.valores ?? []` lo lee la pagina directo.
 */
export function useOpcionesDeFiltro(
  tipo: TipoDeListaRemitos,
  params: ParamsRemitos,
  columnaAbierta: ColumnaFiltrable<RemitoConDetalles> | null,
  opciones: OpcionesCargadas | null,
  setOpciones: (o: OpcionesCargadas) => void
): boolean {
  const columnaQueNecesitaOpciones =
    columnaAbierta && columnaAbierta.filtro.tipo === 'seleccion' && !columnaAbierta.filtro.opcionesEstaticas
      ? columnaAbierta.filtroKey
      : null;

  const listas =
    columnaQueNecesitaOpciones === null ||
    (opciones !== null && opciones.columna === columnaQueNecesitaOpciones && opciones.params === params);

  const secuencia = useRef(0);

  useEffect(() => {
    if (columnaQueNecesitaOpciones === null || listas) return;

    const peticion = ++secuencia.current;

    listarOpcionesDeRemitos(tipo, params, columnaQueNecesitaOpciones)
      .then(({ opciones: valores, haySinAsignar }) => {
        if (peticion !== secuencia.current) return;
        setOpciones({
          columna: columnaQueNecesitaOpciones,
          params,
          valores: haySinAsignar ? [...valores, { id: SIN_ASIGNAR_ID, nombre: 'Sin asignar' }] : valores,
        });
      })
      .catch((error) => {
        if (peticion !== secuencia.current) return;
        console.error('Error al obtener las opciones del filtro:', error);
        // Se guarda vacio bajo la misma marca para que el modal abra igual en
        // vez de quedarse esperando para siempre.
        setOpciones({ columna: columnaQueNecesitaOpciones, params, valores: [] });
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tipo, columnaQueNecesitaOpciones, listas, params]);

  return listas;
}
