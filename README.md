# CTF — Control de Traslado de Facturas

Sistema web empresarial para gestionar el traslado de documentos desde Contabilidad hacia Tesorería mediante formularios dinámicos y códigos QR.

---

## Stack Tecnológico

| Capa | Tecnología |
|------|-----------|
| Backend | Node.js 20 + Express 4 |
| Frontend | HTML5 + CSS3 + JS vanilla |
| Base de datos | PostgreSQL 15 |
| Autenticación | JWT + HttpOnly Cookies |
| PDF | PDFKit |
| QR | qrcode |
| Contenedor | Docker (multi-stage) |
| Deploy | Render |

---

## Estructura del Proyecto

```
ctf-app/
├── src/
│   ├── app.js                     # Punto de entrada Express
│   ├── config/
│   │   ├── database.js            # Pool PostgreSQL + reintentos
│   │   └── initDb.js              # Schema + seed inicial
│   ├── middleware/
│   │   ├── auth.js                # JWT verify, requireRole, requirePasswordSet
│   │   └── errorHandler.js        # Global error handler
│   ├── controllers/
│   │   ├── authController.js      # Login, setup, change password
│   │   └── solicitudesController.js # CRUD solicitudes + PDF
│   ├── services/
│   │   ├── qrService.js           # Generación QR (buffer / dataURL)
│   │   └── pdfService.js          # PDF carta con QR embebido
│   └── routes/
│       ├── auth.js
│       └── solicitudes.js
├── public/
│   ├── css/styles.css             # Diseño empresarial morado/naranja
│   ├── js/utils.js                # API client, helpers, sidebar
│   ├── index.html                 # Redirect inteligente
│   ├── login.html                 # Login + setup primer acceso
│   ├── dashboard.html             # Resumen + stats
│   ├── nueva-solicitud.html       # Formulario dinámico de documentos
│   ├── mis-solicitudes.html       # Listado con filtros + modal detalle
│   ├── scan.html                  # Landing page QR
│   └── cambiar-password.html      # Cambio de contraseña
├── Dockerfile                     # Multi-stage, non-root
├── render.yaml                    # Configuración Render Blueprint
├── .env.example                   # Variables de entorno requeridas
└── package.json
```

---

## Variables de Entorno

| Variable | Requerida | Descripción |
|----------|-----------|-------------|
| `DATABASE_URL` | ✅ | Connection string PostgreSQL |
| `JWT_SECRET` | ✅ | Clave secreta JWT (mínimo 32 chars) |
| `APP_URL` | ✅ | URL pública de la app (para links QR) |
| `NODE_ENV` | — | `production` en Render |
| `PORT` | — | Default `3000` |

---

## Correr Localmente

### Prerrequisitos
- Node.js 18+
- PostgreSQL 14+
- Docker (opcional)

### 1. Clonar e instalar

```bash
git clone <repo>
cd ctf-app
npm install
```

### 2. Configurar entorno

```bash
cp .env.example .env
# Edita .env con tus valores locales:
# DATABASE_URL=postgresql://postgres:password@localhost:5432/ctf_db
# JWT_SECRET=mi_secreto_local_muy_seguro_123
# APP_URL=http://localhost:3000
# NODE_ENV=development
```

### 3. Crear la base de datos

```bash
psql -U postgres -c "CREATE DATABASE ctf_db;"
```

### 4. Iniciar el servidor

```bash
# Desarrollo (con auto-reload)
npm run dev

# Producción
npm start
```

El servidor inicia en `http://localhost:3000`.
La base de datos se inicializa automáticamente con las tablas y usuarios de demo.

### Usuarios de demo creados automáticamente

| Usuario | Rol | Contraseña inicial |
|---------|-----|-------------------|
| `tesoreria1` | TESORERIA | *(sin contraseña — crear en primer login)* |
| `tesoreria2` | TESORERIA | *(sin contraseña — crear en primer login)* |
| `contador1` | CONTADOR | *(sin contraseña — crear en primer login)* |
| `contador2` | CONTADOR | *(sin contraseña — crear en primer login)* |
| `contador3` | CONTADOR | *(sin contraseña — crear en primer login)* |

### Correr con Docker localmente

```bash
# Build
docker build -t ctf-app .

# Run
docker run -p 3000:3000 \
  -e DATABASE_URL="postgresql://postgres:password@host.docker.internal:5432/ctf_db" \
  -e JWT_SECRET="mi_secreto_muy_seguro_123abc" \
  -e APP_URL="http://localhost:3000" \
  -e NODE_ENV="production" \
  ctf-app
```

---

## Deploy en Render

### Opción A — Blueprint (recomendado, 1 click)

