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
    
    // Decodifica o client_id ou tenant usando a API oficial do supabase pra verificar segurança
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    // No caso do VitrineDesk, o cliente que agenda também tem token Supabase?
    // Se a vitrine não exige login obrigatoriamente para agendar, essa parte do getUser 
    // pode falhar caso o usuário seja 'anônimo'. 
    // Mas no booking.js vimos: if (!isLogged()) { ... openAuthModal ... }
    // Logo, exige login! Então podemos manter a verificação.
    
    if (authError || !user) {
      return res.status(401).json({ error: 'Sessão inválida' });
    }

    const { 
      successUrl, 
      cancelUrl, 
      tenantId, 
      serviceName,
      amount,
      appointmentData 
    } = req.body;

    if (!tenantId || !amount || !appointmentData) {
      return res.status(400).json({ error: 'Faltam parâmetros obrigatórios' });
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
    
    // Como os metadados do Stripe tem limite de caracteres (500 chars por chave), 
    // precisaremos serializar o appointmentData de forma inteligente ou dividi-lo se for muito grande.
    const appointmentMetadata = JSON.stringify(appointmentData);

    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      payment_method_types: ['card'], // Adicionar 'pix' se a conta do lojista suportar no Brasil
      line_items: [
        {
          price_data: {
            currency: 'brl',
            product_data: {
              name: serviceName || 'Agendamento de Serviço',
              description: 'Pagamento antecipado de agendamento.',
            },
            unit_amount: Math.round(amount * 100), // Stripe usa centavos
          },
          quantity: 1,
        },
      ],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: {
        is_appointment_checkout: 'true',
        tenant_id: tenantId,
        client_id: user.id, // ID do cliente autenticado
        appointment_payload: appointmentMetadata
      },
    }, {
      idempotencyKey: idempotencyKey
    });

    res.status(200).json({ id: session.id, url: session.url });
  } catch (err) {
    console.error('Detalhe técnico Checkout Pagamento Avulso:', err);
    res.status(500).json({ error: 'Erro inesperado ao criar checkout. Tente novamente.' });
  }
}
