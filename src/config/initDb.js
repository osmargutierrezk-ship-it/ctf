const { query } = require('./database');

const initializeDatabase = async () => {
  try {
    console.log('[DB] Inicializando esquema de base de datos...');

    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id            SERIAL PRIMARY KEY,
        nombre        VARCHAR(100)  NOT NULL,
        username      VARCHAR(50)   UNIQUE NOT NULL,
        password_hash VARCHAR(255),
        rol           VARCHAR(20)   NOT NULL CHECK (rol IN ('TESORERIA', 'CONTADOR')),
        primer_login  BOOLEAN       DEFAULT true,
        activo        BOOLEAN       DEFAULT true,
        creado_en     TIMESTAMPTZ   DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS solicitudes (
        id                    SERIAL PRIMARY KEY,
        id_unico              VARCHAR(36)   UNIQUE NOT NULL,
        documentos            JSONB         NOT NULL,
        usuario_id            INTEGER       REFERENCES usuarios(id),
        usuario_nombre        VARCHAR(100),
        estado                VARCHAR(20)   DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE', 'RECIBIDO')),
        fecha_creacion        TIMESTAMPTZ   DEFAULT NOW(),
        fecha_recepcion       TIMESTAMPTZ,
        usuario_recepcion_id  INTEGER       REFERENCES usuarios(id),
        link_unico            VARCHAR(255)  UNIQUE NOT NULL,
        creado_en             TIMESTAMPTZ   DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_solicitudes_estado     ON solicitudes(estado);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario    ON solicitudes(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha      ON solicitudes(fecha_creacion DESC);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_id_unico   ON solicitudes(id_unico);
    `);

    // Seed demo users if none exist
    const userCount = await query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('[DB] Insertando usuarios de demostración...');

      await query(`
        INSERT INTO usuarios (nombre, username, rol, primer_login) VALUES
          ('Ana García',       'tesoreria1',  'TESORERIA', true),
          ('Roberto Méndez',   'tesoreria2',  'TESORERIA', true),
          ('Carlos López',     'contador1',   'CONTADOR',  true),
          ('María Pérez',      'contador2',   'CONTADOR',  true),
          ('Luis Rodríguez',   'contador3',   'CONTADOR',  true)
        ON CONFLICT (username) DO NOTHING
      `);

      console.log('[DB] Usuarios demo creados. Ninguno tiene contraseña todavía.');
      console.log('[DB] Usuarios disponibles: tesoreria1, tesoreria2, contador1, contador2, contador3');
      console.log('[DB] Cada usuario deberá crear su contraseña en el primer login.');
    }

    console.log('[DB] Base de datos inicializada correctamente.');
  } catch (error) {
    console.error('[DB] Error inicializando base de datos:', error.message);
    throw error;
  }
};

module.exports = { initializeDatabase };
