// Edge Function: admin-usuarios
//
// Único lugar donde se usa la SERVICE ROLE KEY (nunca debe llegar al
// navegador). Permite a un ADMIN autenticado crear o eliminar cuentas de
// auxiliares/administradores. Verifica primero, con el JWT de quien llama,
// que su perfil tenga rol = 'ADMIN' antes de tocar auth.users.
//
// Deploy: supabase functions deploy admin-usuarios
// (SUPABASE_URL, SUPABASE_ANON_KEY y SUPABASE_SERVICE_ROLE_KEY los inyecta
// Supabase automáticamente en runtime, no hace falta configurarlos a mano).

import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function respuesta(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) throw new Error('Falta el header Authorization');

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    // Cliente con el JWT de quien llama: para saber quién es y validar su rol.
    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: userData, error: userError } = await callerClient.auth.getUser();
    if (userError || !userData?.user) throw new Error('No autenticado');

    const { data: perfilCaller, error: perfilError } = await callerClient
      .from('perfiles_auxiliares')
      .select('rol')
      .eq('id', userData.user.id)
      .single();
    if (perfilError || perfilCaller?.rol !== 'ADMIN') {
      throw new Error('Solo un administrador puede gestionar usuarios');
    }

    // Cliente con privilegios totales, solo tras confirmar que quien llama es ADMIN.
    const adminClient = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();

    if (body.accion === 'crear') {
      const { email, password, nombres, dni, rol, turno, secciones } = body;

      if (!email || !password || !nombres || !rol) {
        throw new Error('Faltan campos obligatorios: email, password, nombres, rol');
      }
      if (rol === 'AUXILIAR' && !turno) {
        throw new Error('Un auxiliar necesita un turno asignado');
      }

      const { data: nuevoUsuario, error: crearError } = await adminClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });
      if (crearError) throw crearError;

      const { error: perfilInsertError } = await adminClient.from('perfiles_auxiliares').insert({
        id: nuevoUsuario.user.id,
        nombres,
        email,
        dni: dni || null,
        rol,
        turno: rol === 'ADMIN' ? null : turno,
      });
      if (perfilInsertError) {
        await adminClient.auth.admin.deleteUser(nuevoUsuario.user.id);
        throw perfilInsertError;
      }

      if (rol === 'AUXILIAR' && Array.isArray(secciones) && secciones.length > 0) {
        const filas = secciones.map((s) => ({
          auxiliar_id: nuevoUsuario.user.id,
          grado: s.grado,
          seccion: s.seccion,
        }));
        const { error: seccionesError } = await adminClient.from('auxiliar_secciones').insert(filas);
        if (seccionesError) {
          await adminClient.auth.admin.deleteUser(nuevoUsuario.user.id);
          throw seccionesError;
        }
      }

      return respuesta({ id: nuevoUsuario.user.id });
    }

    if (body.accion === 'eliminar') {
      const { id } = body;
      if (!id) throw new Error('Falta el id del usuario a eliminar');
      if (id === userData.user.id) throw new Error('No puedes eliminar tu propia cuenta');

      const { error: deleteError } = await adminClient.auth.admin.deleteUser(id);
      if (deleteError) throw deleteError;

      return respuesta({ ok: true });
    }

    if (body.accion === 'cambiar_password') {
      const { id, password } = body;
      if (!id || !password) throw new Error('Faltan id y password');

      const { error: updateError } = await adminClient.auth.admin.updateUserById(id, { password });
      if (updateError) throw updateError;

      return respuesta({ ok: true });
    }

    throw new Error('Acción no reconocida');
  } catch (err) {
    return respuesta({ error: err.message }, 400);
  }
});
