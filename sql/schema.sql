-- ============================================================================
-- SelloDigital San Juan — Esquema de base de datos (Supabase / PostgreSQL)
-- Versión para una instalación NUEVA (base de datos vacía).
-- Si ya ejecutaste una versión anterior de este archivo, usa en su lugar
-- sql/migracion_auxiliares_multi_seccion.sql para actualizar en sitio.
-- Ejecutar completo en el SQL Editor de Supabase, en orden.
-- ============================================================================

create extension if not exists pgcrypto;

-- ----------------------------------------------------------------------------
-- 1. ENUMs
-- ----------------------------------------------------------------------------

create type turno_enum as enum ('MANANA', 'TARDE');
create type estado_asistencia_enum as enum ('ASISTIO', 'TARDE', 'FALTA');

-- ----------------------------------------------------------------------------
-- 2. Tabla perfiles_auxiliares
--    Vinculada 1:1 a auth.users. Define el rol y el turno de cada
--    auxiliar/administrador. Un auxiliar puede cubrir VARIAS secciones
--    (incluso de distintos grados) dentro de su turno: esas asignaciones
--    viven en la tabla auxiliar_secciones (más abajo), no aquí.
-- ----------------------------------------------------------------------------

create table perfiles_auxiliares (
  id          uuid primary key references auth.users(id) on delete cascade,
  nombres     text not null,
  email       text not null,
  dni         text unique,        -- DNI del auxiliar (referencia institucional, opcional)
  rol         text not null default 'AUXILIAR' check (rol in ('ADMIN', 'AUXILIAR')),
  turno       turno_enum,         -- null para ADMIN (acceso a ambos turnos)
  created_at  timestamptz not null default now()
);

comment on table perfiles_auxiliares is
  'Un ADMIN tiene turno = null y ve todo. Un AUXILIAR está restringido a su '
  'turno y a las secciones listadas en auxiliar_secciones.';

-- ----------------------------------------------------------------------------
-- 3. Tabla auxiliar_secciones
--    Jurisdicción real de cada auxiliar: puede cubrir varias combinaciones
--    de grado + sección (ej. 3°A, 4°B, 4°C, 4°D, 4°E para un mismo auxiliar).
-- ----------------------------------------------------------------------------

create table auxiliar_secciones (
  auxiliar_id  uuid not null references perfiles_auxiliares(id) on delete cascade,
  grado        text not null,
  seccion      text not null,
  primary key (auxiliar_id, grado, seccion)
);

create index idx_auxiliar_secciones_auxiliar on auxiliar_secciones (auxiliar_id);

-- Valida que la sección asignada (A-H) sea coherente con el turno del
-- auxiliar (A-E = MANANA, F-H = TARDE), para que nunca se pueda asignar a
-- alguien de turno mañana una sección de la tarde o viceversa.
create or replace function public.validar_turno_seccion()
returns trigger
language plpgsql as $$
declare
  v_turno_auxiliar   turno_enum;
  v_turno_esperado    turno_enum;
begin
  select turno into v_turno_auxiliar from perfiles_auxiliares where id = new.auxiliar_id;

  v_turno_esperado := case
    when upper(new.seccion) in ('A', 'B', 'C', 'D', 'E') then 'MANANA'::turno_enum
    when upper(new.seccion) in ('F', 'G', 'H') then 'TARDE'::turno_enum
    else null
  end;

  if v_turno_esperado is null then
    raise exception 'Sección "%" no reconocida (debe ser A-H)', new.seccion;
  end if;

  if v_turno_auxiliar is not null and v_turno_auxiliar <> v_turno_esperado then
    raise exception 'La sección "%" es de turno %, pero el auxiliar tiene turno %',
      new.seccion, v_turno_esperado, v_turno_auxiliar;
  end if;

  new.seccion := upper(new.seccion);
  return new;
end;
$$;

create trigger trg_validar_turno_seccion
  before insert or update on auxiliar_secciones
  for each row execute function public.validar_turno_seccion();

-- ----------------------------------------------------------------------------
-- 4. Tabla estudiantes
-- ----------------------------------------------------------------------------

