import { useEffect, useMemo, useState } from 'react';
import type { RemitoConDetalles, TIPOS_DE_PAGO } from '@backend/types';
import { listarTiposDePago } from '@/api/tiposDePago';
import RemitoCard from '@/features/ventas/RemitoCard';
import MedidorAnchosRemitoCard from '@/features/ventas/MedidorAnchosRemitoCard';
import { ANCHOS_REMITO_CARD_POR_DEFECTO } from '@/features/ventas/estadosRemito';
import ReimprimirRemitoModal from '@/features/ventas/modales/ReimprimirRemitoModal';
import FiltrosVentasToolbar from '@/features/ventas/FiltrosVentasToolbar';
import type {
  ColumnaFiltrable,
  ColumnaTabla,
  CriterioOrden,
  FiltroColumna,
  OpcionFiltro,
} from '@/components/tabla/tipos';

/**
 * Lista de remitos con sus tres estados (cargando / error / vacio), compartida
 * por VentasPage (pendientes, con acciones) e HistorialPage (historial).
 *
 * Tambien aloja la barra de filtro/orden (FiltrosVentasToolbar), aunque
 * VentasPage/HistorialPage son quienes la manejan (useTablaServidor vive en
 * cada pagina, esto solo reenvia esos props): tiene que vivir ACA y no en la
 * pagina porque comparte con las RemitoCard el ancho medido por
 * MedidorAnchosRemitoCard — cada boton necesita el mismo ancho que su
 * columna real en las tarjetas, y esa medicion depende de los `remitos` que
 * solo tiene esta lista.
 */
interface ListaDeRemitosProps {
  remitos: RemitoConDetalles[];
  cargando: boolean;
  error: string | null;
  textoCargando: string;
  textoVacio: string;
  /** VentasPage estira los estados y la lista (y la barra) a todo el ancho. */
  anchoCompleto?: boolean;
  onPagar?: (remito: RemitoConDetalles) => void;
  onAnular?: (remito: RemitoConDetalles) => void;
  /** Cada tarjeta lo ofrece solo si esa venta esta facturada. */
  onDevolver?: (remito: RemitoConDetalles) => void;

  // --- Barra de filtro/orden (ver FiltrosVentasToolbar / useTablaServidor) ---
  campos: ColumnaTabla<RemitoConDetalles>[];
  filtrosColumna: Record<string, FiltroColumna>;
  ordenColumnas: CriterioOrden[];
  onClickHeader: (columna: ColumnaTabla<RemitoConDetalles>) => void;
  onClickOrdenar: (columna: ColumnaTabla<RemitoConDetalles>, event: React.MouseEvent) => void;
  columnaAbierta: ColumnaFiltrable<RemitoConDetalles> | null;
  opcionesFiltroAbierto: OpcionFiltro[];
  onCerrarFiltro: () => void;
  onAplicarFiltro: (filtro: FiltroColumna | null) => void;
}

export default function ListaDeRemitos({
  remitos,
  cargando,
  error,
  textoCargando,
  textoVacio,
  anchoCompleto = false,
  onPagar,
  onAnular,
  onDevolver,
  campos,
  filtrosColumna,
  ordenColumnas,
  onClickHeader,
  onClickOrdenar,
  columnaAbierta,
  opcionesFiltroAbierto,
  onCerrarFiltro,
  onAplicarFiltro,
}: ListaDeRemitosProps) {
  // Los metodos se piden una sola vez para toda la lista: cada tarjeta los
  // necesita solo para poner el nombre al lado de cada total.
  const [metodos, setMetodos] = useState<TIPOS_DE_PAGO[]>([]);
  const metodosConRecargo = useMemo(() => metodos.filter((m) => m.recargo > 0), [metodos]);

  // Ancho de las 6 columnas de valor variable, calculado por
  // MedidorAnchosRemitoCard contra los remitos VISIBLES en esta pagina Y los
  // botones de la barra — reemplaza los anchos fijos pensados para el peor
  // caso y sincroniza cada boton con su columna real.
  const [anchos, setAnchos] = useState(ANCHOS_REMITO_CARD_POR_DEFECTO);

  // Que remito esta desplegado: se maneja aca (no en cada RemitoCard) para que
  // abrir uno cierre el que estaba abierto antes.
  const [abiertoId, setAbiertoId] = useState<number | null>(null);

  // La reimpresion vive aca y no en cada pagina: no necesita nada del padre y
  // asi VentasPage e HistorialPage la tienen sin repetir el modal.
  const [remitoAReimprimir, setRemitoAReimprimir] = useState<RemitoConDetalles | null>(null);
  const toggleAbierto = (id_remito: number) =>
    setAbiertoId((prev) => (prev === id_remito ? null : id_remito));

  useEffect(() => {
    let cancelado = false;

    listarTiposDePago()
      .then((data) => {
        if (!cancelado) setMetodos([...data].sort((a, b) => a.id_tipos_de_pago - b.id_tipos_de_pago));
      })
      .catch((err) => console.error('Error al obtener los tipos de pago:', err));

    return () => {
      cancelado = true;
    };
  }, []);

  const claseEstado = anchoCompleto ? ' w-full' : '';

  return (
    <div className='border-1 px-3 py-2 rounded-xl border-black/20 w-full min-h-0'>
      <div className={anchoCompleto ? 'w-full' : undefined}>
        <FiltrosVentasToolbar
          campos={campos}
          anchos={anchos}
          filtrosColumna={filtrosColumna}
          ordenColumnas={ordenColumnas}
          onClickHeader={onClickHeader}
          onClickOrdenar={onClickOrdenar}
          columnaAbierta={columnaAbierta}
          opcionesFiltroAbierto={opcionesFiltroAbierto}
          onCerrarFiltro={onCerrarFiltro}
          onAplicarFiltro={onAplicarFiltro}
        />
      </div>

      {cargando && <span className={`text-gray-400${claseEstado}`}>{textoCargando}</span>}

      {!cargando && error && <span className={`text-red-500${claseEstado}`}>{error}</span>}

      {!cargando && !error && remitos.length === 0 && (
        <span className={`text-gray-400${claseEstado}`}>{textoVacio}</span>
      )}

      {!cargando && !error && remitos.length > 0 && (
        <div
          className={`flex flex-col gap-3${anchoCompleto ? ' w-full' : ''} flex-1`}
        >
          {remitos.map((remito) => (
            <RemitoCard
              key={remito.id_remito}
              remito={remito}
              metodos={metodos}
              abierto={abiertoId === remito.id_remito}
              onToggle={() => toggleAbierto(remito.id_remito)}
              onPagar={onPagar}
              onAnular={onAnular}
              onDevolver={onDevolver}
              onReimprimir={setRemitoAReimprimir}
              anchoCodigo={anchos.codigo}
              anchoCliente={anchos.cliente}
              anchoEstado={anchos.estado}
              anchoFechaEmision={anchos.fecha_emision}
              anchoFechaCreacion={anchos.fecha_creacion}
              anchoMonto={anchos.total}
            />
          ))}
        </div>
      )}

      <MedidorAnchosRemitoCard
        remitos={remitos}
        metodosConRecargo={metodosConRecargo}
        campos={campos}
        onMedido={setAnchos}
      />

      <ReimprimirRemitoModal
        abierto={remitoAReimprimir !== null}
        onCerrar={() => setRemitoAReimprimir(null)}
        remito={remitoAReimprimir}
      />
    </div>
  );
}
