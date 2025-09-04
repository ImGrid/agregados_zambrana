// src/controllers/pedidosController.js - Controller de Pedidos
// Sistema de Tracking Vehicular - Agregados Zambrana

const Pedido = require("../models/Pedido");
const Cliente = require("../models/Cliente");
const Material = require("../models/Material");
const Stock = require("../models/Stock");
const Vehiculo = require("../models/Vehiculo");
const {
  generateUniqueTrackingCode,
  normalizeTrackingCodeForSearch,
} = require("../utils/codigoSeguimiento");
const {
  success,
  created,
  updated,
  notFound,
  validationError,
  businessLogicError,
  orderCreated,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// CONTROLLERS PARA CLIENTES
// ==========================================

/**
 * Crear nuevo pedido (clientes)
 * POST /api/pedidos
 * Body: { material_id, cantidad, direccion_entrega, telefono_contacto?, fecha_entrega_solicitada?, observaciones? }
 */
const createPedido = asyncHandler(async (req, res) => {
  const orderData = req.body;
  const clienteId = req.clienteId; // Viene del middleware
  const isAdminOrder = req.isAdminCreatingOrder;

  logger.info("Creando nuevo pedido", {
    clienteId,
    materialId: orderData.material_id,
    cantidad: orderData.cantidad,
    isAdminOrder,
    userId: req.user.id,
  });

  // Validar datos básicos requeridos
  if (
    !orderData.material_id ||
    !orderData.cantidad ||
    !orderData.direccion_entrega
  ) {
    return validationError(
      res,
      [
        { field: "material_id", message: "Material es requerido" },
        { field: "cantidad", message: "Cantidad es requerida" },
        {
          field: "direccion_entrega",
          message: "Dirección de entrega es requerida",
        },
      ],
      "Datos incompletos del pedido"
    );
  }

  try {
    // Crear pedido usando el model que ya valida todo
    const newPedido = await Pedido.create(orderData, clienteId);

    logger.info("Pedido creado exitosamente", {
      pedidoId: newPedido.id,
      codigo: newPedido.codigo_seguimiento,
      clienteId,
      valor: newPedido.precio_total,
    });

    // Respuesta optimizada para pedidos
    return orderCreated(res, {
      id: newPedido.id,
      codigo_seguimiento: newPedido.codigo_seguimiento,
      estado: newPedido.estado,
      cantidad: newPedido.cantidad,
      precio_total: newPedido.precio_total,
      fecha_pedido: newPedido.created_at,
    });
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationError(res, error.errors || [], error.message);
    }
    if (error instanceof BusinessLogicError) {
      return businessLogicError(res, error.message);
    }
    throw error;
  }
});

/**
 * Obtener pedidos del cliente autenticado
 * GET /api/pedidos/mis-pedidos
 */
const getMisPedidos = asyncHandler(async (req, res) => {
  const clienteId = req.clienteId; // Viene del middleware

  logger.debug("Obteniendo pedidos del cliente", {
    clienteId,
    userId: req.user.id,
  });

  const pedidos = await Pedido.findByClient(clienteId);

  // Formatear pedidos para respuesta de cliente
  const pedidosFormateados = pedidos.map((pedido) =>
    Pedido.formatForClient(pedido)
  );

  logger.debug("Pedidos del cliente obtenidos", {
    clienteId,
    count: pedidos.length,
  });

  return success(
    res,
    pedidosFormateados,
    `${pedidos.length} pedidos encontrados`
  );
});

/**
 * Seguimiento público por código
 * GET /api/pedidos/seguimiento/:codigo
 * Acceso: Público (no requiere autenticación)
 */
const trackPedido = asyncHandler(async (req, res) => {
  const codigo = normalizeTrackingCodeForSearch(req.params.codigo);

  logger.info("Seguimiento de pedido por código", {
    codigo: codigo.substring(0, 10) + "...",
    ip: req.ip,
  });

  const pedido = await Pedido.findByTrackingCode(codigo);

  if (!pedido) {
    logger.warn("Código de seguimiento no encontrado", { codigo });
    return notFound(res, "Pedido no encontrado con ese código de seguimiento");
  }

  // Información limitada para seguimiento público
  const trackingInfo = {
    codigo_seguimiento: pedido.codigo_seguimiento,
    estado: pedido.estado,
    fecha_pedido: pedido.fecha_pedido,
    fecha_entrega_solicitada: pedido.fecha_entrega_solicitada,
    material_nombre: pedido.material_nombre,
    cantidad: `${pedido.cantidad} ${pedido.unidad_medida}`,
    direccion_entrega: pedido.direccion_entrega,
    estado_descripcion: getEstadoDescripcion(pedido.estado),
    puede_cancelar: Pedido.canBeCanceled(pedido.estado),
  };

  logger.debug("Información de seguimiento proporcionada", {
    codigo,
    estado: pedido.estado,
  });

  return success(res, trackingInfo, "Información de seguimiento obtenida");
});

