const Usuario = require("../models/Usuario");
const Cliente = require("../models/Cliente");
const { generateToken, createLoginResponse } = require("../utils/jwtHelper");
const {
  loginSuccess,
  logoutSuccess,
  created,
  success,
  validationError,
  unauthorized,
  conflict,
  serverError,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  AuthenticationError,
  ConflictError,
} = require("../middleware/errorHandler");
const {
  validateUserRegistration,
  validateEmail,
  validatePassword,
} = require("../utils/validation");
const logger = require("../utils/logger");

/**
 * Login de usuario
 * POST /api/auth/login
 * Body: { email, password }
 */
const login = asyncHandler(async (req, res) => {
  const { email, password } = req.body;

  // VALIDACIÓN SIMPLIFICADA - usar funciones centralizadas
  const emailValidation = validateEmail(email);
  const passwordValidation = validatePassword(password);

  const errors = [];
  if (!emailValidation.isValid) {
    errors.push({ field: "email", message: emailValidation.message });
  }
  if (!passwordValidation.isValid) {
    errors.push({ field: "password", message: passwordValidation.message });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Credenciales incompletas");
  }

  logger.info("Intento de login", { email: emailValidation.value, ip: req.ip });

  // Verificar credenciales usando el modelo Usuario
  const user = await Usuario.verifyCredentials(
    emailValidation.value,
    passwordValidation.value
  );

  if (!user) {
    logger.warn("Login fallido - credenciales inválidas", {
      email: emailValidation.value,
      ip: req.ip,
      userAgent: req.get("User-Agent"),
    });
    return unauthorized(res, "Credenciales inválidas");
  }

  // Generar token JWT
  const token = generateToken(user);

  logger.info("Login exitoso", {
    userId: user.id,
    email: user.email,
    rol: user.rol,
    ip: req.ip,
  });

  return loginSuccess(res, user, token);
});

/**
 * Obtener perfil del usuario autenticado
 * GET /api/auth/me
 * Headers: Authorization: Bearer <token>
 */
const getProfile = asyncHandler(async (req, res) => {
  // El usuario viene del middleware de autenticación
  const user = req.user;

  // Si el usuario es cliente, incluir información adicional del perfil de cliente
  if (user.rol === "cliente") {
    const clientProfile = await Cliente.findByUserId(user.id);

    if (clientProfile) {
      const completeProfile = {
        ...user,
        perfil_cliente: {
          id: clientProfile.id,
          empresa: clientProfile.empresa,
          direccion: clientProfile.direccion,
          ciudad: clientProfile.ciudad,
          tipo_cliente: clientProfile.tipo_cliente,
        },
      };

      logger.debug("Perfil de cliente obtenido", { userId: user.id });
      return success(res, completeProfile, "Perfil obtenido exitosamente");
    }
  }

  logger.debug("Perfil obtenido", { userId: user.id, rol: user.rol });
  return success(res, user, "Perfil obtenido exitosamente");
});

/**
 * Logout de usuario
 * POST /api/auth/logout
 * Headers: Authorization: Bearer <token>
 */
const logout = asyncHandler(async (req, res) => {
  // En JWT stateless, el logout es principalmente del lado cliente
  // Aquí solo hacemos log del evento

  logger.info("Logout realizado", {
    userId: req.user.id,
    email: req.user.email,
    ip: req.ip,
  });

  return logoutSuccess(res);
});

/**
 * Registro de cliente (autoregistro)
 * POST /api/auth/register
 * Body: { nombre, apellido, email, password, telefono?, empresa?, direccion? }
 */
const registerClient = asyncHandler(async (req, res) => {
  const userData = req.body;

  logger.info("Intento de registro de cliente", {
    email: userData.email,
    ip: req.ip,
  });

  // Validar datos de registro
  const validation = validateUserRegistration({
    ...userData,
    rol: "cliente", // Forzar rol cliente para autoregistro
  });

  if (!validation.isValid) {
    logger.warn("Registro fallido - datos inválidos", {
      email: userData.email,
      errors: validation.errors,
    });
    return validationError(
      res,
      validation.errors,
      "Datos de registro inválidos"
    );
  }

  try {
    // Crear usuario con rol cliente
    const newUser = await Usuario.create({
      ...validation.validData,
      rol: "cliente",
    });

    // Crear perfil de cliente con información adicional
    const clientData = {
      usuario_id: newUser.id,
      empresa: userData.empresa || null,
      direccion: userData.direccion || null,
      ciudad: userData.ciudad || "Cochabamba",
      tipo_cliente: userData.empresa ? "empresa" : "particular",
    };

    const clientProfile = await Cliente.create(clientData);

    // Generar token para login automático después del registro
    const token = generateToken(newUser);

    logger.info("Cliente registrado exitosamente", {
      userId: newUser.id,
      email: newUser.email,
      clientId: clientProfile.id,
    });

    // Respuesta con token incluido para login automático
    const responseData = {
      user: newUser,
      cliente: clientProfile,
      token,
      token_type: "Bearer",
      expires_in: "24h",
    };

    return created(res, responseData, "Cliente registrado exitosamente");
  } catch (error) {
    // Manejar error específico de email duplicado
    if (error.code === "23505" || error instanceof ConflictError) {
      logger.warn("Registro fallido - email duplicado", {
        email: userData.email,
      });
      return conflict(res, "El email ya está registrado");
    }

    logger.error("Error en registro de cliente:", error.message);
    throw error;
  }
});

