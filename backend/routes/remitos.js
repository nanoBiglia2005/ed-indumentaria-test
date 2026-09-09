const express = require('express');
const { Prisma } = require('../generated/prisma/client');
const prisma = require('../db');
const { asyncHandler, HttpError } = require('../lib/http');
const { parseId } = require('../lib/validaciones');
const { requireRol } = require('../lib/roles');
const { ROLES_HISTORIAL } = require('../constants/roles');
const {
  ESTADO_CONFIRMADO,
  ESTADO_ANULADO,
  ESTADO_FACTURADO,
  ESTADO_DEVUELTO,
} = require('../constants/ventas');
const {
  remitosInclude,
  resolverItemsVenta,
  buscarRemitoEnEstado,
  buscarRemitoPendiente,
  itemsDeRemito,
} = require('../services/remitos');
const { listarMetodosDePago, remitoConTotales } = require('../services/preciosPorMetodo');
const { parsearPagos, registrarCobro } = require('../services/pagosRemito');
const { parsearDatosCliente, obtenerCliente } = require('../services/clientesFinales');
const { construirPayloadTicket, enviarTrabajoDeImpresion } = require('../services/impresion');
const { resolverDestinoParaSesion } = require('../services/impresoras');
const { parsearConsultaRemitos, construirWhere, construirOrderBy } = require('../lib/remitosConsulta');

const router = express.Router();

/**
 * Manda el ticket de un remito e interpreta la respuesta del print-service.
 * Lanza si no se pudo imprimir; cada llamador decide que hacer con eso (la
 * venta lo traga y avisa, la reimpresion lo propaga como error de la request).
 */
const imprimirTicketDeRemito = async ({ session, idImpresoraPedida, items, metodos, remito }) => {
  const { id_impresora } = await resolverDestinoParaSesion(session, idImpresoraPedida);

  const { respuesta, resultado } = await enviarTrabajoDeImpresion(
    construirPayloadTicket(items, metodos, {
      id_remito: remito.id_remito,
      fecha: remito.fecha_de_creacion,
    }),
    { id_impresora }
  );

  if (!respuesta.ok || resultado.status === 'error') {
    const error = new Error(
      resultado.message ?? resultado.detail ?? 'No se pudo imprimir el remito.'
    );
    error.status = respuesta.status;
    throw error;
  }
};

/**
 * Una pagina de remitos + el total que coincide con los filtros. Mismo
 * mecanismo que GET /api/articulos (ver lib/remitosConsulta.js y
 * lib/articulosConsulta.js): primero solo los `id_remito` de la pagina (y el
 * total), despues las filas completas con remitosInclude.
 *
 * `estadoFijo` es la condicion de estado que decide cada ruta (Historial /
 * Pendientes) — no sale de la query del usuario.
 */
const responderPaginaDeRemitos = async (req, res, { estadoFijo }) => {
  const consulta = parsearConsultaRemitos(req.query);
  const where = construirWhere({ estadoFijo, filtros: consulta.filtros });
  const orderBy = construirOrderBy(consulta.orden);
  const offset = (consulta.pagina - 1) * consulta.tamano;

  const [filas, [{ total }]] = await prisma.$transaction([
    prisma.$queryRaw`
      SELECT r.id_remito FROM "REMITOS" r
        WHERE ${where}
        ORDER BY ${orderBy}
        LIMIT ${consulta.tamano}::int OFFSET ${offset}::int`,
    prisma.$queryRaw`SELECT count(*)::int AS total FROM "REMITOS" r WHERE ${where}`,
  ]);

  const ids = filas.map((fila) => fila.id_remito);
  const remitos = await prisma.REMITOS.findMany({
    where: { id_remito: { in: ids } },
    include: remitosInclude,
  });

  // findMany con `in` no respeta el orden pedido: se reordena por los ids.
  const porId = new Map(remitos.map((remito) => [remito.id_remito, remito]));
  const metodos = await listarMetodosDePago();

  res.status(200).json({
    remitos: ids.map((id) => remitoConTotales(porId.get(id), metodos)),
    total,
  });
};

