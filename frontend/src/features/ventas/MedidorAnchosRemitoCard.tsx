import { useLayoutEffect, useRef } from 'react';
import type { RemitoConDetalles, TIPOS_DE_PAGO } from '@backend/types';
import { ESTADO_CONFIRMADO } from '@backend/types';
import { formatearFecha, formatearPesos } from '@/utils/formato';
import PaymentIcon from '@/components/ui/PaymentIcon';
import { esFiltrable } from '@/components/tabla/tipos';
import type { ColumnaTabla } from '@/components/tabla/tipos';
import BotonFiltroVentas from './BotonFiltroVentas';
import { PALABRA_POR_ESTADO, ANCHOS_REMITO_CARD_POR_DEFECTO } from './estadosRemito';
import type { AnchosRemitoCard } from './estadosRemito';

// Margen de seguridad sobre el ancho medido: cubre el redondeo a subpixel
// entre la medicion (getBoundingClientRect) y el layout final.
const MARGEN_PX = 2;

// Handlers dummy para los botones ocultos: nunca son clickeables
// (visibility:hidden + pointer-events:none en el contenedor), pero
// BotonFiltroVentas los exige.
const NOOP = () => {};

interface MedidorProps {
  /** Los remitos VISIBLES (la pagina actual), no toda la tabla. */
  remitos: RemitoConDetalles[];
  metodosConRecargo: TIPOS_DE_PAGO[];
  /**
   * Campos filtrables de la barra (4 en Ventas pendientes, 6 en Historial:
   * ver campos.ts). Cada uno aporta el ancho de su ETIQUETA como piso ademas
   * del contenido medido — a diferencia de `minimo` mas abajo (que es un
   * peor-caso arbitrario y solo se usa mientras no hay remitos), la etiqueta
   * es texto fijo: "lo minimo que necesita el boton para no cortarse", igual
   * que un header de tabla real.
   */
  campos: ColumnaTabla<RemitoConDetalles>[];
  onMedido: (anchos: AnchosRemitoCard) => void;
}

/**
 * Mide, fuera de pantalla, el ancho que necesita cada una de las 6 columnas
 * de valor variable compartidas por RemitoCard y por los botones de
 * FiltrosVentasToolbar (codigo, cliente, estado, fecha_emision,
 * fecha_creacion, total): el ancho final de cada una es el maximo entre el
 * contenido real de los remitos VISIBLES y el ancho natural del boton de
 * filtro correspondiente — asi el boton queda alineado como cabecera de su
 * columna y ademas nunca corta su propia etiqueta.
 *
 * El markup espejado abajo tiene que tener EXACTAMENTE las mismas clases que
 * los campos reales de RemitoCard (misma tipografia/padding): si diverge, la
 * medicion queda mal. El boton de la barra, en cambio, se mide reusando el
 * componente real (BotonFiltroVentas): no hay markup espejado que pueda
 * divergir. No renderiza nada visible.
 */
