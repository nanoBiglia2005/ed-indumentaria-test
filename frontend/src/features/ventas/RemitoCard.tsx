import type { RemitoConDetalles, TIPOS_DE_PAGO } from '@backend/types';
import {
  ESTADO_ANULADO,
  ESTADO_CONFIRMADO,
  ESTADO_DEVUELTO,
  ESTADO_FACTURADO,
} from '@backend/types';
import { formatearFecha, formatearPesos } from '@/utils/formato';
import PaymentIcon from '@/components/ui/PaymentIcon';
import { PALABRA_POR_ESTADO, ANCHOS_REMITO_CARD_POR_DEFECTO } from './estadosRemito';

/**
 * Color segun el estado del remito (tabla ESTADOS_REMITOS).
 *
 * Las clases van ENTERAS y no armadas como `'text-' + color`: Tailwind escanea
 * el codigo buscando nombres de clase completos, asi que una clase concatenada
 * no se genera nunca. Si alguna parecia funcionar era de rebote, porque ese
 * mismo texto literal aparecia en otro archivo.
 */
type EstiloDeEstado = { borde: string; texto: string; fondo: string };

const ESTILO_POR_ESTADO: Record<number, EstiloDeEstado> = {
  [ESTADO_CONFIRMADO]: {
    borde: 'border-orange-400',
    texto: 'text-orange-400',
    fondo: 'bg-orange-400',
  },
  [ESTADO_FACTURADO]: {
    borde: 'border-violet-500',
    texto: 'text-violet-500',
    fondo: 'bg-violet-500',
  },
  [ESTADO_ANULADO]: {
    borde: 'border-gray-500',
    texto: 'text-gray-500',
    fondo: 'bg-gray-500',
  },
  [ESTADO_DEVUELTO]: {
    borde: 'border-red-500',
    texto: 'text-red-500',
    fondo: 'bg-red-500',
  },
};

interface RemitoCardProps {
  remito: RemitoConDetalles;
  /** Metodos de pago, para rotular cada total mientras no este cobrado. */
  metodos?: TIPOS_DE_PAGO[];
  /** Controlado por el padre: asi solo puede haber una tarjeta abierta a la vez. */
  abierto: boolean;
  onToggle: () => void;
  /** Si se pasan, aparecen los botones en el encabezado del detalle. */
  onPagar?: (remito: RemitoConDetalles) => void;
  onAnular?: (remito: RemitoConDetalles) => void;
  /** Solo se ofrece sobre ventas FACTURADAS (ver `puedeDevolver`). */
  onDevolver?: (remito: RemitoConDetalles) => void;
  /** Solo sobre ventas vigentes (ver `puedeReimprimir`): una anulada no se reimprime. */
  onReimprimir?: (remito: RemitoConDetalles) => void;
  /**
   * Ancho (px) de las columnas de valor variable, calculado por ListaDeRemitos
   * segun el remito mas ancho VISIBLE (ver MedidorAnchosRemitoCard) — asi
   * quedan alineadas entre tarjetas sin volver a un ancho fijo pensado para el
   * peor caso.
   */
  anchoCodigo?: number;
  anchoMonto?: number;
  anchoEstado?: number;
  anchoCliente?: number;
  anchoFechaEmision?: number;
  anchoFechaCreacion?: number;
}

