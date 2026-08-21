import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    // Autenticação baseada no token do lojista
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const { tenantId, stripeSubscriptionId } = req.body;

    if (!tenantId || !stripeSubscriptionId) {
      return res.status(400).json({ error: 'Missing tenantId or stripeSubscriptionId' });
    }

    // Buscar chave secreta do Lojista
    const { data: integration, error: integrationError } = await supabase
      .from('tenant_integrations')
      .select('stripe_secret_key')
      .eq('tenant_id', tenantId)
      .single();

    if (integrationError || !integration?.stripe_secret_key) {
      console.error('Tenant missing Stripe integration or error:', integrationError);
      return res.status(400).json({ error: 'Lojista não configurou as credenciais do Stripe.' });
    }

    const stripe = new Stripe(integration.stripe_secret_key);

    // Cancelar a assinatura na Stripe
    const deletedSubscription = await stripe.subscriptions.cancel(stripeSubscriptionId);

    // Atualizar no banco de dados para garantir resposta imediata na UI
    if (deletedSubscription.status === 'canceled') {
       const { error: dbError } = await supabase
           .from('client_subscriptions')
           .update({ status: 'canceled', updated_at: new Date().toISOString() })
           .eq('stripe_subscription_id', stripeSubscriptionId);
           
       if (dbError) {
           console.error('Erro ao atualizar DB após cancelamento:', dbError);
       }
    }

    res.status(200).json({ success: true, status: deletedSubscription.status });
  } catch (err) {
    console.error('Detalhe técnico Cancelamento Assinatura:', err);
    res.status(500).json({ error: 'Erro inesperado ao cancelar assinatura. Tente novamente.' });
  }
}
