// src/middleware/errorHandler.js - Manejo Centralizado de Errores
// Sistema de Tracking Vehicular - Agregados Zambrana

const logger = require("../utils/logger");

// ==========================================
// TIPOS DE ERROR PERSONALIZADOS
// ==========================================

/**
 * Error de validación (400 Bad Request)
 */
class ValidationError extends Error {
  constructor(message, errors = []) {
    super(message);
    this.name = "ValidationError";
    this.statusCode = 400;
    this.errors = errors;
  }
}

/**
 * Error de autenticación (401 Unauthorized)
 */
class AuthenticationError extends Error {
  constructor(message = "No autorizado") {
    super(message);
    this.name = "AuthenticationError";
    this.statusCode = 401;
  }
}

/**
 * Error de autorización (403 Forbidden)
 */
class AuthorizationError extends Error {
  constructor(message = "Acceso denegado") {
    super(message);
    this.name = "AuthorizationError";
    this.statusCode = 403;
  }
}

/**
 * Error de recurso no encontrado (404 Not Found)
 */
class NotFoundError extends Error {
  constructor(message = "Recurso no encontrado") {
    super(message);
    this.name = "NotFoundError";
    this.statusCode = 404;
  }
}

/**
 * Error de conflicto (409 Conflict)
 */
class ConflictError extends Error {
  constructor(message = "Conflicto de datos") {
    super(message);
    this.name = "ConflictError";
    this.statusCode = 409;
  }
}

/**
 * Error de negocio/lógica (422 Unprocessable Entity)
 */
class BusinessLogicError extends Error {
  constructor(message) {
    super(message);
    this.name = "BusinessLogicError";
    this.statusCode = 422;
  }
}

// ==========================================
// MIDDLEWARE DE MANEJO DE ERRORES
// ==========================================

/**
 * Middleware principal de manejo de errores
 * Debe ir al final de todas las rutas
 */
const errorHandler = (error, req, res, next) => {
  let statusCode = 500;
  let message = "Error interno del servidor";
  let errors = null;

  // Log del error completo (para debugging)
  logger.error("Error capturado por middleware:", {
    error: error.message,
    stack: error.stack,
    url: req.originalUrl,
    method: req.method,
    ip: req.ip,
    userAgent: req.get("User-Agent"),
  });

  // ==========================================
  // ERRORES PERSONALIZADOS
  // ==========================================

  if (error instanceof ValidationError) {
    statusCode = 400;
    message = error.message;
    errors = error.errors;
    logger.warn("Error de validación:", {
      message,
      errors,
      url: req.originalUrl,
    });
  } else if (error instanceof AuthenticationError) {
    statusCode = 401;
    message = error.message;
    logger.warn("Error de autenticación:", {
      message,
      ip: req.ip,
      url: req.originalUrl,
    });
  } else if (error instanceof AuthorizationError) {
    statusCode = 403;
    message = error.message;
    logger.warn("Error de autorización:", {
      message,
      ip: req.ip,
      url: req.originalUrl,
    });
  } else if (error instanceof NotFoundError) {
    statusCode = 404;
    message = error.message;
    logger.info("Recurso no encontrado:", { message, url: req.originalUrl });
  } else if (error instanceof ConflictError) {
    statusCode = 409;
    message = error.message;
    logger.warn("Error de conflicto:", { message, url: req.originalUrl });
  } else if (error instanceof BusinessLogicError) {
    statusCode = 422;
    message = error.message;
    logger.warn("Error de lógica de negocio:", {
      message,
      url: req.originalUrl,
    });
  }

  // ==========================================
  // ERRORES DE BASE DE DATOS (PostgreSQL)
  // ==========================================
  else if (error.code) {
    switch (error.code) {
      case "23505": // Unique violation
        statusCode = 409;
        message = "Ya existe un registro con esos datos";
        if (error.constraint) {
          if (error.constraint.includes("email")) {
            message = "El email ya está registrado";
          } else if (error.constraint.includes("placa")) {
            message = "La placa ya está registrada";
          } else if (error.constraint.includes("codigo_seguimiento")) {
            message = "El código de seguimiento ya existe";
          }
        }
        break;

      case "23503": // Foreign key violation
        statusCode = 400;
        message = "Referencia inválida a datos relacionados";
        break;

      case "23502": // Not null violation
        statusCode = 400;
        message = "Campo requerido faltante";
        if (error.column) {
          message = `El campo '${error.column}' es requerido`;
        }
        break;

      case "23514": // Check constraint violation
        statusCode = 400;
        message = "Los datos no cumplen las reglas de validación";
        break;

      case "22P02": // Invalid text representation
        statusCode = 400;
        message = "Formato de dato inválido";
        break;

      case "08006": // Connection failure
      case "08001": // Unable to connect
        statusCode = 503;
        message = "Error de conexión a base de datos";
        logger.error("Error crítico de BD:", error);
        break;

      default:
        logger.error("Error de BD no manejado:", {
          code: error.code,
          message: error.message,
        });
    }
  }

  // ==========================================
  // ERRORES DE JSONWEBTOKEN
  // ==========================================
  else if (error.name === "JsonWebTokenError") {
    statusCode = 401;
    message = "Token inválido";
  } else if (error.name === "TokenExpiredError") {
    statusCode = 401;
    message = "Token expirado";
  } else if (error.name === "NotBeforeError") {
    statusCode = 401;
    message = "Token no válido aún";
  }

  // ==========================================
  // ERRORES DE SINTAXIS JSON
  // ==========================================
  else if (
    error instanceof SyntaxError &&
    error.status === 400 &&
    "body" in error
  ) {
    statusCode = 400;
    message = "JSON inválido en el cuerpo de la petición";
  } else if (error.type === "entity.too.large") {
    statusCode = 413;
    message = "El cuerpo de la petición es demasiado grande";
  }

  // ==========================================
  // ERRORES ESTÁNDAR DE HTTP
  // ==========================================
  else if (error.statusCode) {
    statusCode = error.statusCode;
    message = error.message;
  }

  // ==========================================
  // RESPUESTA DE ERROR ESTANDARIZADA
  // ==========================================

  const errorResponse = {
    success: false,
    error: {
      message,
      status: statusCode,
      timestamp: new Date().toISOString(),
    },
  };

  // Agregar errores de validación si existen
  if (errors && errors.length > 0) {
    errorResponse.error.validation_errors = errors;
  }

  // En desarrollo, incluir stack trace
  if (process.env.NODE_ENV === "development") {
    errorResponse.error.stack = error.stack;
    errorResponse.error.original_error = error.name;
  }

  // Incluir ID de request para tracking (si existe)
  if (req.requestId) {
    errorResponse.error.request_id = req.requestId;
  }

  res.status(statusCode).json(errorResponse);
};

