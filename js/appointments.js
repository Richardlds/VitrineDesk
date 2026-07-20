/* VitrineDesk - Gestão de Agendamentos */
import { supabase } from './config.js';
import { showToast } from './utils.js';

export async function createAppointment(appointmentData) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('appointments')
      .insert([appointmentData])
      .select();
    if (error) throw error;
    showToast("Agendamento realizado!", "success");
    return data[0];
  } catch (err) {
    showToast(err.message, "error");
    return null;
  }
}

export async function getAppointments(tenantId) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('appointments')
      .select(`id, client_name, client_phone, client_email, appointment_date, appointment_time, status, notes, service_id, services ( name, price, duration )`)
      .eq('tenant_id', tenantId)
      .order('appointment_date', { ascending: true })
      .order('appointment_time', { ascending: true });
    if (error) throw error;
    return data || [];
  } catch (err) { return []; }
}

export async function getAppointmentsByDate(tenantId, date) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('appointments')
      .select('appointment_time, services(duration)')
      .eq('tenant_id', tenantId)
      .eq('appointment_date', date)
      .not('status', 'eq', 'cancelled');
    if (error) throw error;
    return data || [];
  } catch (err) { return []; }
}

export async function updateAppointmentStatus(appointmentId, status) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('appointments')
      .update({ status })
      .eq('id', appointmentId);
    if (error) throw error;
    showToast("Status atualizado!", "success");
    return true;
  } catch (err) {
    showToast(err.message, "error");
    return false;
  }
}

export async function getAppointmentsByPhone(tenantId, phone) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { data, error } = await supabase
      .from('appointments')
      .select(`id, client_name, client_phone, appointment_date, appointment_time, status, service_id, services ( name, price, duration )`)
      .eq('tenant_id', tenantId)
      .eq('client_phone', phone)
      .order('appointment_date', { ascending: false });
    if (error) throw error;
    return data || [];
  } catch (err) { return []; }
}

export async function updateAppointmentDateTime(appointmentId, newDate, newTime) {
  try {
    if (!supabase) throw new Error("Supabase não configurado.");
    const { error } = await supabase
      .from('appointments')
      .update({ appointment_date: newDate, appointment_time: newTime, status: 'confirmed' })
      .eq('id', appointmentId);
    if (error) throw error;
    showToast("Agendamento atualizado!", "success");
    return true;
  } catch (err) {
    showToast(err.message, "error");
    return false;
  }
}