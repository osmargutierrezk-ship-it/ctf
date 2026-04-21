const bcrypt = require('bcryptjs');
const { query } = require('../config/database');
const { generateToken } = require('../middleware/auth');

const login = async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ error: 'Usuario y contraseña son requeridos' });
    }

    const sanitizedUsername = username.trim().toLowerCase();

    const result = await query(
      'SELECT id, nombre, username, password_hash, rol, primer_login, activo FROM usuarios WHERE username = $1',
      [sanitizedUsername]
    );

    if (result.rows.length === 0) {
      console.log(`[AUTH] Intento de login fallido - usuario no encontrado: ${sanitizedUsername}`);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const user = result.rows[0];

    if (!user.activo) {
      console.log(`[AUTH] Intento de login de usuario inactivo: ${sanitizedUsername}`);
      return res.status(401).json({ error: 'Tu cuenta está desactivada. Contacta al administrador' });
    }

    if (!user.password_hash) {
      console.log(`[AUTH] Usuario sin contraseña intentó login: ${sanitizedUsername} - requiere configurar contraseña`);
      const tempToken = generateToken({ ...user, primer_login: true });
      return res.status(200).json({
        requiresPasswordSetup: true,
        message: 'Debes crear una contraseña antes de continuar',
        token: tempToken,
        user: { id: user.id, nombre: user.nombre, username: user.username, rol: user.rol },
      });
    }

    const passwordValid = await bcrypt.compare(password, user.password_hash);
    if (!passwordValid) {
      console.log(`[AUTH] Contraseña incorrecta para usuario: ${sanitizedUsername}`);
      return res.status(401).json({ error: 'Credenciales incorrectas' });
    }

    const token = generateToken(user);
    console.log(`[AUTH] Login exitoso: ${user.username} (${user.rol})`);

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
    };

    if (user.rol === 'TESORERIA') {
      cookieOptions.maxAge = 30 * 24 * 60 * 60 * 1000;
    } else {
      cookieOptions.maxAge = 8 * 60 * 60 * 1000;
    }

    res.cookie('ctf_token', token, cookieOptions);

    return res.status(200).json({
      token,
      requiresPasswordChange: user.primer_login,
      user: {
        id: user.id,
        nombre: user.nombre,
        username: user.username,
        rol: user.rol,
        primer_login: user.primer_login,
      },
    });
  } catch (error) {
    next(error);
  }
};

const changePassword = async (req, res, next) => {
  try {
    const { nuevaPassword, confirmarPassword, passwordActual } = req.body;
    const userId = req.user.id;

    if (!nuevaPassword || !confirmarPassword) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (nuevaPassword !== confirmarPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }
    if (nuevaPassword.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!/(?=.*[0-9])(?=.*[a-zA-Z])/.test(nuevaPassword)) {
      return res.status(400).json({ error: 'La contraseña debe contener letras y números' });
    }

    const userResult = await query(
      'SELECT password_hash, primer_login FROM usuarios WHERE id = $1',
      [userId]
    );
    const user = userResult.rows[0];

    if (user.password_hash && !req.user.primer_login) {
      if (!passwordActual) {
        return res.status(400).json({ error: 'Debes ingresar tu contraseña actual' });
      }
      const currentValid = await bcrypt.compare(passwordActual, user.password_hash);
      if (!currentValid) {
        return res.status(401).json({ error: 'Contraseña actual incorrecta' });
      }
    }

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(nuevaPassword, salt);

    await query(
      'UPDATE usuarios SET password_hash = $1, primer_login = false WHERE id = $2',
      [hash, userId]
    );

    console.log(`[AUTH] Contraseña actualizada para usuario ID: ${userId}`);
    res.clearCookie('ctf_token');

    return res.status(200).json({ message: 'Contraseña actualizada correctamente. Por favor inicia sesión nuevamente.' });
  } catch (error) {
    next(error);
  }
};

const setupPassword = async (req, res, next) => {
  try {
    const { username, nuevaPassword, confirmarPassword } = req.body;

    if (!username || !nuevaPassword || !confirmarPassword) {
      return res.status(400).json({ error: 'Todos los campos son requeridos' });
    }
    if (nuevaPassword !== confirmarPassword) {
      return res.status(400).json({ error: 'Las contraseñas no coinciden' });
    }
    if (nuevaPassword.length < 8) {
      return res.status(400).json({ error: 'La contraseña debe tener al menos 8 caracteres' });
    }
    if (!/(?=.*[0-9])(?=.*[a-zA-Z])/.test(nuevaPassword)) {
      return res.status(400).json({ error: 'La contraseña debe contener letras y números' });
    }

    const sanitizedUsername = username.trim().toLowerCase();
    const userResult = await query(
      'SELECT id, nombre, username, rol, activo FROM usuarios WHERE username = $1',
      [sanitizedUsername]
    );

    if (userResult.rows.length === 0) {
      return res.status(404).json({ error: 'Usuario no encontrado' });
    }

    const user = userResult.rows[0];
    if (!user.activo) {
      return res.status(401).json({ error: 'Cuenta desactivada' });
    }

    const salt = await bcrypt.genSalt(12);
    const hash = await bcrypt.hash(nuevaPassword, salt);

    await query(
      'UPDATE usuarios SET password_hash = $1, primer_login = false WHERE id = $2',
      [hash, user.id]
    );

    console.log(`[AUTH] Contraseña configurada por primera vez para usuario: ${user.username}`);

    const token = generateToken({ ...user, primer_login: false });

    const cookieOptions = {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: user.rol === 'TESORERIA' ? 30 * 24 * 60 * 60 * 1000 : 8 * 60 * 60 * 1000,
    };
    res.cookie('ctf_token', token, cookieOptions);

    return res.status(200).json({
      token,
      message: 'Contraseña configurada correctamente',
      user: { id: user.id, nombre: user.nombre, username: user.username, rol: user.rol },
    });
  } catch (error) {
    next(error);
  }
};

const me = async (req, res) => {
  return res.status(200).json({
    user: {
      id: req.user.id,
      nombre: req.user.nombre,
      username: req.user.username,
      rol: req.user.rol,
      primer_login: req.user.primer_login,
    },
  });
};

const logout = (req, res) => {
  res.clearCookie('ctf_token');
  console.log(`[AUTH] Logout: ${req.user?.username}`);
  return res.status(200).json({ message: 'Sesión cerrada correctamente' });
};

module.exports = { login, changePassword, setupPassword, me, logout };
