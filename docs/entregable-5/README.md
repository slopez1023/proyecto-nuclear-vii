# Entregable 5 — Módulo Web de Administración y Continuidad Musical

Módulo administrativo y de control de reproducción (DJ) para **PONGA (Proyecto Nuclear VII)**. Construido como capa aditiva sobre los entregables 3 y 4 sin modificar ningún archivo existente.

## Requisitos

- Node.js `>= 20`
- PostgreSQL 16 (el mismo servicio definido en `backend/docker-compose.yml`)
- Dependencias de `backend/` instaladas (`npm ci` o `npm install`)

## Variables de entorno

Utiliza el archivo `backend/.env` existente (copia de `backend/.env.example`):

- `DATABASE_URL=postgres://ponga:ponga@localhost:5433/ponga`
- `DATABASE_URL_TEST=postgres://ponga:ponga@localhost:5433/ponga_test` (para pruebas de integración)
- `PUBLIC_BASE_URL=http://localhost:3000` (o URL pública HTTPS en producción)
- `YOUTUBE_API_KEY=...` (opcional para búsqueda en vivo)
- `CATALOGO_SEMILLA=true` (recomendado en desarrollo/demos para precargar canciones)
- `E5_ADMIN_CLAVE` y `E5_DJ_CLAVE` (opcionales; si no existen usuarios al arrancar por primera vez en `EST-MOCK-001`, crea `admin` / `AdminPonga2026!` y `dj` / `DjPonga2026!`)

## Cómo ejecutar el módulo

```bash
cd backend
npm run db:up
node src/e5/server-e5.js
```

Al iniciar:
1. Aplica automáticamente las migraciones del E4 (`backend/migrations/`) y las del E5 (`backend/migrations-e5/`).
2. Expone el backend completo (E3 + E4 + E5) en `http://localhost:3000`.
3. Expone el **panel web** en `http://localhost:3000/admin`.

## Crear o actualizar usuarios del personal

```bash
cd backend
node scripts/e5-crear-usuario.js <id_establecimiento> <usuario> <admin|dj> <clave> [Nombre Completo]
```

Ejemplo:
```bash
node scripts/e5-crear-usuario.js EST-MOCK-001 laura admin MiClaveSegura1 "Laura Pérez"
```

## Cómo ejecutar las pruebas

Pruebas unitarias (sin base de datos):
```bash
cd backend
node --test test/e5-unidad.test.js
```

Pruebas de integración del E5 (requiere PostgreSQL activo y `DATABASE_URL_TEST`):
```bash
cd backend
node --test test/e5-integracion.test.js
```

Pruebas de regresión de E3 y E4:
```bash
cd backend
npm test
```
