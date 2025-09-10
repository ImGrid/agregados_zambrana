const { query } = require("../config/database");
const { DASHBOARD, PEDIDOS, STOCK, VEHICULOS } = require("../config/queries");
const Cliente = require("../models/Cliente");
const {
  success,
  dashboardStats,
  validationError,
  notFound,
} = require("../utils/responseHelper");
const {
  asyncHandler,
  ValidationError,
  NotFoundError,
} = require("../middleware/errorHandler");
const logger = require("../utils/logger");

/**
 * Dashboard para clientes - Solo sus propios datos
 * GET /api/dashboard/cliente
 */
const getDashboardCliente = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info("Generando dashboard de cliente", { userId });

  try {
    // Obtener perfil de cliente
    const cliente = await Cliente.findByUserId(userId);
    if (!cliente) {
      throw new NotFoundError("Perfil de cliente no encontrado");
    }

    // Usar query optimizada para estadísticas del cliente
    const statsResult = await query(DASHBOARD.GET_CLIENT_STATS, [cliente.id]);
    const clientStats = statsResult.rows[0];

    // Obtener pedidos recientes del cliente (últimos 5)
    const pedidosRecientes = await query(
      `SELECT codigo_seguimiento, estado, cantidad, precio_total, 
              material_nombre, fecha_pedido, fecha_entrega_solicitada
       FROM vista_pedidos_completa 
       WHERE cliente_id = $1 
       ORDER BY fecha_pedido DESC 
       LIMIT 5`,
      [cliente.id]
    );

    const dashboardData = {
      resumen_pedidos: {
        total_pedidos: parseInt(clientStats.total_pedidos),
        pedidos_entregados: parseInt(clientStats.pedidos_entregados),
        pedidos_activos: parseInt(clientStats.pedidos_activos),
        valor_total_bolivianos: parseFloat(clientStats.valor_total_pedidos),
        valor_promedio_bolivianos: parseFloat(
          clientStats.valor_promedio_pedido
        ),
      },
      pedidos_recientes: pedidosRecientes.rows.map((pedido) => ({
        codigo_seguimiento: pedido.codigo_seguimiento,
        estado: pedido.estado,
        material: pedido.material_nombre,
        cantidad: `${pedido.cantidad} m³`,
        precio_total: parseFloat(pedido.precio_total),
        fecha_pedido: pedido.fecha_pedido,
        puede_rastrear: true,
      })),
      perfil_cliente: {
        nombre_completo: `${req.user.nombre} ${req.user.apellido}`,
        email: req.user.email,
        telefono: req.user.telefono,
        empresa: cliente.empresa,
        tipo_cliente: cliente.tipo_cliente,
      },
    };

    logger.info("Dashboard de cliente generado exitosamente", {
      userId,
      totalPedidos: dashboardData.resumen_pedidos.total_pedidos,
    });

    return dashboardStats(res, dashboardData, "cliente");
  } catch (error) {
    logger.error("Error generando dashboard de cliente:", error.message);
    throw error;
  }
});

/**
 * Dashboard para administrativos - Gestión operativa
 * GET /api/dashboard/administrativo
 */
