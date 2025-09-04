// src/config/queries.js - SOLUCIÓN DEFINITIVA PARA PARÁMETROS NULL
// Sistema de Tracking Vehicular - Agregados Zambrana

// ==========================================
// USUARIOS - Autenticación y Roles
// ==========================================

const USUARIOS_QUERIES = {
  FIND_BY_EMAIL: `
        SELECT id, email, password, rol, nombre, apellido, telefono, activo, created_at
        FROM usuarios 
        WHERE email = $1 AND activo = true
    `,

  CREATE: `
        INSERT INTO usuarios (email, password, rol, nombre, apellido, telefono)
        VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING id, email, rol, nombre, apellido, telefono, created_at
    `,

  FIND_BY_ID: `
        SELECT id, email, rol, nombre, apellido, telefono, activo, created_at, updated_at
        FROM usuarios 
        WHERE id = $1 AND activo = true
    `,

  FIND_BY_ID_WITH_PASSWORD: `
        SELECT id, email, password, rol, nombre, apellido, telefono, activo, created_at, updated_at
        FROM usuarios 
        WHERE id = $1 AND activo = true
    `,

  LIST_BY_ROLE: `
        SELECT id, email, rol, nombre, apellido, telefono, created_at
        FROM usuarios 
        WHERE rol = $1 AND activo = true
        ORDER BY created_at DESC
    `,

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
  LIST_ACTIVE: `
        SELECT id, nombre, descripcion, unidad_medida, precio_por_unidad, created_at
        FROM materiales 
        WHERE activo = true
        ORDER BY nombre
    `,

  FIND_BY_ID: `
        SELECT id, nombre, descripcion, unidad_medida, precio_por_unidad, activo, created_at
        FROM materiales 
        WHERE id = $1
    `,

  CREATE: `
        INSERT INTO materiales (nombre, descripcion, unidad_medida, precio_por_unidad)
        VALUES ($1, $2, $3, $4)
        RETURNING id, nombre, descripcion, unidad_medida, precio_por_unidad, created_at
    `,

  UPDATE: `
        UPDATE materiales 
        SET nombre = $2, descripcion = $3, precio_por_unidad = $4, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1 AND activo = true
        RETURNING id, nombre, descripcion, unidad_medida, precio_por_unidad
    `,

  DEACTIVATE: `
        UPDATE materiales 
        SET activo = false, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, nombre
    `,
};

// ==========================================
// STOCK - Inventario con Alertas
// ==========================================

const STOCK_QUERIES = {
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

  FIND_BY_MATERIAL: `
        SELECT s.*, m.nombre as material_nombre, m.unidad_medida
        FROM stock s
        JOIN materiales m ON s.material_id = m.id
        WHERE s.material_id = $1
    `,

  UPDATE_QUANTITY: `
        UPDATE stock 
        SET cantidad_disponible = $2, actualizado_por = $3, ultima_actualizacion = CURRENT_TIMESTAMP
        WHERE material_id = $1
        RETURNING material_id, cantidad_disponible, cantidad_minima
    `,

  CHECK_AVAILABILITY: `
        SELECT verificar_stock_disponible($1, $2) as disponible
    `,

  CRITICAL_STOCK: `
        SELECT * FROM vista_inventario_alertas
        WHERE nivel_stock = 'CRÍTICO'
        ORDER BY material
    `,

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
  LIST_ALL: `
        SELECT id, placa, marca, modelo, capacidad_m3, estado, 
               ubicacion_actual_lat, ubicacion_actual_lng, ultima_ubicacion, created_at
        FROM vehiculos
        ORDER BY placa
    `,

  GET_AVAILABLE_BY_CAPACITY: `
        SELECT * FROM obtener_vehiculos_disponibles($1)
    `,

  FIND_BY_ID: `
        SELECT id, placa, marca, modelo, capacidad_m3, estado, 
               ubicacion_actual_lat, ubicacion_actual_lng, ultima_ubicacion
        FROM vehiculos 
        WHERE id = $1
    `,

  UPDATE_STATUS: `
        UPDATE vehiculos 
        SET estado = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, placa, estado
    `,

  UPDATE_LOCATION: `
        UPDATE vehiculos 
        SET ubicacion_actual_lat = $2, ubicacion_actual_lng = $3, 
            ultima_ubicacion = CURRENT_TIMESTAMP, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, placa, ubicacion_actual_lat, ubicacion_actual_lng
    `,

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
  FIND_BY_USER_ID: `
        SELECT c.*, u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.usuario_id = $1
    `,

  CREATE: `
        INSERT INTO clientes (usuario_id, empresa, direccion, ciudad, tipo_cliente)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, usuario_id, empresa, direccion, tipo_cliente, created_at
    `,

  FIND_BY_ID: `
        SELECT c.*, u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        WHERE c.id = $1
    `,

  LIST_ALL: `
        SELECT c.id, c.empresa, c.tipo_cliente, c.ciudad, c.created_at,
               u.nombre, u.apellido, u.email, u.telefono
        FROM clientes c
        JOIN usuarios u ON c.usuario_id = u.id
        ORDER BY c.created_at DESC
    `,

  UPDATE: `
        UPDATE clientes 
        SET empresa = $2, direccion = $3, ciudad = $4, tipo_cliente = $5
        WHERE id = $1
        RETURNING id, empresa, direccion, tipo_cliente
    `,
};

