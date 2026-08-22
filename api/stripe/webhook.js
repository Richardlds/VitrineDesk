import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';

export const config = {
  api: {
    bodyParser: false,
  },
};

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

  let rawBody;
  let unverifiedEvent;
  try {
    rawBody = await buffer(req);
    unverifiedEvent = JSON.parse(rawBody.toString('utf8'));
  } catch (err) {
    return res.status(400).json({ error: 'Failed to parse payload' });
  }

  // 1. Tentar descobrir o Tenant ID
  let tenantId = req.query.tenantId;

  if (!tenantId) {
    const obj = unverifiedEvent.data?.object;
    if (obj?.metadata?.tenant_id) {
      tenantId = obj.metadata.tenant_id;
    } else if (obj?.subscription) {
      // Buscar tenant_id pelo ID da assinatura no nosso banco
      const subId = typeof obj.subscription === 'string' ? obj.subscription : obj.subscription.id;
      const { data } = await supabase
        .from('client_subscriptions')
        .select('tenant_id')
        .eq('stripe_subscription_id', subId)
        .maybeSingle();
      if (data) tenantId = data.tenant_id;
    } else if (obj?.customer) {
      const custId = typeof obj.customer === 'string' ? obj.customer : obj.customer.id;
      const { data } = await supabase
        .from('client_subscriptions')
        .select('tenant_id')
        .eq('stripe_customer_id', custId)
        .maybeSingle();
      if (data) tenantId = data.tenant_id;
    }
  }

  if (!tenantId) {
    console.error('Webhook Error: Could not resolve tenantId for event:', unverifiedEvent.type);
    return res.status(400).json({ error: 'Could not resolve tenantId' });
  }

  // 2. Buscar integração do Lojista
  const { data: integration, error: integrationError } = await supabase
    .from('tenant_integrations')
    .select('stripe_secret_key, stripe_webhook_secret')
    .eq('tenant_id', tenantId)
    .single();

  if (integrationError || !integration?.stripe_secret_key || !integration?.stripe_webhook_secret) {
    console.error(`Tenant ${tenantId} missing Stripe integration`);
    return res.status(400).json({ error: 'Lojista não configurou as credenciais do Stripe.' });
  }

  // 3. Validar a assinatura do Webhook
  const stripe = new Stripe(integration.stripe_secret_key);
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, integration.stripe_webhook_secret);
  } catch (err) {
    console.error('Webhook Signature Verification Failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // 4. Processar os eventos de forma robusta
  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        if (session.mode === 'subscription' && session.metadata?.plan_id) {
          const { client_id, tenant_id, plan_id } = session.metadata;
          const subscriptionId = session.subscription;
          const customerId = session.customer;

          if (typeof subscriptionId === 'string' && subscriptionId.startsWith('sub_')) {
            const subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
            const currentPeriodEnd = new Date(subscriptionDetails.current_period_end * 1000).toISOString();

            const { error } = await supabase
              .from('client_subscriptions')
              .upsert({
                tenant_id,
                client_id,
                plan_id,
                stripe_subscription_id: subscriptionId,
                stripe_customer_id: customerId,
                status: subscriptionDetails.status, // geralmente 'active'
                current_period_end: currentPeriodEnd,
                used_free_appointments_this_cycle: 0,
                updated_at: new Date().toISOString()
              }, { onConflict: 'stripe_subscription_id' });

            if (error) console.error('Erro ao inserir assinatura:', error);
          }
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subscriptionId = invoice.subscription;
        
        if (typeof subscriptionId === 'string' && subscriptionId.startsWith('sub_')) {
          const subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
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
            .eq('stripe_subscription_id', subscriptionId);
            
          if (error) console.error('Erro ao renovar assinatura no webhook:', error);
        }
        break;
      }

      case 'customer.subscription.updated': {
        const subscription = event.data.object;
        const currentPeriodEnd = new Date(subscription.current_period_end * 1000).toISOString();
        const { error } = await supabase
            .from('client_subscriptions')
            .update({ 
              status: subscription.status,
              current_period_end: currentPeriodEnd,
              updated_at: new Date().toISOString()
            })
            .eq('stripe_subscription_id', subscription.id);
        
        if (error) console.error('Erro ao atualizar assinatura:', error);
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
        console.log(`Evento ignorado pelo sistema: ${event.type}`);
    }
  } catch (dbError) {
    console.error('Erro de Processamento no Webhook:', dbError);
  }

  res.status(200).json({ received: true });
}