const getDashboardAdministrativo = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info("Generando dashboard administrativo", { userId });

  try {
    // ⭐ CORREGIDO: Manejar JSON de PostgreSQL correctamente
    const generalStats = await query(DASHBOARD.GET_GENERAL_STATS);
    const rawStats = generalStats.rows[0].estadisticas_dashboard;

    // PostgreSQL puede devolver JSON como objeto o como string
    let stats;
    if (typeof rawStats === "string") {
      stats = JSON.parse(rawStats);
    } else {
      stats = rawStats; // Ya es un objeto
    }

    logger.debug("Estadísticas generales obtenidas", { stats });

    // Obtener pedidos pendientes de gestión
    const pedidosPendientes = await query(
      `SELECT id, codigo_seguimiento, cliente_nombre, material_nombre, 
              cantidad, direccion_entrega, fecha_pedido, estado
       FROM vista_pedidos_completa 
       WHERE estado IN ('pendiente', 'confirmado') 
       ORDER BY fecha_pedido ASC 
       LIMIT 10`
    );

    // Obtener alertas de stock crítico
    const stockCritico = await query(STOCK.CRITICAL_STOCK);

    // Obtener vehículos que necesitan atención
    const vehiculosAtencion = await query(
      `SELECT id, placa, estado, 
              CASE WHEN ultima_ubicacion < NOW() - INTERVAL '2 hours' 
                   THEN 'Sin reporte GPS' 
                   ELSE 'OK' 
              END as estado_gps
       FROM vehiculos 
       WHERE estado IN ('mantenimiento', 'averiado') 
          OR ultima_ubicacion < NOW() - INTERVAL '2 hours'`
    );

    const dashboardData = {
      resumen_operativo: {
        pedidos_pendientes: stats.pedidos_pendientes || 0,
        pedidos_en_transito: stats.pedidos_en_transito || 0,
        vehiculos_disponibles: stats.vehiculos_disponibles || 0,
        vehiculos_en_uso: stats.vehiculos_en_uso || 0,
        materiales_bajo_stock: stats.materiales_bajo_stock || 0,
        clientes_activos_mes: stats.clientes_activos || 0,
      },
      pedidos_requieren_atencion: pedidosPendientes.rows.map((pedido) => ({
        id: pedido.id,
        codigo: pedido.codigo_seguimiento,
        cliente: pedido.cliente_nombre,
        material: pedido.material_nombre,
        cantidad: `${pedido.cantidad} m³`,
        estado: pedido.estado,
        dias_pendiente: Math.floor(
          (Date.now() - new Date(pedido.fecha_pedido)) / (1000 * 60 * 60 * 24)
        ),
      })),
      alertas_stock: stockCritico.rows.map((item) => ({
        material: item.material,
        cantidad_actual: item.cantidad_disponible,
        cantidad_minima: item.cantidad_minima,
        nivel_criticidad: "CRÍTICO",
        accion_requerida: "Reabastecer inmediatamente",
      })),
      vehiculos_atencion: vehiculosAtencion.rows.map((vehiculo) => ({
        id: vehiculo.id,
        placa: vehiculo.placa,
        estado: vehiculo.estado,
        problema:
          vehiculo.estado_gps === "Sin reporte GPS"
            ? "Sin ubicación GPS reciente"
            : `Estado: ${vehiculo.estado}`,
      })),
    };

    logger.info("Dashboard administrativo generado exitosamente", {
      userId,
      pedidosPendientes: dashboardData.pedidos_requieren_atencion.length,
      alertasStock: dashboardData.alertas_stock.length,
    });

    return dashboardStats(res, dashboardData, "administrativo");
  } catch (error) {
    logger.error("Error generando dashboard administrativo:", error.message);
    throw error;
  }
});

/**
 * Dashboard para administradores - Vista completa del negocio
 * GET /api/dashboard/admin
 */
const getDashboardAdmin = asyncHandler(async (req, res) => {
  const userId = req.user.id;

  logger.info("Generando dashboard de administración", { userId });

  try {
    // ⭐ CORREGIDO: Manejar JSON de PostgreSQL correctamente
    const generalStats = await query(DASHBOARD.GET_GENERAL_STATS);
    const rawStats = generalStats.rows[0].estadisticas_dashboard;

    // PostgreSQL puede devolver JSON como objeto o como string
    let stats;
    if (typeof rawStats === "string") {
      stats = JSON.parse(rawStats);
    } else {
      stats = rawStats; // Ya es un objeto
    }

    // Ventas por material (últimos 30 días)
    const ventasPorMaterial = await query(DASHBOARD.GET_SALES_BY_MATERIAL);

    // Métricas financieras básicas
    const metricsFinancieras = await query(
      `SELECT 
         SUM(precio_total) FILTER (WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '30 days') as ventas_mes,
         SUM(precio_total) FILTER (WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '7 days') as ventas_semana,
         SUM(precio_total) FILTER (WHERE fecha_pedido >= CURRENT_DATE) as ventas_hoy,
         COUNT(*) FILTER (WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '30 days') as pedidos_mes
       FROM pedidos 
       WHERE estado = 'entregado'`
    );

    // Top 5 clientes por volumen
    const topClientes = await query(
      `SELECT c.empresa, u.nombre, u.apellido, 
              COUNT(p.id) as total_pedidos,
              SUM(p.precio_total) as valor_total
       FROM clientes c
       JOIN usuarios u ON c.usuario_id = u.id
       JOIN pedidos p ON c.id = p.cliente_id
       WHERE p.fecha_pedido >= CURRENT_DATE - INTERVAL '30 days'
         AND p.estado = 'entregado'
       GROUP BY c.id, c.empresa, u.nombre, u.apellido
       ORDER BY valor_total DESC
       LIMIT 5`
    );

    const metricas = metricsFinancieras.rows[0];

    const dashboardData = {
      resumen_ejecutivo: {
        // Estadísticas operativas
        pedidos_pendientes: stats.pedidos_pendientes || 0,
        pedidos_en_transito: stats.pedidos_en_transito || 0,
        vehiculos_disponibles: stats.vehiculos_disponibles || 0,
        materiales_bajo_stock: stats.materiales_bajo_stock || 0,

        // Métricas financieras
        ventas_mes_bolivianos: parseFloat(metricas.ventas_mes) || 0,
        ventas_semana_bolivianos: parseFloat(metricas.ventas_semana) || 0,
        ventas_hoy_bolivianos: parseFloat(metricas.ventas_hoy) || 0,
        pedidos_entregados_mes: parseInt(metricas.pedidos_mes) || 0,

        // KPIs calculados
        promedio_valor_pedido:
          metricas.pedidos_mes > 0
            ? Math.round(metricas.ventas_mes / metricas.pedidos_mes)
            : 0,
      },
      ventas_por_material: ventasPorMaterial.rows.map((venta) => ({
        material: venta.material,
        cantidad_pedidos: parseInt(venta.cantidad_pedidos),
        volumen_total_m3: parseFloat(venta.cantidad_total),
        valor_total_bolivianos: parseFloat(venta.valor_total),
        porcentaje_ventas:
          metricas.ventas_mes > 0
            ? Math.round((venta.valor_total / metricas.ventas_mes) * 100)
            : 0,
      })),
      top_clientes_mes: topClientes.rows.map((cliente) => ({
        nombre: cliente.empresa || `${cliente.nombre} ${cliente.apellido}`,
        tipo: cliente.empresa ? "Empresa" : "Particular",
        total_pedidos: parseInt(cliente.total_pedidos),
        valor_total_bolivianos: parseFloat(cliente.valor_total),
      })),
      alertas_criticas: [
        ...(stats.materiales_bajo_stock > 0
          ? [
              {
                tipo: "stock",
                mensaje: `${stats.materiales_bajo_stock} materiales con stock crítico`,
                prioridad: "alta",
              },
            ]
          : []),
        ...(stats.pedidos_pendientes > 10
          ? [
              {
                tipo: "pedidos",
                mensaje: `${stats.pedidos_pendientes} pedidos pendientes de gestión`,
                prioridad: "media",
              },
            ]
          : []),
        ...(stats.vehiculos_disponibles === 0
          ? [
              {
                tipo: "flota",
                mensaje: "No hay vehículos disponibles",
                prioridad: "alta",
              },
            ]
          : []),
      ],
    };

    logger.info("Dashboard de administración generado exitosamente", {
      userId,
      ventasMes: dashboardData.resumen_ejecutivo.ventas_mes_bolivianos,
      alertasCriticas: dashboardData.alertas_criticas.length,
    });

    return dashboardStats(res, dashboardData, "administrador");
  } catch (error) {
    logger.error("Error generando dashboard de administración:", error.message);
    throw error;
  }
});

