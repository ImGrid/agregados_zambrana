const { query } = require("../config/database");
const { STOCK, MATERIALES } = require("../config/queries");
const { validateId, validateQuantity } = require("../utils/validation");
const {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

class Stock {
  // Niveles de alerta
  static NIVELES_STOCK = {
    CRITICO: "CRÍTICO",
    BAJO: "BAJO",
    NORMAL: "NORMAL",
  };

  /**
   * Obtener inventario completo con alertas (usa vista optimizada)
   */
  static async getInventoryWithAlerts() {
    try {
      const result = await query(STOCK.LIST_WITH_ALERTS);

      return result.rows.map((item) => ({
        ...item,
        alerta_activa: item.nivel_stock !== this.NIVELES_STOCK.NORMAL,
        accion_recomendada: this.getRecommendedAction(item),
      }));
    } catch (error) {
      logger.error("Error obteniendo inventario con alertas:", error.message);
      throw error;
    }
  }

  /**
   * Obtener stock de un material específico
   */
  static async findByMaterial(materialId) {
    try {
      const idValidation = validateId(materialId, "ID de material");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de material inválido");
      }

      const result = await query(STOCK.FIND_BY_MATERIAL, [idValidation.value]);

      if (!result.rows.length) {
        return null;
      }

      const stockData = result.rows[0];

      return {
        ...stockData,
        nivel_stock: this.calculateStockLevel(
          stockData.cantidad_disponible,
          stockData.cantidad_minima
        ),
        porcentaje_stock: this.calculateStockPercentage(
          stockData.cantidad_disponible,
          stockData.cantidad_minima
        ),
      };
    } catch (error) {
      logger.error("Error obteniendo stock por material:", error.message);
      throw error;
    }
  }

  /**
   * Obtener materiales con stock crítico
   */
  static async getCriticalStock() {
    try {
      const result = await query(STOCK.CRITICAL_STOCK);

      return result.rows.map((item) => ({
        ...item,
        dias_estimados: this.estimateDaysRemaining(item),
        accion_urgente: true,
      }));
    } catch (error) {
      logger.error("Error obteniendo stock crítico:", error.message);
      throw error;
    }
  }

  /**
   * Verificar disponibilidad de stock (usa función PostgreSQL)
   */
  static async checkAvailability(materialId, cantidadRequerida) {
    try {
      const materialValidation = validateId(materialId, "ID de material");
      const quantityValidation = validateQuantity(cantidadRequerida);

      if (!materialValidation.isValid) {
        throw new ValidationError("ID de material inválido");
      }

      if (!quantityValidation.isValid) {
        throw new ValidationError("Cantidad inválida", [
          { field: "cantidad", message: quantityValidation.message },
        ]);
      }

      // Usar función PostgreSQL optimizada
      const result = await query(STOCK.CHECK_AVAILABILITY, [
        materialValidation.value,
        quantityValidation.value,
      ]);

      const disponible = result.rows[0].disponible;

      // Obtener información adicional del stock
      const stockInfo = await this.findByMaterial(materialValidation.value);

      return {
        material_id: materialValidation.value,
        cantidad_requerida: quantityValidation.value,
        disponible,
        cantidad_actual: stockInfo?.cantidad_disponible || 0,
        cantidad_restante: disponible
          ? stockInfo.cantidad_disponible - quantityValidation.value
          : null,
        recomendacion: disponible
          ? "Stock suficiente"
          : `Stock insuficiente. Disponible: ${
              stockInfo?.cantidad_disponible || 0
            } ${stockInfo?.unidad_medida || "m³"}`,
      };
    } catch (error) {
      logger.error("Error verificando disponibilidad:", error.message);
      throw error;
    }
  }

  /**
   * Actualizar cantidad de stock
   */
  static async updateQuantity(materialId, nuevaCantidad, userId) {
    logger.info("Actualizando stock:", { materialId, nuevaCantidad, userId });

    try {
      const materialValidation = validateId(materialId, "ID de material");
      const quantityValidation = validateQuantity(nuevaCantidad);
      const userValidation = validateId(userId, "ID de usuario");

      if (!materialValidation.isValid) {
        throw new ValidationError("ID de material inválido");
      }

      if (!quantityValidation.isValid) {
        throw new ValidationError("Cantidad inválida", [
          { field: "cantidad", message: quantityValidation.message },
        ]);
      }

      if (!userValidation.isValid) {
        throw new ValidationError("ID de usuario inválido");
      }

      // Verificar que el material existe
      const materialExists = await query(MATERIALES.FIND_BY_ID, [
        materialValidation.value,
      ]);
      if (!materialExists.rows.length) {
        throw new NotFoundError("Material no encontrado");
      }

      // Obtener stock actual
      const stockActual = await this.findByMaterial(materialValidation.value);
      if (!stockActual) {
        throw new NotFoundError("Registro de stock no encontrado");
      }

      // Actualizar stock
      const result = await query(STOCK.UPDATE_QUANTITY, [
        materialValidation.value,
        quantityValidation.value,
        userValidation.value,
      ]);

      const updatedStock = result.rows[0];

      // Calcular nivel de stock y generar alertas
      const nivelStock = this.calculateStockLevel(
        updatedStock.cantidad_disponible,
        updatedStock.cantidad_minima
      );
      const alertas = this.generateAlerts(
        updatedStock,
        stockActual.cantidad_disponible
      );

      logger.info("Stock actualizado exitosamente:", {
        materialId,
        cantidadAnterior: stockActual.cantidad_disponible,
        cantidadNueva: updatedStock.cantidad_disponible,
        nivelStock,
      });

      return {
        ...updatedStock,
        material_nombre: materialExists.rows[0].nombre,
        unidad_medida: materialExists.rows[0].unidad_medida,
        nivel_stock: nivelStock,
        cambio_cantidad:
          updatedStock.cantidad_disponible - stockActual.cantidad_disponible,
        alertas,
      };
    } catch (error) {
      logger.error("Error actualizando stock:", error.message);
      throw error;
    }
  }

  /**
   * Reducir stock por consumo (pedidos, etc.)
   */
  static async reduceStock(materialId, cantidadAReducir, userId) {
    logger.info("Reduciendo stock:", { materialId, cantidadAReducir, userId });

    try {
      const materialValidation = validateId(materialId, "ID de material");
      const quantityValidation = validateQuantity(cantidadAReducir);
      const userValidation = validateId(userId, "ID de usuario");

      if (
        !materialValidation.isValid ||
        !quantityValidation.isValid ||
        !userValidation.isValid
      ) {
        throw new ValidationError("Parámetros inválidos");
      }

      // Verificar disponibilidad antes de reducir
      const availability = await this.checkAvailability(
        materialValidation.value,
        quantityValidation.value
      );
      if (!availability.disponible) {
        throw new BusinessLogicError(availability.recomendacion);
      }

      // Reducir stock usando query optimizada
      const result = await query(STOCK.REDUCE_STOCK, [
        materialValidation.value,
        quantityValidation.value,
        userValidation.value,
      ]);

      if (!result.rows.length) {
        throw new BusinessLogicError(
          "No se pudo reducir el stock (posible condición de carrera)"
        );
      }

      const updatedStock = result.rows[0];

      logger.info("Stock reducido exitosamente:", {
        materialId,
        cantidadReducida: quantityValidation.value,
        stockRestante: updatedStock.cantidad_disponible,
      });

      return updatedStock;
    } catch (error) {
      logger.error("Error reduciendo stock:", error.message);
      throw error;
    }
  }

  /**
   * Incrementar stock por entrada/reposición
   */
  static async increaseStock(materialId, cantidadAIncrementar, userId) {
    logger.info("Incrementando stock:", {
      materialId,
      cantidadAIncrementar,
      userId,
    });

    try {
      // Obtener stock actual
      const stockActual = await this.findByMaterial(materialId);
      if (!stockActual) {
        throw new NotFoundError("Stock no encontrado");
      }

      // Calcular nueva cantidad
      const nuevaCantidad =
        stockActual.cantidad_disponible + cantidadAIncrementar;

      // Actualizar stock
      return await this.updateQuantity(materialId, nuevaCantidad, userId);
    } catch (error) {
      logger.error("Error incrementando stock:", error.message);
      throw error;
    }
  }

  /**
   * Calcular nivel de stock
   */
  static calculateStockLevel(cantidadActual, cantidadMinima) {
    if (cantidadActual <= cantidadMinima) {
      return this.NIVELES_STOCK.CRITICO;
    } else if (cantidadActual <= cantidadMinima * 1.5) {
      return this.NIVELES_STOCK.BAJO;
    } else {
      return this.NIVELES_STOCK.NORMAL;
    }
  }

  /**
   * Calcular porcentaje de stock
   */
  static calculateStockPercentage(cantidadActual, cantidadMinima) {
    if (cantidadMinima === 0) return 100;
    return Math.round((cantidadActual / cantidadMinima) * 100);
  }

  /**
   * Obtener acción recomendada basada en nivel de stock
   */
  static getRecommendedAction(stockItem) {
    switch (stockItem.nivel_stock) {
      case this.NIVELES_STOCK.CRITICO:
        return "URGENTE: Reabastecer inmediatamente";
      case this.NIVELES_STOCK.BAJO:
        return "ATENCIÓN: Programar reabastecimiento";
      case this.NIVELES_STOCK.NORMAL:
        return "Stock en nivel normal";
      default:
        return "Revisar stock";
    }
  }

  /**
   * Estimar días restantes de stock (basado en consumo promedio)
   */
  static estimateDaysRemaining(stockItem) {
    // Esta es una estimación básica
    // En un sistema real, se calcularía basado en histórico de consumo
    const consumoPromedioDiario = stockItem.cantidad_minima / 7; // Estimación simple

    if (consumoPromedioDiario === 0) return null;

    return Math.floor(stockItem.cantidad_disponible / consumoPromedioDiario);
  }

  /**
   * Generar alertas basadas en cambios de stock
   */
  static generateAlerts(stockNuevo, cantidadAnterior) {
    const alertas = [];

    const nivelAnterior = this.calculateStockLevel(
      cantidadAnterior,
      stockNuevo.cantidad_minima
    );
    const nivelActual = this.calculateStockLevel(
      stockNuevo.cantidad_disponible,
      stockNuevo.cantidad_minima
    );

    // Alerta por cambio de nivel
    if (nivelAnterior !== nivelActual) {
      alertas.push({
        tipo: "cambio_nivel",
        mensaje: `Stock cambió de nivel ${nivelAnterior} a ${nivelActual}`,
        prioridad:
          nivelActual === this.NIVELES_STOCK.CRITICO ? "alta" : "media",
      });
    }

    // Alerta por stock crítico
    if (nivelActual === this.NIVELES_STOCK.CRITICO) {
      alertas.push({
        tipo: "stock_critico",
        mensaje: "Stock en nivel crítico - requiere atención inmediata",
        prioridad: "alta",
      });
    }

    // Alerta por reducción significativa
    const porcentajeReduccion =
      cantidadAnterior > 0
        ? ((cantidadAnterior - stockNuevo.cantidad_disponible) /
            cantidadAnterior) *
          100
        : 0;

    if (porcentajeReduccion > 50) {
      alertas.push({
        tipo: "reduccion_significativa",
        mensaje: `Stock reducido en ${Math.round(porcentajeReduccion)}%`,
        prioridad: "media",
      });
    }

    return alertas;
  }

  /**
   * Obtener resumen de inventario
   */
  static async getInventorySummary() {
    try {
      const inventory = await this.getInventoryWithAlerts();

      const summary = {
        total_materiales: inventory.length,
        stock_critico: inventory.filter(
          (item) => item.nivel_stock === this.NIVELES_STOCK.CRITICO
        ).length,
        stock_bajo: inventory.filter(
          (item) => item.nivel_stock === this.NIVELES_STOCK.BAJO
        ).length,
        stock_normal: inventory.filter(
          (item) => item.nivel_stock === this.NIVELES_STOCK.NORMAL
        ).length,
        valor_total_inventario: inventory.reduce(
          (total, item) =>
            total + item.cantidad_disponible * item.precio_por_unidad,
          0
        ),
        materiales_criticos: inventory
          .filter((item) => item.nivel_stock === this.NIVELES_STOCK.CRITICO)
          .map((item) => item.material),
        ultima_actualizacion: new Date().toISOString(),
      };

      return summary;
    } catch (error) {
      logger.error("Error obteniendo resumen de inventario:", error.message);
      throw error;
    }
  }
}

module.exports = Stock;