// Historial: todo MENOS los pendientes de cobro, que viven en la pagina de
// Ventas (y por eso /pendientes, mas abajo, no lleva este gate).
router.get(
  '/',
  requireRol(...ROLES_HISTORIAL),
  asyncHandler(async (req, res) => {
    await responderPaginaDeRemitos(req, res, {
      estadoFijo: Prisma.sql`r.id_estado != ${ESTADO_CONFIRMADO}`,
    });
  }, 'Error al obtener los remitos.')
);

// Remitos confirmados que todavia no se cobraron.
router.get(
  '/pendientes',
  asyncHandler(async (req, res) => {
    await responderPaginaDeRemitos(req, res, {
      estadoFijo: Prisma.sql`r.id_estado = ${ESTADO_CONFIRMADO}`,
    });
  }, 'Error al obtener los remitos pendientes.')
);

/**
 * Registra la venta como CONFIRMADA (pendiente de cobro) e imprime el ticket
 * salvo que se pida `imprimir: false`. El metodo de pago se elige despues, al
 * cobrar: aca solo se congela el precio base de cada articulo.
 *
 * Si viene un cliente asignado y sus datos se editaron en la pantalla, se
 * actualizan en la MISMA transaccion: o queda todo o no queda nada.
 *
 * Solo se carga `fecha_de_creacion`; la de emision se llenara cuando el remito
 * se emita de verdad. `cod_remito_final` lo asigna el trigger
 * trg_cod_remito_final de la base a partir de remitos_contador.
 */
router.post(
  '/',
  asyncHandler(async (req, res) => {
    const { error, items } = await resolverItemsVenta(req.body.detalles);
    if (error) {
      throw new HttpError(error.status, { message: error.message });
    }

    // El cliente es opcional: una venta puede no tener a nadie asignado.
    const id_cliente =
      req.body.id_cliente === undefined || req.body.id_cliente === null
        ? null
        : parseId(req.body.id_cliente, 'El id del cliente debe ser un numero.');

    // Se valida ANTES de abrir la transaccion para no crear el remito si el
    // formulario del cliente esta mal.
    let datosCliente = null;
    if (id_cliente !== null) {
      await obtenerCliente(id_cliente);
      if (req.body.cliente) datosCliente = parsearDatosCliente(req.body.cliente);
    }

    const detallesData = items.map((item) => ({
      id_articulo: item.id_articulo,
      precio: item.precio,
      cantidad: item.cantidad,
    }));

    const totalEfectivo = detallesData.reduce(
      (acumulado, detalle) => acumulado + detalle.precio * detalle.cantidad,
      0
    );

    const nuevoRemito = await prisma.$transaction(async (tx) => {
      if (datosCliente) {
        await tx.CLIENTES.update({ where: { id_cliente }, data: datosCliente });
      }

      return tx.REMITOS.create({
        data: {
          fecha_de_creacion: new Date(),
          id_estado: ESTADO_CONFIRMADO,
          id_cliente,
          total_efectivo: totalEfectivo,
          DETALLES_REMITO: { create: detallesData },
        },
        include: remitosInclude,
      });
    });

    const metodos = await listarMetodosDePago();

    // La venta ya quedo guardada: si falla la impresion no se revierte, se
    // avisa en la respuesta.
    let impresion = { status: 'omitida' };
    if (req.body.imprimir !== false) {
      impresion = { status: 'ok' };
      try {
        await imprimirTicketDeRemito({
          session: res.locals.session,
          idImpresoraPedida: req.body.id_impresora ?? null,
          items,
          metodos,
          remito: nuevoRemito,
        });
      } catch (errorImpresion) {
        console.error('Error al imprimir el remito:', errorImpresion);
        impresion = { status: 'error', message: errorImpresion.message };
      }
    }

    res.status(201).json({ ...remitoConTotales(nuevoRemito, metodos), impresion });
  }, 'Error al crear la venta.')
);

/**
 * Cobra un remito pendiente. El metodo de pago es del REMITO, no de cada
 * articulo: los precios de DETALLES_REMITO no se tocan. El reparto entre
 * metodos se guarda en PAGOS_REMITO (una fila por metodo usado) y `total_final`
 * es la suma de lo que se cobra por cada uno.
 *
 * El cuerpo trae TODOS los metodos de pago; los que vengan en 0 se descartan.
 */