create table estudiantes (
  id          uuid primary key default gen_random_uuid(),
  dni         text not null unique,
  nombres     text not null,
  apellidos   text not null,
  grado       text not null,
  seccion     text not null,
  turno       turno_enum not null,
  activo      boolean not null default true,
  created_at  timestamptz not null default now()
);

create index idx_estudiantes_dni on estudiantes (dni);
create index idx_estudiantes_jurisdiccion on estudiantes (turno, grado, seccion);

-- ----------------------------------------------------------------------------
-- 5. Tabla asistencias
-- ----------------------------------------------------------------------------

create table asistencias (
  id             uuid primary key default gen_random_uuid(),
  estudiante_id  uuid not null references estudiantes(id) on delete cascade,
  fecha          date not null default current_date,
  hora_ingreso   time not null,
  estado         estado_asistencia_enum not null,
  registrado_por uuid references auth.users(id),
  created_at     timestamptz not null default now(),
  unique (estudiante_id, fecha)
);

create index idx_asistencias_fecha on asistencias (fecha);
create index idx_asistencias_estudiante on asistencias (estudiante_id);

-- ----------------------------------------------------------------------------
-- 6. Funciones auxiliares (SECURITY DEFINER) para evaluar el perfil del
--    usuario autenticado sin caer en recursión de RLS.
-- ----------------------------------------------------------------------------

create or replace function public.es_admin()
returns boolean
language sql security definer stable set search_path = public as $$
  select coalesce((select rol = 'ADMIN' from perfiles_auxiliares where id = auth.uid()), false);
$$;

create or replace function public.turno_actual()
returns turno_enum
language sql security definer stable set search_path = public as $$
  select turno from perfiles_auxiliares where id = auth.uid();
$$;

-- ¿El usuario autenticado tiene asignada la combinación grado+sección dada?
create or replace function public.tiene_acceso(p_grado text, p_seccion text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from auxiliar_secciones
    where auxiliar_id = auth.uid()
      and grado = p_grado
      and seccion = upper(p_seccion)
  );
$$;

-- ----------------------------------------------------------------------------
-- 7. Row Level Security
-- ----------------------------------------------------------------------------

alter table perfiles_auxiliares enable row level security;
alter table auxiliar_secciones enable row level security;
alter table estudiantes enable row level security;
alter table asistencias enable row level security;

-- perfiles_auxiliares: cada usuario ve su propio perfil; el admin ve todos.
create policy "perfiles_select_propio_o_admin"
  on perfiles_auxiliares for select
  using (id = auth.uid() or es_admin());

create policy "perfiles_admin_gestiona"
  on perfiles_auxiliares for all
  using (es_admin())
  with check (es_admin());

-- auxiliar_secciones: cada auxiliar ve sus propias secciones; el admin gestiona todo.
create policy "auxiliar_secciones_select_propio_o_admin"
  on auxiliar_secciones for select
  using (auxiliar_id = auth.uid() or es_admin());

create policy "auxiliar_secciones_admin_gestiona"
  on auxiliar_secciones for all
  using (es_admin())
  with check (es_admin());

-- estudiantes: el admin ve/gestiona todo; el auxiliar solo ve su jurisdicción
-- (su turno + cualquiera de sus secciones asignadas).
create policy "estudiantes_select_jurisdiccion"
  on estudiantes for select
  using (
    es_admin()
    or (turno = turno_actual() and tiene_acceso(grado, seccion))
  );

create policy "estudiantes_admin_gestiona"
  on estudiantes for insert
  with check (es_admin());

create policy "estudiantes_admin_actualiza"
  on estudiantes for update
  using (es_admin())
  with check (es_admin());

create policy "estudiantes_admin_elimina"
  on estudiantes for delete
  using (es_admin());

-- asistencias: el admin ve/gestiona todo; el auxiliar solo su jurisdicción,
-- y solo puede registrar (insert) marcaciones de estudiantes de su propia
-- jurisdicción, quedando "registrado_por" forzado a su propio uid.
create policy "asistencias_select_jurisdiccion"
  on asistencias for select
  using (
    es_admin()
    or exists (
      select 1 from estudiantes e
      where e.id = asistencias.estudiante_id
        and e.turno = turno_actual()
        and tiene_acceso(e.grado, e.seccion)
    )
  );

