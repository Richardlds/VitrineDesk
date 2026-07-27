-- Fase 1: Criação das Tabelas de Planos e Assinaturas no Supabase

-- 1. Tabela de Planos dos Lojistas
CREATE TABLE public.tenant_client_plans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  price numeric(10, 2) NOT NULL DEFAULT 0.00,
  discount_percentage numeric(5, 2) DEFAULT 0.00,
  free_appointments_per_month integer DEFAULT 0,
  stripe_product_id text,
  stripe_price_id text,
  active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Tabela de Assinaturas dos Clientes
CREATE TABLE public.client_subscriptions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  client_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  plan_id uuid NOT NULL REFERENCES public.tenant_client_plans(id) ON DELETE RESTRICT,
  stripe_subscription_id text,
  stripe_customer_id text,
  status text DEFAULT 'incomplete', -- active, past_due, canceled, etc
  current_period_end timestamp with time zone,
  used_free_appointments_this_cycle integer DEFAULT 0,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Habilitar RLS (Row Level Security)
ALTER TABLE public.tenant_client_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.client_subscriptions ENABLE ROW LEVEL SECURITY;

-- Políticas para tenant_client_plans
-- Lojista pode ver, criar, atualizar e deletar os próprios planos
CREATE POLICY "Lojistas gerenciam próprios planos" ON public.tenant_client_plans
  FOR ALL USING (auth.uid() = (SELECT owner_id FROM public.tenants WHERE id = tenant_id));

-- Clientes e usuários públicos podem ver planos ativos
CREATE POLICY "Todos podem ver planos ativos" ON public.tenant_client_plans
  FOR SELECT USING (active = true);


-- Políticas para client_subscriptions
-- Lojistas podem ver todas assinaturas do seu tenant
CREATE POLICY "Lojista ve assinaturas do seu tenant" ON public.client_subscriptions
  FOR SELECT USING (auth.uid() = (SELECT owner_id FROM public.tenants WHERE id = tenant_id));

-- Clientes podem ver suas próprias assinaturas
CREATE POLICY "Cliente ve sua propria assinatura" ON public.client_subscriptions
  FOR SELECT USING (auth.uid() = client_id);
