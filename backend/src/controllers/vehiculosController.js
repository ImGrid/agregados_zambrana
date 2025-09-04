// src/controllers/vehiculosController.js - Controller Práctico de Vehículos
// Sistema de Tracking Vehicular - Agregados Zambrana
// FILOSOFÍA: Simple y directo - para gestión básica de 3 vehículos

const Vehiculo = require("../models/Vehiculo");
const Pedido = require("../models/Pedido");
const {
  validateId,
  validateVehicleStatus,
  validateCoordinates,
} = require("../utils/validation");
const {
  success,
  created,
  updated,
  notFound,
  validationError,
  businessLogicError,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// GESTIÓN BÁSICA DE FLOTA
// ==========================================

/**
 * Listar todos los vehículos con estado actual
 * GET /api/vehiculos
 * Acceso: Admin/Administrativo
 */
const getVehiculos = asyncHandler(async (req, res) => {
  logger.info("Listando flota de vehículos", {
    userId: req.user.id,
    rol: req.user.rol,
  });

  const vehiculos = await Vehiculo.findAll();

  // Formatear para respuesta administrativa
  const vehiculosFormateados = vehiculos.map((vehiculo) => ({
    id: vehiculo.id,
    placa: vehiculo.placa,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    capacidad_m3: vehiculo.capacidad_m3,
    estado: vehiculo.estado,
    tiene_ubicacion: !!(
      vehiculo.ubicacion_actual_lat && vehiculo.ubicacion_actual_lng
    ),
    ultima_actualizacion: vehiculo.ultima_ubicacion,
    tiempo_sin_actualizar: vehiculo.ultima_ubicacion
      ? Math.round(
          (Date.now() - new Date(vehiculo.ultima_ubicacion)) / (1000 * 60)
        ) // minutos
      : null,
  }));

  logger.debug("Flota obtenida exitosamente", {
    totalVehiculos: vehiculos.length,
    disponibles: vehiculosFormateados.filter((v) => v.estado === "disponible")
      .length,
    userId: req.user.id,
  });

  return success(
    res,
    vehiculosFormateados,
    `Flota: ${vehiculos.length} vehículos`
  );
});

/**
 * Obtener estadísticas de flota
 * GET /api/vehiculos/estadisticas
 * Acceso: Admin/Administrativo
 */
const getFleetStats = asyncHandler(async (req, res) => {
  logger.debug("Obteniendo estadísticas de flota", {
    userId: req.user.id,
  });

  const stats = await Vehiculo.getFleetStats();

  // Agregar información útil
  const statsCompletas = {
    ...stats,
    utilizacion_porcentaje:
      stats.total_vehiculos > 0
        ? Math.round((stats.en_uso / stats.total_vehiculos) * 100)
        : 0,
    vehiculos_operativos: stats.disponibles + stats.en_uso,
    necesita_atencion: stats.mantenimiento > 0,
  };

  logger.info("Estadísticas de flota generadas", {
    totalVehiculos: stats.total_vehiculos,
    utilizacion: statsCompletas.utilizacion_porcentaje + "%",
    userId: req.user.id,
  });

  return success(res, statsCompletas, "Estadísticas de flota obtenidas");
});

// ==========================================
// GESTIÓN DE ESTADOS
// ==========================================

/**
 * Cambiar estado de vehículo
 * PUT /api/vehiculos/:id/estado
 * Body: { nuevo_estado }
 * Acceso: Admin/Administrativo
 */
const cambiarEstado = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { nuevo_estado } = req.body;
  const userId = req.user.id;

  logger.info("Cambiando estado de vehículo", {
    vehiculoId: id,
    nuevoEstado: nuevo_estado,
    userId,
  });

  // Validaciones básicas
  const idValidation = validateId(id, "ID de vehículo");
  const statusValidation = validateVehicleStatus(nuevo_estado);

  const errors = [];
  if (!idValidation.isValid) {
    errors.push({ field: "id", message: idValidation.message });
  }
  if (!statusValidation.isValid) {
    errors.push({ field: "nuevo_estado", message: statusValidation.message });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Datos inválidos");
  }

  try {
    const vehiculoActualizado = await Vehiculo.updateStatus(
      idValidation.value,
      statusValidation.value
    );

    logger.info("Estado de vehículo actualizado", {
      vehiculoId: id,
      placa: vehiculoActualizado.placa,
      estadoNuevo: vehiculoActualizado.estado,
      userId,
    });

    return updated(
      res,
      {
        id: vehiculoActualizado.id,
        placa: vehiculoActualizado.placa,
        estado: vehiculoActualizado.estado,
      },
      `Vehículo ${vehiculoActualizado.placa} ahora está ${vehiculoActualizado.estado}`
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    throw error;
  }
});

/**
 * Actualizar ubicación GPS de vehículo
 * PUT /api/vehiculos/:id/ubicacion
 * Body: { lat, lng }
 * Acceso: Admin/Administrativo (o Conductor en futuro)
 */
