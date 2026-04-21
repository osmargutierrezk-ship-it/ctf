const { Pool } = require('pg');

let pool;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 3000;

const createPool = () => {
  const config = process.env.DATABASE_URL
    ? {
        connectionString: process.env.DATABASE_URL,
        ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME || 'ctf_db',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        max: 10,
        idleTimeoutMillis: 30000,
        connectionTimeoutMillis: 10000,
      };

  return new Pool(config);
};

const connectWithRetry = async (attempt = 1) => {
  try {
    if (!pool) pool = createPool();
    const client = await pool.connect();
    const result = await client.query('SELECT NOW()');
    client.release();
    console.log(`[DB] Conexión establecida con PostgreSQL. Servidor: ${result.rows[0].now}`);
    return pool;
  } catch (error) {
    console.error(`[DB] Error conectando a la base de datos (intento ${attempt}/${MAX_RETRIES}):`, error.message);
    if (attempt < MAX_RETRIES) {
      console.log(`[DB] Reintentando en ${RETRY_DELAY_MS / 1000} segundos...`);
      await new Promise((res) => setTimeout(res, RETRY_DELAY_MS));
      return connectWithRetry(attempt + 1);
    }
    console.error('[DB] Error conectando a la base de datos - se agotaron los intentos. Saliendo.');
    process.exit(1);
  }
};

const query = async (text, params) => {
  if (!pool) pool = createPool();
  try {
    const start = Date.now();
    const result = await pool.query(text, params);
    const duration = Date.now() - start;
    if (process.env.NODE_ENV !== 'production') {
      console.log(`[DB] Query ejecutado en ${duration}ms | rows: ${result.rowCount}`);
    }
    return result;
  } catch (error) {
    console.error('[DB] Error en query:', error.message);
    throw error;
  }
};

const getClient = async () => {
  if (!pool) pool = createPool();
  const client = await pool.connect();
  const originalQuery = client.query.bind(client);
  const release = client.release.bind(client);

  client.query = (...args) => {
    client.lastQuery = args;
    return originalQuery(...args);
  };

  client.release = () => {
    client.query = originalQuery;
    client.release = release;
    return release();
  };

  return client;
};

module.exports = { connectWithRetry, query, getClient };
