-- ============================================================================
-- Migración: permite que un auxiliar cubra VARIAS secciones (de distintos
-- grados) en vez de una sola grado+sección.
-- Ejecútala UNA VEZ sobre una base de datos que ya corrió la versión
-- original de sql/schema.sql (la que tenía grado_asignado/seccion_asignada
-- como columnas únicas en perfiles_auxiliares).
-- Es segura de re-ejecutar (usa IF NOT EXISTS / OR REPLACE / IF EXISTS).
-- ============================================================================

-- 1. Columna DNI de referencia para el auxiliar (opcional).
alter table perfiles_auxiliares add column if not exists dni text unique;

-- 2. Nueva tabla de jurisdicción many-to-many.
create table if not exists auxiliar_secciones (
  auxiliar_id  uuid not null references perfiles_auxiliares(id) on delete cascade,
  grado        text not null,
  seccion      text not null,
  primary key (auxiliar_id, grado, seccion)
);

create index if not exists idx_auxiliar_secciones_auxiliar on auxiliar_secciones (auxiliar_id);

-- 3. Trigger de validación turno <-> sección.
create or replace function public.validar_turno_seccion()
returns trigger
language plpgsql as $$
declare
  v_turno_auxiliar  turno_enum;
  v_turno_esperado  turno_enum;
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

drop trigger if exists trg_validar_turno_seccion on auxiliar_secciones;
create trigger trg_validar_turno_seccion
  before insert or update on auxiliar_secciones
  for each row execute function public.validar_turno_seccion();

-- 4. Migrar datos existentes (si tenías grado_asignado/seccion_asignada
--    ya cargados) hacia la nueva tabla.
insert into auxiliar_secciones (auxiliar_id, grado, seccion)
select id, grado_asignado, upper(seccion_asignada)
from perfiles_auxiliares
where grado_asignado is not null and seccion_asignada is not null
on conflict do nothing;

-- 5. Nueva función de jurisdicción (reemplaza grado_actual()/seccion_actual()).
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

-- 6. Habilitar RLS y políticas sobre la nueva tabla.
alter table auxiliar_secciones enable row level security;

drop policy if exists "auxiliar_secciones_select_propio_o_admin" on auxiliar_secciones;
create policy "auxiliar_secciones_select_propio_o_admin"
  on auxiliar_secciones for select
  using (auxiliar_id = auth.uid() or es_admin());

drop policy if exists "auxiliar_secciones_admin_gestiona" on auxiliar_secciones;
create policy "auxiliar_secciones_admin_gestiona"
  on auxiliar_secciones for all
  using (es_admin())
  with check (es_admin());

-- 7. Reemplazar las políticas de estudiantes/asistencias para que usen
--    tiene_acceso() en vez de grado_actual()/seccion_actual().
drop policy if exists "estudiantes_select_jurisdiccion" on estudiantes;
create policy "estudiantes_select_jurisdiccion"
  on estudiantes for select
  using (
    es_admin()
    or (turno = turno_actual() and tiene_acceso(grado, seccion))
  );

drop policy if exists "asistencias_select_jurisdiccion" on asistencias;
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

drop policy if exists "asistencias_insert_jurisdiccion" on asistencias;
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

-- 8. Limpieza: ya no se usan estas funciones ni columnas.
drop function if exists public.grado_actual();
drop function if exists public.seccion_actual();
alter table perfiles_auxiliares drop column if exists grado_asignado;
alter table perfiles_auxiliares drop column if exists seccion_asignada;
