const { verifyToken, extractToken } = require("../utils/jwtHelper");
const {
  AuthenticationError,
  createAuthorizationError,
} = require("./errorHandler");
const Usuario = require("../models/Usuario");
const logger = require("../utils/logger");

/**
 * Middleware principal de autenticación
 * Verifica el token JWT y obtiene los datos actuales del usuario
 */
const authenticateToken = async (req, res, next) => {
  try {
    // Extraer token del header Authorization
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);

    if (!token) {
      logger.warn("Intento de acceso sin token", {
        ip: req.ip,
        path: req.originalUrl,
      });
      throw new AuthenticationError("Token de acceso requerido");
    }

    // Verificar token JWT
    const decoded = verifyToken(token);

    // Obtener datos actuales del usuario desde la BD
    // (para verificar que sigue activo y obtener datos actualizados)
    const currentUser = await Usuario.findById(decoded.id);

    if (!currentUser) {
      logger.warn("Token válido pero usuario no existe", {
        id: decoded.id,
        email: decoded.email,
      });
      throw new AuthenticationError("Usuario no encontrado");
    }

    if (!currentUser.activo) {
      logger.warn("Intento de acceso con usuario inactivo", {
        id: currentUser.id,
        email: currentUser.email,
      });
      throw new AuthenticationError("Cuenta desactivada");
    }

    // Agregar usuario al request para uso en controllers
    req.user = {
      id: currentUser.id,
      email: currentUser.email,
      nombre: currentUser.nombre,
      apellido: currentUser.apellido,
      rol: currentUser.rol,
      telefono: currentUser.telefono,
    };

    // Agregar token al request (por si se necesita)
    req.token = token;

    logger.debug("Usuario autenticado exitosamente", {
      id: req.user.id,
      email: req.user.email,
      rol: req.user.rol,
    });

    next();
  } catch (error) {
    logger.error("Error en autenticación:", error.message);
    next(error);
  }
};

/**
 * Middleware de autenticación opcional
 * Si hay token lo valida, si no hay token continúa sin usuario
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    const token = extractToken(authHeader);

    // Si no hay token, continuar sin usuario
    if (!token) {
      req.user = null;
      return next();
    }

    // Si hay token, intentar autenticar
    const decoded = verifyToken(token);
    const currentUser = await Usuario.findById(decoded.id);

    if (currentUser && currentUser.activo) {
      req.user = {
        id: currentUser.id,
        email: currentUser.email,
        nombre: currentUser.nombre,
        apellido: currentUser.apellido,
        rol: currentUser.rol,
        telefono: currentUser.telefono,
      };
    } else {
      req.user = null;
    }

    next();
  } catch (error) {
    // En autenticación opcional, si hay error con el token, continuar sin usuario
    logger.debug(
      "Token opcional inválido, continuando sin usuario:",
      error.message
    );
    req.user = null;
    next();
  }
};

/**
 * Crear middleware de autorización por roles
 * @param {string|Array} allowedRoles - Rol o array de roles permitidos
 * @returns {Function} Middleware de autorización
 */
const requireRoles = (...allowedRoles) => {
  return (req, res, next) => {
    try {
      // Verificar que el usuario esté autenticado
      if (!req.user) {
        logger.warn("Intento de acceso sin autenticación a ruta protegida", {
          path: req.originalUrl,
          method: req.method,
          ip: req.ip,
        });
        throw new AuthenticationError("Autenticación requerida");
      }

      // Verificar roles
      const userRole = req.user.rol;
      const hasPermission = allowedRoles.includes(userRole);

      if (!hasPermission) {
        logger.warn("Acceso denegado por permisos", {
          userId: req.user.id,
          userRole: userRole,
          requiredRoles: allowedRoles,
          path: req.originalUrl,
        });
        throw new createAuthorizationError(
          `Acceso denegado. Roles requeridos: ${allowedRoles.join(", ")}`
        );
      }

      logger.debug("Autorización exitosa", {
        userId: req.user.id,
        userRole: userRole,
        path: req.originalUrl,
      });

      next();
    } catch (error) {
      next(error);
    }
  };
};