export default function MedidorAnchosRemitoCard({ remitos, metodosConRecargo, campos, onMedido }: MedidorProps) {
  const refCodigo = useRef<HTMLDivElement>(null);
  const refCliente = useRef<HTMLDivElement>(null);
  const refEstado = useRef<HTMLDivElement>(null);
  const refFechaEmision = useRef<HTMLDivElement>(null);
  const refFechaCreacion = useRef<HTMLDivElement>(null);
  const refMonto = useRef<HTMLDivElement>(null);
  const refEtiquetas = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    // `minimo` es el peor caso posible (ANCHOS_REMITO_CARD_POR_DEFECTO): solo
    // se usa cuando no hay NADA que medir (antes de que carguen los remitos).
    // Una vez que hay remitos, gana la medicion real sin piso artificial (ver
    // el comentario de cabecera: usar `minimo` como piso permanente aca
    // anulaba la medicion real, porque el peor caso nunca pierde un max()).
    const anchoMax = (el: HTMLDivElement | null, minimo: number) => {
      if (!el || el.children.length === 0) return minimo;
      const anchos = Array.from(el.children).map((c) => c.getBoundingClientRect().width + MARGEN_PX);
      return Math.max(...anchos);
    };

    const etiquetas: Record<string, number> = {};
    if (refEtiquetas.current) {
      Array.from(refEtiquetas.current.children).forEach((hijo) => {
        const key = (hijo as HTMLElement).dataset.filtroKey;
        if (key) etiquetas[key] = hijo.getBoundingClientRect().width + MARGEN_PX;
      });
    }

    onMedido({
      codigo: Math.max(
        anchoMax(refCodigo.current, ANCHOS_REMITO_CARD_POR_DEFECTO.codigo),
        etiquetas.codigo ?? 0
      ),
      cliente: Math.max(
        anchoMax(refCliente.current, ANCHOS_REMITO_CARD_POR_DEFECTO.cliente),
        etiquetas.cliente ?? 0
      ),
      estado: Math.max(
        anchoMax(refEstado.current, ANCHOS_REMITO_CARD_POR_DEFECTO.estado),
        etiquetas.estado ?? 0
      ),
      fecha_emision: Math.max(
        anchoMax(refFechaEmision.current, ANCHOS_REMITO_CARD_POR_DEFECTO.fecha_emision),
        etiquetas.fecha_emision ?? 0
      ),
      fecha_creacion: Math.max(
        anchoMax(refFechaCreacion.current, ANCHOS_REMITO_CARD_POR_DEFECTO.fecha_creacion),
        etiquetas.fecha_creacion ?? 0
      ),
      total: Math.max(anchoMax(refMonto.current, ANCHOS_REMITO_CARD_POR_DEFECTO.total), etiquetas.total ?? 0),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [remitos, metodosConRecargo, campos]);

  return (
    <div
      aria-hidden
      style={{ position: 'absolute', top: -9999, left: -9999, visibility: 'hidden', pointerEvents: 'none' }}
    >
      <div ref={refCodigo}>
        {remitos.map((r) => (
          <span key={r.id_remito} className='inline-block whitespace-nowrap text-2xl font-bold px-5 py-3 border-e-1'>
            {r.cod_mes}-{r.cod_remito_final}
          </span>
        ))}
      </div>

      <div ref={refCliente}>
        {remitos.map((r) => (
          <div key={r.id_remito} className='inline-flex flex-col whitespace-nowrap px-2'>
            <span className='text-xs text-gray-400'>Cliente</span>
            <span className='text-black font-medium'>
              {r.CLIENTES ? `${r.CLIENTES.nombre} ${r.CLIENTES.apellido}` : 'No Asignado'}
            </span>
          </div>
        ))}
      </div>

      <div ref={refEstado}>
        {/* Espeja la pill de estado de RemitoCard (misma tipografia/padding;
            el color no afecta el ancho medido asi que no hace falta
            reproducirlo aca). */}
        {remitos.map((r) => (
          <div key={r.id_remito} className='inline-flex items-center whitespace-nowrap px-2'>
            <span className='inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold'>
              {PALABRA_POR_ESTADO[r.id_estado ?? ESTADO_CONFIRMADO] ?? 'Desconocido'}
            </span>
          </div>
        ))}
      </div>

      <div ref={refFechaEmision}>
        {remitos.map((r) => (
          <div key={r.id_remito} className='inline-flex flex-col whitespace-nowrap px-2'>
            <span className='text-xs text-gray-400'>Fecha de Emisión</span>
            <span className='text-black font-medium'>{formatearFecha(r.fecha_de_emision)}</span>
          </div>
        ))}
      </div>

      <div ref={refFechaCreacion}>
        {remitos.map((r) => (
          <div key={r.id_remito} className='inline-flex flex-col whitespace-nowrap px-2'>
            <span className='text-xs text-gray-400'>Fecha de Creación</span>
            <span className='text-black font-medium'>{formatearFecha(r.fecha_de_creacion)}</span>
          </div>
        ))}
      </div>

      <div ref={refMonto}>
        {remitos.map((r) =>
          r.id_estado === ESTADO_CONFIRMADO ? (
            <div key={r.id_remito} className='inline-flex flex-col whitespace-nowrap px-2'>
              <span className='font-semibold flex gap-1 items-center'>
                <PaymentIcon paymentId={1} height={18} />
                {formatearPesos(r.total_efectivo) ?? 0}
              </span>
              {metodosConRecargo.map((metodo) => (
                <span key={metodo.id_tipos_de_pago} className='font-semibold flex gap-1 items-center'>
                  <PaymentIcon paymentId={metodo.id_tipos_de_pago} height={18} />
                  {formatearPesos(r.totales_por_metodo?.[metodo.id_tipos_de_pago]) ?? 0}
                </span>
              ))}
            </div>
          ) : (
            <span key={r.id_remito} className='inline-block whitespace-nowrap text-xl font-bold px-2'>
              {formatearPesos(r.total_final ?? r.total_efectivo)}
            </span>
          )
        )}
      </div>

      <div ref={refEtiquetas}>
        {/*
          Se mide en el estado MAS ANCHO posible del boton (con flecha de
          orden + badge de prioridad de 2 digitos), no en reposo: el ancho
          asignado es fijo (style={{width}}), asi que si se midiera sin el
          badge, el dia que ese campo entre a un orden multiple el badge
          real no tendria donde entrar y el nombre se cortaria (visto en la
          practica: "Estado" -> "Es...", "Total" -> "T.."). Midiendo siempre
          con el peor caso, el boton real NUNCA necesita mas espacio del que
          ya tiene reservado.
        */}
        {campos.filter(esFiltrable).map((campo) => (
          <div key={campo.filtroKey} data-filtro-key={campo.filtroKey} className='inline-block'>
            <BotonFiltroVentas
              columna={campo}
              filtroActivo={false}
              ordenActivo='asc'
              prioridadOrden={0}
              totalCriterios={2}
              onClickHeader={NOOP}
              onClickOrdenar={NOOP}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
