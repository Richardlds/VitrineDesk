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
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({ error: 'Não autorizado' });
    }
    const token = authHeader.split(' ')[1];
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const { name, price, tenantId } = req.body; 
    
    if (!name || price === undefined || !tenantId) {
      return res.status(400).json({ error: 'Missing name, price or tenantId' });
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

    // 1. Create a Product
    const product = await stripe.products.create({
      name: name,
    });

    // 2. Create a Price (amount in cents)
    const unitAmount = Math.round(parseFloat(price) * 100);

    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: unitAmount,
      currency: 'brl',
      recurring: {
        interval: 'month',
      },
    });

    res.status(200).json({ 
      productId: product.id, 
      priceId: stripePrice.id 
    });
  } catch (err) {
    console.error('Error creating Stripe Plan:', err);
    res.status(500).json({ error: 'Error creating plan in Stripe' });
  }
}
