/* VitrineDesk - Serviços e Produtos CRUD */
import { supabase } from './config.js';
import { showToast } from './utils.js';

// Listar serviços do Tenant
export async function getServices(tenantId) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    showToast(err.message, "error");
    return [];
  }
}

// Listar apenas serviços ativos (vitrine pública)
export async function getActiveServices(tenantId) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('services')
      .select('*')
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .order('created_at', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) {
    showToast(err.message, "error");
    return [];
  }
}

// Adicionar Serviço
export async function createService(serviceData) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('services')
      .insert([serviceData])
      .select();
    if (error) throw error;
    showToast("Serviço adicionado!", "success");
    return data[0];
  } catch (err) {
    showToast(err.message, "error");
    return null;
  }
}

// Editar Serviço
export async function updateService(serviceId, updatedData) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('services')
      .update(updatedData)
      .eq('id', serviceId)
      .select();
    if (error) throw error;
    showToast("Serviço atualizado!", "success");
    return data[0];
  } catch (err) {
    showToast(err.message, "error");
    return null;
  }
}

// Excluir Serviço
export async function deleteService(serviceId) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('services')
      .delete()
      .eq('id', serviceId);
    if (error) throw error;
    showToast("Serviço removido.", "info");
    return true;
  } catch (err) {
    showToast(err.message, "error");
    return false;
  }
}