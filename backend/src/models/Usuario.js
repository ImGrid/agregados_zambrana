const { pool, query } = require("../config/database");
const { USUARIOS } = require("../config/queries");
const {
  validateUserRegistration,
  validateEmail,
  validatePassword,
  validateId,
} = require("../utils/validation");
const {
  ValidationError,
  NotFoundError,
  ConflictError,
} = require("../middleware/errorHandler");
const bcrypt = require("bcryptjs");
const logger = require("../utils/logger");
class Usuario {
  /**
   * Crear nuevo usuario con validaciones
   */
  static async create(userData) {
    logger.info("Creando nuevo usuario:", {
      email: userData.email,
      rol: userData.rol,
    });

    try {
      // Validar datos de entrada
      const validation = validateUserRegistration(userData);
      if (!validation.isValid) {
        throw new ValidationError(
          "Datos de usuario inválidos",
          validation.errors
        );
      }

      const validData = validation.validData;

      // Hash de la contraseña
      const saltRounds = 12;
      const hashedPassword = await bcrypt.hash(validData.password, saltRounds);

      // Insertar usuario
      const result = await query(USUARIOS.CREATE, [
        validData.email,
        hashedPassword,
        validData.rol || "cliente",
        validData.nombre,
        validData.apellido,
        validData.telefono || null,
      ]);

      const newUser = result.rows[0];
      logger.info("Usuario creado exitosamente:", {
        id: newUser.id,
        email: newUser.email,
      });

      return newUser;
    } catch (error) {
      logger.error("Error creando usuario:", error.message);

      // Si es error de email duplicado
      if (error.code === "23505" && error.constraint.includes("email")) {
        throw new ConflictError("El email ya está registrado");
      }

      throw error;
    }
  }

  /**
   * Registro de cliente (autoregistro)
   */
  static async registerClient(clientData) {
    logger.info("Autoregistro de cliente:", { email: clientData.email });

    // Forzar rol cliente para autoregistro
    const userData = {
      ...clientData,
      rol: "cliente",
    };

    return await this.create(userData);
  }

  /**
   * Buscar usuario por email
   */
  static async findByEmail(email) {
    try {
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        throw new ValidationError("Email inválido", [
          { field: "email", message: emailValidation.message },
        ]);
      }

      const result = await query(USUARIOS.FIND_BY_EMAIL, [
        emailValidation.value,
      ]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando usuario por email:", error.message);
      throw error;
    }
  }

  /**
   * Buscar usuario por ID
   */
  static async findById(id) {
    try {
      const idValidation = validateId(id, "ID de usuario");
      if (!idValidation.isValid) {
        throw new ValidationError("ID inválido", [
          { field: "id", message: idValidation.message },
        ]);
      }

      const result = await query(USUARIOS.FIND_BY_ID, [idValidation.value]);

      return result.rows.length > 0 ? result.rows[0] : null;
    } catch (error) {
      logger.error("Error buscando usuario por ID:", error.message);
      throw error;
    }
  }

  /**
   * Listar usuarios por rol
   */
  static async findByRole(rol) {
    try {
      const result = await query(USUARIOS.LIST_BY_ROLE, [rol]);

      return result.rows;
    } catch (error) {
      logger.error("Error listando usuarios por rol:", error.message);
      throw error;
    }
  }

  /**
   * Verificar credenciales de login
   */
  static async verifyCredentials(email, password) {
    logger.info("Verificando credenciales:", { email });

    try {
      // Validar email
      const emailValidation = validateEmail(email);
      if (!emailValidation.isValid) {
        return null;
      }

      // Validar password
      const passwordValidation = validatePassword(password);
      if (!passwordValidation.isValid) {
        return null;
      }

      // Buscar usuario
      const user = await this.findByEmail(emailValidation.value);
      if (!user) {
        logger.warn("Usuario no encontrado en login:", {
          email: emailValidation.value,
        });
        return null;
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        logger.warn("Contraseña incorrecta en login:", {
          email: emailValidation.value,
        });
        return null;
      }

      // Remover password del objeto usuario
      const { password: _, ...userWithoutPassword } = user;

      logger.info("Login exitoso:", {
        id: user.id,
        email: user.email,
        rol: user.rol,
      });
      return userWithoutPassword;
    } catch (error) {
      logger.error("Error verificando credenciales:", error.message);
      throw error;
    }
  }

