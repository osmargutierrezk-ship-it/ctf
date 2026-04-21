const express = require('express');
const router = express.Router();
const { verifyToken, requireRole, requirePasswordSet } = require('../middleware/auth');
const {
  crearSolicitud,
  listarSolicitudes,
  obtenerSolicitud,
  recibirSolicitud,
  descargarPDF,
  obtenerStats,
} = require('../controllers/solicitudesController');

const auth = [verifyToken, requirePasswordSet];

router.get('/stats', auth, obtenerStats);
router.get('/', auth, listarSolicitudes);
router.post('/', auth, requireRole('CONTADOR'), crearSolicitud);
router.get('/:id', auth, obtenerSolicitud);
router.put('/:id/recibir', auth, requireRole('TESORERIA'), recibirSolicitud);
router.get('/:id/pdf', auth, descargarPDF);

module.exports = router;
