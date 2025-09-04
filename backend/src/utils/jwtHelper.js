// src/utils/jwtHelper.js - Utilidades JWT y Manejo de Tokens
// Sistema de Tracking Vehicular - Agregados Zambrana

const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const logger = require("./logger");

// ==========================================
// CONFIGURACIÓN JWT
// ==========================================

const JWT_SECRET = process.env.JWT_SECRET || "zambrana_secret_key_dev";
const JWT_EXPIRE = process.env.JWT_EXPIRE || "24h";

// Validar configuración en producción
if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET) {
  logger.error("JWT_SECRET no configurado en producción");
  process.exit(1);
}

// ==========================================
// FUNCIONES JWT
// ==========================================

/**
 * Generar token JWT para usuario
 * @param {Object} user - Objeto usuario (sin password)
 * @returns {string} Token JWT
 */
const generateToken = (user) => {
  try {
    const payload = {
      id: user.id,
      email: user.email,
      rol: user.rol,
      nombre: user.nombre,
      apellido: user.apellido,
    };

    const token = jwt.sign(payload, JWT_SECRET, {
      expiresIn: JWT_EXPIRE,
      issuer: "agregados-zambrana",
      subject: user.id.toString(),
    });

    logger.debug("Token generado para usuario:", {
      id: user.id,
      email: user.email,
      rol: user.rol,
    });

    return token;
  } catch (error) {
    logger.error("Error generando token JWT:", error.message);
    throw new Error("Error generando token de autenticación");
  }
};

/**
 * Verificar y decodificar token JWT
 * @param {string} token - Token JWT
 * @returns {Object} Payload decodificado
 */
const verifyToken = (token) => {
  try {
    const decoded = jwt.verify(token, JWT_SECRET, {
      issuer: "agregados-zambrana",
    });

    logger.debug("Token verificado para usuario:", {
      id: decoded.id,
      email: decoded.email,
    });

    return decoded;
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      logger.warn("Token expirado:", { token: token.substring(0, 20) + "..." });
      throw new Error("Token expirado");
    } else if (error.name === "JsonWebTokenError") {
      logger.warn("Token inválido:", { token: token.substring(0, 20) + "..." });
      throw new Error("Token inválido");
    } else {
      logger.error("Error verificando token:", error.message);
      throw new Error("Error verificando token");
    }
  }
};

/**
 * Extraer token del header Authorization
 * @param {string} authHeader - Header Authorization
 * @returns {string|null} Token o null si no válido
 */
const extractToken = (authHeader) => {
  if (!authHeader) {
    return null;
  }

  // Formato: "Bearer token"
  if (!authHeader.startsWith("Bearer ")) {
    logger.warn("Formato de Authorization header inválido");
    return null;
  }

  const token = authHeader.substring(7);

  if (!token) {
    logger.warn("Token vacío en Authorization header");
    return null;
  }

  return token;
};

// ==========================================
// FUNCIONES DE PASSWORD
// ==========================================

/**
 * Hash de contraseña con bcrypt
 * @param {string} password - Contraseña en texto plano
 * @returns {Promise<string>} Hash de la contraseña
 */
const hashPassword = async (password) => {
  try {
    const saltRounds = 12;
    const hash = await bcrypt.hash(password, saltRounds);

    logger.debug("Password hasheado exitosamente");
    return hash;
  } catch (error) {
    logger.error("Error hasheando password:", error.message);
    throw new Error("Error procesando contraseña");
  }
};

/**
 * Verificar contraseña contra hash
 * @param {string} password - Contraseña en texto plano
 * @param {string} hash - Hash almacenado
 * @returns {Promise<boolean>} True si coincide
 */
const verifyPassword = async (password, hash) => {
  try {
    const isValid = await bcrypt.compare(password, hash);

    logger.debug("Password verificado:", { valid: isValid });
    return isValid;
  } catch (error) {
    logger.error("Error verificando password:", error.message);
    throw new Error("Error verificando contraseña");
  }
};

// ==========================================
// FUNCIONES DE UTILIDAD
// ==========================================

/**
 * Obtener información del token sin verificar (para debugging)
 * @param {string} token - Token JWT
 * @returns {Object|null} Payload decodificado sin verificar
 */
const decodeTokenWithoutVerification = (token) => {
  try {
    return jwt.decode(token);
  } catch (error) {
    logger.debug("Error decodificando token:", error.message);
    return null;
  }
};

/**
 * Verificar si un token está próximo a expirar
 * @param {Object} decodedToken - Token decodificado
 * @param {number} minutesThreshold - Minutos antes de expiración
 * @returns {boolean} True si está próximo a expirar
 */
const isTokenNearExpiry = (decodedToken, minutesThreshold = 30) => {
  if (!decodedToken || !decodedToken.exp) {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  const timeUntilExpiry = decodedToken.exp - now;
  const threshold = minutesThreshold * 60;

  return timeUntilExpiry <= threshold;
};

/**
 * Generar objeto de respuesta de login
 * @param {Object} user - Usuario autenticado
 * @param {string} token - Token generado
 * @returns {Object} Respuesta de login
 */
const createLoginResponse = (user, token) => {
  return {
    user: {
      id: user.id,
      email: user.email,
      nombre: user.nombre,
      apellido: user.apellido,
      rol: user.rol,
      telefono: user.telefono,
    },
    token,
    token_type: "Bearer",
    expires_in: JWT_EXPIRE,
  };
};

// ==========================================
// VALIDACIONES DE SEGURIDAD
// ==========================================

/**
 * Verificar si el usuario tiene permisos para una acción
 * @param {Object} user - Usuario
 * @param {string|Array} requiredRoles - Rol o roles requeridos
 * @returns {boolean} True si tiene permisos
 */
const hasPermission = (user, requiredRoles) => {
  if (!user || !user.rol) {
    return false;
  }

  if (Array.isArray(requiredRoles)) {
    return requiredRoles.includes(user.rol);
  }

  return user.rol === requiredRoles;
};

/**
 * Verificar si un usuario puede acceder a datos de otro usuario
 * @param {Object} currentUser - Usuario actual
 * @param {number} targetUserId - ID del usuario objetivo
 * @returns {boolean} True si puede acceder
 */
const canAccessUserData = (currentUser, targetUserId) => {
  // Admin puede acceder a todo
  if (currentUser.rol === "administrador") {
    return true;
  }

  // Usuario puede acceder a sus propios datos
  if (currentUser.id === targetUserId) {
    return true;
  }

  return false;
};

// ==========================================
// CONFIGURACIÓN DE RESPUESTAS
// ==========================================

/**
 * Configurar headers de seguridad para respuestas de auth
 * @param {Object} res - Objeto response de Express
 */
const setSecurityHeaders = (res) => {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "X-XSS-Protection": "1; mode=block",
  });
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Funciones JWT
  generateToken,
  verifyToken,
  extractToken,

  // Funciones de password
  hashPassword,
  verifyPassword,

  // Funciones de utilidad
  decodeTokenWithoutVerification,
  isTokenNearExpiry,
  createLoginResponse,

  // Funciones de permisos
  hasPermission,
  canAccessUserData,

  // Configuración
  setSecurityHeaders,

  // Constantes
  JWT_EXPIRE,
};
