import { useRef } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { resaltarCoincidencia } from '@/utils/texto';
import BotonFiltroOrden from './BotonFiltroOrden';
import type { ColumnaTabla, CriterioOrden, FiltroColumna } from './tipos';

/**
 * Grilla virtualizada de articulos: header con filtro/orden por columna,
 * columna de seleccion con barra de acciones, celdas con line-clamp y
 * resaltado de busqueda, y una columna de accion final.
 *
 * El motor de filtros/orden vive en useTablaFiltrable; este componente solo
 * renderiza. `compacta` alterna entre los paddings de ArticulosPage (false)
 * y los del modal de venta (true).
 */
interface DataGridProps<T> {
  filas: T[];
  columnas: ColumnaTabla<T>[];
  keyDe: (fila: T) => number;
  altoFila: number;
  anchoColSeleccion: number;
  /** Ultima celda del grid-template (p. ej. 'minmax(110px, 1fr)'). */
  anchoUltimaColumna: string;
  /** Clases del contenedor con scroll (alto/bordes segun el contexto). */
  claseContenedor: string;
  /** Estilo del <span> de texto de las celdas (line-clamp de cada tabla). */
  estiloCeldaTexto: CSSProperties;
  compacta?: boolean;

  // --- Motor (useTablaFiltrable) ---
  filtrosColumna: Record<string, FiltroColumna>;
  ordenColumnas: CriterioOrden[];
  onClickHeader: (columna: ColumnaTabla<T>) => void;
  onClickOrdenar: (columna: ColumnaTabla<T>, event: React.MouseEvent) => void;

  // --- Resaltado ---
  busqueda: string;
  /** true: el filtro de texto de la columna pisa a la busqueda global (ArticulosPage). */
  resaltarPorFiltroColumna?: boolean;

  // --- Seleccion ---
  seleccionados: Set<number>;
  onToggleSeleccion: (id: number) => void;
  todosSeleccionados: boolean;
  onToggleTodos: () => void;
  /** Contenido de la barra violeta que aparece con la seleccion activa. */
  toolbarSeleccion: ReactNode;
  /** true: las celdas de la fila seleccionada se pintan de ambar (ArticulosPage). */
  resaltarFilaSeleccionada?: boolean;

  // --- Columna de accion ---
  renderAccion: (fila: T) => ReactNode;
  claseCeldaAccion: (fila: T) => string;

  // --- Fila ---
  onFilaClick?: (fila: T) => void;

  // --- Estados ---
  cargando?: boolean;
  estadoCargando?: ReactNode;
  estadoVacio: ReactNode;
}

