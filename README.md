# Sistema de Asistencia QR — Colegio San Juan

Aplicación web para el control de asistencia escolar mediante códigos QR, con
dos turnos (Mañana / Tarde), reglas de tolerancia por horario, gestión de
auxiliares y reportes de tardanzas.

## Stack

- **Frontend:** React + Vite + Tailwind CSS
- **Backend:** Supabase (PostgreSQL, Auth, Row Level Security, Edge Functions)
- **QR:** `qrcode.react` (generación) + `html5-qrcode` (escaneo)
- **Excel:** `xlsx` (importación de nómina y exportación de reportes)

## Módulos

- **Importar Excel** — carga masiva de estudiantes; asigna turno automáticamente
  según la sección (A–E = Mañana, F–H = Tarde).
- **Generar QR** — carnets con QR por DNI para imprimir o descargar.
- **Escáner de Asistencia** — cámara de puerta con overlay a pantalla completa
  (ASISTIÓ / TARDE / Turno incorrecto) según la hora de marcación.
- **Reportes** (solo admin) — KPIs, ranking de tardanzas, distribución por turno,
  filtro por auxiliar y exportación a Excel.
- **Gestión de Usuarios** (solo admin) — alta/edición/baja de auxiliares y
  administradores, con sus secciones a cargo.

### Horarios

| Turno  | Secciones | Ingreso puntual | Tolerancia (ASISTIÓ) | Tarde        | Salida   |
|--------|-----------|-----------------|----------------------|--------------|----------|
| Mañana | A, B, C, D, E | 07:00–07:10 | hasta 07:10          | desde 07:11  | 12:45    |
| Tarde  | F, G, H       | 12:30–12:40 | hasta 12:40          | desde 12:41  | 18:15    |

## Puesta en marcha

1. Instala dependencias (este proyecto usa **pnpm**):
   ```bash
   pnpm install
   ```
2. Copia `.env.example` a `.env` y completa tus credenciales de Supabase:
   ```
   VITE_SUPABASE_URL=...
   VITE_SUPABASE_ANON_KEY=...
   ```
3. En el SQL Editor de Supabase, ejecuta en orden los scripts de `sql/`:
   - `schema.sql` (instalación nueva) — crea tablas, RLS y funciones.
   - `restringir_reportes_a_admin.sql` — limita los reportes a administradores.
   - `alta_admin.sql` — da de alta tu primer usuario administrador.
4. Despliega la Edge Function de gestión de usuarios:
   ```bash
   pnpm dlx supabase login
   pnpm dlx supabase link --project-ref <TU_PROJECT_REF>
   pnpm dlx supabase functions deploy admin-usuarios
   ```
5. Arranca el entorno de desarrollo:
   ```bash
   pnpm dev
   ```

## Estructura

```
src/
  components/   # Módulos de UI (Importar, Carnets, Escáner, Reportes, Usuarios)
  lib/          # Cliente Supabase y contexto de autenticación
  pages/        # Login
  utils/        # Reglas de turnos y horarios
sql/            # Scripts de base de datos (esquema, migraciones, siembra)
supabase/       # Edge Function admin-usuarios
```
