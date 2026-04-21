const { query } = require('./database');

const initializeDatabase = async () => {
  try {
    console.log('[DB] Inicializando esquema de base de datos...');

    await query(`
      CREATE TABLE IF NOT EXISTS usuarios (
        id             SERIAL PRIMARY KEY,
        nombre         VARCHAR(100) NOT NULL,
        username       VARCHAR(50)  UNIQUE NOT NULL,
        password_hash  VARCHAR(255),
        rol            VARCHAR(20)  NOT NULL CHECK (rol IN ('TESORERIA','CONTADOR','CONTADOR_OFC')),
        primer_login   BOOLEAN      DEFAULT true,
        activo         BOOLEAN      DEFAULT true,
        creado_en      TIMESTAMPTZ  DEFAULT NOW(),
        actualizado_en TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    // Migrate rol constraint if DB already exists
    await query(`
      DO $$ BEGIN
        ALTER TABLE usuarios DROP CONSTRAINT IF EXISTS usuarios_rol_check;
        ALTER TABLE usuarios ADD CONSTRAINT usuarios_rol_check
          CHECK (rol IN ('TESORERIA','CONTADOR','CONTADOR_OFC'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `);

    await query(`
      CREATE TABLE IF NOT EXISTS solicitudes (
        id                    SERIAL PRIMARY KEY,
        id_unico              VARCHAR(36)   UNIQUE NOT NULL,
        documentos            JSONB         NOT NULL,
        usuario_id            INTEGER       REFERENCES usuarios(id),
        usuario_nombre        VARCHAR(100),
        estado                VARCHAR(20)   DEFAULT 'PENDIENTE' CHECK (estado IN ('PENDIENTE','EN_PROCESO','RECIBIDO')),
        fecha_creacion        TIMESTAMPTZ   DEFAULT NOW(),
        fecha_en_proceso      TIMESTAMPTZ,
        usuario_en_proceso_id INTEGER       REFERENCES usuarios(id),
        fecha_recepcion       TIMESTAMPTZ,
        usuario_recepcion_id  INTEGER       REFERENCES usuarios(id),
        link_unico            VARCHAR(255)  UNIQUE NOT NULL,
        creado_en             TIMESTAMPTZ   DEFAULT NOW()
      )
    `);

    // Migrate estado constraint and add new columns if DB already exists
    await query(`
      DO $$ BEGIN
        ALTER TABLE solicitudes DROP CONSTRAINT IF EXISTS solicitudes_estado_check;
        ALTER TABLE solicitudes ADD CONSTRAINT solicitudes_estado_check
          CHECK (estado IN ('PENDIENTE','EN_PROCESO','RECIBIDO'));
      EXCEPTION WHEN others THEN NULL; END $$;
    `);
    await query(`ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS fecha_en_proceso      TIMESTAMPTZ`);
    await query(`ALTER TABLE solicitudes ADD COLUMN IF NOT EXISTS usuario_en_proceso_id INTEGER REFERENCES usuarios(id)`);

    await query(`
      CREATE TABLE IF NOT EXISTS logs_solicitudes (
        id             SERIAL PRIMARY KEY,
        solicitud_id   VARCHAR(36)  NOT NULL,
        usuario_id     INTEGER      REFERENCES usuarios(id),
        usuario_nombre VARCHAR(100),
        usuario_rol    VARCHAR(20),
        accion         VARCHAR(50)  NOT NULL,
        detalle        TEXT,
        fecha          TIMESTAMPTZ  DEFAULT NOW()
      )
    `);

    await query(`
      CREATE INDEX IF NOT EXISTS idx_solicitudes_estado     ON solicitudes(estado);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_usuario    ON solicitudes(usuario_id);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_fecha      ON solicitudes(fecha_creacion DESC);
      CREATE INDEX IF NOT EXISTS idx_solicitudes_id_unico   ON solicitudes(id_unico);
      CREATE INDEX IF NOT EXISTS idx_logs_solicitud         ON logs_solicitudes(solicitud_id);
      CREATE INDEX IF NOT EXISTS idx_logs_fecha             ON logs_solicitudes(fecha DESC);
    `);

    // Seed demo users if none exist
    const userCount = await query('SELECT COUNT(*) FROM usuarios');
    if (parseInt(userCount.rows[0].count) === 0) {
      console.log('[DB] Insertando usuarios de demostración...');
      await query(`
        INSERT INTO usuarios (nombre, username, rol, primer_login) VALUES
          ('Ana García',       'tesoreria1',    'TESORERIA',    true),
          ('Roberto Méndez',   'tesoreria2',    'TESORERIA',    true),
          ('Carlos López',     'contadorayz',   'CONTADOR',     true),
          ('María Pérez',      'contadorhh1',   'CONTADOR',     true),
          ('Luis Rodríguez',   'contadorhh2',   'CONTADOR',     true),
          ('Oficina Uno',      'contadorofc1',  'CONTADOR_OFC', true),
          ('Oficina Dos',      'contadorofc2',  'CONTADOR_OFC', true)
        ON CONFLICT (username) DO NOTHING
      `);
      console.log('[DB] Usuarios demo: tesoreria1/2, contadorayz, contadorhh1/2, contadorofc1/2');
      console.log('[DB] Cada usuario deberá crear su contraseña en el primer login.');
    }

    console.log('[DB] Base de datos inicializada correctamente.');
  } catch (error) {
    console.error('[DB] Error inicializando base de datos:', error.message);
    throw error;
  }
};

module.exports = { initializeDatabase };
