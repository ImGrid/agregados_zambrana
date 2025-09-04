// src/config/queries.js - Queries SQL Organizadas por Entidad (FIXED)
// Sistema de Tracking Vehicular - Agregados Zambrana
// NOTA: Usamos las funciones y vistas optimizadas que creamos en PostgreSQL

// ==========================================
// USUARIOS - Autenticación y Roles
// ==========================================

const USUARIOS_QUERIES = {
  // Buscar usuario por email para login
  FIND_BY_EMAIL: `
        SELECT id, email, password, rol, nombre, apellido, telefono, activo, created_at
        FROM usuarios 
        WHERE email = $1 AND activo = true
    `,

  // Crear nuevo usuario (registro)
  CREATE: `
        INSERT INTO usuarios (email, password, rol, nombre, apellido, telefono)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, rol, nombre, apellido, telefono, created_at
    `,

  // Obtener perfil completo por ID (sin password por seguridad)
  FIND_BY_ID: `
        SELECT id, email, rol, nombre, apellido, telefono, activo, created_at, updated_at
        FROM usuarios 
        WHERE id = $1 AND activo = true
    `,

  // Obtener usuario con password (solo para operaciones de cambio de contraseña)
  FIND_BY_ID_WITH_PASSWORD: `
        SELECT id, email, password, rol, nombre, apellido, telefono, activo, created_at, updated_at
        FROM usuarios 
        WHERE id = $1 AND activo = true
    `,

  // Listar usuarios por rol (para admin)
  LIST_BY_ROLE: `
        SELECT id, email, rol, nombre, apellido, telefono, created_at
        FROM usuarios 
        WHERE rol = $1 AND activo = true
        ORDER BY created_at DESC
    `,

  // Actualizar información básica
  UPDATE_PROFILE: `
        UPDATE usuarios 
        SET nombre = $2, apellido = $3, telefono = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND activo = true
        RETURNING id, email, rol, nombre, apellido, telefono
    `,
};

// ==========================================
// MATERIALES - Catálogo de Productos
// ==========================================

const MATERIALES_QUERIES = {
  // Listar materiales activos (para clientes y stock)
  LIST_ACTIVE: `
        SELECT id, nombre, descripcion, unidad_medida, precio_por_unidad, created_at
        FROM materiales 
        WHERE activo = true
        ORDER BY nombre
    `,

  // Obtener material por ID
  FIND_BY_ID: `
        SELECT id, nombre, descripcion, unidad_medida, precio_por_unidad, activo, created_at
        FROM materiales 
        WHERE id = $1
    `,

  // Crear nuevo material
  CREATE: `
        INSERT INTO materiales (nombre, descripcion, unidad_medida, precio_por_unidad)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nombre, descripcion, unidad_medida, precio_por_unidad, created_at
    `,

  // Actualizar material
  UPDATE: `
        UPDATE materiales 
        SET nombre = $2, descripcion = $3, precio_por_unidad = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND activo = true
        RETURNING id, nombre, descripcion, unidad_medida, precio_por_unidad
    `,

  // Desactivar material (soft delete)
  DEACTIVATE: `
        UPDATE materiales 
        SET activo = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, nombre
    `,
};

// ==========================================
// STOCK - Inventario con Alertas (USA VISTAS OPTIMIZADAS)
// ==========================================

