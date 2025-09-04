// src/controllers/materialesController.js - Controller de Materiales
// Sistema de Tracking Vehicular - Agregados Zambrana

const Material = require("../models/Material");
const {
  success,
  created,
  updated,
  deleted,
  notFound,
  validationError,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// CONTROLLERS DE MATERIALES
// ==========================================

/**
 * Listar todos los materiales activos
 * GET /api/materiales
 * Acceso: Admin/Administrativo
 */
const getMateriales = asyncHandler(async (req, res) => {
  logger.info("Listando materiales", {
    userId: req.user.id,
    rol: req.user.rol,
  });

  const materiales = await Material.findAllActive();

  logger.debug("Materiales obtenidos exitosamente", {
    count: materiales.length,
    userId: req.user.id,
  });

  return success(
    res,
    materiales,
    `${materiales.length} materiales encontrados`
  );
});

/**
 * Obtener material específico por ID
 * GET /api/materiales/:id
 * Acceso: Admin/Administrativo
 */
const getMaterialById = asyncHandler(async (req, res) => {
  const { id } = req.params;

  logger.debug("Obteniendo material por ID", {
    materialId: id,
    userId: req.user.id,
  });

  const material = await Material.findById(id);

  if (!material) {
    logger.warn("Material no encontrado", {
      materialId: id,
      userId: req.user.id,
    });
    return notFound(res, "Material no encontrado");
  }

  return success(res, material, "Material encontrado");
});

/**
 * Crear nuevo material
 * POST /api/materiales
 * Acceso: Solo Admin
 * Body: { nombre, descripcion?, precio_por_unidad, unidad_medida? }
 */
const createMaterial = asyncHandler(async (req, res) => {
  const materialData = req.body;
  const userId = req.user.id;

  logger.info("Creando nuevo material", {
    nombre: materialData.nombre,
    precio: materialData.precio_por_unidad,
    adminId: userId,
  });

  // Validar datos requeridos básicos
  if (!materialData.nombre || !materialData.precio_por_unidad) {
    return validationError(
      res,
      [
        { field: "nombre", message: "Nombre del material es requerido" },
        {
          field: "precio_por_unidad",
          message: "Precio por unidad es requerido",
        },
      ],
      "Datos incompletos"
    );
  }

  try {
    const newMaterial = await Material.create(materialData);

    logger.info("Material creado exitosamente", {
      materialId: newMaterial.id,
      nombre: newMaterial.nombre,
      adminId: userId,
    });

    return created(res, newMaterial, "Material creado exitosamente");
  } catch (error) {
    if (error instanceof ValidationError) {
      return validationError(res, error.errors || [], error.message);
    }
    throw error;
  }
});

/**
 * Actualizar material existente
 * PUT /api/materiales/:id
 * Acceso: Admin/Administrativo
 * Body: { nombre?, descripcion?, precio_por_unidad? }
 */
const updateMaterial = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const updateData = req.body;
  const userId = req.user.id;

  logger.info("Actualizando material", {
    materialId: id,
    fields: Object.keys(updateData),
    userId,
  });

  // Validar que hay datos para actualizar
  if (Object.keys(updateData).length === 0) {
    return validationError(
      res,
      [
        {
          field: "general",
          message: "Se requiere al menos un campo para actualizar",
        },
      ],
      "No hay datos para actualizar"
    );
  }

  try {
    const updatedMaterial = await Material.update(id, updateData);

    logger.info("Material actualizado exitosamente", {
      materialId: id,
      nombre: updatedMaterial.nombre,
      userId,
    });

    return updated(res, updatedMaterial, "Material actualizado exitosamente");
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    if (error instanceof ValidationError) {
      return validationError(res, error.errors || [], error.message);
    }
    throw error;
  }
});

/**
 * Desactivar material (soft delete)
 * DELETE /api/materiales/:id
 * Acceso: Solo Admin
 */
const deactivateMaterial = asyncHandler(async (req, res) => {
  const { id } = req.params;
  const userId = req.user.id;

  logger.info("Desactivando material", {
    materialId: id,
    adminId: userId,
  });

  try {
    const deactivatedMaterial = await Material.deactivate(id);

    logger.info("Material desactivado exitosamente", {
      materialId: id,
      nombre: deactivatedMaterial.nombre,
      adminId: userId,
    });

    return deleted(
      res,
      `Material '${deactivatedMaterial.nombre}' desactivado exitosamente`
    );
  } catch (error) {
    if (error instanceof NotFoundError) {
      return notFound(res, error.message);
    }
    throw error;
  }
});

/**
 * Obtener estadísticas básicas de materiales
 * GET /api/materiales/stats
 * Acceso: Admin/Administrativo
 */
const getMaterialStats = asyncHandler(async (req, res) => {
  logger.debug("Obteniendo estadísticas de materiales", {
    userId: req.user.id,
  });

  const materiales = await Material.findAllActive();

  const stats = {
    total_materiales: materiales.length,
    precio_promedio:
      materiales.length > 0
        ? (
            materiales.reduce(
              (sum, m) => sum + parseFloat(m.precio_por_unidad),
              0
            ) / materiales.length
          ).toFixed(2)
        : 0,
    precio_mayor:
      materiales.length > 0
        ? Math.max(...materiales.map((m) => parseFloat(m.precio_por_unidad)))
        : 0,
    precio_menor:
      materiales.length > 0
        ? Math.min(...materiales.map((m) => parseFloat(m.precio_por_unidad)))
        : 0,
    tipos_unidades: [...new Set(materiales.map((m) => m.unidad_medida))],
    timestamp: new Date().toISOString(),
  };

  logger.debug("Estadísticas de materiales generadas", {
    totalMateriales: stats.total_materiales,
    userId: req.user.id,
  });

  return success(res, stats, "Estadísticas de materiales obtenidas");
});

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  getMateriales,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deactivateMaterial,
  getMaterialStats,
};
