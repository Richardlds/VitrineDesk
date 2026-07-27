const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  try {
    const { priceId, successUrl, cancelUrl, clientId, tenantId, planId } = req.body;

    if (!priceId || !clientId || !tenantId || !planId) {
      return res.status(400).json({ error: 'Missing required metadata or priceId' });
    }

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
    });

    res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Detalhe técnico Checkout Assinatura:', err);
    res.status(500).json({ error: 'Erro inesperado ao criar checkout. Tente novamente.' });
  }
}