const STOCK_QUERIES = {
  // Usar vista optimizada para inventario con alertas
  LIST_WITH_ALERTS: `
        SELECT * FROM vista_inventario_alertas
        ORDER BY 
            CASE nivel_stock 
                WHEN 'CRÍTICO' THEN 1 
                WHEN 'BAJO' THEN 2 
                WHEN 'NORMAL' THEN 3 
            END,
            material
    `,

  // Obtener stock específico por material
  FIND_BY_MATERIAL: `
        SELECT s.*, m.nombre as material_nombre, m.unidad_medida
        FROM stock s
        JOIN materiales m ON s.material_id = m.id
        WHERE s.material_id = $1
    `,

  // Actualizar cantidad de stock
  UPDATE_QUANTITY: `
        UPDATE stock 
        SET cantidad_disponible = $2, actualizado_por = $3, ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE material_id = $1
        RETURNING material_id, cantidad_disponible, cantidad_minima
    `,

  // Verificar stock disponible (USA FUNCIÓN POSTGRESQL)
  CHECK_AVAILABILITY: `
        SELECT verificar_stock_disponible($1, $2) as disponible
    `,

  // Obtener materiales con stock crítico
  CRITICAL_STOCK: `
        SELECT * FROM vista_inventario_alertas
        WHERE nivel_stock = 'CRÍTICO'
        ORDER BY material
    `,

  // Reducir stock por pedido
  REDUCE_STOCK: `
        UPDATE stock 
        SET cantidad_disponible = cantidad_disponible - $2,
            actualizado_por = $3,
            ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE material_id = $1 AND cantidad_disponible >= $2
        RETURNING material_id, cantidad_disponible
    `,
};

// ==========================================
// VEHÍCULOS - Gestión de Flota
// ==========================================

const VEHICULOS_QUERIES = {
  // Listar todos los vehículos con estado
  LIST_ALL: `
        SELECT id, placa, marca, modelo, capacidad_m3, estado, 
               ubicacion_actual_lat, ubicacion_actual_lng, ultima_ubicacion, created_at
        FROM vehiculos
        ORDER BY placa
    `,

  // Obtener vehículos disponibles por capacidad (USA FUNCIÓN POSTGRESQL)
  GET_AVAILABLE_BY_CAPACITY: `
        SELECT * FROM obtener_vehiculos_disponibles($1)
    `,

  // Obtener vehículo por ID
  FIND_BY_ID: `
        SELECT id, placa, marca, modelo, capacidad_m3, estado, 
               ubicacion_actual_lat, ubicacion_actual_lng, ultima_ubicacion
        FROM vehiculos 
        WHERE id = $1
    `,

  // Actualizar estado del vehículo
  UPDATE_STATUS: `
        UPDATE vehiculos 
        SET estado = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, placa, estado
    `,

  // Actualizar ubicación GPS
  UPDATE_LOCATION: `
        UPDATE vehiculos 
        SET ubicacion_actual_lat = $2, ubicacion_actual_lng = $3, 
            ultima_ubicacion = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, placa, ubicacion_actual_lat, ubicacion_actual_lng
    `,

  // Obtener estadísticas de flota
  GET_FLEET_STATS: `
        SELECT 
            COUNT(*) as total_vehiculos,
            COUNT(*) FILTER (WHERE estado = 'disponible') as disponibles,
            COUNT(*) FILTER (WHERE estado = 'en_uso') as en_uso,
            COUNT(*) FILTER (WHERE estado = 'mantenimiento') as mantenimiento
        FROM vehiculos
    `,
};

// ==========================================
// CLIENTES - Información Extendida
// ==========================================

const CLIENTES_QUERIES = {
  // Obtener cliente con información de usuario
  FIND_BY_USER_ID: `
        SELECT c.*, u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.usuario_id = $1
    `,

  // Crear perfil de cliente
  CREATE: `
        INSERT INTO clientes (usuario_id, empresa, direccion, ciudad, tipo_cliente)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, usuario_id, empresa, direccion, tipo_cliente, created_at
    `,

  // Obtener cliente por ID
  FIND_BY_ID: `
        SELECT c.*, u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = $1
    `,

  // Listar todos los clientes (para admin)
  LIST_ALL: `
        SELECT c.id, c.empresa, c.tipo_cliente, c.ciudad, c.created_at,
               u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        ORDER BY c.created_at DESC
    `,

  // Actualizar información del cliente
  UPDATE: `
        UPDATE clientes 
        SET empresa = $2, direccion = $3, ciudad = $4, tipo_cliente = $5
        WHERE id = $1
        RETURNING id, empresa, direccion, tipo_cliente
    `,
};

// ==========================================
// PEDIDOS - Core del Negocio (USA VISTAS OPTIMIZADAS)
// ==========================================

