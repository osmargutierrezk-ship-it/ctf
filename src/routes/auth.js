const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { login, changePassword, setupPassword, me, logout } = require('../controllers/authController');
const { verifyToken } = require('../middleware/auth');

const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Demasiados intentos de login. Intenta de nuevo en 15 minutos.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, login);
router.post('/setup-password', setupPassword);
router.post('/change-password', verifyToken, changePassword);
router.get('/me', verifyToken, me);
router.post('/logout', verifyToken, logout);

module.exports = router;
