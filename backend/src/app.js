// src/app.js - Servidor Principal Express (CORREGIDO)
// Sistema de Tracking Vehicular - Agregados Zambrana

require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB, pool } = require("./config/database");
const logger = require("./utils/logger");

const app = express();
const PORT = process.env.PORT || 5000;

// ==========================================
// MIDDLEWARES BÁSICOS
// ==========================================

// CORS para desarrollo
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "development" ? "*" : ["http://localhost:3000"],
    credentials: true,
  })
);

// Parser para JSON
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Logging de requests
app.use((req, res, next) => {
  logger.info(`${req.method} ${req.path} - IP: ${req.ip}`);
  next();
});

// ==========================================
// RUTAS DE PRUEBA - FASE 1
// ==========================================

// Ruta básica de health check
app.get("/api/health", async (req, res) => {
  try {
    // Verificar conexión a base de datos
    const result = await pool.query("SELECT NOW() as timestamp, version()");

    res.json({
      status: "OK",
      database: "connected",
      timestamp: result.rows[0].timestamp,
      server_time: new Date().toISOString(),
      node_env: process.env.NODE_ENV,
    });

    logger.info("Health check exitoso");
  } catch (error) {
    logger.error("Error en health check:", error.message);

    res.status(500).json({
      status: "ERROR",
      database: "disconnected",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// Ruta adicional para verificar tablas de la BD
app.get("/api/health/db", async (req, res) => {
  try {
    // Contar tablas en la base de datos
    const tablesQuery = `
            SELECT COUNT(*) as table_count 
            FROM information_schema.tables 
            WHERE table_schema = 'public'
        `;

    // Contar usuarios registrados
    const usersQuery = "SELECT COUNT(*) as user_count FROM usuarios";

    const [tablesResult, usersResult] = await Promise.all([
      pool.query(tablesQuery),
      pool.query(usersQuery),
    ]);

    res.json({
      status: "OK",
      database: "connected",
      tables_count: parseInt(tablesResult.rows[0].table_count),
      users_count: parseInt(usersResult.rows[0].user_count),
      timestamp: new Date().toISOString(),
    });

    logger.info("Database health check exitoso");
  } catch (error) {
    logger.error("Error en database health check:", error.message);

    res.status(500).json({
      status: "ERROR",
      database: "error",
      error: error.message,
      timestamp: new Date().toISOString(),
    });
  }
});

// ==========================================
// MANEJO DE ERRORES BÁSICO
// ==========================================

// Ruta no encontrada (CORREGIDO - sin '*')
app.use((req, res, next) => {
  logger.warn(`Ruta no encontrada: ${req.method} ${req.originalUrl}`);

  res.status(404).json({
    error: "Ruta no encontrada",
    path: req.originalUrl,
    method: req.method,
  });
});

// Manejo de errores global
app.use((error, req, res, next) => {
  logger.error("Error no manejado:", error.message);

  res.status(500).json({
    error: "Error interno del servidor",
    message:
      process.env.NODE_ENV === "development" ? error.message : "Error interno",
  });
});

// ==========================================
// INICIALIZACIÓN DEL SERVIDOR
// ==========================================

const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();

    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`🚀 Servidor iniciado exitosamente`);
      logger.info(`📍 Puerto: ${PORT}`);
      logger.info(`🌍 Entorno: ${process.env.NODE_ENV}`);
      logger.info(`🔗 Health check: http://localhost:${PORT}/api/health`);
      console.log(`\n=== SERVIDOR LISTO ===`);
      console.log(`URL: http://localhost:${PORT}/api/health`);
      console.log(`======================\n`);
    });
  } catch (error) {
    logger.error("Error al iniciar servidor:", error.message);
    process.exit(1);
  }
};

// Manejo de cierre graceful
process.on("SIGTERM", async () => {
  logger.info("Cerrando servidor...");
  await pool.end();
  process.exit(0);
});

process.on("SIGINT", async () => {
  logger.info("Cerrando servidor por SIGINT...");
  await pool.end();
  process.exit(0);
});

// Inicializar
startServer();

module.exports = app;