const PEDIDOS_QUERIES = {
  // Usar vista optimizada para pedidos completos
  LIST_COMPLETE: `
        SELECT * FROM vista_pedidos_completa
        WHERE ($1::varchar IS NULL OR estado = $1)
        ORDER BY fecha_pedido DESC
        LIMIT $2 OFFSET $3
    `,

  // Pedidos específicos de un cliente
  LIST_BY_CLIENT: `
        SELECT * FROM vista_pedidos_completa
        WHERE cliente_id = $1
        ORDER BY fecha_pedido DESC
    `,

  // Crear nuevo pedido
  CREATE: `
        INSERT INTO pedidos (
            cliente_id, material_id, cantidad, precio_total,
            direccion_entrega, direccion_lat, direccion_lng,
            telefono_contacto, fecha_entrega_solicitada, observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        RETURNING id, codigo_seguimiento, cliente_id, material_id, cantidad, 
                  precio_total, estado, created_at
    `,

  // Obtener pedido por código de seguimiento
  FIND_BY_TRACKING_CODE: `
        SELECT * FROM vista_pedidos_completa
        WHERE codigo_seguimiento = $1
    `,

  // Obtener pedido por ID
  FIND_BY_ID: `
        SELECT * FROM vista_pedidos_completa
        WHERE id = $1
    `,

  // Actualizar estado del pedido
  UPDATE_STATUS: `
        UPDATE pedidos 
        SET estado = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, codigo_seguimiento, estado, updated_at
    `,

  // Obtener pedidos pendientes de asignación
  GET_PENDING_ASSIGNMENT: `
        SELECT * FROM vista_pedidos_completa
        WHERE estado IN ('pendiente', 'confirmado')
        ORDER BY fecha_pedido ASC
    `,

  // Estadísticas de pedidos por período
  GET_STATS_BY_PERIOD: `
        SELECT 
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE estado = 'entregado') as entregados,
            COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
            SUM(precio_total) as valor_total,
            SUM(precio_total) FILTER (WHERE estado = 'entregado') as valor_entregado
        FROM pedidos
        WHERE fecha_pedido >= $1 AND fecha_pedido <= $2
    `,
};

// ==========================================
// DASHBOARD - Estadísticas (USA FUNCIÓN POSTGRESQL OPTIMIZADA)
// ==========================================

const DASHBOARD_QUERIES = {
  // Usar función optimizada para estadísticas generales
  GET_GENERAL_STATS: `
        SELECT * FROM estadisticas_dashboard()
    `,

  // Estadísticas específicas del cliente
  GET_CLIENT_STATS: `
        SELECT 
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE estado = 'entregado') as pedidos_entregados,
            COUNT(*) FILTER (WHERE estado IN ('pendiente', 'confirmado', 'asignado', 'en_transito')) as pedidos_activos,
            COALESCE(SUM(precio_total), 0) as valor_total_pedidos,
            COALESCE(AVG(precio_total), 0) as valor_promedio_pedido
        FROM pedidos
        WHERE cliente_id = $1
    `,

  // Ventas por material (últimos 30 días)
  GET_SALES_BY_MATERIAL: `
        SELECT 
            m.nombre as material,
            COUNT(p.id) as cantidad_pedidos,
            SUM(p.cantidad) as cantidad_total,
            SUM(p.precio_total) as valor_total
        FROM pedidos p
        JOIN materiales m ON p.material_id = m.id
        WHERE p.fecha_pedido >= CURRENT_DATE - INTERVAL '30 days'
        GROUP BY m.id, m.nombre
        ORDER BY valor_total DESC
    `,
};

// ==========================================
// EXPORT DE TODAS LAS QUERIES
// ==========================================

module.exports = {
  USUARIOS: USUARIOS_QUERIES,
  MATERIALES: MATERIALES_QUERIES,
  STOCK: STOCK_QUERIES,
  VEHICULOS: VEHICULOS_QUERIES,
  CLIENTES: CLIENTES_QUERIES,
  PEDIDOS: PEDIDOS_QUERIES,
  DASHBOARD: DASHBOARD_QUERIES,
};
