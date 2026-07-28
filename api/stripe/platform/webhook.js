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

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const session = event.data.object;
        
        // Verifica se é uma assinatura (SaaS)
        if (session.mode === 'subscription' && session.metadata?.tenant_id) {
          const { tenant_id, plan_id } = session.metadata;
          const subscriptionId = session.subscription;

          // Busca dados da subscription no Stripe para pegar o vencimento
          const subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
          const currentPeriodEnd = new Date(subscriptionDetails.current_period_end * 1000).toISOString();

          // Pega o settings atual do tenant para não sobrescrever o resto
          const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenant_id).single();
          const currentSettings = tenantData?.settings || {};

          // Atualiza a tabela tenants com o novo plano e status
          const { error } = await supabase
            .from('tenants')
            .update({
                subscription_status: subscriptionDetails.status, // geralmente 'active'
                settings: {
                    ...currentSettings,
                    plano_id: plan_id,
                    vencimento: currentPeriodEnd,
                    stripe_subscription_id: subscriptionId,
                    stripe_customer_id: session.customer
                },
                updated_at: new Date().toISOString()
            })
            .eq('id', tenant_id);

          if (error) console.error('Erro ao atualizar assinatura do tenant:', error);
        }
        break;
      }
      
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        if (invoice.subscription) {
          const subscriptionDetails = await stripe.subscriptions.retrieve(invoice.subscription);
          
          if (subscriptionDetails.metadata?.tenant_id) {
            const tenant_id = subscriptionDetails.metadata.tenant_id;
            const currentPeriodEnd = new Date(subscriptionDetails.current_period_end * 1000).toISOString();

            const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenant_id).single();
            const currentSettings = tenantData?.settings || {};

            const { error } = await supabase
                .from('tenants')
                .update({ 
                    subscription_status: subscriptionDetails.status,
                    settings: {
                        ...currentSettings,
                        vencimento: currentPeriodEnd
                    },
                    updated_at: new Date().toISOString()
                })
                .eq('id', tenant_id);
                
            if (error) console.error('Erro ao renovar assinatura do tenant:', error);
          }
        }
        break;
      }

      case 'invoice.payment_failed':
      case 'customer.subscription.deleted': {
        const obj = event.data.object;
        const subscriptionId = obj.subscription || obj.id; // no deleted, o object é a propria subscription
        
        const subscriptionDetails = await stripe.subscriptions.retrieve(subscriptionId);
        
        if (subscriptionDetails.metadata?.tenant_id) {
            const tenant_id = subscriptionDetails.metadata.tenant_id;

            const { error } = await supabase
                .from('tenants')
                .update({ 
                    subscription_status: subscriptionDetails.status, // past_due ou canceled
                    updated_at: new Date().toISOString()
                })
                .eq('id', tenant_id);

            if (error) console.error('Erro ao cancelar assinatura do tenant:', error);
        }
        break;
      }
    }

    res.json({ received: true });
  } catch (err) {
    console.error('Erro ao processar evento do webhook:', err);
    res.status(500).json({ error: 'Erro interno no webhook' });
  }
}
