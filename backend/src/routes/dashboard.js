const express = require("express");
const router = express.Router();

// Controllers
const {
  getDashboardCliente,
  getDashboardAdministrativo,
  getDashboardAdmin,
  getMetricasSistema,
} = require("../controllers/dashboardController");

// Middlewares
const {
  authenticateToken,
  requireAdmin,
  requireAdminOrStaff,
  requireAuth,
  logAuthenticatedAccess,
} = require("../middleware/authentication");

const { addResponseHelpers } = require("../utils/responseHelper");

// Agregar helpers de respuesta
router.use(addResponseHelpers);

// Todas las rutas de dashboard requieren autenticación
router.use(authenticateToken);
router.use(logAuthenticatedAccess);

/**
 * @route   GET /api/dashboard/cliente
 * @desc    Dashboard para clientes - Solo sus propios datos
 * @access  Private (Solo clientes)
 */
router.get("/cliente", requireAuth, (req, res, next) => {
  // Verificar que el usuario sea cliente
  if (req.user.rol !== "cliente") {
    return res.status(403).json({
      success: false,
      error: {
        message: "Solo clientes pueden acceder a este dashboard",
        status: 403,
      },
    });
  }

  getDashboardCliente(req, res, next);
});

/**
 * @route   GET /api/dashboard/administrativo
 * @desc    Dashboard para administrativos - Gestión operativa
 * @access  Private (Admin/Administrativo)
 */
router.get("/administrativo", requireAdminOrStaff, getDashboardAdministrativo);

/**
 * @route   GET /api/dashboard/admin
 * @desc    Dashboard para administradores - Vista completa del negocio
 * @access  Private (Solo Admin)
 */
router.get("/admin", requireAdmin, getDashboardAdmin);

/**
 * @route   GET /api/dashboard/metricas-sistema
 * @desc    Métricas de rendimiento del sistema
 * @access  Private (Solo Admin)
 */
router.get("/metricas-sistema", requireAdmin, getMetricasSistema);

/**
 * @route   GET /api/dashboard
 * @desc    Redireccionar al dashboard apropiado según el rol del usuario
 * @access  Private (Cualquier usuario autenticado)
 */
router.get("/", requireAuth, (req, res) => {
  const { rol } = req.user;

  // Redireccionar según el rol
  const redirects = {
    cliente: "/api/dashboard/cliente",
    administrativo: "/api/dashboard/administrativo",
    administrador: "/api/dashboard/admin",
    conductor: "/api/dashboard/administrativo", // Los conductores ven dashboard administrativo
  };

  const redirectUrl = redirects[rol];

  if (!redirectUrl) {
    return res.status(400).json({
      success: false,
      error: {
        message: "Rol de usuario no tiene dashboard asignado",
        status: 400,
      },
    });
  }

  return res.status(200).json({
    success: true,
    message: `Dashboard disponible para rol: ${rol}`,
    data: {
      dashboard_url: redirectUrl,
      rol_usuario: rol,
      mensaje: `Accede a ${redirectUrl} para ver tu dashboard`,
    },
  });
});

module.exports = router;