const actualizarUbicacion = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { lat, lng } = req.body;
  const userId = req.user.id;

  logger.info("Actualizando ubicación de vehículo", {
    vehiculoId: id,
    lat: lat ? lat.toString().substring(0, 8) : null,
    lng: lng ? lng.toString().substring(0, 8) : null,
    userId,
  });

  // Validaciones
  const idValidation = validateId(id, "ID de vehículo");
  const coordsValidation = validateCoordinates(lat, lng);

  const errors = [];
  if (!idValidation.isValid) {
    errors.push({ field: "id", message: idValidation.message });
  }
  if (!coordsValidation.isValid) {
    errors.push({ field: "coordenadas", message: coordsValidation.message });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Datos inválidos");
  }

  try {
    const vehiculoActualizado = await Vehiculo.updateLocation(
      idValidation.value,
      coordsValidation.value.lat,
      coordsValidation.value.lng
    );

    logger.info("Ubicación actualizada exitosamente", {
      vehiculoId: id,
      placa: vehiculoActualizado.placa,
      userId,
    });

    return updated(
      res,
      {
        id: vehiculoActualizado.id,
        placa: vehiculoActualizado.placa,
        ubicacion_actual: {
          lat: vehiculoActualizado.ubicacion_actual_lat,
          lng: vehiculoActualizado.ubicacion_actual_lng,
        },
        actualizado_en: new Date().toISOString(),
      },
      `Ubicación de ${vehiculoActualizado.placa} actualizada`
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    throw error;
  }
});

// ==========================================
// SISTEMA EXPERTO SIMPLE
// ==========================================

/**
 * Obtener vehículos disponibles por capacidad
 * GET /api/vehiculos/disponibles/:capacidad
 * Acceso: Admin/Administrativo
 */
const getVehiculosDisponibles = asyncHandler(async (req, res) => {
  const { capacidad } = req.params;
  const userId = req.user.id;

  logger.debug("Buscando vehículos disponibles", {
    capacidadMinima: capacidad,
    userId,
  });

  // Validar capacidad
  const capacidadNum = parseFloat(capacidad);
  if (isNaN(capacidadNum) || capacidadNum <= 0) {
    return validationError(
      res,
      [
        {
          field: "capacidad",
          message: "Capacidad debe ser un número positivo",
        },
      ],
      "Capacidad inválida"
    );
  }

  const vehiculosDisponibles = await Vehiculo.findAvailableByCapacity(
    capacidadNum
  );

  // Formatear respuesta simple
  const vehiculosFormateados = vehiculosDisponibles.map((vehiculo) => ({
    id: vehiculo.vehiculo_id,
    placa: vehiculo.placa,
    capacidad: vehiculo.capacidad,
    marca: vehiculo.marca,
    modelo: vehiculo.modelo,
    eficiencia:
      capacidadNum > 0
        ? Math.round((capacidadNum / vehiculo.capacidad) * 100)
        : 0,
  }));

  logger.debug("Vehículos disponibles encontrados", {
    capacidadMinima: capacidadNum,
    vehiculosEncontrados: vehiculosFormateados.length,
    userId,
  });

  return success(
    res,
    vehiculosFormateados,
    `${vehiculosFormateados.length} vehículos disponibles con capacidad ≥ ${capacidadNum}m³`
  );
});

/**
 * Asignar vehículo automáticamente a pedido (sistema experto SIMPLE)
 * POST /api/vehiculos/asignar-automatico
 * Body: { pedido_id }
 * Acceso: Admin/Administrativo
 */
