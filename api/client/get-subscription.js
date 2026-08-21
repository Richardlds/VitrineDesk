import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tenantId, clientId } = req.query;

  if (!tenantId || !clientId) {
    return res.status(400).json({ error: 'Missing tenantId or clientId' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Missing Authorization header' });
    }
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Unauthorized' });
    }

    const { data, error } = await supabase
      .from('client_subscriptions')
      .select('*, tenant_client_plans(*)')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) {
      console.error('Erro ao buscar assinatura no Supabase (Service Role):', error);
      return res.status(500).json({ error: 'Database error' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro na rota /api/client/get-subscription:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
}
