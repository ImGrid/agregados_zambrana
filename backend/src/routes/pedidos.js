const express = require("express");
const router = express.Router();

// Controllers
const {
  createPedido,
  getMisPedidos,
  trackPedido,
  getAllPedidos,
  changeEstado,
  confirmarPedido,
  getEstadisticas,
  asignarVehiculo,
} = require("../controllers/pedidosController");

// Middlewares de autenticación
const {
  authenticateToken,
  requireAdminOrStaff,
  optionalAuth,
  logAuthenticatedAccess,
} = require("../middleware/authentication");

// Middlewares específicos de pedidos
const {
  requirePedidoOwnership,
  requireSpecificPedidoAccess,
  requireClientForOrder,
  requireStaffForStatusChange,
  allowPublicTracking,
  logPedidoAccess,
} = require("../middleware/pedidoAuth");

const { addResponseHelpers } = require("../utils/responseHelper");

// Agregar helpers de respuesta
router.use(addResponseHelpers);

/**
 * @route   GET /api/pedidos/seguimiento/:codigo
 * @desc    Seguimiento público por código de seguimiento
 * @access  Public
 */
router.get("/seguimiento/:codigo", allowPublicTracking, trackPedido);

/**
 * @route   POST /api/pedidos
 * @desc    Crear nuevo pedido
 * @access  Private (Cliente) / Private (Admin para otros clientes)
 * @body    { material_id, cantidad, direccion_entrega, telefono_contacto?, fecha_entrega_solicitada?, observaciones? }
 */
router.post(
  "/",
  authenticateToken,
  logAuthenticatedAccess,
  requireClientForOrder,
  logPedidoAccess("create"),
  createPedido
);

/**
 * @route   GET /api/pedidos/mis-pedidos
 * @desc    Obtener pedidos del cliente autenticado
 * @access  Private (Solo Cliente)
 */
router.get(
  "/mis-pedidos",
  authenticateToken,
  logAuthenticatedAccess,
  requirePedidoOwnership,
  logPedidoAccess("view_own"),
  getMisPedidos
);

/**
 * @route   GET /api/pedidos/estadisticas
 * @desc    Obtener estadísticas de pedidos
 * @access  Private (Admin/Administrativo)
 * @query   ?fecha_inicio=YYYY-MM-DD&fecha_fin=YYYY-MM-DD
 */
router.get(
  "/estadisticas",
  authenticateToken,
  logAuthenticatedAccess,
  requireAdminOrStaff,
  logPedidoAccess("view_stats"),
  getEstadisticas
);

/**
 * @route   GET /api/pedidos
 * @desc    Listar todos los pedidos con filtros
 * @access  Private (Admin/Administrativo)
 * @query   ?estado=pendiente&page=1&limit=20
 */
router.get(
  "/",
  authenticateToken,
  logAuthenticatedAccess,
  requireAdminOrStaff,
  logPedidoAccess("view_all"),
  getAllPedidos
);

/**
 * @route   PUT /api/pedidos/:id/estado
 * @desc    Cambiar estado de pedido
 * @access  Private (Admin/Administrativo)
 * @body    { nuevo_estado }
 */
router.put(
  "/:id/estado",
  authenticateToken,
  logAuthenticatedAccess,
  requireStaffForStatusChange,
  logPedidoAccess("change_status"),
  changeEstado
);

/**
 * @route   PUT /api/pedidos/:id/confirmar
 * @desc    Confirmar pedido y reducir stock
 * @access  Private (Admin/Administrativo)
 */
router.put(
  "/:id/confirmar",
  authenticateToken,
  logAuthenticatedAccess,
  requireStaffForStatusChange,
  logPedidoAccess("confirm"),
  confirmarPedido
);

/**
 * @route   PUT /api/pedidos/:id/asignar-vehiculo
 * @desc    Asignar vehículo a pedido (sistema experto básico)
 * @access  Private (Admin/Administrativo)
 * @body    { vehiculo_id? } - Opcional, si no se proporciona se asigna automáticamente
 */
router.put(
  "/:id/asignar-vehiculo",
  authenticateToken,
  logAuthenticatedAccess,
  requireStaffForStatusChange,
  logPedidoAccess("assign_vehicle"),
  asignarVehiculo
);

module.exports = router;
