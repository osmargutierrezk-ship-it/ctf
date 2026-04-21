const errorHandler = (err, req, res, next) => {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  if (process.env.NODE_ENV !== 'production') {
    console.error(err.stack);
  }

  if (err.code === '23505') {
    return res.status(409).json({ error: 'Ya existe un registro con esos datos' });
  }
  if (err.code === '23503') {
    return res.status(400).json({ error: 'Referencia a dato que no existe' });
  }
  if (err.code === '42P01') {
    console.error('[DB] Tabla no encontrada - verifica la inicialización de la base de datos');
    return res.status(500).json({ error: 'Error de configuración de base de datos' });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.expose ? err.message : (status === 500 ? 'Error interno del servidor' : err.message);

  res.status(status).json({ error: message });
};

const notFound = (req, res) => {
  res.status(404).json({ error: `Ruta no encontrada: ${req.method} ${req.path}` });
};

module.exports = { errorHandler, notFound };
