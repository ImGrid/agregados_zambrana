/**
 * Respuesta exitosa estándar
 */
const success = (
  res,
  data = null,
  message = "Operación exitosa",
  statusCode = 200
) => {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
  };

  // Solo agregar data si no es null/undefined
  if (data !== null && data !== undefined) {
    response.data = data;
  }

  return res.status(statusCode).json(response);
};

/**
 * Respuesta de creación exitosa (201)
 */
const created = (res, data, message = "Recurso creado exitosamente") => {
  return success(res, data, message, 201);
};

/**
 * Respuesta de actualización exitosa
 */
const updated = (res, data, message = "Recurso actualizado exitosamente") => {
  return success(res, data, message, 200);
};

/**
 * Respuesta de eliminación exitosa
 */
const deleted = (res, message = "Recurso eliminado exitosamente") => {
  return success(res, null, message, 200);
};

/**
 * Respuesta sin contenido (204)
 */
const noContent = (res) => {
  return res.status(204).send();
};

/**
 * Respuesta con paginación
 */
const paginated = (
  res,
  data,
  pagination,
  message = "Datos obtenidos exitosamente"
) => {
  const response = {
    success: true,
    message,
    data,
    pagination: {
      page: pagination.page || 1,
      limit: pagination.limit || 10,
      total: pagination.total || 0,
      pages: Math.ceil((pagination.total || 0) / (pagination.limit || 10)),
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(response);
};

/**
 * Crear objeto de paginación helper
 */
const createPagination = (page, limit, total) => {
  const pageNum = Math.max(1, parseInt(page) || 1);
  const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10)); // Máximo 100 por página
  const totalNum = parseInt(total) || 0;
  const totalPages = Math.ceil(totalNum / limitNum);

  return {
    page: pageNum,
    limit: limitNum,
    total: totalNum,
    pages: totalPages,
    offset: (pageNum - 1) * limitNum,
    hasNext: pageNum < totalPages,
    hasPrevious: pageNum > 1,
  };
};

/**
 * Error de validación (400)
 */
