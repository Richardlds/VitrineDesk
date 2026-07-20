/* VitrineDesk - Painel Dashboard */
import { getAppointments } from './appointments.js';
import { getServices } from './services.js';
import { formatCurrency } from './utils.js';

export async function loadDashboardStats(tenantId) {
  try {
    const [appointments, services] = await Promise.all([
      getAppointments(tenantId),
      getServices(tenantId)
    ]);

    const stats = calculateMetrics(appointments, services);
    renderDashboardStats(stats);
    renderTodayAppointments(appointments);
  } catch (err) {
    console.error("Erro ao carregar dashboard:", err);
  }
}

function calculateMetrics(appointments, services) {
  const hoje = new Date().toISOString().split('T')[0];

  const todayAppointments = appointments.filter(app => app.appointment_date === hoje);
  const confirmed = appointments.filter(app => app.status === 'confirmed');
  const pending = appointments.filter(app => app.status === 'pending');

  let estimatedRevenue = 0;
  confirmed.forEach(app => {
    if (app.services && app.services.price) {
      estimatedRevenue += Number(app.services.price);
    }
  });

  return {
    todayCount: todayAppointments.length,
    totalAppointments: appointments.length,
    confirmedCount: confirmed.length,
    pendingCount: pending.length,
    estimatedRevenue,
    totalServices: services.length,
    activeServices: services.filter(s => s.is_active).length
  };
}

function renderDashboardStats(stats) {
  const elements = {
    'stat-revenue': formatCurrency(stats.estimatedRevenue),
    'stat-today': stats.todayCount,
    'stat-appointments': stats.totalAppointments,
    'stat-pending': stats.pendingCount,
    'stat-confirmed': stats.confirmedCount,
    'stat-services': stats.totalServices,
    'stat-active': stats.activeServices
  };

  Object.entries(elements).forEach(([id, value]) => {
    const el = document.getElementById(id);
    if (el) el.textContent = value;
  });
}

function renderTodayAppointments(appointments) {
  const container = document.getElementById('today-appointments');
  if (!container) return;

  const hoje = new Date().toISOString().split('T')[0];
  const todayApps = appointments.filter(app => app.appointment_date === hoje);

  if (todayApps.length === 0) {
    container.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Nenhum agendamento para hoje</p>';
    return;
  }

  container.innerHTML = todayApps.map(app => `
    <div style="display: flex; justify-content: space-between; align-items: center; padding: 12px 16px; background: var(--bg-secondary); border-radius: 8px; margin-bottom: 8px;">
      <div>
        <strong>${app.client_name}</strong>
        <span style="color: var(--text-muted); margin-left: 8px;">${app.appointment_time?.substring(0, 5)}</span>
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        <span>${app.services?.name || 'Serviço'}</span>
        <span class="badge badge-${app.status === 'confirmed' ? 'success' : app.status === 'pending' ? 'warning' : 'danger'}">${app.status}</span>
      </div>
    </div>
  `).join('');
}