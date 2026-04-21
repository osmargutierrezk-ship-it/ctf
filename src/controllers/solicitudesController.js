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

const getBaseUrl = (req) =>
  process.env.APP_URL || `${req.protocol}://${req.get('host')}`;

const parseDocumentos = (docs) =>
  typeof docs === 'string' ? JSON.parse(docs) : docs;

// ── POST /api/solicitudes ───────────────────────────────────────────────────
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
       VALUES ($1, $2, $3, $4, 'PENDIENTE', $5) RETURNING *`,
      [idUnico, JSON.stringify(sanitizedDocs), usuario.id, usuario.nombre, linkUnico]
    );

    // Log de creación
    await query(
      `INSERT INTO logs_solicitudes (solicitud_id, usuario_id, usuario_nombre, usuario_rol, accion, detalle)
       VALUES ($1, $2, $3, $4, 'CREADO', 'Solicitud creada por contador')`,
      [idUnico, usuario.id, usuario.nombre, usuario.rol]
    );

    console.log(`[SOLICITUD] Nueva solicitud creada: ${idUnico} por ${usuario.username} (${sanitizedDocs.length} documentos)`);

    const fullUrl = `${baseUrl}/scan/${idUnico}`;
    const qrDataUrl = await generateQRDataURL(fullUrl);

    return res.status(201).json({
      message: 'Solicitud creada exitosamente',
      solicitud: { ...result.rows[0], documentos: sanitizedDocs },
      qrDataUrl,
      linkCompleto: fullUrl,
    });
  } catch (error) {
    if (error.message && !error.code) return res.status(400).json({ error: error.message });
    next(error);
  }
};

// ── GET /api/solicitudes ────────────────────────────────────────────────────
const listarSolicitudes = async (req, res, next) => {
  try {
    const usuario = req.user;
    const { estado, page = 1, limit = 20 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    const params = [];
    let whereClause = '';

    if (usuario.rol === 'CONTADOR') {
      params.push(usuario.id);
      whereClause = `WHERE s.usuario_id = $${params.length}`;
    }
    if (estado && ['PENDIENTE', 'EN_PROCESO', 'RECIBIDO'].includes(estado)) {
      params.push(estado);
      whereClause += whereClause
        ? ` AND s.estado = $${params.length}`
        : `WHERE s.estado = $${params.length}`;
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
      solicitudes: result.rows.map((s) => ({ ...s, documentos: parseDocumentos(s.documentos) })),
      total: parseInt(countResult.rows[0].count),
      page: parseInt(page),
      limit: parseInt(limit),
    });
  } catch (error) { next(error); }
};

// ── GET /api/solicitudes/stats ──────────────────────────────────────────────
const obtenerStats = async (req, res, next) => {
  try {
    const usuario = req.user;
    const whereUser = usuario.rol === 'CONTADOR' ? `WHERE usuario_id = ${usuario.id}` : '';
    const result = await query(`
      SELECT
        COUNT(*) FILTER (WHERE estado = 'PENDIENTE')   AS pendientes,
        COUNT(*) FILTER (WHERE estado = 'EN_PROCESO')  AS en_proceso,
        COUNT(*) FILTER (WHERE estado = 'RECIBIDO')    AS recibidos,
        COUNT(*)                                        AS total
      FROM solicitudes ${whereUser}
    `);
    return res.status(200).json(result.rows[0]);
  } catch (error) { next(error); }
};

// ── GET /api/solicitudes/:id ────────────────────────────────────────────────
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
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Solicitud no encontrada' });

    const solicitud = result.rows[0];
    if (usuario.rol === 'CONTADOR' && solicitud.usuario_id !== usuario.id)
      return res.status(403).json({ error: 'No tienes acceso a esta solicitud' });

    const baseUrl = getBaseUrl(req);
    const qrDataUrl = await generateQRDataURL(`${baseUrl}/scan/${solicitud.id_unico}`);

    return res.status(200).json({
      solicitud: { ...solicitud, documentos: parseDocumentos(solicitud.documentos) },
      qrDataUrl,
      linkCompleto: `${baseUrl}/scan/${solicitud.id_unico}`,
    });
  } catch (error) { next(error); }
};

// ── PUT /api/solicitudes/:id/recibir ───────────────────────────────────────
const recibirSolicitud = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = req.user;

    const existing = await query('SELECT * FROM solicitudes WHERE id_unico = $1', [id]);
    if (existing.rows.length === 0)
      return res.status(404).json({ error: 'Solicitud no encontrada' });

    const solicitud = existing.rows[0];

    // ── CONTADOR_OFC: PENDIENTE → EN_PROCESO ───────────────────────────
    if (usuario.rol === 'CONTADOR_OFC') {
      if (solicitud.estado === 'RECIBIDO') {
        return res.status(200).json({
          message: 'Esta solicitud ya fue recibida por Tesorería',
          alreadyReceived: true, solicitud,
        });
      }
      if (solicitud.estado === 'EN_PROCESO') {
        return res.status(200).json({
          message: 'Esta solicitud ya está en proceso',
          alreadyReceived: true, solicitud,
        });
      }

      const result = await query(
        `UPDATE solicitudes
         SET estado = 'EN_PROCESO', fecha_en_proceso = NOW(), usuario_en_proceso_id = $1
         WHERE id_unico = $2 RETURNING *`,
        [usuario.id, id]
      );
      await query(
        `INSERT INTO logs_solicitudes (solicitud_id, usuario_id, usuario_nombre, usuario_rol, accion, detalle)
         VALUES ($1, $2, $3, $4, 'EN_PROCESO', 'Recibido en oficina de contabilidad')`,
        [id, usuario.id, usuario.nombre, usuario.rol]
      );
      console.log(`[QR-SCAN] Solicitud ${id} → EN_PROCESO por ${usuario.username} (CONTADOR_OFC) - ${new Date().toISOString()}`);

      return res.status(200).json({
        message: 'Registrado correctamente — marcado En Proceso',
        solicitud: { ...result.rows[0], documentos: parseDocumentos(result.rows[0].documentos) },
      });
    }

    // ── TESORERIA: cualquier estado → RECIBIDO ─────────────────────────
    if (usuario.rol === 'TESORERIA') {
      if (solicitud.estado === 'RECIBIDO') {
        return res.status(200).json({
          message: 'Esta solicitud ya fue registrada como recibida',
          alreadyReceived: true, solicitud,
        });
      }

      const result = await query(
        `UPDATE solicitudes
         SET estado = 'RECIBIDO', fecha_recepcion = NOW(), usuario_recepcion_id = $1
         WHERE id_unico = $2 RETURNING *`,
        [usuario.id, id]
      );
      await query(
        `INSERT INTO logs_solicitudes (solicitud_id, usuario_id, usuario_nombre, usuario_rol, accion, detalle)
         VALUES ($1, $2, $3, $4, 'RECIBIDO', 'Recibido en Tesorería')`,
        [id, usuario.id, usuario.nombre, usuario.rol]
      );
      console.log(`[QR-SCAN] Solicitud ${id} → RECIBIDO por ${usuario.username} (TESORERIA) - ${new Date().toISOString()}`);

      return res.status(200).json({
        message: 'Registrado correctamente',
        solicitud: { ...result.rows[0], documentos: parseDocumentos(result.rows[0].documentos) },
      });
    }

    return res.status(403).json({ error: 'No tienes acceso' });
  } catch (error) { next(error); }
};

// ── GET /api/solicitudes/:id/logs ──────────────────────────────────────────
const obtenerLogs = async (req, res, next) => {
  try {
    const { id } = req.params;
    const result = await query(
      `SELECT * FROM logs_solicitudes WHERE solicitud_id = $1 ORDER BY fecha ASC`,
      [id]
    );
    return res.status(200).json({ logs: result.rows });
  } catch (error) { next(error); }
};

// ── GET /api/solicitudes/:id/pdf ───────────────────────────────────────────
const descargarPDF = async (req, res, next) => {
  try {
    const { id } = req.params;
    const usuario = req.user;
    const result = await query('SELECT * FROM solicitudes WHERE id_unico = $1', [id]);
    if (result.rows.length === 0)
      return res.status(404).json({ error: 'Solicitud no encontrada' });

    const solicitud = result.rows[0];
    if (usuario.rol === 'CONTADOR' && solicitud.usuario_id !== usuario.id)
      return res.status(403).json({ error: 'No tienes acceso a esta solicitud' });

    const solicitudData = { ...solicitud, documentos: parseDocumentos(solicitud.documentos) };
    const baseUrl = getBaseUrl(req);
    const pdfBuffer = await generateSolicitudPDF(solicitudData, baseUrl);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="CTF-${id.slice(0, 8).toUpperCase()}.pdf"`);
    res.setHeader('Content-Length', pdfBuffer.length);
    console.log(`[PDF] Generado para solicitud: ${id} por ${usuario.username}`);
    return res.send(pdfBuffer);
  } catch (error) { next(error); }
};

module.exports = {
  crearSolicitud, listarSolicitudes, obtenerSolicitud,
  recibirSolicitud, descargarPDF, obtenerStats, obtenerLogs,
};