const asignarVehiculoAutomatico = asyncHandler(async (req, res) => {
  const { pedido_id } = req.body;
  const userId = req.user.id;

  logger.info("Sistema experto: asignación automática", {
    pedidoId: pedido_id,
    userId,
  });

  // Validar pedido ID
  const idValidation = validateId(pedido_id, "ID de pedido");
  if (!idValidation.isValid) {
    return validationError(
      res,
      [{ field: "pedido_id", message: idValidation.message }],
      "ID de pedido inválido"
    );
  }

  try {
    // Obtener pedido
    const pedido = await Pedido.findById(idValidation.value);
    if (!pedido) {
      return notFound(res, "Pedido no encontrado");
    }

    if (pedido.estado !== "confirmado") {
      return businessLogicError(
        res,
        "Solo se pueden asignar vehículos a pedidos confirmados"
      );
    }

    // SISTEMA EXPERTO SIMPLE: Buscar vehículos disponibles
    const vehiculosDisponibles = await Vehiculo.findAvailableByCapacity(
      pedido.cantidad
    );

    if (vehiculosDisponibles.length === 0) {
      logger.warn("No hay vehículos disponibles", {
        pedidoId: pedido_id,
        cantidadRequerida: pedido.cantidad,
      });
      return businessLogicError(
        res,
        `No hay vehículos disponibles para ${pedido.cantidad}m³`
      );
    }

    // REGLA SIMPLE: Usar vehículo de menor capacidad disponible (más eficiente)
    const vehiculoSeleccionado = vehiculosDisponibles[0]; // Ya vienen ordenados por capacidad ASC

    // Asignar vehículo
    await Vehiculo.updateStatus(vehiculoSeleccionado.vehiculo_id, "en_uso");

    // Actualizar pedido a asignado
    await Pedido.updateStatus(idValidation.value, "asignado", userId);

    const resultado = {
      pedido: {
        id: pedido.id,
        codigo_seguimiento: pedido.codigo_seguimiento,
        estado: "asignado",
      },
      vehiculo_asignado: {
        id: vehiculoSeleccionado.vehiculo_id,
        placa: vehiculoSeleccionado.placa,
        capacidad: vehiculoSeleccionado.capacidad,
      },
      sistema_experto: {
        vehiculos_evaluados: vehiculosDisponibles.length,
        criterio_seleccion: "Menor capacidad suficiente",
        eficiencia_uso: Math.round(
          (pedido.cantidad / vehiculoSeleccionado.capacidad) * 100
        ),
      },
    };

    logger.info("Vehículo asignado automáticamente", {
      pedidoId: pedido_id,
      vehiculoAsignado: vehiculoSeleccionado.placa,
      eficiencia: resultado.sistema_experto.eficiencia_uso + "%",
      userId,
    });

    return success(
      res,
      resultado,
      `Vehículo ${vehiculoSeleccionado.placa} asignado automáticamente`
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    if (error instanceof BusinessLogicError) {
      return businessLogicError(res, error.message);
    }
    throw error;
  }
});

// ==========================================
// DASHBOARD DE FLOTA
// ==========================================

/**
 * Dashboard básico de flota
 * GET /api/vehiculos/dashboard
 * Acceso: Admin/Administrativo
 */
const getDashboardFlota = asyncHandler(async (req, res) => {
  logger.debug("Generando dashboard de flota", {
    userId: req.user.id,
  });

  // Obtener datos necesarios
  const [vehiculos, stats] = await Promise.all([
    Vehiculo.findAll(),
    Vehiculo.getFleetStats(),
  ]);

  // Analizar vehículos
  const vehiculosAgrupados = {
    disponible: vehiculos.filter((v) => v.estado === "disponible"),
    en_uso: vehiculos.filter((v) => v.estado === "en_uso"),
    mantenimiento: vehiculos.filter((v) => v.estado === "mantenimiento"),
    averiado: vehiculos.filter((v) => v.estado === "averiado"),
  };

  const capacidadTotal = vehiculos.reduce((sum, v) => sum + v.capacidad_m3, 0);
  const capacidadDisponible = vehiculosAgrupados.disponible.reduce(
    (sum, v) => sum + v.capacidad_m3,
    0
  );

  const dashboard = {
    resumen: {
      total_vehiculos: stats.total_vehiculos,
      capacidad_total: capacidadTotal,
      capacidad_disponible: capacidadDisponible,
      utilizacion_flota:
        stats.total_vehiculos > 0
          ? Math.round((stats.en_uso / stats.total_vehiculos) * 100)
          : 0,
    },
    por_estado: {
      disponible: stats.disponibles,
      en_uso: stats.en_uso,
      mantenimiento: stats.mantenimiento,
      averiado: vehiculosAgrupados.averiado.length,
    },
    vehiculos_detalle: vehiculos.map((v) => ({
      id: v.id,
      placa: v.placa,
      estado: v.estado,
      capacidad: v.capacidad_m3,
      tiene_gps: !!(v.ubicacion_actual_lat && v.ubicacion_actual_lng),
    })),
    alertas: [],
  };

  // Generar alertas simples
  if (stats.disponibles === 0) {
    dashboard.alertas.push({
      tipo: "warning",
      mensaje: "No hay vehículos disponibles",
    });
  }

  if (vehiculosAgrupados.mantenimiento.length > 0) {
    dashboard.alertas.push({
      tipo: "info",
      mensaje: `${vehiculosAgrupados.mantenimiento.length} vehículo(s) en mantenimiento`,
    });
  }

  if (vehiculosAgrupados.averiado.length > 0) {
    dashboard.alertas.push({
      tipo: "error",
      mensaje: `${vehiculosAgrupados.averiado.length} vehículo(s) averiado(s)`,
    });
  }

  logger.info("Dashboard de flota generado", {
    totalVehiculos: dashboard.resumen.total_vehiculos,
    utilizacion: dashboard.resumen.utilizacion_flota + "%",
    alertas: dashboard.alertas.length,
    userId: req.user.id,
  });

  return success(res, dashboard, "Dashboard de flota generado");
});

module.exports = {
  // Gestión básica
  getVehiculos,
  getFleetStats,

  // Estados y ubicación
  cambiarEstado,
  actualizarUbicacion,

  // Sistema experto simple
  getVehiculosDisponibles,
  asignarVehiculoAutomatico,

  // Dashboard
  getDashboardFlota,
};
