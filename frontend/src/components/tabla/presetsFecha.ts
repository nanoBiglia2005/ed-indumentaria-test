// Presets del filtro de tipo "fecha" (ver tipos.ts / ColumnFilterModal): cada
// uno resuelve a un rango {desde, hasta} en yyyy-mm-dd, calculado en el
// calendario LOCAL del navegador (no UTC) — a diferencia de formatearFecha
// (que lee columnas @db.Date en UTC para MOSTRARLAS), estos presets arrancan
// de "hoy" tal como lo vive quien mira la pantalla, asi que usan los getters
// locales de Date en vez de toISOString() (que corta en UTC y podria
// retroceder un dia de mas cerca de medianoche).
const aISO = (fecha: Date): string => {
  const anio = fecha.getFullYear();
  const mes = String(fecha.getMonth() + 1).padStart(2, '0');
  const dia = String(fecha.getDate()).padStart(2, '0');
  return `${anio}-${mes}-${dia}`;
};

export interface PresetDeFecha {
  id: string;
  etiqueta: string;
  desde: string;
  hasta: string;
}

/**
 * Los 5 presets fijos + rango. `Date` con dia fuera del mes (p. ej. dia -6)
 * retrocede al mes anterior solo, sin aritmetica manual de calendario.
 */
export const presetsDeFecha = (): PresetDeFecha[] => {
  const hoy = new Date();
  const hoyISO = aISO(hoy);
  const diaHace = (n: number) => aISO(new Date(hoy.getFullYear(), hoy.getMonth(), hoy.getDate() - n));

  return [
    { id: 'hoy', etiqueta: 'Hoy', desde: hoyISO, hasta: hoyISO },
    { id: '7dias', etiqueta: 'Últimos 7 días', desde: diaHace(6), hasta: hoyISO },
    { id: '30dias', etiqueta: 'Últimos 30 días', desde: diaHace(29), hasta: hoyISO },
    { id: 'mes', etiqueta: 'Este mes', desde: aISO(new Date(hoy.getFullYear(), hoy.getMonth(), 1)), hasta: hoyISO },
    { id: 'anio', etiqueta: 'Este año', desde: aISO(new Date(hoy.getFullYear(), 0, 1)), hasta: hoyISO },
  ];
};

/** Atajo para el filtro inicial de una pagina (ver HistorialPage). */
export const preset30Dias = (): { desde: string; hasta: string } => {
  const { desde, hasta } = presetsDeFecha().find((p) => p.id === '30dias')!;
  return { desde, hasta };
};

// dd/mm, o dd/mm/aa si el anio no es el actual (evita ambiguedad en un rango
// que cruza fin de anio, sin alargar el caso comun).
const aCorto = (iso: string): string => {
  const [anio, mes, dia] = iso.split('-');
  const anioActual = String(new Date().getFullYear());
  return anio === anioActual ? `${dia}/${mes}` : `${dia}/${mes}/${anio.slice(2)}`;
};

/**
 * Texto del boton cuando el filtro de fecha esta activo (ver
 * FiltrosVentasToolbar/BotonFiltroVentas): el nombre del preset elegido, o el
 * rango tal cual si no matchea ninguno (eligio "Personalizado").
 */
export const etiquetaDeFiltroFecha = (filtro: { desde: string | null; hasta: string | null }): string => {
  const preset = presetsDeFecha().find((p) => p.desde === filtro.desde && p.hasta === filtro.hasta);
  if (preset) return preset.etiqueta;

  const { desde, hasta } = filtro;
  if (desde !== null && hasta !== null) return desde === hasta ? aCorto(desde) : `${aCorto(desde)} - ${aCorto(hasta)}`;
  if (desde !== null) return `Desde ${aCorto(desde)}`;
  if (hasta !== null) return `Hasta ${aCorto(hasta)}`;
  return '';
};

/**
 * El texto MAS ANCHO que `etiquetaDeFiltroFecha` puede llegar a producir: un
 * rango personalizado que cruza fin de anio (los dos lados con "/aa"). Sirve
 * de piso para medir el boton (ver MedidorAnchosRemitoCard): el ancho
 * asignado es fijo, asi que si no se contempla este caso, el dia que alguien
 * elija un rango asi el texto no tendria donde entrar.
 */
export const ETIQUETA_FECHA_PEOR_CASO = '31/12/25 - 31/12/25';