/**
 * Obtener métricas de rendimiento del sistema
 * GET /api/dashboard/metricas-sistema
 * Acceso: Solo Admin
 */
const getMetricasSistema = asyncHandler(async (req, res) => {
  logger.info("Obteniendo métricas del sistema", { userId: req.user.id });

  try {
    // Métricas de base de datos y rendimiento
    const sistemasMetrics = await query(`
      SELECT 
        (SELECT COUNT(*) FROM usuarios WHERE activo = true) as usuarios_activos,
        (SELECT COUNT(*) FROM pedidos WHERE fecha_pedido >= CURRENT_DATE - INTERVAL '24 hours') as pedidos_ultimo_dia,
        (SELECT AVG(EXTRACT(EPOCH FROM (updated_at - created_at))/60) 
         FROM pedidos 
         WHERE estado = 'entregado' 
           AND updated_at >= CURRENT_DATE - INTERVAL '7 days') as tiempo_promedio_entrega_minutos,
        (SELECT COUNT(*) FROM pedidos WHERE estado = 'cancelado' AND fecha_pedido >= CURRENT_DATE - INTERVAL '30 days') as pedidos_cancelados_mes
    `);

    const metrics = sistemasMetrics.rows[0];

    const sistemaData = {
      usuarios_sistema: {
        usuarios_activos: parseInt(metrics.usuarios_activos),
        actividad_ultimo_dia: parseInt(metrics.pedidos_ultimo_dia),
      },
      rendimiento_operativo: {
        tiempo_promedio_entrega_horas: metrics.tiempo_promedio_entrega_minutos
          ? Math.round((metrics.tiempo_promedio_entrega_minutos / 60) * 100) /
            100
          : null,
        pedidos_cancelados_mes: parseInt(metrics.pedidos_cancelados_mes),
        tasa_cancelacion_porcentaje:
          parseInt(metrics.pedidos_cancelados_mes) > 0
            ? Math.round(
                (metrics.pedidos_cancelados_mes /
                  (metrics.pedidos_cancelados_mes +
                    parseInt(metrics.pedidos_ultimo_dia))) *
                  100
              )
            : 0,
      },
      timestamp_generacion: new Date().toISOString(),
    };

    return success(res, sistemaData, "Métricas del sistema obtenidas");
  } catch (error) {
    logger.error("Error obteniendo métricas del sistema:", error.message);
    throw error;
  }
});

module.exports = {
  // Dashboards por rol
  getDashboardCliente,
  getDashboardAdministrativo,
  getDashboardAdmin,

  // Métricas adicionales
  getMetricasSistema,
};
