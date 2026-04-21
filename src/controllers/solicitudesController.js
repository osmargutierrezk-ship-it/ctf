const { v4: uuidv4 } = require('uuid');
const { query } = require('../config/database');
const { generateQRDataURL } = require('../services/qrService');
const { generateSolicitudPDF } = require('../services/pdfService');

const sanitizeDocumentos = (docs) => {
  if (!Array.isArray(docs)) throw new Error('Los documentos deben ser un array');
  if (docs.length === 0) throw new Error('Debe incluir al menos un documento');
  if (docs.length > 100) throw new Error('Máximo 100 documentos por solicitud');
  const sanitized = docs.map((d) => String(d).trim().replace(/[<>'"]/g, ''));
  const invalid = sanitized.filter((d) => d.length === 0 || d.length > 50);
  if (invalid.length > 0) throw new Error('Uno o más documentos tienen formato inválido');
  const unique = [...new Set(sanitized)];
  if (unique.length !== sanitized.length) throw new Error('Hay documentos duplicados en la lista');
  return sanitized;
};

const getBaseUrl = (req) => {
  return process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
};

// POST /api/solicitudes
const crearSolicitud = async (req, res, next) => {
  try {
    const { documentos } = req.body;
    const usuario = req.user;

    const sanitizedDocs = sanitizeDocumentos(documentos);

    const idUnico = uuidv4();
    const baseUrl = getBaseUrl(req);
    const linkUnico = `/scan/${idUnico}`;

    const result = await query(
      `INSERT INTO solicitudes (id_unico, documentos, usuario_id, usuario_nombre, estado, link_unico)
       VALUES ($1, $2, $3, $4, 'PENDIENTE', $5)
       RETURNING *`,
      [idUnico, JSON.stringify(sanitizedDocs), usuario.id, usuario.nombre, linkUnico]
    );

    const solicitud = result.rows[0];
    console.log(`[SOLICITUD] Nueva solicitud creada: ${idUnico} por ${usuario.username} (${sanitizedDocs.length} documentos)`);

    const fullUrl = `${baseUrl}/scan/${idUnico}`;
    const qrDataUrl = await generateQRDataURL(fullUrl);

    return res.status(201).json({
      message: 'Solicitud creada exitosamente',
      solicitud: {
        ...solicitud,
        documentos: sanitizedDocs,
      },
      qrDataUrl,
      linkCompleto: fullUrl,
    });
  } catch (error) {
    if (error.message && !error.code) {
      return res.status(400).json({ error: error.message });
    }
    next(error);
  }
};

// GET /api/solicitudes
const listarSolicitudes = async (req, res, next) => {
  try {
    const usuario = req.user;
    const { estado, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let whereClause = '';
    const params = [];

    if (usuario.rol === 'CONTADOR') {
      params.push(usuario.id);
      whereClause = `WHERE s.usuario_id = $${params.length}`;
    }

    if (estado && ['PENDIENTE', 'RECIBIDO'].includes(estado)) {
      params.push(estado);
      whereClause += whereClause ? ` AND s.estado = $${params.length}` : `WHERE s.estado = $${params.length}`;
    }

    params.push(parseInt(limit));
    params.push(offset);

    const result = await query(
      `SELECT s.*, u.nombre AS receptor_nombre
       FROM solicitudes s
       LEFT JOIN usuarios u ON s.usuario_recepcion_id = u.id
       ${whereClause}
       ORDER BY s.fecha_creacion DESC
       LIMIT $${params.length - 1} OFFSET $${params.length}`,
      params
    );

    const countParams = params.slice(0, params.length - 2);
    const countResult = await query(
      `SELECT COUNT(*) FROM solicitudes s ${whereClause}`,
      countParams
    );

    return res.status(200).json({
      solicitudes: result.rows.map((s) => ({
        ...s,
        documentos: typeof s.documentos === 'string' ? JSON.parse(s.documentos) : s.documentos,
      })),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/solicitudes/:id
const obtenerSolicitud = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const result = await query(
      `SELECT s.*, u.nombre AS receptor_nombre
       FROM solicitudes s
       LEFT JOIN usuarios u ON s.usuario_recepcion_id = u.id
       WHERE s.id_unico = $1`,
      [id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const solicitud = result.rows[0];

    if (usuario.rol === 'CONTADOR' && solicitud.usuario_id !== usuario.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta solicitud' });
    }

    const baseUrl = getBaseUrl(req);
    const fullUrl = `${baseUrl}/scan/${solicitud.id_unico}`;
    const qrDataUrl = await generateQRDataURL(fullUrl);

    return res.status(200).json({
      solicitud: {
        ...solicitud,
        documentos: typeof solicitud.documentos === 'string'
          ? JSON.parse(solicitud.documentos)
          : solicitud.documentos,
      },
      qrDataUrl,
      linkCompleto: fullUrl,
    });
  } catch (error) {
    next(error);
  }
};

// PUT /api/solicitudes/:id/recibir  (solo TESORERIA)
const recibirSolicitud = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const existing = await query('SELECT * FROM solicitudes WHERE id_unico = $1', [id]);
    if (existing.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    if (existing.rows[0].estado === 'RECIBIDO') {
      return res.status(200).json({
        message: 'Esta solicitud ya fue registrada como recibida',
        alreadyReceived: true,
        solicitud: existing.rows[0],
      });
    }

    const result = await query(
      `UPDATE solicitudes
       SET estado = 'RECIBIDO', fecha_recepcion = NOW(), usuario_recepcion_id = $1
       WHERE id_unico = $2
       RETURNING *`,
      [usuario.id, id]
    );

    console.log(`[QR-SCAN] Solicitud recibida: ${id} por ${usuario.username} (TESORERIA) - ${new Date().toISOString()}`);

    return res.status(200).json({
      message: 'Registrado correctamente',
      solicitud: {
        ...result.rows[0],
        documentos: typeof result.rows[0].documentos === 'string'
          ? JSON.parse(result.rows[0].documentos)
          : result.rows[0].documentos,
      },
    });
  } catch (error) {
    next(error);
  }
};

// GET /api/solicitudes/:id/pdf
const descargarPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const result = await query('SELECT * FROM solicitudes WHERE id_unico = $1', [id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Solicitud no encontrada' });
    }

    const solicitud = result.rows[0];
    if (usuario.rol === 'CONTADOR' && solicitud.usuario_id !== usuario.id) {
      return res.status(403).json({ error: 'No tienes acceso a esta solicitud' });
    }

    const solicitudData = {
      ...solicitud,
      documentos: typeof solicitud.documentos === 'string'
        ? JSON.parse(solicitud.documentos)
        : solicitud.documentos,
    };

    const baseUrl = getBaseUrl(req);
    const pdfBuffer = await generateSolicitudPDF(solicitudData, baseUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CTF-${id.slice(0, 8).toUpperCase()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);

    console.log(`[PDF] PDF generado y descargado para solicitud: ${id} por ${usuario.username}`);
    return res.send(pdfBuffer);
  } catch (error) {
    next(error);
  }
};

// GET /api/solicitudes/stats
const obtenerStats = async (req, res, next) => {
  try {
    const usuario = req.user;
    let whereUser = usuario.rol === 'CONTADOR' ? `WHERE usuario_id = ${usuario.id}` : '';

    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'PENDIENTE') AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'RECIBIDO')  AS recibidos,
        COUNT(*)                                       AS total
      FROM solicitudes ${whereUser}
    `);

    return res.status(200).json(result.rows[0]);
  } catch (error) {
    next(error);
  }
};

module.exports = { crearSolicitud, listarSolicitudes, obtenerSolicitud, recibirSolicitud, descargarPDF, obtenerStats };
