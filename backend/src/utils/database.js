// src/utils/database.js - Funciones Helper para PostgreSQL
// Sistema de Tracking Vehicular - Agregados Zambrana

const { pool, query } = require("../config/database");
const logger = require("./logger");

// ==========================================
// FUNCIONES HELPER DE CONSULTAS
// ==========================================

/**
 * Ejecutar transacción con rollback automático en caso de error
 * @param {Function} transactionCallback - Función que ejecuta las queries
 * @returns {*} Resultado de la transacción
 */
const executeTransaction = async (transactionCallback) => {
  const client = await pool.connect();

  try {
    await client.query("BEGIN");

    // Ejecutar callback con el cliente de la transacción
    const result = await transactionCallback(client);

    await client.query("COMMIT");

    logger.info("Transacción completada exitosamente");
    return result;
  } catch (error) {
    await client.query("ROLLBACK");
    logger.error("Transacción revertida debido a error:", error.message);
    throw error;
  } finally {
    client.release();
  }
};

/**
 * Ejecutar query con paginación
 * @param {string} baseQuery - Query base sin LIMIT/OFFSET
 * @param {Array} params - Parámetros de la query
 * @param {number} page - Número de página (1-based)
 * @param {number} limit - Elementos por página
 * @returns {Object} Resultado con datos y metadatos de paginación
 */
const executePagedQuery = async (
  baseQuery,
  params = [],
  page = 1,
  limit = 10
) => {
  try {
    // Validar parámetros
    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.max(1, Math.min(100, parseInt(limit) || 10));
    const offset = (pageNum - 1) * limitNum;

    // Query para contar total de registros
    const countQuery = `SELECT COUNT(*) as total FROM (${baseQuery}) as count_query`;

    // Query paginada
    const pagedQuery = `${baseQuery} LIMIT $${params.length + 1} OFFSET $${
      params.length + 2
    }`;

    // Ejecutar ambas queries
    const [countResult, dataResult] = await Promise.all([
      query(countQuery, params),
      query(pagedQuery, [...params, limitNum, offset]),
    ]);

    const total = parseInt(countResult.rows[0].total);
    const totalPages = Math.ceil(total / limitNum);

    return {
      data: dataResult.rows,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages,
        hasNext: pageNum < totalPages,
        hasPrevious: pageNum > 1,
        offset,
      },
    };
  } catch (error) {
    logger.error("Error en query paginada:", error.message);
    throw error;
  }
};

/**
 * Ejecutar múltiples queries en paralelo de forma segura
 * @param {Array} queries - Array de objetos {sql, params}
 * @returns {Array} Array de resultados
 */
const executeParallelQueries = async (queries) => {
  try {
    const promises = queries.map(({ sql, params = [] }) => {
      return query(sql, params).catch((error) => ({ error: error.message }));
    });

    const results = await Promise.all(promises);

    // Verificar si hubo errores
    const hasErrors = results.some((result) => result.error);
    if (hasErrors) {
      const errors = results
        .filter((result) => result.error)
        .map((result) => result.error);
      logger.warn("Algunos queries paralelos fallaron:", errors);
    }

    return results;
  } catch (error) {
    logger.error("Error en queries paralelos:", error.message);
    throw error;
  }
};

// ==========================================
// FUNCIONES DE VALIDACIÓN DE BD
// ==========================================

/**
 * Verificar si una tabla existe
 * @param {string} tableName - Nombre de la tabla
 * @returns {boolean} True si la tabla existe
 */
const tableExists = async (tableName) => {
  try {
    const result = await query(
      `
            SELECT EXISTS (
                SELECT FROM information_schema.tables 
                WHERE table_schema = 'public' 
                AND table_name = $1
            )
        `,
      [tableName]
    );

    return result.rows[0].exists;
  } catch (error) {
    logger.error(
      `Error verificando existencia de tabla ${tableName}:`,
      error.message
    );
    return false;
  }
};

/**
 * Verificar si un registro existe en una tabla
 * @param {string} tableName - Nombre de la tabla
 * @param {string} columnName - Nombre de la columna
 * @param {*} value - Valor a buscar
 * @returns {boolean} True si el registro existe
 */
const recordExists = async (tableName, columnName, value) => {
  try {
    const result = await query(
      `
            SELECT EXISTS (
                SELECT 1 FROM ${tableName} 
                WHERE ${columnName} = $1
            )
        `,
      [value]
    );

    return result.rows[0].exists;
  } catch (error) {
    logger.error(
      `Error verificando existencia de registro en ${tableName}:`,
      error.message
    );
    return false;
  }
};

/**
 * Obtener información del esquema de una tabla
 * @param {string} tableName - Nombre de la tabla
 * @returns {Array} Información de las columnas
 */
