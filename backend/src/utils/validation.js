const validator = require("validator");

/**
 * Validar email
 */
const validateEmail = (email) => {
  if (!email || typeof email !== "string") {
    return { isValid: false, message: "Email es requerido" };
  }

  if (!validator.isEmail(email)) {
    return { isValid: false, message: "Email no válido" };
  }

  // Normalizar email (lowercase, trim)
  const normalizedEmail = email.toLowerCase().trim();

  return { isValid: true, value: normalizedEmail };
};

/**
 * Validar contraseña
 */
const validatePassword = (password) => {
  if (!password || typeof password !== "string") {
    return { isValid: false, message: "Contraseña es requerida" };
  }

  if (password.length < 6) {
    return {
      isValid: false,
      message: "Contraseña debe tener al menos 6 caracteres",
    };
  }

  if (password.length > 100) {
    return { isValid: false, message: "Contraseña demasiado larga" };
  }

  return { isValid: true, value: password };
};

/**
 * Validar nombre (nombre o apellido)
 */
const validateName = (name, fieldName = "Nombre") => {
  if (!name || typeof name !== "string") {
    return { isValid: false, message: `${fieldName} es requerido` };
  }

  const trimmedName = name.trim();

  if (trimmedName.length < 2) {
    return {
      isValid: false,
      message: `${fieldName} debe tener al menos 2 caracteres`,
    };
  }

  if (trimmedName.length > 50) {
    return {
      isValid: false,
      message: `${fieldName} muy largo (máximo 50 caracteres)`,
    };
  }

  // Solo letras, espacios y acentos
  if (!/^[a-zA-ZáéíóúÁÉÍÓÚñÑ\s]+$/.test(trimmedName)) {
    return {
      isValid: false,
      message: `${fieldName} solo puede contener letras`,
    };
  }

  return { isValid: true, value: trimmedName };
};

/**
 * Validar teléfono boliviano
 */
const validatePhone = (phone) => {
  if (!phone) {
    return { isValid: true, value: null }; // Teléfono es opcional
  }

  if (typeof phone !== "string") {
    return { isValid: false, message: "Teléfono debe ser texto" };
  }

  // Limpiar teléfono (quitar espacios, guiones, etc.)
  const cleanPhone = phone.replace(/[\s\-\(\)]/g, "");

  // Formato boliviano: 7XXXXXXX o 6XXXXXXX (8 dígitos)
  if (!/^[67]\d{7}$/.test(cleanPhone)) {
    return {
      isValid: false,
      message: "Teléfono debe ser boliviano (8 dígitos, empezar con 6 o 7)",
    };
  }

  return { isValid: true, value: cleanPhone };
};

/**
 * Validar rol de usuario
 */
const validateUserRole = (rol) => {
  const validRoles = [
    "administrador",
    "administrativo",
    "conductor",
    "cliente",
  ];

  if (!rol || !validRoles.includes(rol)) {
    return {
      isValid: false,
      message: `Rol debe ser uno de: ${validRoles.join(", ")}`,
    };
  }

  return { isValid: true, value: rol };
};

/**
 * Validar cantidad de material
 */
const validateQuantity = (cantidad) => {
  if (!cantidad && cantidad !== 0) {
    return { isValid: false, message: "Cantidad es requerida" };
  }

  const numCantidad = parseFloat(cantidad);

  if (isNaN(numCantidad)) {
    return { isValid: false, message: "Cantidad debe ser un número" };
  }

  if (numCantidad <= 0) {
    return { isValid: false, message: "Cantidad debe ser mayor a 0" };
  }

  if (numCantidad > 1000) {
    return { isValid: false, message: "Cantidad máxima: 1000 m³" };
  }

  // Redondear a 2 decimales
  const roundedQuantity = Math.round(numCantidad * 100) / 100;

  return { isValid: true, value: roundedQuantity };
};

/**
 * Validar precio
 */
const validatePrice = (precio) => {
  if (!precio && precio !== 0) {
    return { isValid: false, message: "Precio es requerido" };
  }

  const numPrecio = parseFloat(precio);

  if (isNaN(numPrecio)) {
    return { isValid: false, message: "Precio debe ser un número" };
  }

  if (numPrecio <= 0) {
    return { isValid: false, message: "Precio debe ser mayor a 0" };
  }

  if (numPrecio > 100000) {
    return { isValid: false, message: "Precio demasiado alto" };
  }

  // Redondear a 2 decimales
  const roundedPrice = Math.round(numPrecio * 100) / 100;

  return { isValid: true, value: roundedPrice };
};

/**
 * Validar dirección
 */
