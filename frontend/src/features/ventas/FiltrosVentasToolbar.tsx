import BotonFiltroVentas from './BotonFiltroVentas';
import ColumnFilterModal from '@/components/tabla/ColumnFilterModal';
import { esFiltrable } from '@/components/tabla/tipos';
import type {
  ColumnaFiltrable,
  ColumnaTabla,
  CriterioOrden,
  FiltroColumna,
  OpcionFiltro,
} from '@/components/tabla/tipos';
import type { AnchosRemitoCard } from './estadosRemito';

/**
 * Barra de filtro/orden de Ventas/Historial: mismo motor y misma interaccion
 * que los headers de columna de DataGrid (useTablaServidor + ColumnFilterModal,
 * reusados tal cual), pero en fila arriba de la lista de RemitoCard en vez de
 * headers de una grilla — no hay columnas de tabla que mostrar, asi que el
 * boton en si (BotonFiltroVentas) tiene un look propio que dialoga con
 * RemitoCard en vez de reusar la estetica de spreadsheet de BotonFiltroOrden.
 */
interface FiltrosVentasToolbarProps<T> {
  campos: ColumnaTabla<T>[];
  /**
   * Ancho (px) por campo, keyeado por `filtroKey` — el mismo que usa
   * RemitoCard para sus columnas (ver ListaDeRemitos / MedidorAnchosRemitoCard):
   * cada boton queda tan ancho como la columna que filtra, como si fuese su
   * cabecera.
   */
  anchos: AnchosRemitoCard;
  filtrosColumna: Record<string, FiltroColumna>;
  ordenColumnas: CriterioOrden[];
  onClickHeader: (columna: ColumnaTabla<T>) => void;
  onClickOrdenar: (columna: ColumnaTabla<T>, event: React.MouseEvent) => void;
  columnaAbierta: ColumnaFiltrable<T> | null;
  opcionesFiltroAbierto: OpcionFiltro[];
  onCerrarFiltro: () => void;
  onAplicarFiltro: (filtro: FiltroColumna | null) => void;
}

export default function FiltrosVentasToolbar<T>({
  campos,
  anchos,
  filtrosColumna,
  ordenColumnas,
  onClickHeader,
  onClickOrdenar,
  columnaAbierta,
  opcionesFiltroAbierto,
  onCerrarFiltro,
  onAplicarFiltro,
}: FiltrosVentasToolbarProps<T>) {
  return (
    <>
      <div className='flex flex-wrap gap-3 mb-2 shrink-0'>
        {campos.filter(esFiltrable).map((campo) => {
          const filtroActivo = filtrosColumna[campo.filtroKey];
          const prioridadOrden = ordenColumnas.findIndex((c) => c.key === campo.filtroKey);
          const ordenActivo = prioridadOrden === -1 ? null : ordenColumnas[prioridadOrden].direccion;
          return (
            <BotonFiltroVentas
              key={campo.header}
              columna={campo}
              ancho={anchos[campo.filtroKey as keyof AnchosRemitoCard]}
              filtroActivo={Boolean(filtroActivo)}
              ordenActivo={ordenActivo}
              prioridadOrden={prioridadOrden}
              totalCriterios={ordenColumnas.length}
              onClickHeader={onClickHeader}
              onClickOrdenar={onClickOrdenar}
            />
          );
        })}
      </div>

      <ColumnFilterModal
        abierto={columnaAbierta !== null}
        onCerrar={onCerrarFiltro}
        titulo={columnaAbierta?.header ?? ''}
        tipo={columnaAbierta?.filtro.tipo ?? null}
        filtroActual={columnaAbierta ? filtrosColumna[columnaAbierta.filtroKey] : undefined}
        opciones={opcionesFiltroAbierto}
        onAplicar={onAplicarFiltro}
      />
    </>
  );
}
