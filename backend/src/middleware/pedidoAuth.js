const {
  createAuthorizationError,
  AuthenticationError,
} = require("./errorHandler");
const Pedido = require("../models/Pedido");
const Cliente = require("../models/Cliente");
const logger = require("../utils/logger");

/**
 * Verificar que un cliente solo accede a sus propios pedidos
 * Los admin/administrativos pueden acceder a cualquier pedido
 */
const requirePedidoOwnership = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    // Los administradores y administrativos pueden ver todos los pedidos
    if (["administrador", "administrativo"].includes(req.user.rol)) {
      return next();
    }

    // Para clientes, verificar que tienen perfil de cliente
    if (req.user.rol === "cliente") {
      const clienteProfile = await Cliente.findByUserId(req.user.id);

      if (!clienteProfile) {
        logger.warn("Cliente sin perfil intentando acceder a pedidos", {
          userId: req.user.id,
        });
        throw new createAuthorizationError("Perfil de cliente no encontrado");
      }

      // Agregar filtro de cliente para usar en controllers
      req.clienteFilter = { cliente_id: clienteProfile.id };
      req.clienteId = clienteProfile.id;

      return next();
    }

    // Otros roles no pueden acceder a pedidos
    logger.warn("Rol sin permisos intentando acceder a pedidos", {
      userId: req.user.id,
      rol: req.user.rol,
    });

    throw new createAuthorizationError(
      "No tienes permisos para acceder a pedidos"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Verificar que un cliente puede acceder a un pedido específico
 * Usado para rutas con :id en la URL
 */
const requireSpecificPedidoAccess = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    const pedidoId = req.params.id || req.params.pedido_id;

    if (!pedidoId) {
      throw new createAuthorizationError("ID de pedido requerido");
    }

    // Los administradores y administrativos pueden acceder a cualquier pedido
    if (["administrador", "administrativo"].includes(req.user.rol)) {
      return next();
    }

    // Para clientes, verificar ownership del pedido
    if (req.user.rol === "cliente") {
      const clienteProfile = await Cliente.findByUserId(req.user.id);

      if (!clienteProfile) {
        throw new createAuthorizationError("Perfil de cliente no encontrado");
      }

      // Verificar que el pedido pertenece al cliente
      const pedido = await Pedido.findById(pedidoId);

      if (!pedido) {
        logger.warn("Intento de acceso a pedido inexistente", {
          pedidoId,
          userId: req.user.id,
        });
        throw new createAuthorizationError("Pedido no encontrado");
      }

      if (pedido.cliente_id !== clienteProfile.id) {
        logger.warn("Cliente intentando acceder a pedido de otro cliente", {
          pedidoId,
          clienteId: clienteProfile.id,
          pedidoClienteId: pedido.cliente_id,
          userId: req.user.id,
        });
        throw new createAuthorizationError(
          "Solo puedes acceder a tus propios pedidos"
        );
      }

      // Agregar información del cliente al request
      req.clienteId = clienteProfile.id;
      req.pedido = pedido;

      return next();
    }

    throw new createAuthorizationError(
      "No tienes permisos para acceder a este pedido"
    );
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar que solo clientes pueden crear pedidos
 * Admin/administrativos crean pedidos a nombre de clientes específicos
 */
const requireClientForOrder = async (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    // Si es cliente, obtener su perfil
    if (req.user.rol === "cliente") {
      const clienteProfile = await Cliente.findByUserId(req.user.id);

      if (!clienteProfile) {
        throw new createAuthorizationError(
          "Perfil de cliente requerido para crear pedidos"
        );
      }

      // Agregar ID de cliente al request para usar en controller
      req.clienteId = clienteProfile.id;
      return next();
    }

    // Admin/administrativos pueden crear pedidos pero deben especificar cliente_id
    if (["administrador", "administrativo"].includes(req.user.rol)) {
      const { cliente_id } = req.body;

      if (!cliente_id) {
        throw new createAuthorizationError(
          "Debe especificar cliente_id para crear pedido"
        );
      }

      // Verificar que el cliente existe
      const clienteExists = await Cliente.findById(cliente_id);
      if (!clienteExists) {
        throw new createAuthorizationError(
          "Cliente especificado no encontrado"
        );
      }

      req.clienteId = parseInt(cliente_id);
      req.isAdminCreatingOrder = true;
      return next();
    }

    throw new createAuthorizationError("Solo clientes pueden crear pedidos");
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para verificar acceso público a seguimiento por código
 * Cualquier persona con el código puede hacer seguimiento
 */
const allowPublicTracking = (req, res, next) => {
  // El seguimiento por código es público, no requiere autenticación
  // Solo verificamos que el código esté presente
  const { codigo } = req.params;

  if (!codigo) {
    return next(
      new createAuthorizationError("Código de seguimiento requerido")
    );
  }

  req.trackingCode = codigo.toUpperCase().trim();
  next();
};

/**
 * Middleware para verificar que solo admin/administrativos pueden cambiar estados
 */
const requireStaffForStatusChange = (req, res, next) => {
  try {
    if (!req.user) {
      throw new AuthenticationError("Autenticación requerida");
    }

    if (!["administrador", "administrativo"].includes(req.user.rol)) {
      logger.warn("Usuario sin permisos intentando cambiar estado de pedido", {
        userId: req.user.id,
        rol: req.user.rol,
        pedidoId: req.params.id,
      });

      throw new createAuthorizationError(
        "Solo personal administrativo puede cambiar estados de pedidos"
      );
    }

    next();
  } catch (error) {
    next(error);
  }
};

/**
 * Middleware para logging de accesos a pedidos (auditoría)
 */
const logPedidoAccess = (action = "access") => {
  return (req, res, next) => {
    const logData = {
      action,
      userId: req.user?.id,
      rol: req.user?.rol,
      pedidoId: req.params.id || req.params.pedido_id,
      clienteId: req.clienteId,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    };

    logger.info(`Acceso a pedidos: ${action}`, logData);
    next();
  };
};

/**
 * Verificar si un usuario puede ver estadísticas de pedidos
 */
const canViewPedidoStats = (user) => {
  return ["administrador", "administrativo"].includes(user?.rol);
};

/**
 * Verificar si un usuario puede crear pedidos a nombre de otros
 */
const canCreateOrderForOthers = (user) => {
  return ["administrador"].includes(user?.rol);
};

module.exports = {
  // Middlewares principales
  requirePedidoOwnership,
  requireSpecificPedidoAccess,
  requireClientForOrder,
  requireStaffForStatusChange,

  // Middlewares especiales
  allowPublicTracking,
  logPedidoAccess,

  // Utilities
  canViewPedidoStats,
  canCreateOrderForOthers,
};
