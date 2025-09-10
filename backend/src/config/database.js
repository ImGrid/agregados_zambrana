const { Pool } = require("pg");
const logger = require("../utils/logger");

const poolConfig = {
  host: process.env.DB_HOST || "localhost",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "agregados_zambrana",
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,

  // Configuraciones de pool para optimización
  max: 20, // Máximo número de conexiones en el pool
  idleTimeoutMillis: 30000, // Tiempo antes de cerrar conexión idle
  connectionTimeoutMillis: 2000, // Tiempo máximo para obtener conexión

  // Configuraciones de SSL para producción
  ssl:
    process.env.NODE_ENV === "production"
      ? {
          rejectUnauthorized: false,
        }
      : false,
};

// Crear pool de conexiones
const pool = new Pool(poolConfig);

pool.on("connect", (client) => {
  logger.info("Nueva conexión establecida con PostgreSQL");
});

pool.on("acquire", (client) => {
  logger.debug("Conexión adquirida del pool");
});

pool.on("remove", (client) => {
  logger.info("Conexión removida del pool");
});

pool.on("error", (err, client) => {
  logger.error("Error inesperado en conexión PostgreSQL:", err.message);
  process.exit(-1);
});

/**
 * Conectar a la base de datos y validar conexión
 */
const connectDB = async () => {
  try {
    logger.info("Conectando a PostgreSQL...");

    // Probar conexión inicial
    const client = await pool.connect();

    // Verificar que la base de datos tiene las tablas necesarias
    const result = await client.query(`
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'public' 
              AND table_name IN ('usuarios', 'materiales', 'stock', 'vehiculos', 'clientes', 'pedidos')
        `);

    const tableCount = parseInt(result.rows[0].table_count);

    if (tableCount < 6) {
      logger.warn(
        `Solo se encontraron ${tableCount}/6 tablas principales. ¿Ejecutó el script de creación de BD?`
      );
    } else {
      logger.info(
        `✓ Base de datos conectada correctamente (${tableCount} tablas encontradas)`
      );
    }

    // Liberar conexión de prueba
    client.release();

    logger.info("PostgreSQL conectado exitosamente");
  } catch (error) {
    logger.error("Error conectando a PostgreSQL:");
    logger.error(`Host: ${poolConfig.host}:${poolConfig.port}`);
    logger.error(`Database: ${poolConfig.database}`);
    logger.error(`User: ${poolConfig.user}`);
    logger.error(`Error: ${error.message}`);

    // No salir del proceso aquí, dejar que app.js maneje el error
    throw error;
  }
};

/**
 * Cerrar todas las conexiones del pool
 */
const closeDB = async () => {
  try {
    await pool.end();
    logger.info("Conexiones de base de datos cerradas correctamente");
  } catch (error) {
    logger.error("Error cerrando conexiones de base de datos:", error.message);
    throw error;
  }
};

/**
 * Función helper para ejecutar queries con manejo de errores
 */
const query = async (text, params = []) => {
  const start = Date.now();

  try {
    logger.debug(`Ejecutando query: ${text.substring(0, 100)}...`);

    const result = await pool.query(text, params);
    const duration = Date.now() - start;

    logger.debug(
      `Query ejecutada en ${duration}ms, filas: ${result.rows.length}`
    );

    return result;
  } catch (error) {
    const duration = Date.now() - start;

    logger.error(`Query falló después de ${duration}ms`);
    logger.error(`SQL: ${text.substring(0, 200)}`);
    logger.error(`Params: ${JSON.stringify(params)}`);
    logger.error(`Error: ${error.message}`);

    throw error;
  }
};

/**
 * Función helper para obtener estadísticas del pool
 */
const getPoolStats = () => {
  return {
    total: pool.totalCount,
    idle: pool.idleCount,
    waiting: pool.waitingCount,
    max: poolConfig.max,
  };
};

/**
 * Función helper para validar que la conexión esté activa
 */
const healthCheck = async () => {
  try {
    const result = await query("SELECT NOW() as current_time, version()");
    return {
      status: "connected",
      timestamp: result.rows[0].current_time,
      version: result.rows[0].version,
      pool_stats: getPoolStats(),
    };
  } catch (error) {
    return {
      status: "error",
      error: error.message,
      pool_stats: getPoolStats(),
    };
  }
};

module.exports = {
  pool, // Pool de conexiones para usar directamente
  connectDB, // Función para inicializar conexión
  closeDB, // Función para cerrar conexiones
  query, // Helper para ejecutar queries con logging
  healthCheck, // Función para health check
  getPoolStats, // Estadísticas del pool
};
