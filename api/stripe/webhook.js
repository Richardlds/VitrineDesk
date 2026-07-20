// api/stripe/webhook.js
import Stripe from 'stripe';

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

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];

  let event;

  try {
    // Para validar a assinatura, o Stripe precisa do corpo bruto (raw string/buffer), não o objeto JSON
    const rawBody = await buffer(req);
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  switch (event.type) {
    case 'checkout.session.completed':
      const session = event.data.object;
      console.log('Pagamento confirmado:', session.id);
      break;
    case 'customer.subscription.deleted':
      const subscription = event.data.object;
      console.log('Assinatura cancelada:', subscription.id);
      break;
    default:
      console.log(`Evento não tratado: ${event.type}`);
  }

  res.status(200).json({ received: true });
}