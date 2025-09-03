// src/models/Vehiculo.js - Model de Vehículo (Sistema Experto)
// Sistema de Tracking Vehicular - Agregados Zambrana

const { query } = require("../config/database");
const { VEHICULOS } = require("../config/queries");
const {
  validateId,
  validatePlate,
  validateVehicleCapacity,
  validateVehicleStatus,
  validateCoordinates,
} = require("../utils/validation");
const {
  ValidationError,
  NotFoundError,
  BusinessLogicError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

// ==========================================
// CLASE MODEL VEHICULO (CON SISTEMA EXPERTO)
// ==========================================

class Vehiculo {
  // Estados válidos de vehículos
  static ESTADOS = {
    DISPONIBLE: "disponible",
    EN_USO: "en_uso",
    MANTENIMIENTO: "mantenimiento",
    AVERIADO: "averiado",
  };

  // Reglas del sistema experto para asignación
  static REGLAS_ASIGNACION = {
    // Regla 1: Asignar vehículo con capacidad óptima (no demasiado grande ni pequeño)
    CAPACIDAD_OPTIMA: "capacidad_optima",
    // Regla 2: Preferir vehículos más cercanos geográficamente
    PROXIMIDAD_GEOGRAFICA: "proximidad_geografica",
    // Regla 3: Considerar estado del vehículo y disponibilidad
    DISPONIBILIDAD: "disponibilidad",
    // Regla 4: Balancear uso entre vehículos
    BALANCE_USO: "balance_uso",
  };

  // ==========================================
  // MÉTODOS DE CONSULTA
  // ==========================================

  /**
   * Obtener todos los vehículos con información de estado
   * @returns {Array} Lista de vehículos
   */
  static async findAll() {
    try {
      const result = await query(VEHICULOS.LIST_ALL);

      return result.rows.map((vehiculo) => ({
        ...vehiculo,
        ubicacion_disponible:
          vehiculo.ubicacion_actual_lat && vehiculo.ubicacion_actual_lng,
        tiempo_sin_actualizacion: vehiculo.ultima_ubicacion
          ? this.calculateTimeSinceLastUpdate(vehiculo.ultima_ubicacion)
          : null,
      }));
    } catch (error) {
      logger.error("Error obteniendo lista de vehículos:", error.message);
      throw error;
    }
  }

  /**
   * Obtener vehículo por ID
   * @param {number} id - ID del vehículo
   * @returns {Object|null} Vehículo encontrado
   */
  static async findById(id) {
    try {
      const idValidation = validateId(id, "ID de vehículo");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de vehículo inválido");
      }

      const result = await query(VEHICULOS.FIND_BY_ID, [idValidation.value]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando vehículo por ID:", error.message);
      throw error;
    }
  }

  /**
   * Obtener vehículos disponibles por capacidad (usa función PostgreSQL optimizada)
   * @param {number} capacidadMinima - Capacidad mínima requerida
   * @returns {Array} Lista de vehículos disponibles
   */
  static async findAvailableByCapacity(capacidadMinima = 0) {
    try {
      const capacityValidation = validateVehicleCapacity(capacidadMinima);
      if (!capacityValidation.isValid) {
        throw new ValidationError("Capacidad mínima inválida");
      }

      // Usar función PostgreSQL optimizada
      const result = await query(VEHICULOS.GET_AVAILABLE_BY_CAPACITY, [
        capacityValidation.value,
      ]);

      return result.rows;
    } catch (error) {
      logger.error("Error obteniendo vehículos disponibles:", error.message);
      throw error;
    }
  }

  /**
   * Obtener estadísticas de la flota
   * @returns {Object} Estadísticas de flota
   */
  static async getFleetStats() {
    try {
      const result = await query(VEHICULOS.GET_FLEET_STATS);

      const stats = result.rows[0];

      return {
        total_vehiculos: parseInt(stats.total_vehiculos),
        disponibles: parseInt(stats.disponibles),
        en_uso: parseInt(stats.en_uso),
        mantenimiento: parseInt(stats.mantenimiento),
        porcentaje_disponible:
          stats.total_vehiculos > 0
            ? Math.round((stats.disponibles / stats.total_vehiculos) * 100)
            : 0,
        capacidad_total: await this.getTotalFleetCapacity(),
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      logger.error("Error obteniendo estadísticas de flota:", error.message);
      throw error;
    }
  }

  // ==========================================
  // SISTEMA EXPERTO - ASIGNACIÓN AUTOMÁTICA
  // ==========================================

  /**
   * Sistema experto: Asignar vehículo óptimo para un pedido
   * @param {Object} pedidoData - Datos del pedido
   * @returns {Object} Resultado de asignación
   */
  static async asignarVehiculoAutomatico(pedidoData) {
    logger.info("Sistema experto: Asignando vehículo automático", {
      volumen: pedidoData.cantidad,
      destino: pedidoData.direccion_entrega,
    });

    try {
      // REGLA 1: Obtener vehículos con capacidad suficiente
      const vehiculosDisponibles = await this.findAvailableByCapacity(
        pedidoData.cantidad
      );

      if (vehiculosDisponibles.length === 0) {
        throw new BusinessLogicError(
          `No hay vehículos disponibles con capacidad suficiente (${pedidoData.cantidad} m³)`
        );
      }

      logger.info(
        `Encontrados ${vehiculosDisponibles.length} vehículos con capacidad suficiente`
      );

      // REGLA 2: Aplicar sistema experto de decisión
      const vehiculoSeleccionado = this.aplicarReglasSeleccion(
        vehiculosDisponibles,
        pedidoData
      );

      // REGLA 3: Calcular tiempo estimado con factores externos
      const tiempoEstimado = this.calcularTiempoEstimado(
        vehiculoSeleccionado,
        pedidoData
      );

      logger.info("Vehículo asignado por sistema experto:", {
        vehiculo_id: vehiculoSeleccionado.vehiculo_id,
        placa: vehiculoSeleccionado.placa,
        capacidad: vehiculoSeleccionado.capacidad,
        razon: vehiculoSeleccionado.razon_seleccion,
      });

      return {
        vehiculo_asignado: vehiculoSeleccionado,
        tiempo_estimado_minutos: tiempoEstimado,
        justificacion: vehiculoSeleccionado.razon_seleccion,
        reglas_aplicadas: vehiculoSeleccionado.reglas_aplicadas,
      };
    } catch (error) {
      logger.error("Error en asignación automática:", error.message);
      throw error;
    }
  }

  /**
   * Aplicar reglas de selección del sistema experto
   * @param {Array} vehiculosDisponibles - Lista de vehículos disponibles
   * @param {Object} pedidoData - Datos del pedido
   * @returns {Object} Vehículo seleccionado con justificación
   */
  static aplicarReglasSeleccion(vehiculosDisponibles, pedidoData) {
    let vehiculosEvaluados = vehiculosDisponibles.map((vehiculo) => ({
      ...vehiculo,
      puntuacion: 0,
      reglas_aplicadas: [],
      razon_seleccion: "",
    }));

    // REGLA 1: Capacidad óptima (no desperdiciar capacidad ni usar vehículo muy justo)
    vehiculosEvaluados = vehiculosEvaluados.map((vehiculo) => {
      const ratio_utilizacion = pedidoData.cantidad / vehiculo.capacidad;

      if (ratio_utilizacion >= 0.7 && ratio_utilizacion <= 0.95) {
        // Utilización óptima (70-95%)
        vehiculo.puntuacion += 10;
        vehiculo.reglas_aplicadas.push("Utilización óptima de capacidad");
      } else if (ratio_utilizacion >= 0.5) {
        // Utilización aceptable (50-70%)
        vehiculo.puntuacion += 7;
        vehiculo.reglas_aplicadas.push("Utilización aceptable de capacidad");
      } else if (ratio_utilizacion >= 0.3) {
        // Utilización baja pero funcional (30-50%)
        vehiculo.puntuacion += 4;
        vehiculo.reglas_aplicadas.push("Utilización baja de capacidad");
      } else {
        // Utilización muy baja (<30%)
        vehiculo.puntuacion += 1;
        vehiculo.reglas_aplicadas.push("Sobredimensionado para el pedido");
      }

      return vehiculo;
    });

    // REGLA 2: Preferir vehículos más pequeños cuando múltiples opciones
    const capacidadMinima = Math.min(
      ...vehiculosEvaluados.map((v) => v.capacidad)
    );
    vehiculosEvaluados = vehiculosEvaluados.map((vehiculo) => {
      if (vehiculo.capacidad === capacidadMinima) {
        vehiculo.puntuacion += 5;
        vehiculo.reglas_aplicadas.push(
          "Vehículo de menor capacidad disponible"
        );
      }
      return vehiculo;
    });

    // REGLA 3: Considerar proximidad geográfica (si hay coordenadas)
    if (pedidoData.direccion_lat && pedidoData.direccion_lng) {
      vehiculosEvaluados = vehiculosEvaluados.map((vehiculo) => {
        if (vehiculo.ubicacion_actual_lat && vehiculo.ubicacion_actual_lng) {
          const distancia = this.calculateDistance(
            vehiculo.ubicacion_actual_lat,
            vehiculo.ubicacion_actual_lng,
            pedidoData.direccion_lat,
            pedidoData.direccion_lng
          );

          if (distancia < 5) {
            // Menos de 5 km
            vehiculo.puntuacion += 8;
            vehiculo.reglas_aplicadas.push("Muy cerca del destino");
          } else if (distancia < 15) {
            // Menos de 15 km
            vehiculo.puntuacion += 5;
            vehiculo.reglas_aplicadas.push("Relativamente cerca del destino");
          } else {
            vehiculo.puntuacion += 2;
            vehiculo.reglas_aplicadas.push("Distancia considerable al destino");
          }
        }
        return vehiculo;
      });
    }

    // REGLA 4: Factor tiempo (preferir vehículos con ubicación actualizada recientemente)
    const ahora = new Date();
    vehiculosEvaluados = vehiculosEvaluados.map((vehiculo) => {
      if (vehiculo.ultima_ubicacion) {
        const minutosSinActualizar =
          (ahora - new Date(vehiculo.ultima_ubicacion)) / (1000 * 60);

        if (minutosSinActualizar < 30) {
          vehiculo.puntuacion += 3;
          vehiculo.reglas_aplicadas.push("Ubicación recientemente actualizada");
        } else if (minutosSinActualizar < 120) {
          vehiculo.puntuacion += 1;
          vehiculo.reglas_aplicadas.push(
            "Ubicación actualizada en las últimas 2 horas"
          );
        }
      }
      return vehiculo;
    });

    // Seleccionar vehículo con mayor puntuación
    vehiculosEvaluados.sort((a, b) => b.puntuacion - a.puntuacion);
    const vehiculoSeleccionado = vehiculosEvaluados[0];

    // Generar justificación
    vehiculoSeleccionado.razon_seleccion = this.generarJustificacion(
      vehiculoSeleccionado,
      pedidoData
    );

    return vehiculoSeleccionado;
  }

  /**
   * Calcular tiempo estimado considerando múltiples factores
   * @param {Object} vehiculo - Vehículo seleccionado
   * @param {Object} pedidoData - Datos del pedido
   * @returns {number} Tiempo estimado en minutos
   */
  static calcularTiempoEstimado(vehiculo, pedidoData) {
    // Tiempo base (esto vendría normalmente de Google Maps API)
    let tiempoBase = 45; // minutos base para entregas en Cochabamba

    // REGLA: Ajustar por zona geográfica
    if (pedidoData.direccion_entrega) {
      const direccion = pedidoData.direccion_entrega.toLowerCase();

      if (direccion.includes("sacaba") || direccion.includes("quillacollo")) {
        tiempoBase += 15; // Zonas periféricas
      } else if (
        direccion.includes("cercado") ||
        direccion.includes("centro")
      ) {
        tiempoBase += 5; // Centro de la ciudad
      }
    }

    // REGLA: Ajustar por hora del día
    const hora = new Date().getHours();
    if ((hora >= 7 && hora <= 9) || (hora >= 17 && hora <= 19)) {
      tiempoBase += 20; // Hora pico
    } else if (hora >= 12 && hora <= 14) {
      tiempoBase += 10; // Hora de almuerzo
    }

    // REGLA: Ajustar por capacidad del vehículo (vehículos más grandes son más lentos)
    if (vehiculo.capacidad > 20) {
      tiempoBase += 10; // Vehículos grandes
    } else if (vehiculo.capacidad < 10) {
      tiempoBase -= 5; // Vehículos pequeños y ágiles
    }

    // REGLA: Tiempo de carga proporcional a la cantidad
    const tiempoCarga = Math.ceil(pedidoData.cantidad / 5) * 2; // 2 min por cada 5 m³

    return tiempoBase + tiempoCarga;
  }

  // ==========================================
  // MÉTODOS DE ACTUALIZACIÓN
  // ==========================================

  /**
   * Actualizar estado del vehículo
   * @param {number} id - ID del vehículo
   * @param {string} nuevoEstado - Nuevo estado
   * @returns {Object} Vehículo actualizado
   */
  static async updateStatus(id, nuevoEstado) {
    logger.info("Actualizando estado de vehículo:", { id, nuevoEstado });

    try {
      const idValidation = validateId(id, "ID de vehículo");
      const statusValidation = validateVehicleStatus(nuevoEstado);

      if (!idValidation.isValid) {
        throw new ValidationError("ID de vehículo inválido");
      }

      if (!statusValidation.isValid) {
        throw new ValidationError("Estado inválido", [
          { field: "estado", message: statusValidation.message },
        ]);
      }

      // Verificar que el vehículo existe
      const vehiculo = await this.findById(idValidation.value);
      if (!vehiculo) {
        throw new NotFoundError("Vehículo no encontrado");
      }

      // Actualizar estado
      const result = await query(VEHICULOS.UPDATE_STATUS, [
        idValidation.value,
        statusValidation.value,
      ]);

      const updatedVehiculo = result.rows[0];

      logger.info("Estado de vehículo actualizado:", {
        id: updatedVehiculo.id,
        estadoAnterior: vehiculo.estado,
        estadoNuevo: updatedVehiculo.estado,
      });

      return updatedVehiculo;
    } catch (error) {
      logger.error("Error actualizando estado de vehículo:", error.message);
      throw error;
    }
  }

  /**
   * Actualizar ubicación GPS del vehículo
   * @param {number} id - ID del vehículo
   * @param {number} lat - Latitud
   * @param {number} lng - Longitud
   * @returns {Object} Vehículo con ubicación actualizada
   */
  static async updateLocation(id, lat, lng) {
    try {
      const idValidation = validateId(id, "ID de vehículo");
      const coordsValidation = validateCoordinates(lat, lng);

      if (!idValidation.isValid) {
        throw new ValidationError("ID de vehículo inválido");
      }

      if (!coordsValidation.isValid) {
        throw new ValidationError("Coordenadas inválidas", [
          { field: "coordenadas", message: coordsValidation.message },
        ]);
      }

      const result = await query(VEHICULOS.UPDATE_LOCATION, [
        idValidation.value,
        coordsValidation.value.lat,
        coordsValidation.value.lng,
      ]);

      const updatedVehiculo = result.rows[0];

      logger.debug("Ubicación de vehículo actualizada:", {
        id: updatedVehiculo.id,
        placa: updatedVehiculo.placa,
        lat: updatedVehiculo.ubicacion_actual_lat,
        lng: updatedVehiculo.ubicacion_actual_lng,
      });

      return updatedVehiculo;
    } catch (error) {
      logger.error("Error actualizando ubicación:", error.message);
      throw error;
    }
  }

  // ==========================================
  // MÉTODOS DE UTILIDAD
  // ==========================================

  /**
   * Calcular distancia entre dos puntos (Haversine)
   * @param {number} lat1 - Latitud punto 1
   * @param {number} lng1 - Longitud punto 1
   * @param {number} lat2 - Latitud punto 2
   * @param {number} lng2 - Longitud punto 2
   * @returns {number} Distancia en kilómetros
   */
  static calculateDistance(lat1, lng1, lat2, lng2) {
    const R = 6371; // Radio de la Tierra en km
    const dLat = ((lat2 - lat1) * Math.PI) / 180;
    const dLng = ((lng2 - lng1) * Math.PI) / 180;

    const a =
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos((lat1 * Math.PI) / 180) *
        Math.cos((lat2 * Math.PI) / 180) *
        Math.sin(dLng / 2) *
        Math.sin(dLng / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distancia en km
  }

  /**
   * Calcular tiempo desde última actualización
   * @param {Date} ultimaUbicacion - Timestamp de última ubicación
   * @returns {Object} Tiempo transcurrido
   */
  static calculateTimeSinceLastUpdate(ultimaUbicacion) {
    const ahora = new Date();
    const diff = ahora - new Date(ultimaUbicacion);
    const minutos = Math.floor(diff / (1000 * 60));
    const horas = Math.floor(minutos / 60);

    return {
      minutos_totales: minutos,
      horas: horas,
      minutos_restantes: minutos % 60,
      texto: horas > 0 ? `${horas}h ${minutos % 60}m` : `${minutos}m`,
    };
  }

  /**
   * Obtener capacidad total de la flota
   * @returns {number} Capacidad total en m³
   */
  static async getTotalFleetCapacity() {
    try {
      const vehiculos = await this.findAll();
      return vehiculos.reduce(
        (total, vehiculo) => total + vehiculo.capacidad_m3,
        0
      );
    } catch (error) {
      logger.error("Error calculando capacidad total:", error.message);
      return 0;
    }
  }

  /**
   * Generar justificación para selección de vehículo
   * @param {Object} vehiculo - Vehículo seleccionado
   * @param {Object} pedidoData - Datos del pedido
   * @returns {string} Justificación textual
   */
  static generarJustificacion(vehiculo, pedidoData) {
    const ratio = ((pedidoData.cantidad / vehiculo.capacidad) * 100).toFixed(1);
    let justificacion = `Vehículo ${vehiculo.placa} (${vehiculo.capacidad}m³) - Utilización: ${ratio}%`;

    if (vehiculo.reglas_aplicadas.length > 0) {
      justificacion += `. Factores: ${vehiculo.reglas_aplicadas
        .slice(0, 2)
        .join(", ")}`;
    }

    return justificacion;
  }
}

// ==========================================
// EXPORT
// ==========================================

module.exports = Vehiculo;
