/* VitrineDesk - Dados do Tenant */
import { supabase } from './config.js';
import { showToast } from './utils.js';

// Buscar loja pelo Slug (vitrine pública)
export async function getTenantBySlug(slug) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('slug', slug)
      .single();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Erro ao carregar loja:", err.message);
    return null;
  }
}

// Buscar tenant do usuário logado
export async function getMyTenant() {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) throw new Error("Usuário não autenticado.");

    const { data, error } = await supabase
      .from('tenants')
      .select('*')
      .eq('owner_id', session.user.id)
      .maybeSingle();
    if (error) throw error;
    return data;
  } catch (err) {
    console.error("Erro ao carregar tenant:", err.message);
    return null;
  }
}

// Atualizar tenant
export async function updateTenant(tenantId, updates) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('tenants')
      .update(updates)
      .eq('id', tenantId)
      .select()
      .single();
    if (error) throw error;
    showToast("Configurações salvas!", "success");
    return data;
  } catch (err) {
    showToast(err.message, "error");
    return null;
  }
}

// Aplicar identidade visual
export function applyTenantBranding(tenant) {
  if (!tenant) return;

  if (tenant.settings?.title) {
    document.title = tenant.settings.title;
  } else {
    document.title = `${tenant.name} - VitrineDesk`;
  }

  const brandNames = document.querySelectorAll('.brand-name');
  brandNames.forEach(el => el.textContent = tenant.name);

  if (tenant.primary_color) {
    document.documentElement.style.setProperty('--primary', tenant.primary_color);
  }

  if (tenant.logo_url) {
    const logos = document.querySelectorAll('.brand-logo');
    logos.forEach(el => { el.src = tenant.logo_url; el.style.display = 'block'; });
  }

  if (tenant.whatsapp) {
    const whatsappBtn = document.getElementById('whatsapp-float');
    if (whatsappBtn) {
      const numero = tenant.whatsapp.replace(/\D/g, '');
      whatsappBtn.href = `https://wa.me/55${numero}`;
      whatsappBtn.style.display = 'flex';
    }
  }
}