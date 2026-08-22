import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Não autorizado. Falta cabeçalho de autenticação.' });
    }
    const token = authHeader.split(' ')[1];
    
    // Validar token com o Supabase Auth para garantir segurança
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida ou expirada.' });
    }

    const { tenantId, clientId } = req.query;

    if (!tenantId || !clientId) {
      return res.status(400).json({ error: 'Faltam parâmetros de busca.' });
    }

    // Certificar-se de que o usuário só está buscando a própria assinatura
    if (user.id !== clientId) {
      return res.status(403).json({ error: 'Acesso negado. Você só pode ler suas próprias assinaturas.' });
    }

    // Busca bypassando RLS usando a Service Role Key
    const { data, error } = await supabase
      .from('client_subscriptions')
      .select('*, plan:tenant_client_plans(*)')
      .eq('tenant_id', tenantId)
      .eq('client_id', clientId)
      .eq('status', 'active');

    if (error) {
      console.error('Erro ao buscar assinatura via get-subscription:', error);
      return res.status(500).json({ error: 'Erro no banco de dados' });
    }

    return res.status(200).json(data);
  } catch (err) {
    console.error('Erro detalhado no get-subscription:', err);
    return res.status(500).json({ error: 'Erro inesperado.' });
  }
}