// ==========================================
// PEDIDOS - SOLUCIÓN DEFINITIVA SIN PARÁMETROS NULL
// ==========================================

const PEDIDOS_QUERIES = {
  // SOLUCIÓN 1: Query sin filtro (todos los pedidos)
  LIST_ALL: `
        SELECT * FROM vista_pedidos_completa
        ORDER BY fecha_pedido DESC
        LIMIT $1 OFFSET $2
    `,

  // SOLUCIÓN 2: Query con filtro específico por estado
  LIST_BY_ESTADO: `
        SELECT * FROM vista_pedidos_completa
        WHERE estado = $1
        ORDER BY fecha_pedido DESC
        LIMIT $2 OFFSET $3
    `,

  // SOLUCIÓN 3: Query usando COALESCE (más robusta)
  LIST_COMPLETE: `
        SELECT * FROM vista_pedidos_completa
        WHERE COALESCE($1::text, '') = '' OR estado = $1::text
        ORDER BY fecha_pedido DESC
        LIMIT $2 OFFSET $3
    `,

  LIST_BY_CLIENT: `
        SELECT * FROM vista_pedidos_completa
        WHERE cliente_id = $1
        ORDER BY fecha_pedido DESC
    `,

  CREATE: `
        INSERT INTO pedidos (
            codigo_seguimiento,
            cliente_id, material_id, cantidad, precio_total,
            direccion_entrega, direccion_lat, direccion_lng,
            telefono_contacto, fecha_entrega_solicitada, observaciones
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11)
        RETURNING id, codigo_seguimiento, cliente_id, material_id, cantidad, 
                  precio_total, estado, created_at
    `,

  FIND_BY_TRACKING_CODE: `
        SELECT * FROM vista_pedidos_completa
        WHERE codigo_seguimiento = $1
    `,

  FIND_BY_ID: `
        SELECT * FROM vista_pedidos_completa
        WHERE id = $1
    `,

  UPDATE_STATUS: `
        UPDATE pedidos 
        SET estado = $2, updated_at = CURRENT_TIMESTAMP
        WHERE id = $1
        RETURNING id, codigo_seguimiento, estado, updated_at
    `,

  GET_PENDING_ASSIGNMENT: `
        SELECT * FROM vista_pedidos_completa
        WHERE estado IN ('pendiente', 'confirmado')
        ORDER BY fecha_pedido ASC
    `,

  GET_STATS_BY_PERIOD: `
        SELECT 
            COUNT(*) as total_pedidos,
            COUNT(*) FILTER (WHERE estado = 'entregado') as entregados,
            COUNT(*) FILTER (WHERE estado = 'pendiente') as pendientes,
            COALESCE(SUM(precio_total), 0) as valor_total,
            COALESCE(SUM(precio_total) FILTER (WHERE estado = 'entregado'), 0) as valor_entregado
        FROM pedidos
        WHERE fecha_pedido >= $1::date AND fecha_pedido <= $2::date
    `,
};

// ==========================================
// DASHBOARD - Estadísticas
// ==========================================

const DASHBOARD_QUERIES = {
  GET_GENERAL_STATS: `
        SELECT * FROM estadisticas_dashboard()
    `,

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
// EXPORT
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