// ==========================================
// CONTROLLERS PARA ADMINISTRATIVOS
// ==========================================

/**
 * Listar todos los pedidos con filtros (admin/administrativos)
 * GET /api/pedidos?estado=pendiente&page=1&limit=20
 */
const getAllPedidos = asyncHandler(async (req, res) => {
  const { estado, page = 1, limit = 20 } = req.query;
  const userId = req.user.id;

  logger.info("Listando pedidos administrativos", {
    estado,
    page,
    limit,
    userId,
    rol: req.user.rol,
  });

  // Usar el método del model que ya maneja paginación
  const pedidos = await Pedido.findWithDetails(
    { estado },
    parseInt(limit),
    (parseInt(page) - 1) * parseInt(limit)
  );

  const responseData = {
    pedidos,
    filtros_aplicados: { estado },
    pagination: {
      page: parseInt(page),
      limit: parseInt(limit),
      total: pedidos.length,
    },
  };

  logger.debug("Pedidos administrativos obtenidos", {
    count: pedidos.length,
    filtros: { estado },
    userId,
  });

  return success(res, responseData, `${pedidos.length} pedidos encontrados`);
});

/**
 * Cambiar estado de pedido (admin/administrativos)
 * PUT /api/pedidos/:id/estado
 * Body: { nuevo_estado }
 */
const changeEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nuevo_estado } = req.body;
  const userId = req.user.id;

  logger.info("Cambiando estado de pedido", {
    pedidoId: id,
    nuevoEstado: nuevo_estado,
    userId,
    rol: req.user.rol,
  });

  if (!nuevo_estado) {
    return validationError(
      res,
      [{ field: "nuevo_estado", message: "Nuevo estado es requerido" }],
      "Estado no proporcionado"
    );
  }

  try {
    const updatedPedido = await Pedido.updateStatus(id, nuevo_estado, userId);

    logger.info("Estado de pedido actualizado", {
      pedidoId: id,
      estadoNuevo: updatedPedido.estado,
      userId,
    });

    return updated(
      res,
      {
        id: updatedPedido.id,
        codigo_seguimiento: updatedPedido.codigo_seguimiento,
        estado: updatedPedido.estado,
        updated_at: updatedPedido.updated_at,
      },
      `Estado cambiado a '${updatedPedido.estado}'`
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationError(res, [], error.message);
    }
    if (error instanceof BusinessLogicError) {
      return businessLogicError(res, error.message);
    }
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    throw error;
  }
});

/**
 * Confirmar pedido y reducir stock (admin/administrativos)
 * PUT /api/pedidos/:id/confirmar
 */
const confirmarPedido = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  logger.info("Confirmando pedido", {
    pedidoId: id,
    userId,
    rol: req.user.rol,
  });

  try {
    const result = await Pedido.confirm(id, userId);

    logger.info("Pedido confirmado exitosamente", {
      pedidoId: id,
      stockActualizado: result.stockActualizado.material_id,
      stockRestante: result.stockActualizado.cantidad_disponible,
      userId,
    });

    return updated(
      res,
      {
        pedido: result.pedido,
        stock_actualizado: {
          material_id: result.stockActualizado.material_id,
          cantidad_restante: result.stockActualizado.cantidad_disponible,
        },
      },
      "Pedido confirmado y stock actualizado"
    );
  } catch (error) {
    if (error instanceof BusinessLogicError || error instanceof NotFoundError) {
      return businessLogicError(res, error.message);
    }
    throw error;
  }
});

/**
 * Obtener estadísticas de pedidos (admin/administrativos)
 * GET /api/pedidos/estadisticas?fecha_inicio=2025-01-01&fecha_fin=2025-01-31
 */
