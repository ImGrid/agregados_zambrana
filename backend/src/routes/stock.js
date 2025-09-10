const express = require("express");
const router = express.Router();

// Controllers
const {
  getInventario,
  getStockByMaterial,
  updateStock,
  getStockAlerts,
  checkStockAvailability,
  getInventorySummary,
  incrementStock,
} = require("../controllers/stockController");

// Middlewares
const {
  authenticateToken,
  requireAdminOrStaff,
  logAuthenticatedAccess,
} = require("../middleware/authentication");

const { addResponseHelpers } = require("../utils/responseHelper");

// Agregar helpers de respuesta
router.use(addResponseHelpers);

// Todas las rutas de stock requieren autenticación
router.use(authenticateToken);
router.use(logAuthenticatedAccess);

// Todas las rutas requieren rol administrativo
router.use(requireAdminOrStaff);

/**
 * @route   GET /api/stock
 * @desc    Listar inventario completo con alertas
 * @access  Private (Admin/Administrativo)
 */
router.get("/", getInventario);

/**
 * @route   GET /api/stock/alerts
 * @desc    Obtener materiales con stock crítico/bajo
 * @access  Private (Admin/Administrativo)
 */
router.get("/alerts", getStockAlerts);

/**
 * @route   PUT /api/stock/:material_id
 * @desc    Actualizar cantidad de stock
 * @access  Private (Admin/Administrativo)
 * @body    { cantidad_disponible }
 */
router.put("/:material_id", updateStock);

/**
 * @route   GET /api/stock/summary
 * @desc    Obtener resumen general del inventario
 * @access  Private (Admin/Administrativo)
 */
router.get("/summary", getInventorySummary);

/**
 * @route   GET /api/stock/:material_id
 * @desc    Obtener stock específico de un material
 * @access  Private (Admin/Administrativo)
 */
router.get("/:material_id", getStockByMaterial);

/**
 * @route   POST /api/stock/check-availability
 * @desc    Verificar disponibilidad de stock
 * @access  Private (Admin/Administrativo)
 * @body    { material_id, cantidad_requerida }
 */
router.post("/check-availability", checkStockAvailability);

/**
 * @route   POST /api/stock/:material_id/increment
 * @desc    Incrementar stock (entrada de materiales)
 * @access  Private (Admin/Administrativo)
 * @body    { cantidad }
 */
router.post("/:material_id/increment", incrementStock);

module.exports = router;