router.put(
  '/:id_remito/facturar',
  asyncHandler(async (req, res) => {
    const { error, remito } = await buscarRemitoPendiente(req.params.id_remito);
    if (error) {
      throw new HttpError(error.status, { message: error.message });
    }

    const metodos = await listarMetodosDePago();
    const { totales_por_metodo } = remitoConTotales(remito, metodos);
    const pagos = parsearPagos(req.body, metodos, remito.total_efectivo, totales_por_metodo);

    const facturado = await registrarCobro(remito, pagos, remitosInclude);
    res.status(200).json(remitoConTotales(facturado, metodos));
  }, 'Error al facturar el remito.')
);

/**
 * Cambio de estado de un remito, que es todo lo que hacen anular y devolver:
 * el remito NO se borra ni se toca por dentro, queda registrado con su nuevo
 * estado. Los detalles y los pagos se conservan tal cual.
 */
const cambiarEstadoDelRemito = async (res, idParam, { desde, mensajeDesde, hacia }) => {
  const { error, remito } = await buscarRemitoEnEstado(idParam, desde, mensajeDesde);
  if (error) {
    throw new HttpError(error.status, { message: error.message });
  }

  const actualizado = await prisma.REMITOS.update({
    where: { id_remito: remito.id_remito },
    data: { id_estado: hacia },
    include: remitosInclude,
  });

  const metodos = await listarMetodosDePago();
  res.status(200).json(remitoConTotales(actualizado, metodos));
};

// Anula un remito pendiente (no se borra: queda registrado como ANULADO).
router.put(
  '/:id_remito/anular',
  asyncHandler(async (req, res) => {
    await cambiarEstadoDelRemito(res, req.params.id_remito, {
      desde: ESTADO_CONFIRMADO,
      mensajeDesde: 'El remito ya no esta pendiente: no se puede modificar.',
      hacia: ESTADO_ANULADO,
    });
  }, 'Error al anular el remito.')
);

// Devuelve una venta ya cobrada. Exige que este FACTURADA: una pendiente se
// anula, y una ya devuelta o anulada no se puede volver a devolver.
router.put(
  '/:id_remito/devolver',
  asyncHandler(async (req, res) => {
    await cambiarEstadoDelRemito(res, req.params.id_remito, {
      desde: ESTADO_FACTURADO,
      mensajeDesde: 'Solo se puede devolver una venta facturada.',
      hacia: ESTADO_DEVUELTO,
    });
  }, 'Error al devolver la venta.')
);

/**
 * Reimprime el ticket de un remito ya guardado. Existe porque la impresion de
 * la venta es best-effort: si la impresora estaba desconectada, o si se eligio
 * la equivocada, hasta ahora no habia forma de volver a emitirlo.
 *
 * NO se puede reimprimir un remito anulado ni devuelto: esa venta ya no existe
 * comercialmente y un ticket suyo circulando es peor que ninguno.
 */
router.post(
  '/:id_remito/reimprimir',
  asyncHandler(async (req, res) => {
    const id_remito = parseId(req.params.id_remito, 'El id del remito debe ser un numero.');

    const remito = await prisma.REMITOS.findUnique({
      where: { id_remito },
      include: remitosInclude,
    });

    if (!remito) {
      throw new HttpError(404, { message: 'El remito no existe.' });
    }
    if (remito.id_estado !== ESTADO_CONFIRMADO && remito.id_estado !== ESTADO_FACTURADO) {
      throw new HttpError(409, {
        message: 'No se puede reimprimir una venta anulada o devuelta.',
      });
    }

    const metodos = await listarMetodosDePago();

    try {
      await imprimirTicketDeRemito({
        session: res.locals.session,
        idImpresoraPedida: req.body.id_impresora ?? null,
        items: itemsDeRemito(remito),
        metodos,
        remito,
      });
    } catch (errorImpresion) {
      // A diferencia de la venta, aca imprimir ES la accion: si falla, falla la
      // request. Se propaga el status del print-service (503 desconectada, 504
      // sin respuesta) para que el frontend distinga el motivo.
      if (errorImpresion instanceof HttpError) throw errorImpresion;
      throw new HttpError(errorImpresion.status ?? 502, { message: errorImpresion.message });
    }

    res.status(200).json({ status: 'ok' });
  }, 'Error al reimprimir el remito.')
);

module.exports = router;
