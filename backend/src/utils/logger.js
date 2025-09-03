const fs = require("fs");
const path = require("path");

const LOG_LEVEL = process.env.LOG_LEVEL || "info";
const LOG_TO_FILE = process.env.NODE_ENV === "production";

// Niveles de log (menor número = mayor prioridad)
const LOG_LEVELS = {
  error: 0,
  warn: 1,
  info: 2,
  debug: 3,
};

// Colores para consola
const COLORS = {
  error: "\x1b[31m", // Rojo
  warn: "\x1b[33m", // Amarillo
  info: "\x1b[36m", // Cyan
  debug: "\x1b[35m", // Magenta
  reset: "\x1b[0m", // Reset
};

// ==========================================
// FUNCIONES DE LOG
// ==========================================

/**
 * Formatear timestamp para logs
 */
const getTimestamp = () => {
  return new Date().toISOString();
};

/**
 * Formatear mensaje de log
 */
const formatMessage = (level, message, ...args) => {
  const timestamp = getTimestamp();
  const formattedArgs =
    args.length > 0
      ? " " +
        args
          .map((arg) =>
            typeof arg === "object" ? JSON.stringify(arg, null, 2) : String(arg)
          )
          .join(" ")
      : "";

  return `[${timestamp}] [${level.toUpperCase()}] ${message}${formattedArgs}`;
};

/**
 * Escribir log a archivo (solo en producción)
 */
const writeToFile = (level, formattedMessage) => {
  if (!LOG_TO_FILE) return;

  try {
    const logsDir = path.join(__dirname, "../../logs");

    // Crear directorio de logs si no existe
    if (!fs.existsSync(logsDir)) {
      fs.mkdirSync(logsDir, { recursive: true });
    }

    // Nombre de archivo con fecha
    const date = new Date().toISOString().split("T")[0];
    const filename = path.join(logsDir, `app-${date}.log`);

    // Escribir al archivo
    fs.appendFileSync(filename, formattedMessage + "\n", "utf8");
  } catch (error) {
    console.error("Error escribiendo log a archivo:", error.message);
  }
};

/**
 * Función base para logging
 */
const log = (level, message, ...args) => {
  // Verificar si el nivel está habilitado
  if (LOG_LEVELS[level] > LOG_LEVELS[LOG_LEVEL]) {
    return;
  }

  const formattedMessage = formatMessage(level, message, ...args);

  // Log a consola con colores
  if (process.env.NODE_ENV !== "test") {
    const color = COLORS[level] || "";
    console.log(`${color}${formattedMessage}${COLORS.reset}`);
  }

  // Log a archivo en producción
  writeToFile(level, formattedMessage);
};

// ==========================================
// FUNCIONES ESPECÍFICAS DE NIVEL
// ==========================================

const logger = {
  /**
   * Log de error (mayor prioridad)
   */
  error: (message, ...args) => {
    log("error", message, ...args);
  },

  /**
   * Log de warning
   */
  warn: (message, ...args) => {
    log("warn", message, ...args);
  },

  /**
   * Log de información general
   */
  info: (message, ...args) => {
    log("info", message, ...args);
  },

  /**
   * Log de debug (solo en desarrollo)
   */
  debug: (message, ...args) => {
    log("debug", message, ...args);
  },

  /**
   * Log de requests HTTP (información específica)
   */
  request: (method, path, statusCode, duration, ip) => {
    const message = `${method} ${path} - ${statusCode} - ${duration}ms - IP: ${ip}`;
    log("info", message);
  },

  /**
   * Log de base de datos (información específica)
   */
  database: (query, duration, rows) => {
    const shortQuery =
      query.length > 100 ? query.substring(0, 100) + "..." : query;
    const message = `DB Query: ${shortQuery} - ${duration}ms - ${rows} rows`;
    log("debug", message);
  },

  /**
   * Log de autenticación
   */
  auth: (action, email, success, ip) => {
    const status = success ? "SUCCESS" : "FAILED";
    const message = `AUTH ${action.toUpperCase()}: ${email} - ${status} - IP: ${ip}`;
    log(success ? "info" : "warn", message);
  },
};

// ==========================================
// FUNCIONES UTILITARIAS
// ==========================================

/**
 * Obtener estadísticas de logs
 */
logger.getStats = () => {
  return {
    current_level: LOG_LEVEL,
    available_levels: Object.keys(LOG_LEVELS),
    log_to_file: LOG_TO_FILE,
    environment: process.env.NODE_ENV,
  };
};

/**
 * Cambiar nivel de log dinámicamente
 */
logger.setLevel = (level) => {
  if (LOG_LEVELS.hasOwnProperty(level)) {
    process.env.LOG_LEVEL = level;
    logger.info(`Nivel de log cambiado a: ${level}`);
    return true;
  } else {
    logger.error(
      `Nivel de log inválido: ${level}. Disponibles: ${Object.keys(
        LOG_LEVELS
      ).join(", ")}`
    );
    return false;
  }
};

/**
 * Log de inicio de aplicación
 */
logger.startup = () => {
  logger.info("=".repeat(50));
  logger.info("🚀 SISTEMA DE TRACKING VEHICULAR");
  logger.info("📦 Agregados Zambrana Backend");
  logger.info(`🌍 Entorno: ${process.env.NODE_ENV || "development"}`);
  logger.info(`📊 Nivel de log: ${LOG_LEVEL}`);
  logger.info(
    `💾 Log a archivo: ${LOG_TO_FILE ? "Habilitado" : "Deshabilitado"}`
  );
  logger.info("=".repeat(50));
};

/**
 * Log de cierre de aplicación
 */
logger.shutdown = () => {
  logger.info("=".repeat(50));
  logger.info("🔻 Cerrando aplicación...");
  logger.info(`⏰ Tiempo de ejecución finalizado: ${getTimestamp()}`);
  logger.info("👋 Hasta luego!");
  logger.info("=".repeat(50));
};

// ==========================================
// MANEJO DE ERRORES NO CAPTURADOS
// ==========================================

// Log de errores no manejados
process.on("uncaughtException", (error) => {
  logger.error("ERROR NO CAPTURADO:", error.message);
  logger.error("Stack:", error.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("PROMISE RECHAZADA NO MANEJADA:", reason);
  logger.error("Promise:", promise);
  process.exit(1);
});

// ==========================================
// EXPORT
// ==========================================

module.exports = logger;
