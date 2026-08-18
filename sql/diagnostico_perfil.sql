-- Diagnóstico: ¿por qué "no tiene perfil de auxiliar asignado"?
-- Corre esto en el SQL Editor de Supabase y revisa el resultado.

select
  au.id                                          as auth_user_id,
  au.email                                       as auth_email,
  pa.id                                          as perfil_id,
  pa.rol,
  pa.turno,
  (
    select string_agg(concat(s.grado, ' "', s.seccion, '"'), ', ' order by s.grado, s.seccion)
    from auxiliar_secciones s
    where s.auxiliar_id = pa.id
  ) as secciones_asignadas
from auth.users au
left join public.perfiles_auxiliares pa on pa.id = au.id
order by au.created_at desc;
