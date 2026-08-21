# Auditoría de Seguridad y QA — Sistema de Asistencia QR

Fecha: 2026-08-21 · Alcance: frontend (React/Vite), base de datos (Supabase/Postgres + RLS), Edge Function `admin-usuarios`, despliegue (Vercel).

---

## 1. Resumen ejecutivo

El proyecto tiene una **base de seguridad sólida**: toda la autorización real se impone en el servidor con Row Level Security (RLS), la clave peligrosa (service role) nunca llega al navegador, y los reportes están restringidos a administradores en la propia base de datos.

Se aplicaron mejoras de **defensa en profundidad**: cabeceras de seguridad HTTP, CORS restringido en la Edge Function y validación de contraseñas. Quedan **acciones manuales** en el panel de Supabase (sección 5).

| Área | Estado |
|------|--------|
| Secretos expuestos | ✅ Sin problemas |
| Autenticación / sesiones | ✅ Correcto |
| Autorización (RLS) | ✅ Correcto |
| Edge Function (service role) | ✅ Endurecida |
| Cabeceras HTTP | ✅ Agregadas |
| Rate limiting anti-sobrecarga | ⚠️ Requiere config. en Supabase |
| Política de contraseñas | ⚠️ Requiere config. en Supabase |

---

## 2. Sobre las "claves de la base de datos" (importante)

Es normal preocuparse al ver la clave de Supabase en el navegador, pero hay que distinguir dos claves:

- **`anon key` (VITE_SUPABASE_ANON_KEY)** — Es **pública por diseño**. Va en el bundle del navegador y *no es un riesgo*: no da acceso a nada por sí sola. Todo lo que puede hacer está limitado por las políticas RLS. Aunque alguien la copie, solo podrá hacer lo que RLS permita a un usuario **autenticado y autorizado**. Esto es exactamente cómo Supabase está diseñado para funcionar.
- **`service_role key`** — Es la clave peligrosa (ignora RLS). **Nunca está en el frontend.** Solo vive dentro de la Edge Function `admin-usuarios`, que se ejecuta en el servidor de Supabase. ✅

La verdadera protección de tu base de datos **no es esconder la anon key**, sino tener RLS bien configurado — y lo tienes. Verificado: no hay secretos hardcodeados en `src/`, `.env` no está en git (solo `.env.example` con placeholders).

---

## 3. Lo que ya estaba bien

- **RLS activo** en las 4 tablas (`perfiles_auxiliares`, `auxiliar_secciones`, `estudiantes`, `asistencias`).
- Funciones de autorización (`es_admin`, `turno_actual`, `tiene_acceso`) con `SECURITY DEFINER` y `SET search_path = public` (evita secuestro de search_path).
- El auxiliar **solo ve/gestiona su jurisdicción** (turno + secciones asignadas); el admin ve todo.
- Al insertar asistencia, RLS **fuerza** `registrado_por = auth.uid()`: nadie puede falsear quién marcó.
- El reporte (`obtener_reporte_asistencia`) es `SECURITY INVOKER` y **verifica `es_admin()`** antes de devolver datos: aunque un auxiliar llame la RPC con otros parámetros, no puede leer fuera de su alcance.
- La Edge Function valida el **JWT del que llama y que su rol sea ADMIN** *antes* de usar la service role key. Si falla la creación del perfil, hace rollback borrando el usuario de auth.
- El escáner tiene un guard (`procesando` + `pause`) que **evita ráfagas de inserciones** por una misma lectura.
- La autorización de la UI (mostrar/ocultar pantallas de admin) es solo cosmética; la verdadera barrera es RLS en el servidor. ✅ Arquitectura correcta.

---

## 4. Lo que se corrigió en este cambio

### 4.1 Cabeceras de seguridad HTTP (`vercel.json`)
Se agregaron cabeceras que protegen a los usuarios y a tu app:

- **`Content-Security-Policy`** — Restringe de dónde puede cargar recursos y **a qué servidores puede conectarse** el navegador: solo tu app y `*.supabase.co`. Mitiga XSS y exfiltración de datos.
- **`X-Frame-Options: DENY`** + **`frame-ancestors 'none'`** — Impide que **embeban tu app en un iframe** en otro sitio (anti-clickjacking / robo de sesión). Esto responde directamente a "que no puedan acceder desde otros lugares".
- **`Strict-Transport-Security` (HSTS)** — Fuerza HTTPS siempre.
- **`X-Content-Type-Options: nosniff`**, **`Referrer-Policy`**, **`Cross-Origin-Opener-Policy`**.
- **`Permissions-Policy`** — Deshabilita micrófono, geolocalización, pagos, USB; permite **cámara solo a tu propio origen** (necesaria para el escáner).