1. Haz push de este proyecto a un repositorio GitHub.
2. Ve a [render.com](https://render.com) → **New** → **Blueprint**.
3. Conecta el repositorio.
4. Render lee `render.yaml` y crea automáticamente:
   - El servicio web Docker
   - La base de datos PostgreSQL
5. Solo debes configurar manualmente la variable `APP_URL` con la URL que Render asigne.

### Opción B — Manual paso a paso

#### Paso 1: Crear la base de datos

1. En Render Dashboard → **New** → **PostgreSQL**
2. Nombre: `ctf-db`
3. Plan: Free (o Starter para producción)
4. Región: Oregon
5. Click **Create Database**
6. Copia la **Internal Database URL**

#### Paso 2: Crear el servicio web

1. **New** → **Web Service**
2. Conecta tu repositorio GitHub
3. Configuración:
   - **Runtime:** Docker
   - **Dockerfile Path:** `./Dockerfile`
   - **Region:** Oregon (misma que la DB)
   - **Plan:** Free o Starter

4. **Variables de entorno:**

```
NODE_ENV       = production
PORT           = 3000
DATABASE_URL   = [Internal URL de tu PostgreSQL en Render]
JWT_SECRET     = [genera con: openssl rand -base64 48]
APP_URL        = https://[tu-servicio].onrender.com
```

5. Click **Create Web Service**

#### Paso 3: Verificar el deploy

```bash
# Health check
curl https://[tu-app].onrender.com/api/health

# Respuesta esperada:
# {"status":"ok","timestamp":"...","version":"1.0.0"}
```

#### Paso 4: Primer uso

1. Ve a `https://[tu-app].onrender.com`
2. Ingresa con usuario `contador1` (sin contraseña)
3. El sistema pedirá crear una contraseña
4. Ya puedes usar la aplicación

---

## API Reference

### Autenticación

| Método | Ruta | Descripción |
|--------|------|-------------|
| POST | `/api/auth/login` | Login con usuario y contraseña |
| POST | `/api/auth/setup-password` | Crear contraseña (primer acceso) |
| POST | `/api/auth/change-password` | Cambiar contraseña |
| GET | `/api/auth/me` | Obtener usuario actual |
| POST | `/api/auth/logout` | Cerrar sesión |

### Solicitudes

| Método | Ruta | Rol | Descripción |
|--------|------|-----|-------------|
| GET | `/api/solicitudes` | Ambos | Listar (CONTADOR: solo propias) |
| POST | `/api/solicitudes` | CONTADOR | Crear nueva solicitud |
| GET | `/api/solicitudes/stats` | Ambos | Stats del usuario |
| GET | `/api/solicitudes/:id` | Ambos | Detalle de solicitud |
| PUT | `/api/solicitudes/:id/recibir` | TESORERIA | Marcar como recibida |
| GET | `/api/solicitudes/:id/pdf` | Ambos | Descargar PDF |

---

## Lógica de Negocio

### Flujo completo

```
CONTADOR                          TESORERIA
   │                                  │
   ├─ Login                           ├─ Login
   ├─ Crea solicitud con docs         │
   ├─ Sistema genera QR + PDF         │
   ├─ Descarga PDF / muestra QR       │
   │                                  │
   │    (fisicamente entrega docs)     │
   │ ─────────────────────────────▶   │
   │                                  ├─ Escanea QR
   │                                  ├─ Sistema → RECIBIDO
   │                                  ├─ Registra fecha/hora
   │                                  │
   ├─ Estado visible: RECIBIDO        │
```

### Roles y permisos

| Acción | CONTADOR | TESORERIA |
|--------|----------|-----------|
| Crear solicitud | ✅ | ❌ |
| Ver sus solicitudes | ✅ | — |
| Ver todas las solicitudes | — | ✅ |
| Escanear QR / recibir | ❌ | ✅ |
| Descargar PDF | ✅ | ✅ |

### Persistencia de sesión

- **TESORERIA:** Token JWT válido por **30 días** (cookie persistente)
- **CONTADOR:** Token JWT válido por **8 horas**

---

## Seguridad

- Contraseñas hasheadas con **bcrypt** (12 rounds)
- Rate limiting: 10 intentos de login / 15 min
- Helmet.js (headers HTTP seguros)
- Sanitización de inputs
- Cookies `httpOnly` + `secure` + `sameSite: strict`
- Validación en frontend Y backend
- Rutas protegidas por rol
- No se puede registrar usuarios desde la app

---

## Agregar usuarios manualmente

Conecta a la base de datos y ejecuta:

```sql
-- Agregar un contador
INSERT INTO usuarios (nombre, username, rol, primer_login)
VALUES ('Juan García', 'jgarcia', 'CONTADOR', true);

-- Agregar tesorería
INSERT INTO usuarios (nombre, username, rol, primer_login)
VALUES ('Ana López', 'alopez', 'TESORERIA', true);

-- El usuario deberá crear su contraseña en el primer login
```

---

## Logs esperados en consola

```
[DB] Conexión establecida con PostgreSQL. Servidor: 2024-...
[DB] Base de datos inicializada correctamente.
CTF - Control de Traslado Facturas - Servidor corriendo en puerto 3000

[AUTH] Login exitoso: contador1 (CONTADOR)
[SOLICITUD] Nueva solicitud creada: abc-123 por contador1 (3 documentos)
[QR-SCAN] Solicitud abc-123 marcada como RECIBIDA por tesoreria1
[PDF] PDF generado y descargado para solicitud: abc-123 por contador1
```

En caso de fallo de conexión:
```
[DB] Error conectando a la base de datos (intento 1/5): ...
[DB] Reintentando en 3 segundos...
```
