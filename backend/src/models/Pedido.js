// src/models/Pedido.js - Model de Pedido COMPLETO CORREGIDO
// Sistema de Tracking Vehicular - Agregados Zambrana

const { query } = require("../config/database");
const { PEDIDOS, STOCK, MATERIALES } = require("../config/queries");
const {
  validateOrderData,
  validateId,
  validateQuantity,
} = require("../utils/validation");
const { generateUniqueTrackingCode } = require("../utils/codigoSeguimiento");
const {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// CLASE MODEL PEDIDO
// ==========================================

class Pedido {
  // Estados válidos de pedidos (debe coincidir con ENUM de BD)
  static ESTADOS = {
    PENDIENTE: "pendiente",
    CONFIRMADO: "confirmado",
    ASIGNADO: "asignado",
    EN_TRANSITO: "en_transito",
    ENTREGADO: "entregado",
    CANCELADO: "cancelado",
  };

  // Flujo de estados válido
  static FLUJO_ESTADOS = {
    [Pedido.ESTADOS.PENDIENTE]: [
      Pedido.ESTADOS.CONFIRMADO,
      Pedido.ESTADOS.CANCELADO,
    ],
    [Pedido.ESTADOS.CONFIRMADO]: [
      Pedido.ESTADOS.ASIGNADO,
      Pedido.ESTADOS.CANCELADO,
    ],
    [Pedido.ESTADOS.ASIGNADO]: [
      Pedido.ESTADOS.EN_TRANSITO,
      Pedido.ESTADOS.CANCELADO,
    ],
    [Pedido.ESTADOS.EN_TRANSITO]: [Pedido.ESTADOS.ENTREGADO],
    [Pedido.ESTADOS.ENTREGADO]: [], // Estado final
    [Pedido.ESTADOS.CANCELADO]: [], // Estado final
  };

  // ==========================================
  // MÉTODOS DE CREACIÓN
  // ==========================================

  /**
   * Crear nuevo pedido con validaciones de stock
   * @param {Object} orderData - Datos del pedido
   * @param {number} clienteId - ID del cliente
   * @returns {Object} Pedido creado
   */
  static async create(orderData, clienteId) {
    logger.info("Creando nuevo pedido:", {
      clienteId,
      material_id: orderData.material_id,
    });

    try {
      // Validar datos del pedido - USA FUNCIÓN CENTRALIZADA
      const validation = validateOrderData(orderData);
      if (!validation.isValid) {
        throw new ValidationError(
          "Datos de pedido inválidos",
          validation.errors
        );
      }

      const validData = validation.validData;

      // Validar que el cliente existe - USA FUNCIÓN CENTRALIZADA
      const clienteValidation = validateId(clienteId, "ID de cliente");
      if (!clienteValidation.isValid) {
        throw new ValidationError("ID de cliente inválido");
      }

      // Verificar que el material existe y obtener precio
      const materialResult = await query(MATERIALES.FIND_BY_ID, [
        validData.material_id,
      ]);
      if (!materialResult.rows.length || !materialResult.rows[0].activo) {
        throw new NotFoundError("Material no encontrado o no disponible");
      }

      const material = materialResult.rows[0];

      // Verificar stock disponible usando función PostgreSQL optimizada
      const stockCheck = await query(STOCK.CHECK_AVAILABILITY, [
        validData.material_id,
        validData.cantidad,
      ]);
      if (!stockCheck.rows[0].disponible) {
        throw new BusinessLogicError(
          `Stock insuficiente. Se requieren ${validData.cantidad} ${material.unidad_medida}, verifique disponibilidad`
        );
      }

      // GENERAR CÓDIGO SIMPLIFICADO
      const codigoSeguimiento = await generateUniqueTrackingCode();

      // Calcular precio total
      const precioTotal = validData.cantidad * material.precio_por_unidad;

      // Crear el pedido - INSERTAR CÓDIGO MANUALMENTE
      const result = await query(PEDIDOS.CREATE, [
        codigoSeguimiento, // $1 - código generado
        clienteValidation.value, // $2 - cliente_id
        validData.material_id, // $3
        validData.cantidad, // $4
        precioTotal, // $5
        validData.direccion_entrega, // $6
        validData.direccion_lat, // $7
        validData.direccion_lng, // $8
        validData.telefono_contacto, // $9
        validData.fecha_entrega_solicitada, // $10
        orderData.observaciones || null, // $11
      ]);

      const newPedido = result.rows[0];

      logger.info("Pedido creado exitosamente:", {
        id: newPedido.id,
        codigo: newPedido.codigo_seguimiento,
        valor: precioTotal,
      });

      return newPedido;
    } catch (error) {
      logger.error("Error creando pedido:", error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE BÚSQUEDA - SOLUCIÓN DEFINITIVA SIN NULL
  // ==========================================

  /**
   * Obtener pedidos con información completa - CORREGIDO SIN PARÁMETROS NULL
   * @param {Object} filters - Filtros de búsqueda
   * @param {number} limit - Límite de resultados
   * @param {number} offset - Offset para paginación
   * @returns {Array} Lista de pedidos
   */
  static async findWithDetails(filters = {}, limit = 50, offset = 0) {
    try {
      // SOLUCIÓN: Usar queries diferentes según si hay filtro o no
      const estado =
        filters.estado &&
        filters.estado !== "undefined" &&
        filters.estado !== ""
          ? filters.estado.trim()
          : null;

      logger.debug("Ejecutando findWithDetails con parámetros", {
        estado,
        limit,
        offset,
        filters,
      });

      let result;

      if (estado) {
        // Si hay estado, usar query con filtro específico
        logger.debug("Usando query con filtro de estado");
        result = await query(PEDIDOS.LIST_BY_ESTADO, [
          estado, // $1 - estado específico (nunca null)
          limit, // $2
          offset, // $3
        ]);
      } else {
        // Si no hay estado, usar query sin filtro
        logger.debug("Usando query sin filtro de estado");
        result = await query(PEDIDOS.LIST_ALL, [
          limit, // $1
          offset, // $2
        ]);
      }

      logger.debug("Query ejecutada exitosamente", {
        rowCount: result.rows.length,
        estado,
        usedFilter: !!estado,
      });

      return result.rows;
    } catch (error) {
      logger.error("Error obteniendo pedidos con detalles:", error.message);
      logger.error("Parámetros que causaron error:", {
        estado: filters.estado,
        limit,
        offset,
      });
      throw error;
    }
  }

  /**
   * Obtener pedidos de un cliente específico
   * @param {number} clienteId - ID del cliente
   * @returns {Array} Pedidos del cliente
   */
  static async findByClient(clienteId) {
    try {
      const idValidation = validateId(clienteId, "ID de cliente");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de cliente inválido");
      }

      const result = await query(PEDIDOS.LIST_BY_CLIENT, [idValidation.value]);

      return result.rows;
    } catch (error) {
      logger.error("Error obteniendo pedidos del cliente:", error.message);
      throw error;
    }
  }

  /**
   * Obtener pedido por código de seguimiento
   * @param {string} codigoSeguimiento - Código de seguimiento
   * @returns {Object|null} Pedido encontrado o null
   */
  static async findByTrackingCode(codigoSeguimiento) {
    try {
      if (!codigoSeguimiento || typeof codigoSeguimiento !== "string") {
        throw new ValidationError("Código de seguimiento inválido");
      }

      const cleanCode = codigoSeguimiento.toUpperCase().trim();

      const result = await query(PEDIDOS.FIND_BY_TRACKING_CODE, [cleanCode]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando por código de seguimiento:", error.message);
      throw error;
    }
  }

  /**
   * Obtener pedido por ID con información completa
   * @param {number} id - ID del pedido
   * @returns {Object|null} Pedido encontrado o null
   */
  static async findById(id) {
    try {
      const idValidation = validateId(id, "ID de pedido");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de pedido inválido");
      }

      const result = await query(PEDIDOS.FIND_BY_ID, [idValidation.value]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando pedido por ID:", error.message);
      throw error;
    }
  }

  /**
   * Obtener pedidos pendientes de asignación
   * @returns {Array} Pedidos pendientes
   */
  static async findPendingAssignment() {
    try {
      const result = await query(PEDIDOS.GET_PENDING_ASSIGNMENT);

      return result.rows;
    } catch (error) {
      logger.error("Error obteniendo pedidos pendientes:", error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE ACTUALIZACIÓN
  // ==========================================

  /**
   * Actualizar estado del pedido con validaciones
   * @param {number} id - ID del pedido
   * @param {string} nuevoEstado - Nuevo estado
   * @param {number} userId - ID del usuario que hace el cambio
   * @returns {Object} Pedido actualizado
   */
  static async updateStatus(id, nuevoEstado, userId) {
    logger.info("Actualizando estado de pedido:", { id, nuevoEstado, userId });

    try {
      // Validar ID
      const idValidation = validateId(id, "ID de pedido");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de pedido inválido");
      }

      // Validar nuevo estado
      if (!Object.values(this.ESTADOS).includes(nuevoEstado)) {
        throw new ValidationError(
          `Estado inválido. Debe ser uno de: ${Object.values(this.ESTADOS).join(
            ", "
          )}`
        );
      }

      // Obtener pedido actual
      const pedidoActual = await this.findById(idValidation.value);
      if (!pedidoActual) {
        throw new NotFoundError("Pedido no encontrado");
      }

      // Verificar transición de estado válida
      const transicionesPermitidas =
        this.FLUJO_ESTADOS[pedidoActual.estado] || [];
      if (!transicionesPermitidas.includes(nuevoEstado)) {
        throw new BusinessLogicError(
          `Transición de estado inválida: ${pedidoActual.estado} → ${nuevoEstado}. ` +
            `Transiciones permitidas: ${transicionesPermitidas.join(", ")}`
        );
      }

      // Actualizar estado
      const result = await query(PEDIDOS.UPDATE_STATUS, [
        idValidation.value,
        nuevoEstado,
      ]);

      const updatedPedido = result.rows[0];

      logger.info("Estado actualizado exitosamente:", {
        id: updatedPedido.id,
        estadoAnterior: pedidoActual.estado,
        estadoNuevo: updatedPedido.estado,
      });

      return updatedPedido;
    } catch (error) {
      logger.error("Error actualizando estado:", error.message);
      throw error;
    }
  }

  /**
   * Confirmar pedido y reducir stock
   * @param {number} id - ID del pedido
   * @param {number} userId - ID del usuario que confirma
   * @returns {Object} Resultado de la confirmación
   */
  static async confirm(id, userId) {
    logger.info("Confirmando pedido:", { id, userId });

    try {
      // Obtener pedido
      const pedido = await this.findById(id);
      if (!pedido) {
        throw new NotFoundError("Pedido no encontrado");
      }

      // Verificar que esté en estado pendiente
      if (pedido.estado !== this.ESTADOS.PENDIENTE) {
        throw new BusinessLogicError(
          `No se puede confirmar pedido en estado: ${pedido.estado}`
        );
      }

      // Verificar stock nuevamente antes de confirmar
      const stockCheck = await query(STOCK.CHECK_AVAILABILITY, [
        pedido.material_id,
        pedido.cantidad,
      ]);
      if (!stockCheck.rows[0].disponible) {
        throw new BusinessLogicError(
          "Stock insuficiente para confirmar el pedido"
        );
      }

      // Reducir stock
      const stockReduction = await query(STOCK.REDUCE_STOCK, [
        pedido.material_id,
        pedido.cantidad,
        userId,
      ]);

      if (!stockReduction.rows.length) {
        throw new BusinessLogicError(
          "No se pudo reducir el stock (posible condición de carrera)"
        );
      }

      // Actualizar estado a confirmado
      const updatedPedido = await this.updateStatus(
        id,
        this.ESTADOS.CONFIRMADO,
        userId
      );

      logger.info("Pedido confirmado exitosamente:", {
        id,
        stockRestante: stockReduction.rows[0].cantidad_disponible,
      });

      return {
        pedido: updatedPedido,
        stockActualizado: stockReduction.rows[0],
      };
    } catch (error) {
      logger.error("Error confirmando pedido:", error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE ESTADÍSTICAS
  // ==========================================

  /**
   * Obtener estadísticas de pedidos por período
   * @param {Date} fechaInicio - Fecha de inicio
   * @param {Date} fechaFin - Fecha de fin
   * @returns {Object} Estadísticas
   */
  static async getStatsByPeriod(fechaInicio, fechaFin) {
    try {
      const result = await query(PEDIDOS.GET_STATS_BY_PERIOD, [
        fechaInicio,
        fechaFin,
      ]);

      const stats = result.rows[0];

      return {
        total_pedidos: parseInt(stats.total_pedidos),
        pedidos_entregados: parseInt(stats.entregados),
        pedidos_pendientes: parseInt(stats.pendientes),
        valor_total: parseFloat(stats.valor_total) || 0,
        valor_entregado: parseFloat(stats.valor_entregado) || 0,
        tasa_entrega:
          stats.total_pedidos > 0
            ? ((stats.entregados / stats.total_pedidos) * 100).toFixed(2)
            : 0,
        periodo: {
          inicio: fechaInicio,
          fin: fechaFin,
        },
      };
    } catch (error) {
      logger.error("Error obteniendo estadísticas:", error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE UTILIDAD
  // ==========================================

  /**
   * Validar transición de estado
   * @param {string} estadoActual - Estado actual
   * @param {string} estadoNuevo - Estado nuevo
   * @returns {boolean} True si la transición es válida
   */
  static isValidTransition(estadoActual, estadoNuevo) {
    const transicionesPermitidas = this.FLUJO_ESTADOS[estadoActual] || [];
    return transicionesPermitidas.includes(estadoNuevo);
  }

  /**
   * Obtener próximos estados válidos
   * @param {string} estadoActual - Estado actual
   * @returns {Array} Lista de estados válidos
   */
  static getNextValidStates(estadoActual) {
    return this.FLUJO_ESTADOS[estadoActual] || [];
  }

  /**
   * Verificar si un pedido puede ser cancelado
   * @param {string} estado - Estado del pedido
   * @returns {boolean} True si puede ser cancelado
   */
  static canBeCanceled(estado) {
    return [
      this.ESTADOS.PENDIENTE,
      this.ESTADOS.CONFIRMADO,
      this.ESTADOS.ASIGNADO,
    ].includes(estado);
  }

  /**
   * Verificar si un pedido está en estado final
   * @param {string} estado - Estado del pedido
   * @returns {boolean} True si está en estado final
   */
  static isFinalState(estado) {
    return [this.ESTADOS.ENTREGADO, this.ESTADOS.CANCELADO].includes(estado);
  }

  /**
   * Formatear pedido para respuesta a cliente
   * @param {Object} pedido - Objeto pedido
   * @returns {Object} Pedido formateado
   */
  static formatForClient(pedido) {
    if (!pedido) return null;

    return {
      codigo_seguimiento: pedido.codigo_seguimiento,
      estado: pedido.estado,
      material: pedido.material_nombre,
      cantidad: `${pedido.cantidad} ${pedido.unidad_medida}`,
      precio_total: pedido.precio_total,
      direccion_entrega: pedido.direccion_entrega,
      fecha_pedido: pedido.fecha_pedido,
      fecha_entrega_solicitada: pedido.fecha_entrega_solicitada,
      puede_cancelar: this.canBeCanceled(pedido.estado),
      estado_final: this.isFinalState(pedido.estado),
    };
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = Pedido;
