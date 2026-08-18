-- ============================================================================
-- Siembra de los 7 auxiliares reales del colegio.
--
-- PASO PREVIO OBLIGATORIO (una vez por auxiliar):
--   Supabase Dashboard → Authentication → Users → Add user
--   Crea una cuenta (email + contraseña) para cada uno de los 7 auxiliares
--   listados abajo, copia el UUID que Supabase le asigna, y reemplaza el
--   placeholder <UUID_...> y <EMAIL_...> correspondiente antes de ejecutar
--   este script en el SQL Editor.
--
-- Requiere haber corrido sql/schema.sql (o la migración) primero.
-- ============================================================================

-- 1) PALACIOS DÍAZ, Juan Mario — DNI 29087177 — Turno Mañana
--    3°A, 4°B, 4°C, 4°D, 4°E
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_PALACIOS>', 'Juan Mario Palacios Díaz', '<EMAIL_PALACIOS>', '29087177', 'AUXILIAR', 'MANANA');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_PALACIOS>', '3°', 'A'),
  ('<UUID_PALACIOS>', '4°', 'B'),
  ('<UUID_PALACIOS>', '4°', 'C'),
  ('<UUID_PALACIOS>', '4°', 'D'),
  ('<UUID_PALACIOS>', '4°', 'E');

-- 2) COLQUICHAGUA LEÓN, Míriam Lucy — DNI 08329423 — Turno Mañana
--    2°E, 3°B, 3°C, 3°D, 3°E
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_COLQUICHAGUA>', 'Míriam Lucy Colquichagua León', '<EMAIL_COLQUICHAGUA>', '08329423', 'AUXILIAR', 'MANANA');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_COLQUICHAGUA>', '2°', 'E'),
  ('<UUID_COLQUICHAGUA>', '3°', 'B'),
  ('<UUID_COLQUICHAGUA>', '3°', 'C'),
  ('<UUID_COLQUICHAGUA>', '3°', 'D'),
  ('<UUID_COLQUICHAGUA>', '3°', 'E');

-- 3) HUAMANCULI TORRES, Hugo — DNI 41543065 — Turno Mañana
--    2°A, 2°B, 2°C, 2°D, 4°A
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_HUAMANCULI>', 'Hugo Huamanculi Torres', '<EMAIL_HUAMANCULI>', '41543065', 'AUXILIAR', 'MANANA');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_HUAMANCULI>', '2°', 'A'),
  ('<UUID_HUAMANCULI>', '2°', 'B'),
  ('<UUID_HUAMANCULI>', '2°', 'C'),
  ('<UUID_HUAMANCULI>', '2°', 'D'),
  ('<UUID_HUAMANCULI>', '4°', 'A');

-- 4) GUTIÉRREZ JUSCAMAITA, Guillermo Wilfredo — DNI 42893266 — Turno Tarde
--    1°F, 1°G, 1°H, 2°F, 2°G, 2°H, 3°H
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_GUTIERREZ_J>', 'Guillermo Wilfredo Gutiérrez Juscamaita', '<EMAIL_GUTIERREZ_J>', '42893266', 'AUXILIAR', 'TARDE');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_GUTIERREZ_J>', '1°', 'F'),
  ('<UUID_GUTIERREZ_J>', '1°', 'G'),
  ('<UUID_GUTIERREZ_J>', '1°', 'H'),
  ('<UUID_GUTIERREZ_J>', '2°', 'F'),
  ('<UUID_GUTIERREZ_J>', '2°', 'G'),
  ('<UUID_GUTIERREZ_J>', '2°', 'H'),
  ('<UUID_GUTIERREZ_J>', '3°', 'H');

-- 5) ENCISO TORRES, Saturnino — DNI 28273910 — Turno Mañana
--    1°A, 1°B, 1°C, 1°D, 1°E
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_ENCISO>', 'Saturnino Enciso Torres', '<EMAIL_ENCISO>', '28273910', 'AUXILIAR', 'MANANA');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_ENCISO>', '1°', 'A'),
  ('<UUID_ENCISO>', '1°', 'B'),
  ('<UUID_ENCISO>', '1°', 'C'),
  ('<UUID_ENCISO>', '1°', 'D'),
  ('<UUID_ENCISO>', '1°', 'E');

-- 6) QUISPE FERNANDEZ, Yari Julia — DNI 28459507 — Turno Tarde
--    3°F, 3°G, 4°F, 4°G, 5°F, 5°G, 5°H
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_QUISPE>', 'Yari Julia Quispe Fernandez', '<EMAIL_QUISPE>', '28459507', 'AUXILIAR', 'TARDE');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_QUISPE>', '3°', 'F'),
  ('<UUID_QUISPE>', '3°', 'G'),
  ('<UUID_QUISPE>', '4°', 'F'),
  ('<UUID_QUISPE>', '4°', 'G'),
  ('<UUID_QUISPE>', '5°', 'F'),
  ('<UUID_QUISPE>', '5°', 'G'),
  ('<UUID_QUISPE>', '5°', 'H');

-- 7) GUTIÉRREZ PALOMINO, Yamir Guillermo — DNI 72537596 — Turno Mañana
--    5°A, 5°B, 5°C, 5°D, 5°E
insert into perfiles_auxiliares (id, nombres, email, dni, rol, turno) values
  ('<UUID_GUTIERREZ_P>', 'Yamir Guillermo Gutiérrez Palomino', '<EMAIL_GUTIERREZ_P>', '72537596', 'AUXILIAR', 'MANANA');
insert into auxiliar_secciones (auxiliar_id, grado, seccion) values
  ('<UUID_GUTIERREZ_P>', '5°', 'A'),
  ('<UUID_GUTIERREZ_P>', '5°', 'B'),
  ('<UUID_GUTIERREZ_P>', '5°', 'C'),
  ('<UUID_GUTIERREZ_P>', '5°', 'D'),
  ('<UUID_GUTIERREZ_P>', '5°', 'E');