const validateAddress = (direccion) => {
  if (!direccion || typeof direccion !== "string") {
    return { isValid: false, message: "Dirección es requerida" };
  }

  const trimmedAddress = direccion.trim();

  if (trimmedAddress.length < 10) {
    return {
      isValid: false,
      message: "Dirección muy corta (mínimo 10 caracteres)",
    };
  }

  if (trimmedAddress.length > 500) {
    return {
      isValid: false,
      message: "Dirección muy larga (máximo 500 caracteres)",
    };
  }

  return { isValid: true, value: trimmedAddress };
};

/**
 * Validar coordenadas GPS
 */
const validateCoordinates = (lat, lng) => {
  if (lat !== null && lat !== undefined) {
    const numLat = parseFloat(lat);
    if (isNaN(numLat) || numLat < -90 || numLat > 90) {
      return { isValid: false, message: "Latitud inválida (-90 a 90)" };
    }
  }

  if (lng !== null && lng !== undefined) {
    const numLng = parseFloat(lng);
    if (isNaN(numLng) || numLng < -180 || numLng > 180) {
      return { isValid: false, message: "Longitud inválida (-180 a 180)" };
    }
  }

  // Ambas coordenadas o ninguna
  if (
    (lat === null || lat === undefined) !== (lng === null || lng === undefined)
  ) {
    return {
      isValid: false,
      message: "Debe proporcionar ambas coordenadas o ninguna",
    };
  }

  return {
    isValid: true,
    value: {
      lat: lat !== null && lat !== undefined ? parseFloat(lat) : null,
      lng: lng !== null && lng !== undefined ? parseFloat(lng) : null,
    },
  };
};

/**
 * Validar fecha de entrega
 */
