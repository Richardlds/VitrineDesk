import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import Stripe from "https://esm.sh/stripe@12.18.0?target=deno"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  // Handle CORS preflight request
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const body = await req.json();
    const { name, price, tenantId } = body;

    if (!name || !price || !tenantId) {
      throw new Error('Missing required fields (name, price, tenantId)');
    }

    // Initialize Supabase Client with Service Role Key
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    
    if (!supabaseUrl || !supabaseKey) {
        throw new Error('Server configuration error (missing Supabase variables)');
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch Tenant's Stripe Secret Key
    const { data: integration, error: integrationError } = await supabase
      .from('tenant_integrations')
      .select('stripe_secret_key')
      .eq('tenant_id', tenantId)
      .single();

    if (integrationError || !integration || !integration.stripe_secret_key) {
      throw new Error('O lojista não possui a Chave Secreta da Stripe configurada nas configurações.');
    }

    const stripeKey = integration.stripe_secret_key;

    const stripe = new Stripe(stripeKey, {
      apiVersion: '2022-11-15',
      httpClient: Stripe.createFetchHttpClient(),
    });

    // 1. Create a Product in Stripe
    const product = await stripe.products.create({
      name: name,
      metadata: {
        tenantId: tenantId
      }
    });

    // 2. Create a Price for the Product in Stripe (assuming price is in BRL and in decimals, e.g. 50.00)
    // Stripe expects amount in cents (integer)
    const amountInCents = Math.round(parseFloat(price) * 100);

    const stripePrice = await stripe.prices.create({
      product: product.id,
      unit_amount: amountInCents,
      currency: 'brl',
      recurring: {
        interval: 'month',
      },
    });

    // 3. Return the IDs to the client
    return new Response(
      JSON.stringify({ 
        productId: product.id, 
        priceId: stripePrice.id 
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error(error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { 
        status: 400, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