  /**
   * Actualizar perfil de usuario
   */
  static async updateProfile(id, updateData) {
    logger.info("Actualizando perfil de usuario:", { id });

    try {
      // Validar ID
      const idValidation = validateId(id, "ID de usuario");
      if (!idValidation.isValid) {
        throw new ValidationError("ID inválido", [
          { field: "id", message: idValidation.message },
        ]);
      }

      // Verificar que el usuario existe
      const existingUser = await this.findById(idValidation.value);
      if (!existingUser) {
        throw new NotFoundError("Usuario no encontrado");
      }

      // Validar datos a actualizar
      const errors = [];
      const validData = {};

      if (updateData.nombre) {
        const nameValidation = require("../utils/validation").validateName(
          updateData.nombre,
          "Nombre"
        );
        if (!nameValidation.isValid) {
          errors.push({ field: "nombre", message: nameValidation.message });
        } else {
          validData.nombre = nameValidation.value;
        }
      }

      if (updateData.apellido) {
        const lastNameValidation = require("../utils/validation").validateName(
          updateData.apellido,
          "Apellido"
        );
        if (!lastNameValidation.isValid) {
          errors.push({
            field: "apellido",
            message: lastNameValidation.message,
          });
        } else {
          validData.apellido = lastNameValidation.value;
        }
      }

      if (updateData.telefono !== undefined) {
        const phoneValidation = require("../utils/validation").validatePhone(
          updateData.telefono
        );
        if (!phoneValidation.isValid) {
          errors.push({ field: "telefono", message: phoneValidation.message });
        } else {
          validData.telefono = phoneValidation.value;
        }
      }

      if (errors.length > 0) {
        throw new ValidationError("Datos de actualización inválidos", errors);
      }

      // Usar datos existentes si no se proporcionan nuevos
      const nombre = validData.nombre || existingUser.nombre;
      const apellido = validData.apellido || existingUser.apellido;
      const telefono =
        validData.telefono !== undefined
          ? validData.telefono
          : existingUser.telefono;

      // Actualizar usuario
      const result = await query(USUARIOS.UPDATE_PROFILE, [
        idValidation.value,
        nombre,
        apellido,
        telefono,
      ]);

      const updatedUser = result.rows[0];
      logger.info("Perfil actualizado exitosamente:", { id: updatedUser.id });

      return updatedUser;
    } catch (error) {
      logger.error("Error actualizando perfil:", error.message);
      throw error;
    }
  }

  /**
   * Cambiar contraseña de usuario
   */
  static async changePassword(id, currentPassword, newPassword) {
    logger.info("Cambiando contraseña:", { id });

    try {
      // Validar ID
      const idValidation = validateId(id, "ID de usuario");
      if (!idValidation.isValid) {
        throw new ValidationError("ID inválido");
      }

      // Buscar usuario con contraseña
      const user = await query(USUARIOS.FIND_BY_ID_WITH_PASSWORD, [
        idValidation.value,
      ]);
      if (!user.rows.length) {
        throw new NotFoundError("Usuario no encontrado");
      }

      const userData = user.rows[0];

      // Verificar contraseña actual
      const isValidCurrentPassword = await bcrypt.compare(
        currentPassword,
        userData.password
      );
      if (!isValidCurrentPassword) {
        throw new ValidationError("Contraseña actual incorrecta");
      }

      // Validar nueva contraseña
      const passwordValidation = validatePassword(newPassword);
      if (!passwordValidation.isValid) {
        throw new ValidationError("Nueva contraseña inválida", [
          { field: "password", message: passwordValidation.message },
        ]);
      }

      // Hash de la nueva contraseña
      const hashedNewPassword = await bcrypt.hash(passwordValidation.value, 12);

      // Actualizar contraseña
      await query(
        "UPDATE usuarios SET password = $2, updated_at = CURRENT_TIMESTAMP WHERE id = $1",
        [idValidation.value, hashedNewPassword]
      );

      logger.info("Contraseña cambiada exitosamente:", { id });
      return true;
    } catch (error) {
      logger.error("Error cambiando contraseña:", error.message);
      throw error;
    }
  }

  /**
   * Formatear usuario (remover información sensible)
   */
  static formatUser(user) {
    if (!user) return null;

    const { password, ...userWithoutPassword } = user;
    return userWithoutPassword;
  }

  /**
   * Verificar si un usuario tiene un rol específico
   */
  static hasRole(user, roles) {
    if (!user || !user.rol) return false;

    if (Array.isArray(roles)) {
      return roles.includes(user.rol);
    }

    return user.rol === roles;
  }

  /**
   * Verificar si un usuario es admin
   */
  static isAdmin(user) {
    return this.hasRole(user, "administrador");
  }

  /**
   * Verificar si un usuario puede gestionar otros usuarios
   * @param {Object} user - Objeto usuario
   * @returns {boolean} True si puede gestionar usuarios
   */
  static canManageUsers(user) {
    return this.hasRole(user, ["administrador"]);
  }

  /**
   * Obtener permisos de usuario basado en rol
   */
  static getPermissions(user) {
    if (!user || !user.rol) {
      return {};
    }

    const permissions = {
      cliente: {
        canCreateOrders: true,
        canViewOwnOrders: true,
        canViewTracking: true,
      },
      conductor: {
        canViewAssignedOrders: true,
        canUpdateLocation: true,
        canReportDelivery: true,
      },
      administrativo: {
        canManageStock: true,
        canManageOrders: true,
        canViewDashboard: true,
        canManageVehicles: true,
      },
      administrador: {
        canManageUsers: true,
        canManageStock: true,
        canManageOrders: true,
        canViewDashboard: true,
        canManageVehicles: true,
        canViewReports: true,
        canManageSystem: true,
      },
    };

    return permissions[user.rol] || {};
  }
}

module.exports = Usuario;
