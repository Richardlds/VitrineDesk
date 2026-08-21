import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
import crypto from 'crypto';

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const { priceId, successUrl, cancelUrl, clientId, tenantId, planId } = req.body;

    if (!priceId || !clientId || !tenantId || !planId) {
      return res.status(400).json({ error: 'Missing required metadata or priceId' });
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

    const idempotencyKey = crypto.randomUUID();
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        client_id: clientId,
        tenant_id: tenantId,
        plan_id: planId
      }
    }, {
      idempotencyKey: idempotencyKey
    });

    res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Detalhe técnico Checkout Assinatura:', err);
    res.status(500).json({ error: 'Erro inesperado ao criar checkout. Tente novamente.' });
  }
}
