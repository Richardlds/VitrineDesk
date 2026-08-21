const { createClient } = require('@supabase/supabase-js');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseServiceKey) {
  throw new Error("Variáveis de ambiente do Supabase não configuradas.");
}

const supabaseService = createClient(supabaseUrl, supabaseServiceKey);

module.exports = async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version, Authorization'
  );

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { tenant_id, message, type } = req.body;

    if (!tenant_id || !message) {
      return res.status(400).json({ error: 'tenant_id and message are required' });
    }

    // Insere a notificação ignorando o RLS
    const { data, error } = await supabaseService
      .from('notifications')
      .insert({
        tenant_id,
        message,
        type: type || 'appointment',
        read: false
      })
      .select();

    if (error) {
      console.error("Erro ao inserir notificação:", error);
      return res.status(500).json({ error: error.message });
    }

    return res.status(200).json({ success: true, data });
  } catch (error) {
    console.error("Unexpected error in create-notification:", error);
    return res.status(500).json({ error: 'Internal Server Error' });
  }
};
