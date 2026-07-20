// api/stripe/create-checkout.js
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  try {
    const { priceId, successUrl, cancelUrl } = req.body;

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
    });

    res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Detalhe técnico:', err);
    res.status(500).json({ error: 'Erro inesperado. Tente novamente.' });
  }
}