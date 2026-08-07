import Stripe from 'stripe';
import crypto from 'crypto';

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
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