/**
 * Actualizar perfil del usuario autenticado
 * PUT /api/auth/profile
 * Headers: Authorization: Bearer <token>
 * Body: { nombre?, apellido?, telefono? }
 */
const updateProfile = asyncHandler(async (req, res) => {
  const userId = req.user.id;
  const updateData = req.body;

  logger.info("Actualizando perfil", { userId });

  // Actualizar datos básicos del usuario
  const updatedUser = await Usuario.updateProfile(userId, updateData);

  // Si es cliente y hay datos adicionales, actualizar perfil de cliente
  if (
    req.user.rol === "cliente" &&
    (updateData.empresa !== undefined ||
      updateData.direccion !== undefined ||
      updateData.ciudad !== undefined)
  ) {
    const clientData = {
      empresa: updateData.empresa,
      direccion: updateData.direccion,
      ciudad: updateData.ciudad,
    };

    // Buscar el cliente existente
    const existingClient = await Cliente.findByUserId(userId);

    if (existingClient) {
      await Cliente.update(existingClient.id, clientData);
      logger.debug("Perfil de cliente actualizado", {
        userId,
        clientId: existingClient.id,
      });
    }
  }

  logger.info("Perfil actualizado exitosamente", { userId });

  return success(res, updatedUser, "Perfil actualizado exitosamente");
});

/**
 * Cambiar contraseña del usuario autenticado
 * PUT /api/auth/change-password
 * Headers: Authorization: Bearer <token>
 * Body: { current_password, new_password }
 */
const changePassword = asyncHandler(async (req, res) => {
  const { current_password, new_password } = req.body;
  const userId = req.user.id;

  // VALIDACIÓN SIMPLIFICADA - usar funciones centralizadas
  const currentPasswordValidation = validatePassword(current_password);
  const newPasswordValidation = validatePassword(new_password);

  const errors = [];
  if (!currentPasswordValidation.isValid) {
    errors.push({
      field: "current_password",
      message: "Contraseña actual requerida",
    });
  }
  if (!newPasswordValidation.isValid) {
    errors.push({
      field: "new_password",
      message: newPasswordValidation.message,
    });
  }

  if (errors.length > 0) {
    return validationError(res, errors, "Datos incompletos");
  }

  logger.info("Cambio de contraseña solicitado", { userId });

  // Cambiar contraseña usando método del modelo
  const success_change = await Usuario.changePassword(
    userId,
    currentPasswordValidation.value,
    newPasswordValidation.value
  );

  if (success_change) {
    logger.info("Contraseña cambiada exitosamente", { userId });
    return success(res, null, "Contraseña actualizada exitosamente");
  }

  return serverError(res, "Error cambiando contraseña");
});

/**
 * Crear usuario (solo administradores)
 * POST /api/auth/admin/create-user
 * Headers: Authorization: Bearer <token> (rol: administrador)
 * Body: { nombre, apellido, email, password, rol, telefono? }
 */
const createUser = asyncHandler(async (req, res) => {
  const userData = req.body;
  const adminUser = req.user;

  logger.info("Admin creando usuario", {
    adminId: adminUser.id,
    targetRole: userData.rol,
    email: userData.email,
  });

  // Validar que solo admin puede crear usuarios
  if (adminUser.rol !== "administrador") {
    logger.warn("Intento no autorizado de crear usuario", {
      userId: adminUser.id,
      userRole: adminUser.rol,
    });
    return unauthorized(res, "Solo administradores pueden crear usuarios");
  }

  // Validar datos
  const validation = validateUserRegistration(userData);

  if (!validation.isValid) {
    return validationError(
      res,
      validation.errors,
      "Datos de usuario inválidos"
    );
  }

  try {
    // Crear usuario
    const newUser = await Usuario.create(validation.validData);

    // Si es cliente, crear perfil de cliente básico
    if (newUser.rol === "cliente") {
      const clientData = {
        usuario_id: newUser.id,
        ciudad: "Cochabamba",
        tipo_cliente: "particular",
      };

      await Cliente.create(clientData);
      logger.debug("Perfil de cliente creado automáticamente", {
        userId: newUser.id,
      });
    }

    logger.info("Usuario creado por admin", {
      adminId: adminUser.id,
      newUserId: newUser.id,
      role: newUser.rol,
    });

    return created(res, newUser, "Usuario creado exitosamente");
  } catch (error) {
    if (error.code === "23505" || error instanceof ConflictError) {
      return conflict(res, "El email ya está registrado");
    }

    logger.error("Error creando usuario:", error.message);
    throw error;
  }
});

module.exports = {
  // Autenticación básica
  login,
  logout,
  getProfile,

  // Registro y gestión de perfil
  registerClient,
  updateProfile,
  changePassword,

  // Funciones administrativas
  createUser,
};
