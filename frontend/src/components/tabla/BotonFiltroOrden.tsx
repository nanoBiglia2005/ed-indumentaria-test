import IconoOrden from './IconoOrden';
import type { ColumnaTabla } from './tipos';

/**
 * Boton de "nombre (abre el filtro) + icono de orden" de un campo filtrable.
 * Extraido del header de columna de DataGrid para reusarlo tal cual en
 * cualquier lugar que necesite la misma interaccion sin ser una grilla (ver
 * FiltrosVentasToolbar). El JSX y el comportamiento son identicos a los que
 * tenia inline el header: esto es una extraccion mecanica, no un rediseño.
 */
interface BotonFiltroOrdenProps<T> {
  columna: ColumnaTabla<T>;
  filtroActivo: boolean;
  ordenActivo: 'asc' | 'desc' | null;
  prioridadOrden: number;
  totalCriterios: number;
  onClickHeader: (columna: ColumnaTabla<T>) => void;
  onClickOrdenar: (columna: ColumnaTabla<T>, event: React.MouseEvent) => void;
  claseBtnFiltro?: string;
  claseBtnOrden?: string;
}

export default function BotonFiltroOrden<T>({
  columna,
  filtroActivo,
  ordenActivo,
  prioridadOrden,
  totalCriterios,
  onClickHeader,
  onClickOrdenar,
  claseBtnFiltro = 'py-3 pl-4 pr-1.5 gap-1.5',
  claseBtnOrden = 'py-3 pl-2 pr-1',
}: BotonFiltroOrdenProps<T>) {
  return (
    <div
      className={`flex items-stretch border-black/35 text-xs font-medium border-b border-l transition-colors duration-100 ease-in ${
        filtroActivo ? 'bg-violet-500 text-white' : 'bg-stone-100'
      }`}
    >
      <button
        type='button'
        onClick={() => onClickHeader(columna)}
        title={filtroActivo ? `Quitar filtro de ${columna.header}` : `Filtrar por ${columna.header}`}
        className={`flex-1 min-w-0 ${claseBtnFiltro} flex items-center cursor-pointer transition-colors duration-100 ease-in text-left ${
          filtroActivo ? 'hover:bg-violet-600' : 'hover:bg-amber-100'
        }`}
      >
        <span className='flex-1 truncate'>{columna.header}</span>
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
        className={`shrink-0 ${claseBtnOrden} flex items-center gap-0.5 cursor-pointer transition-colors duration-100 ease-in ${
          filtroActivo ? 'hover:bg-violet-600' : 'hover:bg-amber-100'
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
          <span className='text-[10px] font-bold leading-none w-3 text-center'>{prioridadOrden + 1}</span>
        )}
      </button>
    </div>
  );
}
