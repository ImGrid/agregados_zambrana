// src/routes/auth.js - Rutas de Autenticación
// Sistema de Tracking Vehicular - Agregados Zambrana

const express = require("express");
const router = express.Router();

// Controllers
const {
  login,
  logout,
  getProfile,
  registerClient,
  updateProfile,
  changePassword,
  createUser,
} = require("../controllers/authController");

// Middlewares
const {
  authenticateToken,
  requireAdmin,
  logAuthenticatedAccess,
  checkTokenExpiry,
} = require("../middleware/authentication");

const { addResponseHelpers } = require("../utils/responseHelper");

// Agregar helpers de respuesta a todas las rutas
router.use(addResponseHelpers);

// ==========================================
// RUTAS PÚBLICAS (NO REQUIEREN AUTENTICACIÓN)
// ==========================================

/**
 * @route   POST /api/auth/login
 * @desc    Iniciar sesión con email y password
 * @access  Public
 * @body    { email, password }
 */
router.post("/login", login);

/**
 * @route   POST /api/auth/register
 * @desc    Registro de clientes (autoregistro)
 * @access  Public
 * @body    { nombre, apellido, email, password, telefono?, empresa?, direccion?, ciudad? }
 */
router.post("/register", registerClient);

// ==========================================
// RUTAS PROTEGIDAS (REQUIEREN AUTENTICACIÓN)
// ==========================================

// Middleware para todas las rutas protegidas
router.use(authenticateToken);
router.use(logAuthenticatedAccess);
router.use(checkTokenExpiry);

/**
 * @route   GET /api/auth/me
 * @desc    Obtener perfil del usuario autenticado
 * @access  Private (cualquier usuario autenticado)
 */
router.get("/me", getProfile);

/**
 * @route   POST /api/auth/logout
 * @desc    Cerrar sesión (invalidar token del lado cliente)
 * @access  Private (cualquier usuario autenticado)
 */
router.post("/logout", logout);

/**
 * @route   PUT /api/auth/profile
 * @desc    Actualizar perfil del usuario autenticado
 * @access  Private (cualquier usuario autenticado)
 * @body    { nombre?, apellido?, telefono?, empresa?, direccion?, ciudad? }
 */
router.put("/profile", updateProfile);

/**
 * @route   PUT /api/auth/change-password
 * @desc    Cambiar contraseña del usuario autenticado
 * @access  Private (cualquier usuario autenticado)
 * @body    { current_password, new_password }
 */
router.put("/change-password", changePassword);

// ==========================================
// RUTAS ADMINISTRATIVAS (SOLO ADMINISTRADORES)
// ==========================================

/**
 * @route   POST /api/auth/admin/create-user
 * @desc    Crear nuevo usuario (cualquier rol)
 * @access  Private (solo administrador)
 * @body    { nombre, apellido, email, password, rol, telefono? }
 */
router.post("/admin/create-user", requireAdmin, createUser);

// ==========================================
// MIDDLEWARE DE MANEJO DE ERRORES ESPECÍFICO
// ==========================================

// Manejo de rutas no encontradas dentro de /auth
router.use((req, res) => {
  res.status(404).json({
    success: false,
    error: {
      message: `Ruta de autenticación no encontrada: ${req.method} ${req.originalUrl}`,
      status: 404,
      timestamp: new Date().toISOString(),
    },
  });
});

// ==========================================
// EXPORT
// ==========================================

module.exports = router;
