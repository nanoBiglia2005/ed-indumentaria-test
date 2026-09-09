import { ESTADO_ANULADO, ESTADO_CONFIRMADO, ESTADO_DEVUELTO, ESTADO_FACTURADO } from '@backend/types';

/**
 * Compartido por RemitoCard (lo muestra) y MedidorAnchosRemitoCard (lo mide):
 * separado en su propio archivo porque un modulo que exporta un componente no
 * puede exportar ademas constantes sueltas (react-refresh/only-export-components).
 */
export const PALABRA_POR_ESTADO: Record<number, string> = {
  [ESTADO_CONFIRMADO]: 'Confirmada',
  [ESTADO_FACTURADO]: 'Paga',
  [ESTADO_ANULADO]: 'Anulada',
  [ESTADO_DEVUELTO]: 'Devuelta',
};

/**
 * Anchos de respaldo (px) de las 6 columnas de valor variable de RemitoCard,
 * hasta que ListaDeRemitos mida los remitos visibles (ver
 * MedidorAnchosRemitoCard). Las claves son las mismas que `filtroKey` en
 * campos.ts (asi el medidor y la barra de filtros no necesitan una tabla de
 * mapeo aparte). codigo/estado/total son los mismos valores que tenian las
 * clases fijas w-30/w-18/w-29 que reemplazaron; cliente/fecha_emision/
 * fecha_creacion son una estimacion razonable (nunca tuvieron clase fija) que
 * solo se usa como flash inicial, antes de la primera medicion real.
 */
export const ANCHOS_REMITO_CARD_POR_DEFECTO = {
  codigo: 120,
  cliente: 140,
  estado: 72,
  fecha_emision: 110,
  fecha_creacion: 110,
  total: 116,
};

/** Ancho (px) final por campo: max(contenido medido, etiqueta del boton). */
export type AnchosRemitoCard = typeof ANCHOS_REMITO_CARD_POR_DEFECTO;
