const jwt = require('jsonwebtoken');
const { query } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'ctf_secret_key_change_in_production';

const verifyToken = async (req, res, next) => {
  try {
    let token = null;

    const authHeader = req.headers['authorization'];
    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7);
    }

    if (!token && req.cookies && req.cookies.ctf_token) {
      token = req.cookies.ctf_token;
    }

    if (!token) {
      return res.status(401).json({ error: 'Token de autenticación requerido', code: 'NO_TOKEN' });
    }

    const decoded = jwt.verify(token, JWT_SECRET);

    const result = await query(
      'SELECT id, nombre, username, rol, primer_login, activo FROM usuarios WHERE id = $1 AND activo = true',
      [decoded.id]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Usuario no encontrado o inactivo', code: 'USER_NOT_FOUND' });
    }

    req.user = result.rows[0];
    next();
  } catch (error) {
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ error: 'Sesión expirada, por favor inicia sesión nuevamente', code: 'TOKEN_EXPIRED' });
    }
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ error: 'Token inválido', code: 'INVALID_TOKEN' });
    }
    console.error('[AUTH] Error verificando token:', error.message);
    return res.status(500).json({ error: 'Error interno de autenticación' });
  }
};

const requireRole = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'No autenticado' });
    }
    if (!roles.includes(req.user.rol)) {
      console.warn(`[AUTH] Acceso denegado: usuario ${req.user.username} (rol: ${req.user.rol}) intentó acceder a ruta restringida para: ${roles.join(', ')}`);
      return res.status(403).json({ error: 'No tienes permiso para realizar esta acción', code: 'FORBIDDEN' });
    }
    next();
  };
};

const requirePasswordSet = (req, res, next) => {
  if (req.user && req.user.primer_login) {
    return res.status(403).json({
      error: 'Debes cambiar tu contraseña antes de continuar',
      code: 'PASSWORD_CHANGE_REQUIRED',
    });
  }
  next();
};

const generateToken = (user) => {
  const expiresIn = user.rol === 'TESORERIA' ? '30d' : '8h';
  return jwt.sign(
    { id: user.id, username: user.username, rol: user.rol },
    JWT_SECRET,
    { expiresIn }
  );
};

module.exports = { verifyToken, requireRole, requirePasswordSet, generateToken };