create policy "asistencias_insert_jurisdiccion"
  on asistencias for insert
  with check (
    es_admin()
    or (
      registrado_por = auth.uid()
      and exists (
        select 1 from estudiantes e
        where e.id = asistencias.estudiante_id
          and e.turno = turno_actual()
          and tiene_acceso(e.grado, e.seccion)
      )
    )
  );

create policy "asistencias_admin_actualiza"
  on asistencias for update
  using (es_admin())
  with check (es_admin());

create policy "asistencias_admin_elimina"
  on asistencias for delete
  using (es_admin());

-- ----------------------------------------------------------------------------
-- 8. RPC obtener_reporte_asistencia
--    SECURITY INVOKER (por defecto): respeta automáticamente las políticas
--    RLS anteriores, por lo que un auxiliar nunca puede leer datos fuera de
--    su jurisdicción aunque envíe parámetros de otro turno/grado/sección.
--    Cuenta ASISTIO/TARDE contra asistencias reales y FALTA para cada día
--    hábil (lunes a viernes) del rango sin marcación registrada.
-- ----------------------------------------------------------------------------

create or replace function public.obtener_reporte_asistencia(
  p_fecha_inicio date,
  p_fecha_fin    date,
  p_turno        turno_enum default null,
  p_grado        text default null,
  p_seccion      text default null
)
returns table (
  estudiante_id  uuid,
  dni            text,
  nombres        text,
  apellidos      text,
  grado          text,
  seccion        text,
  turno          turno_enum,
  total_asistio  bigint,
  total_tarde    bigint,
  total_falta    bigint,
  total_dias     bigint
)
language plpgsql
security invoker
as $$
begin
  if not es_admin() then
    raise exception 'Acceso denegado: los reportes son exclusivos de administradores';
  end if;

  return query
  select
    e.id,
    e.dni,
    e.nombres,
    e.apellidos,
    e.grado,
    e.seccion,
    e.turno,
    count(*) filter (where a.estado = 'ASISTIO')                     as total_asistio,
    count(*) filter (where a.estado = 'TARDE')                       as total_tarde,
    count(*) filter (where a.estado is null)                         as total_falta,
    count(*)                                                         as total_dias
  from estudiantes e
  cross join lateral generate_series(p_fecha_inicio, p_fecha_fin, interval '1 day') as d(fecha)
  left join asistencias a
    on a.estudiante_id = e.id and a.fecha = d.fecha::date
  where e.activo = true
    and extract(dow from d.fecha) not in (0, 6) -- excluye sábado y domingo
    and (p_turno is null or e.turno = p_turno)
    and (p_grado is null or e.grado = p_grado)
    and (p_seccion is null or e.seccion = p_seccion)
  group by e.id, e.dni, e.nombres, e.apellidos, e.grado, e.seccion, e.turno
  order by total_tarde desc, e.apellidos asc;
end;
$$;

-- ----------------------------------------------------------------------------
-- 9. Alta de un auxiliar/admin (ejecutar manualmente por cada usuario nuevo,
--    después de crearlo en Authentication > Users del panel de Supabase).
--    Para la carga real de los 7 auxiliares del colegio, usa
--    sql/seed_auxiliares.sql como plantilla.
-- ----------------------------------------------------------------------------

-- Ejemplo: auxiliar de turno mañana con varias secciones a cargo
-- insert into perfiles_auxiliares (id, nombres, email, rol, turno)
-- values ('<uuid-de-auth.users>', 'María Pérez', 'maria@sanjuan.edu.pe', 'AUXILIAR', 'MANANA');
-- insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
--   ('<uuid-de-auth.users>', '3°', 'A'),
--   ('<uuid-de-auth.users>', '4°', 'B');

-- Ejemplo: administrador con acceso total
-- insert into perfiles_auxiliares (id, nombres, email, rol)
-- values ('<uuid-de-auth.users>', 'Admin Colegio', 'admin@sanjuan.edu.pe', 'ADMIN');
