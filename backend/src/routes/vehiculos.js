// src/routes/vehiculos.js - Rutas de Vehículos
// Sistema de Tracking Vehicular - Agregados Zambrana

const express = require("express");
const router = express.Router();

// Controllers
const {
  getVehiculos,
  getFleetStats,
  cambiarEstado,
  actualizarUbicacion,
  getVehiculosDisponibles,
  asignarVehiculoAutomatico,
  getDashboardFlota,
} = require("../controllers/vehiculosController");

// Middlewares
const {
  authenticateToken,
  requireAdminOrStaff,
  logAuthenticatedAccess,
} = require("../middleware/authentication");

const { addResponseHelpers } = require("../utils/responseHelper");

// ==========================================
// MIDDLEWARE PARA TODAS LAS RUTAS
// ==========================================

// Agregar helpers de respuesta
router.use(addResponseHelpers);

// Todas las rutas de vehículos requieren autenticación
router.use(authenticateToken);
router.use(logAuthenticatedAccess);

// Todas las rutas requieren rol administrativo (por ahora)
router.use(requireAdminOrStaff);

// ==========================================
// RUTAS PRINCIPALES DE GESTIÓN
// ==========================================

/**
 * @route   GET /api/vehiculos
 * @desc    Listar todos los vehículos con estado actual
 * @access  Private (Admin/Administrativo)
 */
router.get("/", getVehiculos);

/**
 * @route   GET /api/vehiculos/estadisticas
 * @desc    Obtener estadísticas de la flota
 * @access  Private (Admin/Administrativo)
 */
router.get("/estadisticas", getFleetStats);

/**
 * @route   GET /api/vehiculos/dashboard
 * @desc    Dashboard básico de flota con alertas
 * @access  Private (Admin/Administrativo)
 */
router.get("/dashboard", getDashboardFlota);

// ==========================================
// RUTAS DE ESTADOS Y UBICACIÓN
// ==========================================

/**
 * @route   PUT /api/vehiculos/:id/estado
 * @desc    Cambiar estado de vehículo
 * @access  Private (Admin/Administrativo)
 * @body    { nuevo_estado }
 */
router.put("/:id/estado", cambiarEstado);

/**
 * @route   PUT /api/vehiculos/:id/ubicacion
 * @desc    Actualizar ubicación GPS de vehículo
 * @access  Private (Admin/Administrativo)
 * @body    { lat, lng }
 */
router.put("/:id/ubicacion", actualizarUbicacion);

// ==========================================
// RUTAS DEL SISTEMA EXPERTO SIMPLE
// ==========================================

/**
 * @route   GET /api/vehiculos/disponibles/:capacidad
 * @desc    Obtener vehículos disponibles por capacidad mínima
 * @access  Private (Admin/Administrativo)
 */
router.get("/disponibles/:capacidad", getVehiculosDisponibles);

/**
 * @route   POST /api/vehiculos/asignar-automatico
 * @desc    Asignar vehículo automáticamente a pedido (sistema experto)
 * @access  Private (Admin/Administrativo)
 * @body    { pedido_id }
 */
router.post("/asignar-automatico", asignarVehiculoAutomatico);

module.exports = router;
