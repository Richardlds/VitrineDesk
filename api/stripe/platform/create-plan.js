import Stripe from 'stripe';
import crypto from 'crypto';
import { createClient } from '@supabase/supabase-js';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const supabase = createClient(
  process.env.SUPABASE_URL || 'https://ioadqdpxbuqdlwamqtxm.supabase.co',
  process.env.VITE_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlvYWRxZHB4YnVxZGx3YW1xdHhtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODEyNDg5NjksImV4cCI6MjA5NjgyNDk2OX0.LFbTj_GK_gPFtvtFr5O_nMIi8cWDn2Pl57YSrsAaTCU'
);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
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

    const { name, price, description } = req.body; 
    
    if (!name || price === undefined) {
      return res.status(400).json({ error: 'Missing name or price' });
    }

    // 1. Create a Product
    const productData = {
      name: name,
    };
    if (description) {
      productData.description = description;
    }
    
    const product = await stripe.products.create(productData, {
      idempotencyKey: crypto.randomUUID()
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
    }, {
      idempotencyKey: crypto.randomUUID()
    });

    res.status(200).json({ 
      productId: product.id, 
      priceId: stripePrice.id 
    });
  } catch (err) {
    console.error('Error creating Platform Stripe Plan:', err);
    res.status(500).json({ error: 'Error creating platform plan in Stripe' });
  }
}