export default function DataGrid<T>({
  filas,
  columnas,
  keyDe,
  altoFila,
  anchoColSeleccion,
  anchoUltimaColumna,
  claseContenedor,
  estiloCeldaTexto,
  compacta = false,
  filtrosColumna,
  ordenColumnas,
  onClickHeader,
  onClickOrdenar,
  busqueda,
  resaltarPorFiltroColumna = false,
  seleccionados,
  onToggleSeleccion,
  todosSeleccionados,
  onToggleTodos,
  toolbarSeleccion,
  resaltarFilaSeleccionada = false,
  renderAccion,
  claseCeldaAccion,
  onFilaClick,
  cargando = false,
  estadoCargando = null,
  estadoVacio,
}: DataGridProps<T>) {
  const scrollParentRef = useRef<HTMLDivElement>(null);

  const gridTemplateColumns = `${anchoColSeleccion}px ${columnas
    .map((c) => `${c.width}px`)
    .join(' ')} ${anchoUltimaColumna}`;

  const rowVirtualizer = useVirtualizer({
    count: filas.length,
    getScrollElement: () => scrollParentRef.current,
    estimateSize: () => altoFila,
    overscan: 10,
  });

  const modoSeleccion = seleccionados.size > 0;

  // Paddings historicos de cada tabla.
  const pyHeader = compacta ? 'py-2' : 'py-3';
  const claseBtnFiltro = compacta ? 'py-2 pl-3 pr-1 gap-1' : 'py-3 pl-4 pr-1.5 gap-1.5';
  const claseBtnOrden = compacta ? 'py-2 pl-1.5 pr-1' : 'py-3 pl-2 pr-1';
  const claseHeaderAccion = compacta ? 'py-2 px-3' : 'py-3 px-4';
  const claseCelda = compacta ? 'py-2 px-3' : 'py-3 px-4';

  return (
    <div ref={scrollParentRef} className={claseContenedor}>
      <div
        className='grid text-black sticky top-0 z-10 isolate will-change-transform'
        style={{ gridTemplateColumns, transform: 'translateZ(0)' }}
      >
        <span
          className={`${pyHeader} border-black/35 bg-stone-100 border-b flex items-center justify-center ${
            modoSeleccion ? 'bg-violet-500' : ''
          }`}
        >
          <input
            type='checkbox'
            checked={todosSeleccionados}
            onChange={onToggleTodos}
            title={todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
            className='h-4 w-4 accent-violet-300 cursor-pointer'
          />
        </span>

        {modoSeleccion ? (
          <div
            className='border-black/35 bg-violet-500 border-b border-l overflow-hidden'
            style={{ gridColumn: '2 / -1' }}
          >
            <div className='sticky w-fit flex items-center gap-2 px-3 py-2'>{toolbarSeleccion}</div>
          </div>
        ) : (
          <>
            {columnas.map((columna) => {
              // Columna de solo lectura (valor derivado): header plano, sin los
              // botones de filtrar ni de ordenar.
              if (columna.filtroKey === undefined) {
                return (
                  <span
                    key={columna.header}
                    className={`${claseBtnFiltro} border-black/35 bg-stone-100 text-[13px] font-medium border-b border-l flex items-center`}
                    title={`${columna.header} (no se puede filtrar ni ordenar)`}
                  >
                    <span className='flex-1 truncate'>{columna.header}</span>
                  </span>
                );
              }

              const filtroActivo = filtrosColumna[columna.filtroKey];
              const prioridadOrden = ordenColumnas.findIndex((c) => c.key === columna.filtroKey);
              const ordenActivo = prioridadOrden === -1 ? null : ordenColumnas[prioridadOrden].direccion;
              return (
                <BotonFiltroOrden
                  key={columna.header}
                  columna={columna}
                  filtroActivo={Boolean(filtroActivo)}
                  ordenActivo={ordenActivo}
                  prioridadOrden={prioridadOrden}
                  totalCriterios={ordenColumnas.length}
                  onClickHeader={onClickHeader}
                  onClickOrdenar={onClickOrdenar}
                  claseBtnFiltro={claseBtnFiltro}
                  claseBtnOrden={claseBtnOrden}
                />
              );
            })}
            <span
              className={`${claseHeaderAccion} border-black/35 bg-stone-100 border-b border-l text-[13px] font-medium flex items-center justify-center`}
            >
              Acción
            </span>
          </>
        )}
      </div>

      {cargando && estadoCargando}

      {!cargando && filas.length === 0 && estadoVacio}

      {!cargando && (
        <div style={{ position: 'relative', height: rowVirtualizer.getTotalSize() }}>
          {rowVirtualizer.getVirtualItems().map((virtualRow) => {
            const item = filas[virtualRow.index];
            const id = keyDe(item);
            const seleccionada = seleccionados.has(id);
            return (
              <div
                key={id}
                onClick={onFilaClick ? () => onFilaClick(item) : undefined}
                className={`grid text-black text-xs group absolute top-0 left-0 w-full${
                  onFilaClick ? ' cursor-pointer' : ''
                }`}
                style={{
                  gridTemplateColumns,
                  height: altoFila,
                  transform: `translateY(${virtualRow.start}px)`,
                }}
              >
                <label
                  onClick={onFilaClick ? (e) => e.stopPropagation() : undefined}
                  className={`${pyHeader} border-black/20 border-b flex items-center justify-center cursor-pointer group-hover:bg-amber-50 transition-colors duration-100 ease-in ${
                    seleccionada ? 'bg-amber-100' : ''
                  }`}
                >
                  <input
                    type='checkbox'
                    checked={seleccionada}
                    onChange={() => onToggleSeleccion(id)}
                    className='h-4 w-4 accent-violet-600 cursor-pointer'
                  />
                </label>
                {columnas.map((columna) => {
                  const valorTexto = String(columna.render(item) ?? '');
                  const filtroTextoColumna =
                    columna.filtroKey === undefined ? undefined : filtrosColumna[columna.filtroKey];
                  const terminoResaltado = resaltarPorFiltroColumna
                    ? filtroTextoColumna?.tipo === 'texto' && filtroTextoColumna.valor.trim() !== ''
                      ? filtroTextoColumna.valor.trim()
                      : busqueda
                    : busqueda;
                  return (
                    <p
                      key={columna.header}
                      onClick={columna.onClick ? () => columna.onClick!(item) : undefined}
                      className={`${claseCelda} border-black/20 border-b border-l flex items-center break-words group-hover:bg-amber-50 transition-colors duration-100 ease-in ${
                        resaltarFilaSeleccionada && seleccionada ? 'bg-amber-100' : ''
                      } ${columna.onClick ? 'cursor-pointer hover:bg-amber-300' : ''} ${
                        columna.extraClassName ? columna.extraClassName(item) : ''
                      }`}
                    >
                      {columna.renderCell ? (
                        columna.renderCell(item)
                      ) : (
                        <span style={estiloCeldaTexto}>
                          {terminoResaltado
                            ? resaltarCoincidencia(valorTexto, terminoResaltado)
                            : valorTexto}
                        </span>
                      )}
                    </p>
                  );
                })}
                <div className={claseCeldaAccion(item)}>{renderAccion(item)}</div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