const getEstadisticas = asyncHandler(async (req, res) => {
  const { fecha_inicio, fecha_fin } = req.query;
  const userId = req.user.id;

  // Fechas por defecto: último mes
  const fechaFin = fecha_fin ? new Date(fecha_fin) : new Date();
  const fechaInicio = fecha_inicio
    ? new Date(fecha_inicio)
    : new Date(fechaFin.getTime() - 30 * 24 * 60 * 60 * 1000); // 30 días atrás

  logger.debug("Obteniendo estadísticas de pedidos", {
    fechaInicio: fechaInicio.toISOString().split("T")[0],
    fechaFin: fechaFin.toISOString().split("T")[0],
    userId,
  });

  const stats = await Pedido.getStatsByPeriod(fechaInicio, fechaFin);

  // Agregar estadísticas adicionales básicas
  const pedidosPendientes = await Pedido.findPendingAssignment();

  const estadisticasCompletas = {
    ...stats,
    pedidos_pendientes_asignacion: pedidosPendientes.length,
    promedio_pedidos_por_dia:
      stats.total_pedidos > 0
        ? (
            stats.total_pedidos /
            Math.ceil((fechaFin - fechaInicio) / (1000 * 60 * 60 * 24))
          ).toFixed(1)
        : 0,
  };

  logger.debug("Estadísticas generadas", {
    totalPedidos: stats.total_pedidos,
    pendientes: pedidosPendientes.length,
    userId,
  });

  return success(
    res,
    estadisticasCompletas,
    "Estadísticas de pedidos obtenidas"
  );
});

/**
 * Asignar vehículo a pedido (sistema experto básico)
 * PUT /api/pedidos/:id/asignar-vehiculo
 */
const asignarVehiculo = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { vehiculo_id } = req.body; // Opcional, si no se proporciona se asigna automáticamente
  const userId = req.user.id;

  logger.info("Asignando vehículo a pedido", {
    pedidoId: id,
    vehiculoId: vehiculo_id,
    userId,
  });

  try {
    // Obtener el pedido
    const pedido = await Pedido.findById(id);
    if (!pedido) {
      return notFound(res, "Pedido no encontrado");
    }

    if (pedido.estado !== "confirmado") {
      return businessLogicError(
        res,
        "Solo se pueden asignar vehículos a pedidos confirmados"
      );
    }

    let vehiculoAsignado;

    if (vehiculo_id) {
      // Asignación manual
      const vehiculo = await Vehiculo.findById(vehiculo_id);
      if (!vehiculo || vehiculo.estado !== "disponible") {
        return businessLogicError(res, "Vehículo no disponible");
      }

      if (vehiculo.capacidad_m3 < pedido.cantidad) {
        return businessLogicError(res, "Vehículo sin capacidad suficiente");
      }

      vehiculoAsignado = vehiculo;
    } else {
      // Asignación automática (sistema experto básico)
      const vehiculosDisponibles = await Vehiculo.findAvailableByCapacity(
        pedido.cantidad
      );

      if (vehiculosDisponibles.length === 0) {
        return businessLogicError(
          res,
          "No hay vehículos disponibles con capacidad suficiente"
        );
      }

      // Seleccionar el de menor capacidad que sea suficiente (optimización básica)
      vehiculoAsignado = vehiculosDisponibles[0];
    }

    // Actualizar estado del vehículo
    await Vehiculo.updateStatus(
      vehiculoAsignado.id || vehiculoAsignado.vehiculo_id,
      "en_uso"
    );

    // Actualizar estado del pedido
    const pedidoActualizado = await Pedido.updateStatus(id, "asignado", userId);

    logger.info("Vehículo asignado exitosamente", {
      pedidoId: id,
      vehiculoId: vehiculoAsignado.id || vehiculoAsignado.vehiculo_id,
      placa: vehiculoAsignado.placa,
      userId,
    });

    return updated(
      res,
      {
        pedido: {
          id: pedidoActualizado.id,
          estado: pedidoActualizado.estado,
          codigo_seguimiento: pedidoActualizado.codigo_seguimiento,
        },
        vehiculo_asignado: {
          id: vehiculoAsignado.id || vehiculoAsignado.vehiculo_id,
          placa: vehiculoAsignado.placa,
          capacidad:
            vehiculoAsignado.capacidad || vehiculoAsignado.capacidad_m3,
        },
      },
      "Vehículo asignado exitosamente"
    );
  } catch (error) {
    if (error instanceof NotFoundError || error instanceof BusinessLogicError) {
      return businessLogicError(res, error.message);
    }
    throw error;
  }
});

// ==========================================
// UTILITIES
// ==========================================

/**
 * Obtener descripción amigable del estado
 */
const getEstadoDescripcion = (estado) => {
  const descripciones = {
    pendiente: "Pedido recibido, esperando confirmación",
    confirmado: "Pedido confirmado, preparando entrega",
    asignado: "Vehículo asignado, saliendo a entrega",
    en_transito: "En camino al destino",
    entregado: "Entregado exitosamente",
    cancelado: "Pedido cancelado",
  };

  return descripciones[estado] || "Estado desconocido";
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Controllers para clientes
  createPedido,
  getMisPedidos,
  trackPedido,

  // Controllers para administrativos
  getAllPedidos,
  changeEstado,
  confirmarPedido,
  getEstadisticas,
  asignarVehiculo,

  // Utilities
  getEstadoDescripcion,
};