const validateDeliveryDate = (fecha) => {
  if (!fecha) {
    return { isValid: true, value: null }; // Fecha opcional
  }

  const deliveryDate = new Date(fecha);

  if (isNaN(deliveryDate.getTime())) {
    return { isValid: false, message: "Fecha inválida" };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (deliveryDate < today) {
    return {
      isValid: false,
      message: "Fecha de entrega no puede ser en el pasado",
    };
  }

  // Máximo 30 días en el futuro
  const maxDate = new Date();
  maxDate.setDate(maxDate.getDate() + 30);

  if (deliveryDate > maxDate) {
    return { isValid: false, message: "Fecha de entrega máxima: 30 días" };
  }

  return { isValid: true, value: deliveryDate.toISOString().split("T")[0] };
};

/**
 * Validar placa de vehículo boliviano
 */
const validatePlate = (placa) => {
  if (!placa || typeof placa !== "string") {
    return { isValid: false, message: "Placa es requerida" };
  }

  const cleanPlate = placa.toUpperCase().replace(/[\s\-]/g, "");

  // Formato boliviano: ABC-123 o ABC123 (3 letras, 3 números)
  if (!/^[A-Z]{3}\d{3}$/.test(cleanPlate)) {
    return { isValid: false, message: "Placa debe ser formato ABC123" };
  }

  return { isValid: true, value: cleanPlate };
};

/**
 * Validar capacidad de vehículo
 */
const validateVehicleCapacity = (capacidad) => {
  if (!capacidad && capacidad !== 0) {
    return { isValid: false, message: "Capacidad es requerida" };
  }

  const numCapacidad = parseFloat(capacidad);

  if (isNaN(numCapacidad)) {
    return { isValid: false, message: "Capacidad debe ser un número" };
  }

  if (numCapacidad <= 0) {
    return { isValid: false, message: "Capacidad debe ser mayor a 0" };
  }

  if (numCapacidad > 50) {
    return { isValid: false, message: "Capacidad máxima: 50 m³" };
  }

  return { isValid: true, value: numCapacidad };
};

/**
 * Validar estado de vehículo
 */
const validateVehicleStatus = (estado) => {
  const validStatuses = ["disponible", "en_uso", "mantenimiento", "averiado"];

  if (!estado || !validStatuses.includes(estado)) {
    return {
      isValid: false,
      message: `Estado debe ser uno de: ${validStatuses.join(", ")}`,
    };
  }

  return { isValid: true, value: estado };
};

/**
 * Validar datos de registro de usuario
 */
const validateUserRegistration = (userData) => {
  const errors = [];
  const validData = {};

  // Email
  const emailValidation = validateEmail(userData.email);
  if (!emailValidation.isValid) {
    errors.push({ field: "email", message: emailValidation.message });
  } else {
    validData.email = emailValidation.value;
  }

  // Contraseña
  const passwordValidation = validatePassword(userData.password);
  if (!passwordValidation.isValid) {
    errors.push({ field: "password", message: passwordValidation.message });
  } else {
    validData.password = passwordValidation.value;
  }

  // Nombre
  const nameValidation = validateName(userData.nombre, "Nombre");
  if (!nameValidation.isValid) {
    errors.push({ field: "nombre", message: nameValidation.message });
  } else {
    validData.nombre = nameValidation.value;
  }

  // Apellido
  const lastNameValidation = validateName(userData.apellido, "Apellido");
  if (!lastNameValidation.isValid) {
    errors.push({ field: "apellido", message: lastNameValidation.message });
  } else {
    validData.apellido = lastNameValidation.value;
  }

  // Teléfono (opcional)
  const phoneValidation = validatePhone(userData.telefono);
  if (!phoneValidation.isValid) {
    errors.push({ field: "telefono", message: phoneValidation.message });
  } else {
    validData.telefono = phoneValidation.value;
  }

  // Rol (solo para admin que crea usuarios)
  if (userData.rol) {
    const roleValidation = validateUserRole(userData.rol);
    if (!roleValidation.isValid) {
      errors.push({ field: "rol", message: roleValidation.message });
    } else {
      validData.rol = roleValidation.value;
    }
  }

  return {
    isValid: errors.length === 0,
    errors,
    validData,
  };
};

/**
 * Validar datos de pedido
 */
const validateOrderData = (orderData) => {
  const errors = [];
  const validData = {};

  // Material ID
  if (
    !orderData.material_id ||
    !Number.isInteger(Number(orderData.material_id))
  ) {
    errors.push({ field: "material_id", message: "ID de material inválido" });
  } else {
    validData.material_id = parseInt(orderData.material_id);
  }

  // Cantidad
  const quantityValidation = validateQuantity(orderData.cantidad);
  if (!quantityValidation.isValid) {
    errors.push({ field: "cantidad", message: quantityValidation.message });
  } else {
    validData.cantidad = quantityValidation.value;
  }

  // Dirección
  const addressValidation = validateAddress(orderData.direccion_entrega);
  if (!addressValidation.isValid) {
    errors.push({
      field: "direccion_entrega",
      message: addressValidation.message,
    });
  } else {
    validData.direccion_entrega = addressValidation.value;
  }

  // Coordenadas (opcionales)
  const coordsValidation = validateCoordinates(
    orderData.direccion_lat,
    orderData.direccion_lng
  );
  if (!coordsValidation.isValid) {
    errors.push({ field: "coordenadas", message: coordsValidation.message });
  } else {
    validData.direccion_lat = coordsValidation.value.lat;
    validData.direccion_lng = coordsValidation.value.lng;
  }

  // Teléfono de contacto (opcional pero recomendado)
  const phoneValidation = validatePhone(orderData.telefono_contacto);
  if (!phoneValidation.isValid) {
    errors.push({
      field: "telefono_contacto",
      message: phoneValidation.message,
    });
  } else {
    validData.telefono_contacto = phoneValidation.value;
  }

  // Fecha de entrega (opcional)
  const dateValidation = validateDeliveryDate(
    orderData.fecha_entrega_solicitada
  );
  if (!dateValidation.isValid) {
    errors.push({
      field: "fecha_entrega_solicitada",
      message: dateValidation.message,
    });
  } else {
    validData.fecha_entrega_solicitada = dateValidation.value;
  }

  return {
    isValid: errors.length === 0,
    errors,
    validData,
  };
};

/**
 * Sanitizar texto (prevenir XSS básico)
 */
const sanitizeText = (text) => {
  if (!text || typeof text !== "string") return text;

  return text
    .trim()
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#x27;")
    .replace(/\//g, "&#x2F;");
};

/**
 * Validar ID numérico
 */
const validateId = (id, fieldName = "ID") => {
  if (!id) {
    return { isValid: false, message: `${fieldName} es requerido` };
  }

  const numId = parseInt(id);

  if (isNaN(numId) || numId <= 0) {
    return {
      isValid: false,
      message: `${fieldName} debe ser un número positivo`,
    };
  }

  return { isValid: true, value: numId };
};

module.exports = {
  // Validaciones básicas
  validateEmail,
  validatePassword,
  validateName,
  validatePhone,
  validateUserRole,

  // Validaciones de negocio
  validateQuantity,
  validatePrice,
  validateAddress,
  validateCoordinates,
  validateDeliveryDate,

  // Validaciones de vehículos
  validatePlate,
  validateVehicleCapacity,
  validateVehicleStatus,

  // Validaciones compuestas
  validateUserRegistration,
  validateOrderData,

  // Utilidades
  sanitizeText,
  validateId,
};
