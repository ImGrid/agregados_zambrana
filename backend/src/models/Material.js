const { query } = require("../config/database");
const { MATERIALES } = require("../config/queries");
const {
  validateId,
  validateName,
  validatePrice,
  sanitizeText,
} = require("../utils/validation");
const {
  ValidationError,
  NotFoundError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

class Material {
  /**
   * Obtener todos los materiales activos
   * @returns {Array} Lista de materiales
   */
  static async findAllActive() {
    try {
      const result = await query(MATERIALES.LIST_ACTIVE);

      return result.rows.map((material) => ({
        ...material,
        precio_formateado: `Bs. ${material.precio_por_unidad} por ${material.unidad_medida}`,
      }));
    } catch (error) {
      logger.error("Error obteniendo materiales activos:", error.message);
      throw error;
    }
  }

  /**
   * Obtener material por ID
   * @param {number} id - ID del material
   * @returns {Object|null} Material encontrado
   */
  static async findById(id) {
    try {
      const idValidation = validateId(id, "ID de material");
      if (!idValidation.isValid) {
        throw new ValidationError("ID de material inválido");
      }

      const result = await query(MATERIALES.FIND_BY_ID, [idValidation.value]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando material por ID:", error.message);
      throw error;
    }
  }

  /**
   * Crear nuevo material
   * @param {Object} materialData - Datos del material
   * @returns {Object} Material creado
   */
  static async create(materialData) {
    logger.info("Creando nuevo material:", { nombre: materialData.nombre });

    try {
      // Validar nombre
      const nameValidation = validateName(
        materialData.nombre,
        "Nombre del material"
      );
      if (!nameValidation.isValid) {
        throw new ValidationError("Nombre inválido", [
          { field: "nombre", message: nameValidation.message },
        ]);
      }

      // Validar precio
      const priceValidation = validatePrice(materialData.precio_por_unidad);
      if (!priceValidation.isValid) {
        throw new ValidationError("Precio inválido", [
          { field: "precio_por_unidad", message: priceValidation.message },
        ]);
      }

      const result = await query(MATERIALES.CREATE, [
        nameValidation.value,
        sanitizeText(materialData.descripcion) || null,
        materialData.unidad_medida || "m³",
        priceValidation.value,
      ]);

      const newMaterial = result.rows[0];
      logger.info("Material creado exitosamente:", {
        id: newMaterial.id,
        nombre: newMaterial.nombre,
      });

      return newMaterial;
    } catch (error) {
      logger.error("Error creando material:", error.message);
      throw error;
    }
  }

  /**
   * Actualizar material
   * @param {number} id - ID del material
   * @param {Object} updateData - Datos a actualizar
   * @returns {Object} Material actualizado
   */
  static async update(id, updateData) {
    logger.info("Actualizando material:", { id });

    try {
      // Verificar que existe
      const existing = await this.findById(id);
      if (!existing) {
        throw new NotFoundError("Material no encontrado");
      }

      // Validar datos
      const nameValidation = validateName(
        updateData.nombre || existing.nombre,
        "Nombre del material"
      );
      const priceValidation = validatePrice(
        updateData.precio_por_unidad || existing.precio_por_unidad
      );

      if (!nameValidation.isValid || !priceValidation.isValid) {
        throw new ValidationError("Datos de actualización inválidos");
      }

      const result = await query(MATERIALES.UPDATE, [
        id,
        nameValidation.value,
        sanitizeText(updateData.descripcion) || existing.descripcion,
        priceValidation.value,
      ]);

      return result.rows[0];
    } catch (error) {
      logger.error("Error actualizando material:", error.message);
      throw error;
    }
  }

  /**
   * Desactivar material (soft delete)
   * @param {number} id - ID del material
   * @returns {Object} Material desactivado
   */
  static async deactivate(id) {
    logger.info("Desactivando material:", { id });

    try {
      const result = await query(MATERIALES.DEACTIVATE, [id]);

      if (!result.rows.length) {
        throw new NotFoundError("Material no encontrado");
      }

      return result.rows[0];
    } catch (error) {
      logger.error("Error desactivando material:", error.message);
      throw error;
    }
  }
}
module.exports = Material;