function RemitoCard({
  remito,
  metodos = [],
  abierto,
  onToggle,
  onPagar,
  onAnular,
  onDevolver,
  onReimprimir,
  anchoCodigo = ANCHOS_REMITO_CARD_POR_DEFECTO.codigo,
  anchoMonto = ANCHOS_REMITO_CARD_POR_DEFECTO.total,
  anchoEstado = ANCHOS_REMITO_CARD_POR_DEFECTO.estado,
  anchoCliente = ANCHOS_REMITO_CARD_POR_DEFECTO.cliente,
  anchoFechaEmision = ANCHOS_REMITO_CARD_POR_DEFECTO.fecha_emision,
  anchoFechaCreacion = ANCHOS_REMITO_CARD_POR_DEFECTO.fecha_creacion,
}: RemitoCardProps) {
  const metodosConRecargo = metodos.filter((metodo) => metodo.recargo > 0);

  const estilo =
    ESTILO_POR_ESTADO[remito.id_estado ?? ESTADO_FACTURADO] ?? ESTILO_POR_ESTADO[ESTADO_FACTURADO];
  const palabra = PALABRA_POR_ESTADO[remito.id_estado ?? ESTADO_FACTURADO] ?? 'Desconocido';

  const puedeDevolver = Boolean(onDevolver) && remito.id_estado === ESTADO_FACTURADO;
  const puedeReimprimir =
    Boolean(onReimprimir) &&
    (remito.id_estado === ESTADO_CONFIRMADO || remito.id_estado === ESTADO_FACTURADO);
  const hayAcciones = Boolean(onPagar || onAnular) || puedeDevolver || puedeReimprimir;

  // shrink-0: dentro de la lista en columna, si no, las tarjetas se aplastan
  // en vez de dejar scrollear cuando hay muchas ventas.
  return (
    <div className={`w-full shrink-0 border ${estilo.borde} rounded-xl shadow-lg hover:shadow-xl select-none overflow-hidden`}>
      <button
        type='button'
        onClick={onToggle}
        className='w-full flex items-center justify-between gap-4 pe-5 cursor-pointer text-left hover:bg-amber-50 transition-colors duration-100 ease-in'
      > 
        <div className={`flex gap-3 items-center min-w-0 overflow-x-auto ${estilo.texto}`}>
          <span
            style={{ width: anchoCodigo }}
            className={`text-2xl font-bold px-5 py-3 text-center ${abierto ? `text-white ${estilo.fondo}` : estilo.texto} transition-colors duration-100 ease-in border-e-1`}
          >
            <p>{remito.cod_mes}-{remito.cod_remito_final}</p>
          </span>

          {/* Estado como pill de color: es el dato mas escaneable de un vistazo
              (junto con codigo y total), no un dato mas apilado como fecha o
              cliente — de ahi que vaya justo despues del codigo, antes del
              total, y no como texto chico con label. */}
          {remito.id_estado !== ESTADO_CONFIRMADO && (
            <div style={{ width: anchoEstado }} className='flex items-center px-2'>
              <span
                className={`inline-flex items-center justify-center rounded-full px-2.5 py-1 text-xs font-bold text-white ${estilo.fondo}`}
              >
                {palabra}
              </span>
            </div>
          )}

          {remito.id_estado !== ESTADO_CONFIRMADO ? (
            <span style={{ width: anchoMonto }} className='text-xl font-bold px-2'>
              {formatearPesos(remito.total_final ?? remito.total_efectivo)}
            </span>
          ) : (
            <div style={{ width: anchoMonto }} className='flex flex-col px-2'>
              <span className='font-semibold text-gray-900 flex gap-1 items-center'>
                <PaymentIcon paymentId={1} height={18}/>
                {formatearPesos(remito.total_efectivo) ?? 0}
              </span>
              {metodosConRecargo.map((metodo) => (
                <span
                  key={metodo.id_tipos_de_pago}
                  className='font-semibold text-violet-600 flex gap-1 items-center'
                  title={`Total con ${metodo.nombre_tipo_de_pago}`}
                >
                  <PaymentIcon paymentId={metodo.id_tipos_de_pago} height={18}/>
                  {formatearPesos(remito.totales_por_metodo?.[metodo.id_tipos_de_pago]) ?? 0}
                </span>
              ))}
            </div>
          )}

          {remito.id_estado !== ESTADO_CONFIRMADO && (
            <div style={{ width: anchoFechaEmision }} className='flex flex-col px-2'>
              <span className='text-xs text-gray-400'>Fecha de Emisión</span>
              <span className={`font-medium ${!remito.fecha_de_emision ? 'text-gray text-sm' : 'text-black'}`}>{formatearFecha(remito.fecha_de_emision)}</span>
            </div>
          )}
          <div style={{ width: anchoFechaCreacion }} className='flex flex-col px-2'>
            <span className='text-xs text-gray-400'>Fecha de Creación</span>
            <span className={`font-medium ${!remito.fecha_de_creacion ? 'text-gray text-sm' : 'text-black'}`}>{formatearFecha(remito.fecha_de_creacion)}</span>
          </div>
          <div style={{ width: anchoCliente }} className='flex flex-col px-2'>
            <span className='text-xs text-gray-400'>Cliente</span>
            <span className={`text-black font-medium`}>{remito.CLIENTES ? remito.CLIENTES.nombre + ' ' +remito.CLIENTES.apellido : 'No Asignado'}</span>
          </div>
        </div>
        <div className='flex items-center gap-4 shrink-0'>
        {/* Los botones se montan SIEMPRE (si no, no habria nada que animar) y lo
            que se anima es el ancho de la columna.

            0fr -> 1fr y no max-w-0 -> max-w-[N]: con max-w hay que elegir un
            tope fijo, y como es mas grande que los botones la animacion termina
            a mitad de camino y se ve como un salto. `1fr` mide el ancho real,
            asi que el tiempo es el mismo con uno o con dos botones. */}
        {hayAcciones && (
          <div
            className={`grid transition-[grid-template-columns] duration-300 ease-out ${
              abierto ? 'grid-cols-[1fr]' : 'grid-cols-[0fr]'
            }`}
          >
            {/* justify-end mantiene los botones pegados al borde derecho y deja
                que lo que todavia no entra se recorte por la IZQUIERDA: de ahi
                que aparezcan de derecha a izquierda. */}
            <div className='flex justify-end overflow-hidden'>
              {/* La duracion cambia con `abierto`, que es lo que permite que el
                  fundido no compita con el barrido de arriba:

                  al ABRIR va mas lento que el ancho (500 vs 300) asi el fundido
                  se sigue viendo despues de que los botones terminaron de
                  destaparse; al CERRAR va mas rapido (150) para que alcancen a
                  desvanecerse antes de que el recorte se los coma. */}
              <div
                className={`flex items-center gap-2 shrink-0 transition-opacity ease-out ${
                  abierto ? 'opacity-100 duration-500' : 'opacity-0 duration-150'
                }`}
              >
                {puedeReimprimir && (
                  <div
                    onClick={() => onReimprimir?.(remito)}
                    className='rounded border border-amber-500 px-3 py-1 font-semibold text-amber-600 cursor-pointer transition-colors duration-100 ease-in hover:bg-amber-500 hover:text-white'
                  >
                    Reimprimir
                  </div>
                )}
                {onPagar && (
                  <div
                    onClick={() => onPagar(remito)}
                    className='rounded border border-violet-500 bg-violet-500 px-3 py-1 font-semibold text-white cursor-pointer transition-colors duration-100 ease-in hover:bg-violet-600 active:bg-violet-700'
                  >
                    Pagar Remito
                  </div>
                )}
                {onAnular && (
                  <div
                    onClick={() => onAnular(remito)}
                    className='rounded border border-red-500 px-3 py-1 font-semibold text-red-600 cursor-pointer transition-colors duration-100 ease-in hover:bg-red-500 hover:text-white'
                  >
                    Anular Remito
                  </div>
                )}
                {puedeDevolver && (
                  <div
                    onClick={() => onDevolver?.(remito)}
                    className='rounded border border-red-500 px-3 py-1 font-semibold hover:bg-red-600 cursor-pointer transition-colors duration-100 ease-in bg-red-500 text-white'
                  >
                    Devolver Venta
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
          <svg
            className={`w-5 h-5 text-gray-400 transition-transform duration-200 ease-in-out ${
              abierto ? 'rotate-180' : ''
            }`}
            fill='none'
            viewBox='0 0 24 24'
            stroke='currentColor'
            strokeWidth={2}
          >
            <path strokeLinecap='round' strokeLinejoin='round' d='M19 9l-7 7-7-7' />
          </svg>
        </div>
      </button>

      <div
        className={`overflow-y-auto transition-all duration-200 ease-in-out ${
          abierto ? 'max-h-60 border-black/10 border-t' : 'max-h-0'
        }`}
      >

        <div className='px-5 py-2 overflow-x-auto'>
          {remito.DETALLES_REMITO.length === 0 ? (
            <p className='text-sm text-gray-400 italic py-2'>Sin artículos</p>
          ) : (
            <div className='min-w-max divide-y divide-black/5'>
              {/* Rotula una sola vez que las dos columnas de la derecha son
                  precio unitario (arriba, en la fila del articulo) y subtotal
                  (con cantidad ya aplicada) — evita repetir la aclaracion en
                  cada fila cuando hay 2-3 metodos con recargo. */}
              <div className='flex items-center justify-between gap-3 pb-1 text-[10px] font-semibold uppercase tracking-wide text-gray-400'>
                <span>Artículo / precio unitario</span>
                <div className='flex items-center gap-4 shrink-0'>
                  <span>Cant.</span>
                  <span>Subtotal</span>
                </div>
              </div>
              {remito.DETALLES_REMITO.map((detalle) => (
                <div key={detalle.id_detalle} className='flex items-center justify-between gap-3 py-2 text-sm text-black'>
                  <div className='flex flex-col min-w-[300px] font-medium'>
                    <span className='truncate'>{detalle.ARTICULOS?.descripcion ?? `Artículo ${detalle.id_articulo}`}</span>
                    <div className='flex flex-wrap gap-x-3 gap-y-0.5'>
                      <div className='flex gap-1 items-center min-w-18'>
                        <PaymentIcon paymentId={1} height={16}/>
                        <span className='text-gray-500'>{formatearPesos(detalle.precio ?? 0)}</span>
                      </div>
                      {metodosConRecargo.map((metodo) => (
                        <div className='text-violet-500 flex gap-1 items-center min-w-18' key={metodo.id_tipos_de_pago}>
                          <PaymentIcon paymentId={metodo.id_tipos_de_pago} height={16}/>
                          <span>{formatearPesos(detalle.precios_por_metodo[metodo.id_tipos_de_pago])}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className='flex items-center gap-4 shrink-0 text-gray-600'>
                    <span>x{detalle.cantidad}</span>
                    <div className='flex-col text-md'>
                      <div className='flex gap-1 items-center text-black justify-end'>
                        <span className='font-medium'>{formatearPesos(detalle.precio && detalle.cantidad ? detalle.precio * detalle.cantidad : 0)}</span>
                        <PaymentIcon paymentId={1} height={16}/>
                      </div>
                      {metodosConRecargo.map((metodo) => (
                      <div className='text-violet-500 flex gap-1 items-center justify-end' key={metodo.id_tipos_de_pago}>
                        <span className='font-medium'>{formatearPesos(detalle.precios_por_metodo[metodo.id_tipos_de_pago]
                        && detalle.cantidad ? detalle.precios_por_metodo[metodo.id_tipos_de_pago] * detalle.cantidad : 0)}</span>
                        <PaymentIcon paymentId={metodo.id_tipos_de_pago} height={16}/>
                      </div>
                      ))}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default RemitoCard;
