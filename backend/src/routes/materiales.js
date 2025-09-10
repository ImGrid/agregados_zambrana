const express = require("express");
const router = express.Router();

// Controllers
const {
  getMateriales,
  getMaterialById,
  createMaterial,
  updateMaterial,
  deactivateMaterial,
  getMaterialStats,
} = require("../controllers/materialesController");

// Middlewares
const {
  authenticateToken,
  requireAdmin,
  requireAdminOrStaff,
  logAuthenticatedAccess,
} = require("../middleware/authentication");

const { addResponseHelpers } = require("../utils/responseHelper");

// Agregar helpers de respuesta
router.use(addResponseHelpers);

// Todas las rutas de materiales requieren autenticación
router.use(authenticateToken);
router.use(logAuthenticatedAccess);

// Todas las rutas requieren rol administrativo
router.use(requireAdminOrStaff);

/**
 * @route   GET /api/materiales
 * @desc    Listar todos los materiales activos
 * @access  Private (Admin/Administrativo)
 */
router.get("/", getMateriales);

/**
 * @route   GET /api/materiales/stats
 * @desc    Obtener estadísticas de materiales
 * @access  Private (Admin/Administrativo)
 */
router.get("/stats", getMaterialStats);

/**
 * @route   GET /api/materiales/:id
 * @desc    Obtener material específico por ID
 * @access  Private (Admin/Administrativo)
 */
router.get("/:id", getMaterialById);

/**
 * @route   POST /api/materiales
 * @desc    Crear nuevo material
 * @access  Private (Solo Admin)
 * @body    { nombre, descripcion?, precio_por_unidad, unidad_medida? }
 */
router.post("/", requireAdmin, createMaterial);

/**
 * @route   PUT /api/materiales/:id
 * @desc    Actualizar material existente
 * @access  Private (Admin/Administrativo)
 * @body    { nombre?, descripcion?, precio_por_unidad? }
 */
router.put("/:id", updateMaterial);

/**
 * @route   DELETE /api/materiales/:id
 * @desc    Desactivar material (soft delete)
 * @access  Private (Solo Admin)
 */
router.delete("/:id", requireAdmin, deactivateMaterial);

module.exports = router;
