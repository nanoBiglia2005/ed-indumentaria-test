import { useEffect, useMemo, useRef, useState } from 'react';
import type { RemitoConDetalles } from '@backend/types';
import { useNotificacion } from '@/hooks/useNotificacion';
import { useResetAlCambiar } from '@/hooks/useResetAlCambiar';
import { useTablaServidor } from '@/components/tabla/useTablaServidor';
import { preset30Dias } from '@/components/tabla/presetsFecha';
import Paginador from '@/components/tabla/Paginador';
import { listarRemitosPagina } from '@/api/remitos';
import type { ParamsRemitos } from '@/api/remitos';
import ListaDeRemitos from '@/features/ventas/ListaDeRemitos';
import { useOpcionesDeFiltro } from '@/features/ventas/useOpcionesDeFiltro';
import type { OpcionesCargadas } from '@/features/ventas/useOpcionesDeFiltro';
import { camposHistorial } from '@/features/ventas/campos';
import ConfirmarAccionRemitoModal from '@/features/ventas/modales/ConfirmarAccionRemitoModal';
import { ACCION_DEVOLVER } from '@/features/ventas/modales/accionesDeRemito';
import { codigoRemito } from '@/features/ventas/codigoRemito';
import Notificacion from '@/components/ui/Notificacion';
import SectionWrapper from '@/components/layout/SectionWrapper';

const TAMANO_PAGINA = 30;

/**
 * Historial: filtrado/ordenado en la base (mismo mecanismo que Articulos, ver
 * lib/remitosConsulta.js), pero la lista sigue siendo RemitoCard — no un
 * DataGrid (ver FiltrosVentasToolbar).
 */
function HistorialPage() {
  const [remitos, setRemitos] = useState<RemitoConDetalles[]>([]);
  const [total, setTotal] = useState(0);
  const [pagina, setPagina] = useState(1);
  const [cargando, setCargando] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);

  // Venta facturada que se esta devolviendo.
  const [remitoADevolver, setRemitoADevolver] = useState<RemitoConDetalles | null>(null);
  const { notificacion, mostrar: mostrarNotificacion } = useNotificacion();

  // Opciones del filtro de seleccion recien abierto (hoy solo "Cliente":
  // "Estado" tiene opciones fijas, ver campos.ts). El estado vive aca, ANTES
  // de useTablaServidor, porque este lo necesita de entrada — ver el
  // comentario de cabecera de useOpcionesDeFiltro.
  const [opciones, setOpciones] = useState<OpcionesCargadas | null>(null);

  // Arranca acotado a los ultimos 30 dias por Fecha de Creacion (nunca es
  // null, a diferencia de Fecha de Emision — ver ANCHOS_REMITO_CARD_POR_DEFECTO
  // y el comentario del trigger en la migracion 0_init), el mismo rango que
  // el preset "Últimos 30 días" del modal (ver presetsFecha.ts): el usuario lo
  // puede ampliar o sacar como cualquier otro filtro, esto es solo el punto de
  // partida al entrar a la pagina.
  const tabla = useTablaServidor({
    columnas: camposHistorial,
    opciones: opciones?.valores ?? [],
    filtrosIniciales: { fecha_creacion: { tipo: 'fecha', ...preset30Dias() } },
  });

  // Cambia de identidad solo cuando cambia algun filtro o el orden.
  const params = useMemo<ParamsRemitos>(
    () => ({ filtros: tabla.filtrosColumna, orden: tabla.ordenColumnas }),
    [tabla.filtrosColumna, tabla.ordenColumnas]
  );

  const opcionesListas = useOpcionesDeFiltro('historial', params, tabla.columnaAbierta, opciones, setOpciones);

  // Cualquier cambio de filtro/orden vuelve a la primera pagina.
  useResetAlCambiar(params, () => setPagina(1));

  // Cualquier disparador de una consulta nueva (filtro/orden, pagina o
  // recarga) marca "cargando" y limpia el error ya en este render — evita
  // setState sincronico dentro del efecto (react-hooks/set-state-in-effect).
  const marcarCargando = () => {
    setCargando(true);
    setError(null);
  };
  useResetAlCambiar(params, marcarCargando);
  useResetAlCambiar(pagina, marcarCargando);
  useResetAlCambiar(recarga, marcarCargando);

  // Las respuestas pueden llegar desordenadas (una consulta lenta despues de
  // una rapida): solo se acepta la de la ultima peticion disparada.
  const secuencia = useRef(0);

  useEffect(() => {
    const peticion = ++secuencia.current;

    listarRemitosPagina(params, pagina, TAMANO_PAGINA)
      .then((respuesta) => {
        if (peticion !== secuencia.current) return;
        setRemitos(respuesta.remitos);
        setTotal(respuesta.total);
        const ultima = Math.max(1, Math.ceil(respuesta.total / TAMANO_PAGINA));
        if (pagina > ultima) setPagina(ultima);
      })
      .catch((err) => {
        if (peticion !== secuencia.current) return;
        console.error('Error al obtener las ventas:', err);
        setError('No se pudieron cargar las ventas.');
      })
      .finally(() => {
        if (peticion === secuencia.current) setCargando(false);
      });
  }, [params, pagina, recarga]);

  const recargarPagina = () => setRecarga((n) => n + 1);

  // La venta no se va de la lista (el historial las muestra todas): cambia de
  // estado, asi que hay que recargar para que la tarjeta se repinte.
  const handleDevuelto = (remito: RemitoConDetalles) => {
    setRemitoADevolver(null);
    recargarPagina();

    const codigo = codigoRemito(remito.cod_mes, remito.cod_remito_final);
    mostrarNotificacion(codigo ? `Venta ${codigo} devuelta.` : 'Venta devuelta.');
  };

  return (
    <SectionWrapper>
      <Notificacion mensaje={notificacion} posicion='pagina' />

      <div className='flex flex-col w-full h-full px-5 pt-10 min-h-0'>
        <div className='flex items-center justify-between mb-5 shrink-0'>
          <span className='text-2xl font-semibold text-black'>Historial de Ventas</span>
        </div>

        <ListaDeRemitos
          remitos={remitos}
          cargando={cargando && remitos.length === 0}
          error={error}
          textoCargando='Cargando ventas...'
          textoVacio='No hay ventas que coincidan con los filtros.'
          onDevolver={setRemitoADevolver}
          campos={camposHistorial}
          filtrosColumna={tabla.filtrosColumna}
          ordenColumnas={tabla.ordenColumnas}
          onClickHeader={tabla.handleClickHeader}
          onClickOrdenar={tabla.handleClickOrdenar}
          columnaAbierta={tabla.columnaAbierta}
          opcionesFiltroAbierto={tabla.opcionesFiltroAbierto}
          opcionesListas={opcionesListas}
          onCerrarFiltro={() => tabla.setColumnaFiltroAbierta(null)}
          onAplicarFiltro={tabla.handleAplicarFiltro}
        />

        <Paginador
          pagina={pagina}
          tamano={TAMANO_PAGINA}
          total={total}
          cargando={cargando}
          onCambiarPagina={setPagina}
        />
      </div>

      <ConfirmarAccionRemitoModal
        abierto={remitoADevolver !== null}
        remito={remitoADevolver}
        accion={ACCION_DEVOLVER}
        onCerrar={() => setRemitoADevolver(null)}
        onHecho={handleDevuelto}
      />
    </SectionWrapper>
  );
}

export default HistorialPage;
