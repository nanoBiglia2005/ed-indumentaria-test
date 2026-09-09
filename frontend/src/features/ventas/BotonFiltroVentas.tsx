import IconoOrden from '@/components/tabla/IconoOrden';
import type { ColumnaTabla } from '@/components/tabla/tipos';

/**
 * Boton "nombre (abre el filtro) + icono de orden" de la barra de
 * Ventas/Historial (ver FiltrosVentasToolbar). Misma interaccion que
 * BotonFiltroOrden (el header de columna de DataGrid: reusado tal cual ahi),
 * pero look propio pensado para vivir arriba de una lista de RemitoCard en
 * vez de pegado a una grilla de spreadsheet:
 *
 * - `rounded-lg` + `border` en las 4 caras + `shadow-sm`, dialogando con el
 *   `rounded-xl border shadow` de RemitoCard en vez de la esquina recta con
 *   borde solo abajo/izquierda del header de DataGrid.
 * - Filtro activo = chip violeta RELLENO (`bg-violet-500`), el mismo gesto
 *   que RemitoCard usa en su chip de codigo cuando la tarjeta esta abierta
 *   (`estilo.fondo` + texto blanco): "esto esta activo" se lee igual en los
 *   dos lugares.
 *   Filtro inactivo = fondo blanco, hover ambar (la otra mitad de la paleta
 *   del proyecto).
 * - La prioridad de orden (cuando hay mas de un criterio apilado) ya no es un
 *   numerito plano: es un chip circular ambar (o blanco sobre violeta si el
 *   filtro tambien esta activo), mas cerca del lenguaje de "badge" que del
 *   texto crudo del header de tabla.
 */
interface BotonFiltroVentasProps<T> {
  columna: ColumnaTabla<T>;
  /**
   * Texto visible del boton. Por defecto `columna.header` — FiltrosVentasToolbar
   * pasa otra cosa cuando hay un filtro de fecha activo (el preset elegido, o
   * el rango personalizado), para mostrar QUE se esta filtrando en vez de solo
   * el nombre de la columna.
   */
  texto?: string;
  filtroActivo: boolean;
  ordenActivo: 'asc' | 'desc' | null;
  prioridadOrden: number;
  totalCriterios: number;
  onClickHeader: (columna: ColumnaTabla<T>) => void;
  onClickOrdenar: (columna: ColumnaTabla<T>, event: React.MouseEvent) => void;
  /**
   * Ancho (px) igual al de la columna que este boton filtra en RemitoCard
   * (ver ListaDeRemitos / MedidorAnchosRemitoCard). Sin definir, el boton
   * toma su ancho natural — es lo que usa el propio medidor oculto para
   * conocer ese ancho natural en primer lugar.
   */
  ancho?: number;
}

export default function BotonFiltroVentas<T>({
  columna,
  texto,
  filtroActivo,
  ordenActivo,
  prioridadOrden,
  totalCriterios,
  onClickHeader,
  onClickOrdenar,
  ancho,
}: BotonFiltroVentasProps<T>) {
  return (
    <div
      style={ancho !== undefined ? { width: ancho } : undefined}
      className={`flex items-stretch rounded-lg border text-sm font-medium shadow-sm overflow-hidden transition-colors duration-100 ease-in ${
        filtroActivo ? 'bg-violet-500 border-violet-500 text-white' : 'bg-white border-gray-200 text-gray-700'
      }`}
    >
      <button
        type='button'
        onClick={() => onClickHeader(columna)}
        title={filtroActivo ? `Quitar filtro de ${columna.header}` : `Filtrar por ${columna.header}`}
        className={`flex-1 min-w-0 flex items-center gap-1.5 px-3 py-2 cursor-pointer text-left transition-colors duration-100 ease-in ${
          filtroActivo ? 'hover:bg-violet-600' : 'hover:bg-amber-50 hover:text-amber-700'
        }`}
      >
        <span className='flex-1 truncate'>{texto ?? columna.header}</span>
        <svg
          className={`h-3.5 w-3.5 shrink-0 ${filtroActivo ? 'text-white' : 'text-gray-400'}`}
          fill='none'
          viewBox='0 0 24 24'
          stroke='currentColor'
          strokeWidth={2}
        >
          <path
            strokeLinecap='round'
            strokeLinejoin='round'
            d='M12 3c2.755 0 5.455.232 8.083.678.533.09.917.556.917 1.096v1.044a2.25 2.25 0 01-.659 1.591l-5.432 5.432a2.25 2.25 0 00-.659 1.591v2.927a2.25 2.25 0 01-1.244 2.013L9.75 21v-6.568a2.25 2.25 0 00-.659-1.591L3.659 7.409A2.25 2.25 0 013 5.818V4.774c0-.54.384-1.006.917-1.096A48.32 48.32 0 0112 3z'
          />
        </svg>
      </button>

      <span className={`w-px shrink-0 ${filtroActivo ? 'bg-white/30' : 'bg-gray-200'}`} />

      <button
        type='button'
        onClick={(e) => onClickOrdenar(columna, e)}
        title={
          ordenActivo === 'asc'
            ? 'Orden ascendente. Click: invertir. Shift+click: usar solo esta columna.'
            : ordenActivo === 'desc'
            ? 'Orden descendente. Click: quitar. Shift+click: usar solo esta columna.'
            : `Ordenar por ${columna.header}. Shift+click: usar solo esta columna.`
        }
        className={`shrink-0 flex items-center gap-1 px-2.5 py-2 cursor-pointer transition-colors duration-100 ease-in ${
          filtroActivo ? 'hover:bg-violet-600' : 'hover:bg-amber-50'
        } ${
          ordenActivo
            ? filtroActivo
              ? 'text-white'
              : 'text-violet-600'
            : filtroActivo
            ? 'text-white/70'
            : 'text-gray-400'
        }`}
      >
        <IconoOrden direccion={ordenActivo} />
        {totalCriterios > 1 && prioridadOrden !== -1 && (
          <span
            className={`flex items-center justify-center h-3.5 w-3.5 shrink-0 rounded-full text-[9px] font-bold leading-none ${
              filtroActivo ? 'bg-white text-violet-600' : 'bg-amber-400 text-white'
            }`}
          >
            {prioridadOrden + 1}
          </span>
        )}
      </button>
    </div>
  );
}
