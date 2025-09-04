// src/utils/codigoSeguimiento.js - Generación de Códigos de Seguimiento
// Sistema de Tracking Vehicular - Agregados Zambrana

const { query } = require("../config/database");
const logger = require("./logger");

// ==========================================
// GENERACIÓN DE CÓDIGOS DE SEGUIMIENTO
// ==========================================

/**
 * Generar código de seguimiento único
 * Formato: ZAM + YYYYMMDD + HHMMSS + RR (random)
 * Ejemplo: ZAM20250115103045AB
 */
const generateTrackingCode = () => {
  const now = new Date();

  // Fecha y hora en formato compacto
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");

  // Sufijo aleatorio de 2 caracteres
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  const randomSuffix = Array.from({ length: 2 }, () =>
    chars.charAt(Math.floor(Math.random() * chars.length))
  ).join("");

  const codigo = `ZAM${year}${month}${day}${hours}${minutes}${seconds}${randomSuffix}`;

  return codigo;
};

/**
 * Verificar si un código de seguimiento ya existe
 * @param {string} codigo - Código de seguimiento a verificar
 * @returns {Promise<boolean>} True si existe
 */
const trackingCodeExists = async (codigo) => {
  try {
    const result = await query(
      "SELECT COUNT(*) as count FROM pedidos WHERE codigo_seguimiento = $1",
      [codigo]
    );

    return parseInt(result.rows[0].count) > 0;
  } catch (error) {
    logger.error("Error verificando código de seguimiento:", error.message);
    throw error;
  }
};

/**
 * Generar código de seguimiento único garantizado
 * @param {number} maxRetries - Máximo número de reintentos
 * @returns {Promise<string>} Código único
 */
const generateUniqueTrackingCode = async (maxRetries = 5) => {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const codigo = generateTrackingCode();

    const exists = await trackingCodeExists(codigo);

    if (!exists) {
      logger.debug("Código de seguimiento generado", {
        codigo,
        intento: attempt,
      });
      return codigo;
    }

    logger.warn("Código duplicado encontrado, reintentando", {
      codigo,
      intento: attempt,
    });

    // Esperar un poco antes del siguiente intento
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  // Si llegamos aquí, no pudimos generar un código único
  const fallbackCode = generateTrackingCode() + Date.now().toString().slice(-3);

  logger.error("No se pudo generar código único, usando fallback", {
    fallbackCode,
    intentos: maxRetries,
  });

  return fallbackCode;
};

/**
 * Validar formato de código de seguimiento
 * @param {string} codigo - Código a validar
 * @returns {Object} Resultado de validación
 */
const validateTrackingCode = (codigo) => {
  if (!codigo || typeof codigo !== "string") {
    return {
      isValid: false,
      message: "Código de seguimiento requerido",
    };
  }

  const cleanCode = codigo.trim().toUpperCase();

  // Formato: ZAM + 14 dígitos/letras + 2 letras/números
  // Ejemplo: ZAM20250115103045AB (19 caracteres total)
  if (!/^ZAM\d{14}[A-Z0-9]{2}$/.test(cleanCode)) {
    return {
      isValid: false,
      message: "Formato de código inválido",
    };
  }

  return {
    isValid: true,
    value: cleanCode,
  };
};

/**
 * Extraer información del código de seguimiento
 * @param {string} codigo - Código de seguimiento
 * @returns {Object} Información extraída
 */
const parseTrackingCode = (codigo) => {
  const validation = validateTrackingCode(codigo);

  if (!validation.isValid) {
    return { error: validation.message };
  }

  const cleanCode = validation.value;

  try {
    // Extraer componentes: ZAM + YYYYMMDD + HHMMSS + RR
    const prefix = cleanCode.substring(0, 3); // ZAM
    const year = cleanCode.substring(3, 7);
    const month = cleanCode.substring(7, 9);
    const day = cleanCode.substring(9, 11);
    const hour = cleanCode.substring(11, 13);
    const minute = cleanCode.substring(13, 15);
    const second = cleanCode.substring(15, 17);
    const suffix = cleanCode.substring(17, 19);

    const fechaGeneracion = new Date(
      parseInt(year),
      parseInt(month) - 1, // Los meses en JS son 0-indexados
      parseInt(day),
      parseInt(hour),
      parseInt(minute),
      parseInt(second)
    );

    return {
      codigo_completo: cleanCode,
      prefijo: prefix,
      fecha_generacion: fechaGeneracion,
      sufijo_aleatorio: suffix,
      valido: true,
    };
  } catch (error) {
    logger.debug("Error parseando código de seguimiento:", error.message);
    return { error: "Error parseando código" };
  }
};

/**
 * Generar código corto para visualización (opcional)
 * @param {string} codigoCompleto - Código completo
 * @returns {string} Código corto para mostrar al usuario
 */
const generateShortCode = (codigoCompleto) => {
  if (!codigoCompleto || codigoCompleto.length < 10) {
    return codigoCompleto;
  }

  // Mostrar solo los últimos 8 caracteres para el usuario
  // Ejemplo: ZAM20250115103045AB -> 103045AB
  return codigoCompleto.slice(-8);
};

/**
 * Formatear código para mostrar al usuario
 * @param {string} codigo - Código completo
 * @returns {string} Código formateado
 */
const formatTrackingCodeForDisplay = (codigo) => {
  if (!codigo) return "";

  const validation = validateTrackingCode(codigo);
  if (!validation.isValid) return codigo;

  const cleanCode = validation.value;

  // Formato: ZAM-YYYYMMDD-HHMMSS-RR
  // Ejemplo: ZAM-20250115-103045-AB
  return `${cleanCode.substring(0, 3)}-${cleanCode.substring(
    3,
    11
  )}-${cleanCode.substring(11, 17)}-${cleanCode.substring(17, 19)}`;
};

// ==========================================
// UTILIDADES PARA BÚSQUEDA
// ==========================================

/**
 * Normalizar código de seguimiento para búsqueda
 * Permite buscar con o sin guiones, mayúsculas/minúsculas
 * @param {string} codigo - Código ingresado por el usuario
 * @returns {string} Código normalizado
 */
const normalizeTrackingCodeForSearch = (codigo) => {
  if (!codigo) return "";

  // Remover espacios, guiones, convertir a mayúsculas
  return codigo
    .toString()
    .replace(/[\s\-]/g, "")
    .toUpperCase()
    .trim();
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Funciones principales
  generateUniqueTrackingCode,
  validateTrackingCode,
  trackingCodeExists,

  // Funciones de utilidad
  parseTrackingCode,
  generateShortCode,
  formatTrackingCodeForDisplay,
  normalizeTrackingCodeForSearch,

  // Función interna (para testing)
  generateTrackingCode,
};