/**
 * Middleware para solo administradores
 */
const requireAdmin = requireRoles("administrador");

/**
 * Middleware para administradores y administrativos
 */
const requireAdminOrStaff = requireRoles("administrador", "administrativo");

/**
 * Middleware para roles internos (no clientes)
 */
const requireInternalUser = requireRoles(
  "administrador",
  "administrativo",
  "conductor"
);

/**
 * Middleware para cualquier usuario autenticado
 */
const requireAuth = requireRoles(
  "administrador",
  "administrativo",
  "conductor",
  "cliente"
);

/**
 * Middleware para verificar que el usuario puede acceder a datos de otro usuario
 * Administradores pueden acceder a cualquier usuario, otros solo a sí mismos
 */
const requireOwnershipOrAdmin = (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    // Los administradores pueden acceder a todo
    if (req.user.rol === "administrador") {
      return next();
    }

    // Obtener ID del usuario objetivo (puede venir de params o query)
    const targetUserId = parseInt(
      req.params.id || req.params.userId || req.query.userId
    );

    if (!targetUserId) {
      throw new createAuthorizationError("ID de usuario requerido");
    }

    // Verificar que el usuario accede solo a sus propios datos
    if (req.user.id !== targetUserId) {
      logger.warn("Intento de acceso a datos de otro usuario", {
        currentUserId: req.user.id,
        targetUserId: targetUserId,
        path: req.originalUrl,
      });
      throw new createAuthorizationError(
        "Solo puedes acceder a tus propios datos"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar que un cliente solo accede a sus propios pedidos
 */
const requireOrderOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    // Los administradores y administrativos pueden ver todos los pedidos
    if (["administrador", "administrativo"].includes(req.user.rol)) {
      return next();
    }

    // Los clientes solo pueden ver sus propios pedidos
    if (req.user.rol === "cliente") {
      // Aquí se validaría que el pedido pertenece al cliente
      // Por ahora solo agregamos la información del usuario para que el controller la use
      req.clientFilter = { cliente_id: req.user.id };
      return next();
    }

    throw new createAuthorizationError("No tienes permisos para ver pedidos");
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para logging de accesos autenticados
 */
const logAuthenticatedAccess = (req, res, next) => {
  if (req.user) {
    logger.info("Acceso autenticado", {
      userId: req.user.id,
      email: req.user.email,
      rol: req.user.rol,
      method: req.method,
      path: req.originalUrl,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
  }
  next();
};

/**
 * Middleware para verificar si el token está próximo a expirar
 */
const checkTokenExpiry = (req, res, next) => {
  if (req.token) {
    try {
      const {
        isTokenNearExpiry,
        decodeTokenWithoutVerification,
      } = require("../utils/auth");
      const decoded = decodeTokenWithoutVerification(req.token);

      if (decoded && isTokenNearExpiry(decoded, 30)) {
        // Agregar header informativo sobre renovación de token
        res.set("X-Token-Refresh-Suggested", "true");

        logger.info("Token próximo a expirar", {
          userId: req.user.id,
          expiresAt: new Date(decoded.exp * 1000).toISOString(),
        });
      }
    } catch (error) {
      logger.debug("Error verificando expiración de token:", error.message);
    }
  }
  next();
};

module.exports = {
  // Middleware principal
  authenticateToken,
  optionalAuth,

  // Middleware de roles
  requireRoles,
  requireAdmin,
  requireAdminOrStaff,
  requireInternalUser,
  requireAuth,

  // Middleware especiales
  requireOwnershipOrAdmin,
  requireOrderOwnership,

  // Utilidades
  logAuthenticatedAccess,
  checkTokenExpiry,
};
