// src/models/Cliente.js - Model de Cliente
// Sistema de Tracking Vehicular - Agregados Zambrana

const { query } = require("../config/database");
const { CLIENTES } = require("../config/queries");
const { validateId, sanitizeText } = require("../utils/validation");
const {
  ValidationError,
  NotFoundError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// CLASE MODEL CLIENTE
// ==========================================

class Cliente {
  /**
   * Crear perfil de cliente
   * @param {Object} clienteData - Datos del cliente
   * @returns {Object} Cliente creado
   */
  static async create(clienteData) {
    logger.info("Creando perfil de cliente:", {
      usuario_id: clienteData.usuario_id,
    });

    try {
      const result = await query(CLIENTES.CREATE, [
        clienteData.usuario_id,
        sanitizeText(clienteData.empresa) || null,
        sanitizeText(clienteData.direccion) || null,
        clienteData.ciudad || "Cochabamba",
        clienteData.tipo_cliente || "particular",
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error("Error creando cliente:", error.message);
      throw error;
    }
  }

  /**
   * Buscar cliente por usuario ID
   * @param {number} userId - ID del usuario
   * @returns {Object|null} Cliente encontrado
   */
  static async findByUserId(userId) {
    try {
      const idValidation = validateId(userId, "ID de usuario");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de usuario inválido");
      }

      const result = await query(CLIENTES.FIND_BY_USER_ID, [
        idValidation.value,
      ]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando cliente por usuario:", error.message);
      throw error;
    }
  }

  /**
   * Buscar cliente por ID
   * @param {number} id - ID del cliente
   * @returns {Object|null} Cliente encontrado
   */
  static async findById(id) {
    try {
      const idValidation = validateId(id, "ID de cliente");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de cliente inválido");
      }

      const result = await query(CLIENTES.FIND_BY_ID, [idValidation.value]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando cliente por ID:", error.message);
      throw error;
    }
  }

  /**
   * Listar todos los clientes (para admin)
   * @returns {Array} Lista de clientes
   */
  static async findAll() {
    try {
      const result = await query(CLIENTES.LIST_ALL);

      return result.rows;
    } catch (error) {
      logger.error("Error listando clientes:", error.message);
      throw error;
    }
  }

  /**
   * Actualizar información del cliente
   * @param {number} id - ID del cliente
   * @param {Object} updateData - Datos a actualizar
   * @returns {Object} Cliente actualizado
   */
  static async update(id, updateData) {
    try {
      const result = await query(CLIENTES.UPDATE, [
        id,
        sanitizeText(updateData.empresa) || null,
        sanitizeText(updateData.direccion) || null,
        updateData.ciudad || "Cochabamba",
        updateData.tipo_cliente || "particular",
      ]);

      if (!result.rows.length) {
        throw new NotFoundError("Cliente no encontrado");
      }

      return result.rows[0];
    } catch (error) {
      logger.error("Error actualizando cliente:", error.message);
      throw error;
    }
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = Cliente;
