import { useEffect, useMemo, useState } from 'react';
import BaseModal from '@/components/ui/BaseModal';
import SearchInput from '@/components/ui/SearchInput';
import { useToggleSet } from '@/hooks/useToggleSet';
import { normalizarBusqueda } from '@/utils/texto';
import { presetsDeFecha } from '@/components/tabla/presetsFecha';

import type { FiltroColumna, OpcionFiltro } from '@/components/tabla/tipos';

// Fuente unica de estos tipos: components/tabla/tipos.ts (se re-exportan por compatibilidad).
export type { FiltroColumna, OpcionFiltro } from '@/components/tabla/tipos';

interface ColumnFilterModalProps {
  abierto: boolean;
  onCerrar: () => void;
  titulo: string;
  tipo: 'texto' | 'rango' | 'seleccion' | 'fecha' | null;
  filtroActual?: FiltroColumna;
  opciones?: OpcionFiltro[];
  onAplicar: (filtro: FiltroColumna | null) => void;
  /**
   * z-index del modal. Por defecto queda en la capa base (z-50), que alcanza
   * cuando la tabla vive en una pagina. Si la tabla esta DENTRO de otro modal
   * hay que subirlo por encima de ese, o el filtro se abre por detras.
   */
  z?: string;
}

export default function ColumnFilterModal({
  abierto,
  onCerrar,
  titulo,
  tipo,
  filtroActual,
  opciones = [],
  onAplicar,
  z,
}: ColumnFilterModalProps) {
  const [valorTexto, setValorTexto] = useState('');
  const [desde, setDesde] = useState('');
  const [hasta, setHasta] = useState('');
  // Vista del filtro de fecha: arranca en los presets (Hoy/7 dias/30 dias/Mes/
  // Año); "Personalizado" pasa a los inputs de rango existentes.
  const [mostrarPersonalizado, setMostrarPersonalizado] = useState(false);
  const { seleccionados: idsSeleccionados, toggle: toggleId, setSeleccionados: setIdsSeleccionados } =
    useToggleSet<number>();
  const [busqueda, setBusqueda] = useState('');
  const [error, setError] = useState<string | null>(null);

  // La busqueda solo filtra lo que se ve: no toca los ids seleccionados.
  const opcionesVisibles = useMemo(() => {
    const termino = normalizarBusqueda(busqueda);
    if (termino === '') return opciones;
    return opciones.filter((opcion) => normalizarBusqueda(opcion.nombre).includes(termino));
  }, [opciones, busqueda]);

  useEffect(() => {
    if (!abierto) return;
    setError(null);
    setBusqueda('');

    if (tipo === 'texto') {
      setValorTexto(filtroActual?.tipo === 'texto' ? filtroActual.valor : '');
    } else if (tipo === 'rango') {
      const rango = filtroActual?.tipo === 'rango' ? filtroActual : null;
      setDesde(rango && rango.desde !== null ? String(rango.desde) : '');
      setHasta(rango && rango.hasta !== null ? String(rango.hasta) : '');
    } else if (tipo === 'fecha') {
      const fecha = filtroActual?.tipo === 'fecha' ? filtroActual : null;
      setDesde(fecha?.desde ?? '');
      setHasta(fecha?.hasta ?? '');
      // Siempre arranca en la lista de presets, aunque ya haya un filtro
      // personalizado aplicado: entrar a editarlo es un click en
      // "Personalizado" mas, igual que elegir cualquier otro preset.
      setMostrarPersonalizado(false);
    } else if (tipo === 'seleccion') {
      const seleccion = filtroActual?.tipo === 'seleccion' ? filtroActual.ids : null;
      setIdsSeleccionados(new Set(seleccion ?? opciones.map((o) => o.id)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [abierto, tipo]);

  /** Un preset SE APLICA con el click: no pasa por el footer "Aplicar". */
  const handleAplicarPreset = (desdePreset: string, hastaPreset: string) => {
    onAplicar({ tipo: 'fecha', desde: desdePreset, hasta: hastaPreset });
    onCerrar();
  };

  const handleAplicar = () => {
    if (tipo === 'texto') {
      const valor = valorTexto.trim();
      onAplicar(valor === '' ? null : { tipo: 'texto', valor });
      onCerrar();
      return;
    }

    if (tipo === 'rango') {
      const textoDesde = desde.trim();
      const textoHasta = hasta.trim();
      const valorDesde = textoDesde === '' ? null : Number(textoDesde);
      const valorHasta = textoHasta === '' ? null : Number(textoHasta);

      if (valorDesde !== null && Number.isNaN(valorDesde)) {
        setError('El valor "Desde" debe ser un número.');
        return;
      }
      if (valorHasta !== null && Number.isNaN(valorHasta)) {
        setError('El valor "Hasta" debe ser un número.');
        return;
      }
      if (valorDesde !== null && valorHasta !== null && valorDesde > valorHasta) {
        setError('El valor "Desde" no puede ser mayor que el valor "Hasta".');
        return;
      }

      setError(null);
      onAplicar(
        valorDesde === null && valorHasta === null
          ? null
          : { tipo: 'rango', desde: valorDesde, hasta: valorHasta }
      );
      onCerrar();
      return;
    }

    if (tipo === 'seleccion') {
      const todasSeleccionadas = opciones.length > 0 && idsSeleccionados.size === opciones.length;
      onAplicar(todasSeleccionadas ? null : { tipo: 'seleccion', ids: [...idsSeleccionados] });
      onCerrar();
      return;
    }

    if (tipo === 'fecha') {
      const valorDesde = desde.trim() === '' ? null : desde.trim();
      const valorHasta = hasta.trim() === '' ? null : hasta.trim();

      if (valorDesde !== null && valorHasta !== null && valorDesde > valorHasta) {
        setError('La fecha "Desde" no puede ser posterior a la fecha "Hasta".');
        return;
      }

      setError(null);
      onAplicar(
        valorDesde === null && valorHasta === null ? null : { tipo: 'fecha', desde: valorDesde, hasta: valorHasta }
      );
      onCerrar();
    }
  };

  return (
    <BaseModal
      abierto={abierto}
      onCerrar={onCerrar}
      titulo={`Filtrar por ${titulo}`}
      z={z}
      footer={
        tipo === 'fecha' && !mostrarPersonalizado ? (
          // Los presets se aplican solos con el click: este footer solo
          // ofrece cancelar, no hay nada pendiente que "Aplicar".
          <button
            onClick={onCerrar}
            className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors cursor-pointer'
          >
            Cancelar
          </button>
        ) : (
          <>
            <button
              onClick={onCerrar}
              className='flex-1 px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200 transition-colors cursor-pointer'
            >
              Cancelar
            </button>
            <button
              onClick={handleAplicar}
              className='flex-1 px-4 py-2 cursor-pointer text-sm font-medium text-white bg-violet-600 rounded-md hover:bg-violet-700 transition-colors'
            >
              Aplicar
            </button>
          </>
        )
      }
    >
      {error && (
        <div className='mb-4 p-3 bg-red-100 border border-red-400 text-red-700 rounded text-sm'>
          {error}
        </div>
      )}

      {tipo === 'texto' && (
        <input
          type='text'
          autoFocus
          value={valorTexto}
          onChange={(e) => setValorTexto(e.target.value)}
          placeholder={`Buscar en ${titulo}...`}
          className='w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
        />
      )}

      {tipo === 'rango' && (
        <div className='flex gap-3'>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Desde</label>
            <input
              type='number'
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              placeholder='Sin límite'
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
            />
          </div>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Hasta</label>
            <input
              type='number'
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              placeholder='Sin límite'
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
            />
          </div>
        </div>
      )}

      {tipo === 'fecha' && !mostrarPersonalizado && (
        <div className='flex flex-col gap-2'>
          {presetsDeFecha().map((preset) => (
            <button
              key={preset.id}
              type='button'
              onClick={() => handleAplicarPreset(preset.desde, preset.hasta)}
              className='w-full px-3 py-2 text-left text-sm font-medium text-gray-700 border border-gray-200 rounded-md hover:bg-violet-50 hover:border-violet-300 hover:text-violet-700 transition-colors cursor-pointer'
            >
              {preset.etiqueta}
            </button>
          ))}
          <button
            type='button'
            onClick={() => setMostrarPersonalizado(true)}
            className='w-full px-3 py-2 text-left text-sm font-medium text-violet-600 border border-violet-600 rounded-md hover:bg-violet-50 transition-colors cursor-pointer'
          >
            Personalizado
          </button>
        </div>
      )}

      {tipo === 'fecha' && mostrarPersonalizado && (
        <div className='flex gap-3'>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Desde</label>
            <input
              type='date'
              value={desde}
              onChange={(e) => setDesde(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
            />
          </div>
          <div className='flex-1'>
            <label className='block text-sm font-medium text-gray-700 mb-1'>Hasta</label>
            <input
              type='date'
              value={hasta}
              onChange={(e) => setHasta(e.target.value)}
              className='w-full px-3 py-2 border border-gray-300 rounded-md text-gray-700 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-500'
            />
          </div>
        </div>
      )}

      {tipo === 'seleccion' && (
        <div>
          <SearchInput
            valor={busqueda}
            onCambio={setBusqueda}
            placeholder={`Buscar en ${titulo}...`}
            claseContenedor='relative flex items-center mb-2'
          />

          <button
            type='button'
            onClick={() => setIdsSeleccionados(new Set(opciones.map((o) => o.id)))}
            className='w-full mb-3 px-3 py-1.5 text-sm font-medium text-violet-600 border border-violet-600 rounded-md hover:bg-violet-50 transition-colors cursor-pointer'
          >
            Ver todos
          </button>

          {opciones.length === 0 ? (
            <p className='text-sm text-gray-400 italic'>No hay opciones disponibles.</p>
          ) : opcionesVisibles.length === 0 ? (
            <p className='text-sm text-gray-400 italic'>Sin resultados para "{busqueda}".</p>
          ) : (
            <div className='h-60'>
            <ul className='max-h-60 overflow-y-auto divide-y divide-gray-100 border border-gray-200 rounded-md'>
              {opcionesVisibles.map((opcion) => (
                <li key={opcion.id}>
                  <label
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setIdsSeleccionados(new Set([opcion.id]));
                    }}
                    className='flex items-center gap-2 px-3 py-2 text-sm text-gray-700 cursor-pointer hover:bg-gray-50'
                  >
                    <input
                      type='checkbox'
                      checked={idsSeleccionados.has(opcion.id)}
                      onChange={() => toggleId(opcion.id)}
                      className='cursor-pointer accent-violet-600'
                    />
                    {opcion.nombre}
                  </label>
                </li>
              ))}
            </ul>
            </div>
          )}
        </div>
      )}
    </BaseModal>
  );
}
