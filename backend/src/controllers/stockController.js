const Stock = require("../models/Stock");
const {
  success,
  updated,
  notFound,
  validationError,
  businessLogicError,
  stockUpdated,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const { validateQuantity } = require("../utils/validation");
const logger = require("../utils/logger");

/**
 * Listar inventario completo con alertas
 * GET /api/stock
 * Acceso: Admin/Administrativo
 */
const getInventario = asyncHandler(async (req, res) => {
  logger.info("Listando inventario completo", {
    userId: req.user.id,
    rol: req.user.rol,
  });

  const inventario = await Stock.getInventoryWithAlerts();

  // Contar alertas por nivel
  const alertStats = {
    total_materiales: inventario.length,
    stock_critico: inventario.filter((item) => item.nivel_stock === "CRÍTICO")
      .length,
    stock_bajo: inventario.filter((item) => item.nivel_stock === "BAJO").length,
    stock_normal: inventario.filter((item) => item.nivel_stock === "NORMAL")
      .length,
  };

  logger.debug("Inventario obtenido exitosamente", {
    ...alertStats,
    userId: req.user.id,
  });

  const responseData = {
    inventario,
    resumen: alertStats,
    timestamp: new Date().toISOString(),
  };

  return success(
    res,
    responseData,
    `Inventario obtenido: ${inventario.length} materiales`
  );
});

/**
 * Obtener stock específico de un material
 * GET /api/stock/:material_id
 * Acceso: Admin/Administrativo
 */
const getStockByMaterial = asyncHandler(async (req, res) => {
  const { material_id } = req.params;

  logger.debug("Obteniendo stock de material", {
    materialId: material_id,
    userId: req.user.id,
  });

  const stockData = await Stock.findByMaterial(material_id);

  if (!stockData) {
    logger.warn("Stock de material no encontrado", {
      materialId: material_id,
      userId: req.user.id,
    });
    return notFound(res, "Stock de material no encontrado");
  }

  return success(res, stockData, "Stock de material obtenido");
});

/**
 * Actualizar cantidad de stock
 * PUT /api/stock/:material_id
 * Acceso: Admin/Administrativo
 * Body: { cantidad_disponible }
 */
const updateStock = asyncHandler(async (req, res) => {
  const { material_id } = req.params;
  const { cantidad_disponible } = req.body;
  const userId = req.user.id;

  logger.info("Actualizando stock:", {
    materialId: material_id,
    nuevaCantidad: cantidad_disponible,
    userId,
  });

  // VALIDACIÓN SIMPLIFICADA - usar funciones centralizadas
  const materialIdValidation = validateId(material_id, "ID de material");
  const quantityValidation = validateQuantity(cantidad_disponible);
  const userIdValidation = validateId(userId, "ID de usuario");

  const errors = [];
  if (!materialIdValidation.isValid) {
    errors.push({
      field: "material_id",
      message: materialIdValidation.message,
    });
  }
  if (!quantityValidation.isValid) {
    errors.push({
      field: "cantidad_disponible",
      message: quantityValidation.message,
    });
  }
  if (!userIdValidation.isValid) {
    errors.push({ field: "user_id", message: userIdValidation.message });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Datos inválidos");
  }

  try {
    const updatedStock = await Stock.updateQuantity(
      materialIdValidation.value,
      quantityValidation.value,
      userIdValidation.value
    );

    logger.info("Stock actualizado exitosamente", {
      materialId: material_id,
      cantidadNueva: updatedStock.cantidad_disponible,
      nivelStock: updatedStock.nivel_stock,
      userId,
    });

    return stockUpdated(
      res,
      {
        material_id: updatedStock.material_id,
        material_nombre: updatedStock.material_nombre,
        cantidad_disponible: updatedStock.cantidad_disponible,
        cantidad_minima: updatedStock.cantidad_minima,
        nivel_stock: updatedStock.nivel_stock,
        unidad_medida: updatedStock.unidad_medida,
        cambio_cantidad: updatedStock.cambio_cantidad,
        accion_recomendada: Stock.getRecommendedAction({
          nivel_stock: updatedStock.nivel_stock,
        }),
      },
      updatedStock.alertas || []
    );
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationError(res, error.errors || [], error.message);
    }
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    throw error;
  }
});

/**
 * Obtener materiales con stock crítico/bajo
 * GET /api/stock/alerts
 * Acceso: Admin/Administrativo
 */