const validationError = (res, errors, message = "Errores de validación") => {
  const response = {
    success: false,
    error: {
      message,
      status: 400,
      validation_errors: errors,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(400).json(response);
};

/**
 * Error de autenticación (401)
 */
const unauthorized = (res, message = "No autorizado") => {
  const response = {
    success: false,
    error: {
      message,
      status: 401,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(401).json(response);
};

/**
 * Error de autorización/permisos (403)
 */
const forbidden = (res, message = "Acceso denegado") => {
  const response = {
    success: false,
    error: {
      message,
      status: 403,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(403).json(response);
};

/**
 * Recurso no encontrado (404)
 */
const notFound = (res, message = "Recurso no encontrado") => {
  const response = {
    success: false,
    error: {
      message,
      status: 404,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(404).json(response);
};

/**
 * Conflicto de datos (409)
 */
const conflict = (res, message = "Conflicto de datos") => {
  const response = {
    success: false,
    error: {
      message,
      status: 409,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(409).json(response);
};

/**
 * Error de lógica de negocio (422)
 */
const businessLogicError = (res, message = "Error de lógica de negocio") => {
  const response = {
    success: false,
    error: {
      message,
      status: 422,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(422).json(response);
};

/**
 * Error interno del servidor (500)
 */
const serverError = (res, message = "Error interno del servidor") => {
  const response = {
    success: false,
    error: {
      message,
      status: 500,
      timestamp: new Date().toISOString(),
    },
  };

  return res.status(500).json(response);
};

/**
 * Respuesta de login exitoso
 */
const loginSuccess = (res, user, token) => {
  const response = {
    success: true,
    message: "Login exitoso",
    data: {
      user: {
        id: user.id,
        email: user.email,
        nombre: user.nombre,
        apellido: user.apellido,
        rol: user.rol,
      },
      token,
      token_type: "Bearer",
      expires_in: process.env.JWT_EXPIRE || "24h",
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(response);
};

/**
 * Respuesta de logout exitoso
 */
const logoutSuccess = (res) => {
  return success(res, null, "Logout exitoso");
};

/**
 * Respuesta de stock actualizado con alertas
 */
const stockUpdated = (res, stockData, alerts = []) => {
  const response = {
    success: true,
    message: "Stock actualizado exitosamente",
    data: stockData,
    timestamp: new Date().toISOString(),
  };

  // Agregar alertas si existen
  if (alerts.length > 0) {
    response.alerts = alerts;
  }

  return res.status(200).json(response);
};

/**
 * Respuesta de pedido creado con código de seguimiento
 */
const orderCreated = (res, orderData) => {
  const response = {
    success: true,
    message: "Pedido creado exitosamente",
    data: {
      ...orderData,
      tracking_url: `/api/pedidos/seguimiento/${orderData.codigo_seguimiento}`,
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(201).json(response);
};

/**
 * Respuesta de vehículo asignado automáticamente
 */
const vehicleAssigned = (res, assignmentData) => {
  const response = {
    success: true,
    message: "Vehículo asignado automáticamente",
    data: {
      pedido_id: assignmentData.pedido_id,
      vehiculo: {
        id: assignmentData.vehiculo.id,
        placa: assignmentData.vehiculo.placa,
        capacidad: assignmentData.vehiculo.capacidad_m3,
      },
      tiempo_estimado: assignmentData.tiempo_estimado,
      razon_asignacion: assignmentData.razon || "Capacidad óptima",
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(response);
};

/**
 * Respuesta de estadísticas del dashboard
 */
const dashboardStats = (res, stats, userRole) => {
  const response = {
    success: true,
    message: `Estadísticas para ${userRole}`,
    data: {
      stats,
      role: userRole,
      generated_at: new Date().toISOString(),
    },
    timestamp: new Date().toISOString(),
  };

  return res.status(200).json(response);
};

/**
 * Formatear datos de usuario (remover información sensible)
 */
const formatUser = (user) => {
  if (!user) return null;

  const { password, ...userWithoutPassword } = user;
  return userWithoutPassword;
};

/**
 * Formatear lista de usuarios
 */
const formatUsers = (users) => {
  if (!Array.isArray(users)) return [];

  return users.map((user) => formatUser(user));
};

/**
 * Formatear respuesta con tiempo de procesamiento
 */
const withProcessingTime = (startTime, data) => {
  const processingTime = Date.now() - startTime;

  return {
    ...data,
    processing_time_ms: processingTime,
  };
};

/**
 * Crear respuesta de health check
 */
const healthCheck = (res, status = "OK", details = {}) => {
  const response = {
    status,
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || "development",
    ...details,
  };

  return res.status(status === "OK" ? 200 : 503).json(response);
};

/**
 * Middleware para agregar helpers de respuesta a res
 */
const addResponseHelpers = (req, res, next) => {
  // Agregar métodos helper directamente a res
  res.success = (data, message) => success(res, data, message);
  res.created = (data, message) => created(res, data, message);
  res.updated = (data, message) => updated(res, data, message);
  res.deleted = (message) => deleted(res, message);
  res.paginated = (data, pagination, message) =>
    paginated(res, data, pagination, message);

  res.validationError = (errors, message) =>
    validationError(res, errors, message);
  res.unauthorized = (message) => unauthorized(res, message);
  res.forbidden = (message) => forbidden(res, message);
  res.notFound = (message) => notFound(res, message);
  res.conflict = (message) => conflict(res, message);
  res.businessLogicError = (message) => businessLogicError(res, message);
  res.serverError = (message) => serverError(res, message);

  next();
};

module.exports = {
  // Respuestas de éxito
  success,
  created,
  updated,
  deleted,
  noContent,
  paginated,

  // Respuestas de error
  validationError,
  unauthorized,
  forbidden,
  notFound,
  conflict,
  businessLogicError,
  serverError,

  // Respuestas específicas del dominio
  loginSuccess,
  logoutSuccess,
  stockUpdated,
  orderCreated,
  vehicleAssigned,
  dashboardStats,
  healthCheck,

  // Utilidades
  createPagination,
  formatUser,
  formatUsers,
  withProcessingTime,
  addResponseHelpers,
};
