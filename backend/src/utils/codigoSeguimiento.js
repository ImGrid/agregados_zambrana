// src/utils/codigoSeguimiento.js - Generación SIMPLIFICADA de Códigos de Seguimiento
// Sistema de Tracking Vehicular - Agregados Zambrana
// FILOSOFÍA: Simple y directo - ZAM000001, ZAM000002...

const { query } = require("../config/database");
const logger = require("./logger");

// ==========================================
// GENERACIÓN SIMPLE DE CÓDIGOS
// ==========================================

/**
 * Generar código de seguimiento secuencial simple
 * Formato: ZAM + 6 dígitos (ZAM000001, ZAM000002...)
 * @returns {Promise<string>} Código único
 */
const generateUniqueTrackingCode = async () => {
  try {
    // Obtener el siguiente número de secuencia
    const result = await query(`
      SELECT COALESCE(MAX(
        CASE 
          WHEN codigo_seguimiento ~ '^ZAM[0-9]{6}$' 
          THEN CAST(SUBSTRING(codigo_seguimiento, 4) AS INTEGER) 
          ELSE 0 
        END
      ), 0) + 1 as next_number
      FROM pedidos
      WHERE codigo_seguimiento LIKE 'ZAM%'
    `);

    const nextNumber = result.rows[0].next_number;
    const codigo = `ZAM${String(nextNumber).padStart(6, "0")}`;

    logger.debug("Código de seguimiento generado", {
      codigo,
      numero: nextNumber,
    });
    return codigo;
  } catch (error) {
    logger.error("Error generando código de seguimiento:", error.message);
    throw new Error("Error generando código de seguimiento");
  }
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

  // Formato simple: ZAM + 6 dígitos (ZAM000001)
  if (!/^ZAM\d{6}$/.test(cleanCode)) {
    return {
      isValid: false,
      message: "Formato de código inválido (debe ser ZAM000001)",
    };
  }

  return {
    isValid: true,
    value: cleanCode,
  };
};

/**
 * Normalizar código para búsqueda (remover espacios, convertir mayúsculas)
 * @param {string} codigo - Código ingresado por el usuario
 * @returns {string} Código normalizado
 */
const normalizeTrackingCodeForSearch = (codigo) => {
  if (!codigo) return "";

  return codigo
    .toString()
    .replace(/[\s\-]/g, "")
    .toUpperCase()
    .trim();
};

/**
 * Verificar si un código de seguimiento existe (helper para testing)
 * @param {string} codigo - Código de seguimiento
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
    logger.error("Error verificando código existente:", error.message);
    throw error;
  }
};

/**
 * Formatear código para mostrar al usuario (ya está en formato simple)
 * @param {string} codigo - Código completo
 * @returns {string} Código formateado (igual al original)
 */
const formatTrackingCodeForDisplay = (codigo) => {
  const validation = validateTrackingCode(codigo);
  return validation.isValid ? validation.value : codigo || "";
};

/**
 * Generar código corto para notificaciones (últimos 4 dígitos)
 * @param {string} codigoCompleto - Código completo ZAM000001
 * @returns {string} Código corto (0001)
 */
const generateShortCode = (codigoCompleto) => {
  const validation = validateTrackingCode(codigoCompleto);
  if (!validation.isValid) return codigoCompleto;

  // Últimos 4 dígitos: ZAM000001 -> 0001
  return validation.value.slice(-4);
};

// ==========================================
// EXPORTS SIMPLIFICADOS
// ==========================================

module.exports = {
  // Función principal
  generateUniqueTrackingCode,

  // Validación y normalización
  validateTrackingCode,
  normalizeTrackingCodeForSearch,

  // Utilidades de formato
  formatTrackingCodeForDisplay,
  generateShortCode,

  // Helper para testing
  trackingCodeExists,
};