// ==========================================
// MIDDLEWARE PARA CAPTURAR ASYNC ERRORS
// ==========================================

/**
 * Wrapper para async handlers que automaticamente captura errores
 * Evita tener que usar try/catch en cada controller async
 */
const asyncHandler = (fn) => {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// ==========================================
// MIDDLEWARE DE 404 (RUTA NO ENCONTRADA)
// ==========================================

/**
 * Middleware para manejar rutas no encontradas
 * Debe ir antes del errorHandler pero después de todas las rutas
 */
const notFoundHandler = (req, res, next) => {
  const error = new NotFoundError(
    `Ruta ${req.method} ${req.originalUrl} no encontrada`
  );
  next(error);
};

// ==========================================
// FUNCIONES HELPER PARA CREAR ERRORES
// ==========================================

/**
 * Crear error de validación con detalles
 */
const createValidationError = (message, errors = []) => {
  return new ValidationError(message, errors);
};

/**
 * Crear error de recurso no encontrado
 */
const createNotFoundError = (resource = "Recurso") => {
  return new NotFoundError(`${resource} no encontrado`);
};

/**
 * Crear error de lógica de negocio
 */
const createBusinessLogicError = (message) => {
  return new BusinessLogicError(message);
};

/**
 * Crear error de autorización
 */
const createAuthorizationError = (
  message = "No tienes permisos para esta acción"
) => {
  return new AuthorizationError(message);
};

// ==========================================
// MIDDLEWARE DE LOGGING DE REQUESTS
// ==========================================

/**
 * Middleware para generar ID único por request (opcional)
 */
const generateRequestId = (req, res, next) => {
  req.requestId =
    Date.now().toString(36) + Math.random().toString(36).substr(2);
  res.setHeader("X-Request-ID", req.requestId);
  next();
};

/**
 * Middleware para logging detallado de requests
 */
const requestLogger = (req, res, next) => {
  const startTime = Date.now();

  // Override del método res.json para capturar respuestas
  const originalJson = res.json;
  res.json = function (data) {
    const duration = Date.now() - startTime;

    logger.request(
      req.method,
      req.originalUrl,
      res.statusCode,
      duration,
      req.ip
    );

    // Si es error (4xx, 5xx), log adicional
    if (res.statusCode >= 400) {
      logger.warn("Request con error:", {
        method: req.method,
        url: req.originalUrl,
        status: res.statusCode,
        duration,
        ip: req.ip,
        userAgent: req.get("User-Agent"),
        requestId: req.requestId,
      });
    }

    originalJson.call(this, data);
  };

  next();
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Clases de error
  ValidationError,
  AuthenticationError,
  AuthorizationError,
  NotFoundError,
  ConflictError,
  BusinessLogicError,

  // Middlewares principales
  errorHandler,
  asyncHandler,
  notFoundHandler,

  // Helpers para crear errores
  createValidationError,
  createNotFoundError,
  createBusinessLogicError,
  createAuthorizationError,

  // Middlewares adicionales
  generateRequestId,
  requestLogger,
};