### 4.2 CORS restringido en la Edge Function
Antes: `Access-Control-Allow-Origin: *` (cualquier web podía invocarla desde el navegador de un admin logueado). Ahora: solo responde a orígenes permitidos — `localhost` (desarrollo), previews `*.vercel.app`, y los dominios que configures en la variable `ORIGENES_PERMITIDOS`. Se agregó también rechazo de métodos distintos de `POST/OPTIONS`.

### 4.3 Validación de contraseñas y de rol
La Edge Function ahora exige **mínimo 8 caracteres** al crear cuenta o cambiar contraseña, y valida que `rol` sea `ADMIN` o `AUXILIAR`.

---

## 5. Acciones manuales pendientes (panel de Supabase / Vercel)

Estas no se pueden hacer desde el código; requieren tu acceso al dashboard:

1. **Configurar `ORIGENES_PERMITIDOS` en la Edge Function.** Tras desplegar en Vercel, en Supabase → Edge Functions → `admin-usuarios` → Settings → variables de entorno, agrega:
   `ORIGENES_PERMITIDOS = https://TU-DOMINIO.vercel.app` (o tu dominio propio; separa varios con comas). Luego re-despliega la función.

2. **Rate limiting / anti-sobrecarga (lo que pediste).** El límite de consultas *no se puede imponer de forma confiable desde el navegador* (un atacante usaría la API directamente). Se controla en Supabase:
   - Auth → Rate Limits: baja los límites de intentos de login/OTP a valores razonables (evita fuerza bruta y sobrecarga).
   - Considera activar el plan/configuración de **restricción de red** o un WAF/proxy (Cloudflare) delante si el uso público lo amerita.
   - RLS ya evita que un auxiliar lea toda la BD; el mayor costo por consulta está acotado por `.limit()` y por los rangos de fecha del reporte.

3. **Política de contraseñas y credenciales filtradas.** Auth → Policies: sube la longitud mínima a 8+ y activa **"Leaked password protection"** (rechaza contraseñas conocidas en filtraciones).

4. **Protege el service_role key.** Nunca lo pongas en variables `VITE_*` (esas van al navegador). Solo debe existir donde Supabase lo inyecta (Edge Functions). Si alguna vez se filtró, **rótalo** en Settings → API.

5. **Variables en Vercel:** confirma que solo estén `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`. **No** agregues el service role.

6. **Confirmación de email:** actualmente las cuentas se crean con `email_confirm: true` (el admin las da de alta). Correcto para un sistema cerrado. Mantén **deshabilitado el auto-registro público** (Auth → Providers → Email → "Enable sign-ups" en OFF) para que nadie se cree cuentas solo.

---

## 6. Checklist de QA de seguridad (para probar manualmente)

- [ ] Un **auxiliar** NO puede abrir Reportes ni Gestión de Usuarios (probar navegando a la ruta directa).
- [ ] Un auxiliar que llame la RPC de reporte con parámetros de otro turno/grado recibe **"Acceso denegado"** o datos vacíos.
- [ ] Un auxiliar solo ve estudiantes/asistencias de **sus secciones**.
- [ ] Invocar la Edge Function `admin-usuarios` **sin token** o con token de auxiliar → 400/403, sin crear nada.
- [ ] Crear usuario con contraseña `<8` caracteres → rechazado.
- [ ] Escanear el mismo QR dos veces el mismo día → "YA REGISTRADO HOY" (constraint `unique(estudiante_id, fecha)`), no duplica.
- [ ] Escanear fuera del horario (antes 5:59am / después 6:59pm) → "FUERA DE HORARIO", no inserta.
- [ ] En producción, revisar en DevTools → Network que la respuesta traiga las cabeceras `Content-Security-Policy`, `X-Frame-Options`, etc.
- [ ] Intentar embeber la app en un `<iframe>` de otra página → bloqueado.

---

## 7. Recomendaciones adicionales (opcionales, a futuro)

- **Chunking del upsert de Excel**: para nóminas muy grandes (>2000 filas), dividir el upsert en lotes de ~500 reduce el pico de carga. Hoy es admin-only, riesgo bajo.
- **Auditoría/logs**: guardar un registro de acciones administrativas (altas/bajas de usuarios) para trazabilidad.
- **2FA para administradores** (Supabase soporta MFA).
- **Code-splitting** del bundle (el escáner y `xlsx` con `import()` dinámico) — es rendimiento, no seguridad.
