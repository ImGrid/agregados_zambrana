require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { connectDB, pool } = require("./config/database");
const logger = require("./utils/logger");

// Middlewares de manejo de errores
const {
  errorHandler,
  notFoundHandler,
  generateRequestId,
  requestLogger,
} = require("./middleware/errorHandler");

// Helper de respuestas
const { addResponseHelpers } = require("./utils/responseHelper");

const app = express();
const PORT = process.env.PORT || 5000;

// Generar ID único por request
app.use(generateRequestId);

// CORS para desarrollo
app.use(
  cors({
    origin:
      process.env.NODE_ENV === "development" ? "*" : ["http://localhost:3000"],
    credentials: true,
  })
);

// Parser para JSON
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true, limit: "10mb" }));

// Logging de requests
app.use(requestLogger);

// Agregar helpers de respuesta
app.use(addResponseHelpers);

// Autenticación (Fase 3)
const authRoutes = require("./routes/auth");
app.use("/api/auth", authRoutes);

// Materiales (Fase 4)
const materialesRoutes = require("./routes/materiales");
app.use("/api/materiales", materialesRoutes);

// Stock (Fase 4)
const stockRoutes = require("./routes/stock");
app.use("/api/stock", stockRoutes);

// Pedidos (Fase 5)
const pedidosRoutes = require("./routes/pedidos");
app.use("/api/pedidos", pedidosRoutes);

// Vehículos (Fase 6)
const vehiculosRoutes = require("./routes/vehiculos");
app.use("/api/vehiculos", vehiculosRoutes);

// DASHBOARD (Fase 7)
const dashboardRoutes = require("./routes/dashboard");
app.use("/api/dashboard", dashboardRoutes);

// Status básico (solo desarrollo)
if (process.env.NODE_ENV === "development") {
  app.get("/api/status", async (req, res) => {
    try {
      const result = await pool.query("SELECT NOW() as timestamp");
      res.json({
        status: "OK",
        database: "connected",
        timestamp: result.rows[0].timestamp,
        fases_completadas: [
          "Fase 3: Autenticación",
          "Fase 4: Materiales y Stock",
          "Fase 5: Pedidos",
          "Fase 6: Vehículos",
          "Fase 7: Dashboard",
        ],
      });
    } catch (error) {
      res.status(500).json({
        status: "ERROR",
        database: "disconnected",
      });
    }
  });
}

// Manejar rutas no encontradas
app.use(notFoundHandler);

// Manejo de errores global
app.use(errorHandler);

const startServer = async () => {
  try {
    // Conectar a la base de datos
    await connectDB();

    // Validar variables de entorno críticas en producción
    if (process.env.NODE_ENV === "production") {
      if (!process.env.JWT_SECRET) {
        logger.error("JWT_SECRET no configurado en producción");
        process.exit(1);
      }
      if (!process.env.DB_PASSWORD) {
        logger.error("DB_PASSWORD no configurado en producción");
        process.exit(1);
      }
    }

    // Iniciar servidor
    app.listen(PORT, () => {
      logger.info(`Servidor iniciado en puerto ${PORT}`);
      logger.info(`Entorno: ${process.env.NODE_ENV}`);

      // Info mínima solo en desarrollo
      if (process.env.NODE_ENV === "development") {
        console.log(`\nServidor: http://localhost:${PORT}/api`);
      }
    });
  } catch (error) {
    logger.error("Error al iniciar servidor:", error.message);
    process.exit(1);
  }
};

const gracefulShutdown = async (signal) => {
  logger.info(`Cerrando servidor (${signal})`);

  try {
    await pool.end();
    logger.info("Servidor cerrado correctamente");
    process.exit(0);
  } catch (error) {
    logger.error("Error durante cierre:", error.message);
    process.exit(1);
  }
};

// Manejar señales de cierre
process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

// Manejar errores no capturados
process.on("uncaughtException", (error) => {
  logger.error("Excepción no capturada:", error);
  gracefulShutdown("UNCAUGHT_EXCEPTION");
});

process.on("unhandledRejection", (reason, promise) => {
  logger.error("Promesa rechazada no manejada:", { reason });
  gracefulShutdown("UNHANDLED_REJECTION");
});

startServer();

module.exports = app;
