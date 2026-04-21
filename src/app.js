require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const cookieParser = require('cookie-parser');
const path = require('path');
const rateLimit = require('express-rate-limit');

const { connectWithRetry } = require('./config/database');
const { errorHandler, notFound } = require('./middleware/errorHandler');
const authRoutes = require('./routes/auth');
const solicitudesRoutes = require('./routes/solicitudes');

const app = express();
const PORT = process.env.PORT || 3000;

// ── Security Middleware ──────────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", 'cdn.jsdelivr.net'],
      scriptSrcAttr: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'", 'fonts.googleapis.com'],
      fontSrc: ["'self'", 'fonts.gstatic.com'],
      imgSrc: ["'self'", 'data:', 'blob:'],
      connectSrc: ["'self'"],
    },
  },
}));

app.use(cors({
  origin: process.env.APP_URL || 'http://localhost:3000',
  credentials: true,
}));

app.set('trust proxy', 1);

app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Demasiadas solicitudes. Intenta de nuevo más tarde.' },
}));

// ── General Middleware ───────────────────────────────────────────────────────
app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '1mb' }));
app.use(cookieParser());

// ── Static Files ─────────────────────────────────────────────────────────────
app.use(express.static(path.join(__dirname, '../public'), {
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
}));

// ── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/solicitudes', solicitudesRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// ── SPA Catch-all ─────────────────────────────────────────────────────────────
app.get('/scan/:id', (req, res) => {
  res.sendFile(path.join(__dirname, '../public/scan.html'));
});

app.get(['/dashboard', '/nueva-solicitud', '/mis-solicitudes', '/cambiar-password'], (req, res) => {
  res.sendFile(path.join(__dirname, '../public', req.path.slice(1) + '.html'));
});

// ── Error Handling ────────────────────────────────────────────────────────────
app.use('/api/*', notFound);
app.use(errorHandler);

// ── Start Server ──────────────────────────────────────────────────────────────
const start = async () => {
  try {
    await connectWithRetry();

    const { initializeDatabase } = require('./config/initDb');
    await initializeDatabase();

    app.listen(PORT, '0.0.0.0', () => {
      console.log(`\n╔════════════════════════════════════════╗`);
      console.log(`║   CTF - Control de Traslado Facturas   ║`);
      console.log(`║   Servidor corriendo en puerto ${PORT}     ║`);
      console.log(`║   Entorno: ${(process.env.NODE_ENV || 'development').padEnd(28)}║`);
      console.log(`╚════════════════════════════════════════╝\n`);
    });
  } catch (error) {
    console.error('[APP] Error iniciando servidor:', error.message);
    process.exit(1);
  }
};

process.on('uncaughtException', (err) => {
  console.error('[APP] Excepción no controlada:', err.message);
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  console.error('[APP] Promesa rechazada sin manejar:', reason);
  process.exit(1);
});

start();

module.exports = app;
