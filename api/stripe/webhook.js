// api/stripe/webhook.js
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

// Obrigatório para o Stripe Webhook funcionar na Vercel
export const config = {
  api: {
    bodyParser: false,
  },
};

// Função auxiliar para ler o raw body (buffer) na Vercel
async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) {
    chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.SUPABASE_SERVICE_ROLE_KEY || ''
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { tenantId } = req.query;
  if (!tenantId) {
    return res.status(400).json({ error: 'Missing tenantId in webhook URL' });
  }

  // Buscar integrações do Lojista
  const { data: integration, error: integrationError } = await supabase
    .from('tenant_integrations')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('tenant_id', tenantId)
    .single();

  if (integrationError || !integration?.stripe_secret_key || !integration?.stripe_webhook_secret) {
    console.error('Tenant missing Stripe integration or error:', integrationError);
    return res.status(400).json({ error: 'Lojista não configurou corretamente as credenciais do Stripe.' });
  }

  const stripe = new Stripe(integration.stripe_secret_key);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, integration.stripe_webhook_secret);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Verifica se é uma assinatura para planos de cliente (usando o metadata)
        if (session.mode === 'subscription' && session.metadata?.plan_id) {
          const { client_id, tenant_id, plan_id } = session.metadata;
          const subscriptionId = session.subscription;
          const customerId = session.customer;

          // Busca dados da subscription no Stripe para pegar o vencimento
          const subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
          const currentPeriodEnd = new Date(subscriptionDetails.current_period_end * 1000).toISOString();

          const { error } = await supabase
            .from('client_subscriptions')
            .insert([{
              tenant_id,
              client_id,
              plan_id,
              stripe_subscription_id: subscriptionId,
              stripe_customer_id: customerId,
              status: subscriptionDetails.status, // geralmente 'active'
              current_period_end: currentPeriodEnd,
              used_free_appointments_this_cycle: 0
            }]);

          if (error) console.error('Erro ao inserir assinatura:', error);
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscriptionDetails = await stripe.subscriptions.retrieve(invoice.subscription);
          const currentPeriodEnd = new Date(subscriptionDetails.current_period_end * 1000).toISOString();

          // Renova período e zera agendamentos grátis utilizados
          const { error } = await supabase
            .from('client_subscriptions')
            .update({ 
              status: subscriptionDetails.status,
              current_period_end: currentPeriodEnd,
              used_free_appointments_this_cycle: 0,
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', invoice.subscription);
            
          if (error) console.error('Erro ao renovar assinatura:', error);
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'customer.subscription.deleted': {
        const obj = event.data.object;
        const subscriptionId = obj.subscription || obj.id;
        
        let newStatus = event.type === 'customer.subscription.deleted' ? 'canceled' : 'past_due';
        
        if (subscriptionId) {
          const { error } = await supabase
            .from('client_subscriptions')
            .update({ 
              status: newStatus,
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', subscriptionId);
            
          if (error) console.error('Erro ao inativar assinatura:', error);
        }
        break;
      }

      default:
        console.log(`Evento não tratado: ${event.type}`);
    }
  } catch (dbError) {
    console.error('Erro no processamento do BD no Webhook:', dbError);
  }

  res.status(200).json({ received: true });
}