const getStockAlerts = asyncHandler(async (req, res) => {
  logger.info("Obteniendo alertas de stock", {
    userId: req.user.id,
  });

  // Obtener materiales con stock crítico
  const stockCritico = await Stock.getCriticalStock();

  // Obtener inventario completo para alertas de stock bajo
  const inventarioCompleto = await Stock.getInventoryWithAlerts();
  const stockBajo = inventarioCompleto.filter(
    (item) => item.nivel_stock === "BAJO"
  );

  const alerts = {
    critico: stockCritico.map((item) => ({
      ...item,
      prioridad: "ALTA",
      accion_requerida: "Reabastecer inmediatamente",
    })),
    bajo: stockBajo.map((item) => ({
      ...item,
      prioridad: "MEDIA",
      accion_requerida: "Programar reabastecimiento",
    })),
    resumen: {
      total_alertas: stockCritico.length + stockBajo.length,
      critico_count: stockCritico.length,
      bajo_count: stockBajo.length,
    },
  };

  logger.info("Alertas de stock obtenidas", {
    totalAlertas: alerts.resumen.total_alertas,
    critico: alerts.resumen.critico_count,
    bajo: alerts.resumen.bajo_count,
    userId: req.user.id,
  });

  return success(
    res,
    alerts,
    `${alerts.resumen.total_alertas} alertas de stock encontradas`
  );
});

/**
 * Verificar disponibilidad de stock para cantidad específica
 * POST /api/stock/check-availability
 * Acceso: Admin/Administrativo
 * Body: { material_id, cantidad_requerida }
 */
const checkStockAvailability = asyncHandler(async (req, res) => {
  const { material_id, cantidad_requerida } = req.body;
  const userId = req.user.id;

  logger.debug("Verificando disponibilidad de stock", {
    materialId: material_id,
    cantidadRequerida: cantidad_requerida,
    userId,
  });

  // VALIDACIÓN SIMPLIFICADA - usar funciones centralizadas
  const materialIdValidation = validateId(material_id, "ID de material");
  const quantityValidation = validateQuantity(cantidad_requerida);

  const errors = [];
  if (!materialIdValidation.isValid) {
    errors.push({
      field: "material_id",
      message: materialIdValidation.message,
    });
  }
  if (!quantityValidation.isValid) {
    errors.push({
      field: "cantidad_requerida",
      message: quantityValidation.message,
    });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Datos incompletos");
  }

  try {
    const availability = await Stock.checkAvailability(
      materialIdValidation.value,
      quantityValidation.value
    );

    const responseData = {
      ...availability,
      verificado_por: req.user.nombre + " " + req.user.apellido,
      timestamp: new Date().toISOString(),
    };

    const message = availability.disponible
      ? "Stock suficiente disponible"
      : "Stock insuficiente";

    return success(res, responseData, message);
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationError(res, error.errors || [], error.message);
    }
    throw error;
  }
});

/**
 * Obtener resumen general del inventario
 * GET /api/stock/summary
 * Acceso: Admin/Administrativo
 */
const getInventorySummary = asyncHandler(async (req, res) => {
  logger.debug("Generando resumen de inventario", {
    userId: req.user.id,
  });

  const summary = await Stock.getInventorySummary();

  logger.debug("Resumen de inventario generado", {
    totalMateriales: summary.total_materiales,
    valorTotal: summary.valor_total_inventario,
    userId: req.user.id,
  });

  return success(res, summary, "Resumen de inventario generado");
});

/**
 * Incrementar stock (entrada de materiales)
 * POST /api/stock/:material_id/increment
 * Acceso: Admin/Administrativo
 * Body: { cantidad }
 */
const incrementStock = asyncHandler(async (req, res) => {
  const { material_id } = req.params;
  const { cantidad } = req.body;
  const userId = req.user.id;

  logger.info("Incrementando stock (entrada de materiales)", {
    materialId: material_id,
    cantidadEntrada: cantidad,
    userId,
  });

  // Validar cantidad
  if (!cantidad) {
    return validationError(
      res,
      [{ field: "cantidad", message: "Cantidad a incrementar es requerida" }],
      "Cantidad no proporcionada"
    );
  }

  const quantityValidation = validateQuantity(cantidad);
  if (!quantityValidation.isValid) {
    return validationError(
      res,
      [{ field: "cantidad", message: quantityValidation.message }],
      "Cantidad inválida"
    );
  }

  try {
    const updatedStock = await Stock.increaseStock(
      material_id,
      quantityValidation.value,
      userId
    );

    logger.info("Stock incrementado exitosamente", {
      materialId: material_id,
      cantidadAgregada: quantityValidation.value,
      stockFinal: updatedStock.cantidad_disponible,
      userId,
    });

    return updated(
      res,
      {
        material_id: updatedStock.material_id,
        material_nombre: updatedStock.material_nombre,
        cantidad_agregada: quantityValidation.value,
        cantidad_disponible: updatedStock.cantidad_disponible,
        nivel_stock: updatedStock.nivel_stock || "NORMAL",
      },
      `Stock incrementado en ${quantityValidation.value} unidades`
    );
  } catch (error) {
    if (error instanceof ValidationError || error instanceof NotFoundError) {
      return validationError(res, [], error.message);
    }
    throw error;
  }
});

module.exports = {
  getInventario,
  getStockByMaterial,
  updateStock,
  getStockAlerts,
  checkStockAvailability,
  getInventorySummary,
  incrementStock,
};