const getTableSchema = async (tableName) => {
  try {
    const result = await query(
      `
            SELECT 
                column_name,
                data_type,
                is_nullable,
                column_default,
                character_maximum_length
            FROM information_schema.columns 
            WHERE table_schema = 'public' 
              AND table_name = $1
            ORDER BY ordinal_position
        `,
      [tableName]
    );

    return result.rows;
  } catch (error) {
    logger.error(
      `Error obteniendo esquema de tabla ${tableName}:`,
      error.message
    );
    throw error;
  }
};

// ==========================================
// FUNCIONES DE ANÁLISIS Y ESTADÍSTICAS
// ==========================================

/**
 * Obtener estadísticas generales de la base de datos
 * @returns {Object} Estadísticas de la BD
 */
const getDatabaseStats = async () => {
  try {
    const stats = await executeParallelQueries([
      {
        sql: `SELECT schemaname, tablename, n_tup_ins, n_tup_upd, n_tup_del 
                      FROM pg_stat_user_tables 
                      WHERE schemaname = 'public'`,
      },
      {
        sql: `SELECT COUNT(*) as total_tables 
                      FROM information_schema.tables 
                      WHERE table_schema = 'public'`,
      },
      {
        sql: `SELECT pg_size_pretty(pg_database_size(current_database())) as database_size`,
      },
    ]);

    return {
      table_statistics: stats[0].error ? [] : stats[0].rows,
      total_tables: stats[1].error
        ? 0
        : parseInt(stats[1].rows[0].total_tables),
      database_size: stats[2].error ? "N/A" : stats[2].rows[0].database_size,
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error obteniendo estadísticas de BD:", error.message);
    throw error;
  }
};

/**
 * Ejecutar función PostgreSQL optimizada y formatear resultado
 * @param {string} functionName - Nombre de la función
 * @param {Array} params - Parámetros de la función
 * @returns {*} Resultado de la función
 */
const callPostgreSQLFunction = async (functionName, params = []) => {
  try {
    const paramPlaceholders = params
      .map((_, index) => `$${index + 1}`)
      .join(", ");
    const sql = `SELECT * FROM ${functionName}(${paramPlaceholders})`;

    const result = await query(sql, params);

    // Si la función retorna un solo valor, devolverlo directamente
    if (result.rows.length === 1 && Object.keys(result.rows[0]).length === 1) {
      const key = Object.keys(result.rows[0])[0];
      return result.rows[0][key];
    }

    return result.rows;
  } catch (error) {
    logger.error(`Error ejecutando función ${functionName}:`, error.message);
    throw error;
  }
};

// ==========================================
// FUNCIONES DE BACKUP Y MANTENIMIENTO
// ==========================================

/**
 * Limpiar conexiones inactivas (solo para desarrollo)
 * @returns {number} Número de conexiones cerradas
 */
const cleanupIdleConnections = async () => {
  if (process.env.NODE_ENV === "production") {
    logger.warn("Cleanup de conexiones no disponible en producción");
    return 0;
  }

  try {
    const result = await query(`
            SELECT pg_terminate_backend(pid) as terminated
            FROM pg_stat_activity 
            WHERE state = 'idle' 
              AND state_change < now() - interval '1 hour'
              AND pid <> pg_backend_pid()
        `);

    const terminated = result.rows.filter((row) => row.terminated).length;
    logger.info(`Conexiones inactivas cerradas: ${terminated}`);

    return terminated;
  } catch (error) {
    logger.error("Error limpiando conexiones:", error.message);
    return 0;
  }
};

/**
 * Obtener consultas lentas recientes
 * @param {number} limit - Límite de consultas a retornar
 * @returns {Array} Lista de consultas lentas
 */
const getSlowQueries = async (limit = 10) => {
  try {
    const result = await query(
      `
            SELECT 
                query,
                calls,
                total_time,
                mean_time,
                rows
            FROM pg_stat_statements 
            WHERE calls > 1
            ORDER BY mean_time DESC 
            LIMIT $1
        `,
      [limit]
    );

    return result.rows;
  } catch (error) {
    // pg_stat_statements puede no estar habilitado
    logger.debug(
      "No se pudieron obtener consultas lentas (pg_stat_statements no disponible)"
    );
    return [];
  }
};

// ==========================================
// FUNCIONES DE UTILIDAD ESPECÍFICAS DEL DOMINIO
// ==========================================

/**
 * Verificar integridad de datos críticos
 * @returns {Object} Resultado de verificación
 */
const verifyDataIntegrity = async () => {
  try {
    const checks = await executeParallelQueries([
      // Verificar que todos los pedidos tienen cliente válido
      {
        sql: `SELECT COUNT(*) as orphaned_orders 
                      FROM pedidos p 
                      LEFT JOIN clientes c ON p.cliente_id = c.id 
                      WHERE c.id IS NULL`,
      },
      // Verificar que todos los clientes tienen usuario válido
      {
        sql: `SELECT COUNT(*) as orphaned_clients 
                      FROM clientes c 
                      LEFT JOIN usuarios u ON c.usuario_id = u.id 
                      WHERE u.id IS NULL`,
      },
      // Verificar stock negativo
      {
        sql: `SELECT COUNT(*) as negative_stock 
                      FROM stock 
                      WHERE cantidad_disponible < 0`,
      },
      // Verificar pedidos sin material
      {
        sql: `SELECT COUNT(*) as invalid_materials 
                      FROM pedidos p 
                      LEFT JOIN materiales m ON p.material_id = m.id 
                      WHERE m.id IS NULL`,
      },
    ]);

    const issues = [];

    if (checks[0].rows && parseInt(checks[0].rows[0].orphaned_orders) > 0) {
      issues.push("Pedidos huérfanos detectados");
    }

    if (checks[1].rows && parseInt(checks[1].rows[0].orphaned_clients) > 0) {
      issues.push("Clientes huérfanos detectados");
    }

    if (checks[2].rows && parseInt(checks[2].rows[0].negative_stock) > 0) {
      issues.push("Stock negativo detectado");
    }

    if (checks[3].rows && parseInt(checks[3].rows[0].invalid_materials) > 0) {
      issues.push("Pedidos con materiales inválidos detectados");
    }

    return {
      integrity_ok: issues.length === 0,
      issues,
      details: {
        orphaned_orders: checks[0].rows
          ? parseInt(checks[0].rows[0].orphaned_orders)
          : 0,
        orphaned_clients: checks[1].rows
          ? parseInt(checks[1].rows[0].orphaned_clients)
          : 0,
        negative_stock: checks[2].rows
          ? parseInt(checks[2].rows[0].negative_stock)
          : 0,
        invalid_materials: checks[3].rows
          ? parseInt(checks[3].rows[0].invalid_materials)
          : 0,
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error verificando integridad de datos:", error.message);
    throw error;
  }
};

/**
 * Generar reporte de uso de la base de datos
 * @returns {Object} Reporte de uso
 */
const generateUsageReport = async () => {
  try {
    const report = await executeParallelQueries([
      {
        sql: "SELECT COUNT(*) as total_usuarios FROM usuarios WHERE activo = true",
      },
      { sql: "SELECT COUNT(*) as total_clientes FROM clientes" },
      { sql: "SELECT COUNT(*) as total_pedidos FROM pedidos" },
      {
        sql: "SELECT COUNT(*) as pedidos_activos FROM pedidos WHERE estado IN ('pendiente', 'confirmado', 'asignado', 'en_transito')",
      },
      { sql: "SELECT COUNT(*) as total_vehiculos FROM vehiculos" },
      {
        sql: "SELECT COUNT(*) as vehiculos_disponibles FROM vehiculos WHERE estado = 'disponible'",
      },
      {
        sql: "SELECT COUNT(*) as materiales_activos FROM materiales WHERE activo = true",
      },
      {
        sql: "SELECT COUNT(*) as stock_critico FROM vista_inventario_alertas WHERE nivel_stock = 'CRÍTICO'",
      },
    ]);

    return {
      usuarios: {
        total_activos: parseInt(report[0].rows?.[0]?.total_usuarios || 0),
      },
      clientes: {
        total: parseInt(report[1].rows?.[0]?.total_clientes || 0),
      },
      pedidos: {
        total: parseInt(report[2].rows?.[0]?.total_pedidos || 0),
        activos: parseInt(report[3].rows?.[0]?.pedidos_activos || 0),
      },
      vehiculos: {
        total: parseInt(report[4].rows?.[0]?.total_vehiculos || 0),
        disponibles: parseInt(report[5].rows?.[0]?.vehiculos_disponibles || 0),
      },
      inventario: {
        materiales_activos: parseInt(
          report[6].rows?.[0]?.materiales_activos || 0
        ),
        stock_critico: parseInt(report[7].rows?.[0]?.stock_critico || 0),
      },
      timestamp: new Date().toISOString(),
    };
  } catch (error) {
    logger.error("Error generando reporte de uso:", error.message);
    throw error;
  }
};

// ==========================================
// EXPORTS
// ==========================================

module.exports = {
  // Funciones de transacciones y consultas
  executeTransaction,
  executePagedQuery,
  executeParallelQueries,

  // Funciones de validación
  tableExists,
  recordExists,
  getTableSchema,

  // Funciones de análisis
  getDatabaseStats,
  callPostgreSQLFunction,

  // Funciones de mantenimiento
  cleanupIdleConnections,
  getSlowQueries,

  // Funciones específicas del dominio
  verifyDataIntegrity,
  generateUsageReport,
};
