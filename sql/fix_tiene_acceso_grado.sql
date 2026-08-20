-- ============================================================================
-- FIX: tiene_acceso() debe comparar el GRADO por su NÚMERO, no por texto exacto.
--
-- Problema
-- --------
-- La jurisdicción del auxiliar (tabla auxiliar_secciones) guarda el grado en
-- formato corto: '3°', '4°'. Pero estudiantes.grado se importa del Excel tal
-- cual viene ('3ro secundaria', '3° secundaria', '3RO', etc.). La versión
-- original de tiene_acceso() comparaba con igualdad EXACTA de texto:
--
--     ... and grado = p_grado          -- '3ro secundaria' = '3°'  → FALSE
--
-- Como nunca coincidía, un AUXILIAR no podía ver a sus alumnos ni registrar
-- asistencia: en el escáner todo salía "NO ENCONTRADO" y el INSERT en
-- asistencias quedaba bloqueado por RLS. El ADMIN no lo notaba porque
-- es_admin() cortocircuita la política antes de llegar a tiene_acceso().
--
-- Solución
-- --------
-- Comparar solo el número de grado (1-5) de ambos lados, replicando en SQL lo
-- que ya hacía gradoNumero() en el cliente. Si algún grado no tuviera número
-- (caso raro), cae a comparar el texto en mayúsculas.
--
-- No hay que tocar las políticas RLS: siguen llamando a tiene_acceso(), solo
-- cambia el cuerpo de la función. Seguro de re-ejecutar (CREATE OR REPLACE).
-- Ejecutar en el SQL Editor de Supabase.
-- ============================================================================

create or replace function public.tiene_acceso(p_grado text, p_seccion text)
returns boolean
language sql security definer stable set search_path = public as $$
  select exists (
    select 1 from auxiliar_secciones
    where auxiliar_id = auth.uid()
      and coalesce(substring(grado   from '\d+'), upper(trim(grado)))
        = coalesce(substring(p_grado from '\d+'), upper(trim(p_grado)))
      and seccion = upper(p_seccion)
  );
$$;
