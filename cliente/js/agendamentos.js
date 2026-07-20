import { showToast, formatDate, formatTime, formatCurrency, showConfirm, supaFetch, showSkeleton, hideSkeleton, hexToRgb } from './utils.js';
import { getLoggedClient } from './auth.js';
import { getTenantId } from './app.js';

let myAppointments = [];
let appointmentFilter = 'todos';

let cachedAgendaSettings = null;

// Carregar configurações da Seção de Agendamentos salvas no Tenant
export function getAgendaSettings() {
    if (cachedAgendaSettings) return cachedAgendaSettings;
    const tenant = JSON.parse(sessionStorage.getItem('vp_tenant') || '{}');
    const settings = tenant.settings || {};
    cachedAgendaSettings = {
        mostrar: settings.agenda_mostrar !== false,
        titulo: settings.agenda_titulo || 'Meus Agendamentos',
        subtitulo: settings.agenda_subtitulo || '',
        mostrarFiltros: settings.agenda_mostrar_filtros !== false,
        permitirCancelar: settings.agenda_permitir_cancelar !== false,
        textoVazio: settings.agenda_texto_vazio || 'Nenhum agendamento encontrado',
        textoCancelar: settings.agenda_texto_cancelar || 'Cancelar',
        textoConfirmarCancel: settings.agenda_texto_confirmar_cancel || 'Deseja cancelar este agendamento?',
        corConfirmado: settings.agenda_cor_confirmado || '#10b981',
        corPendente: settings.agenda_cor_pendente || '#f59e0b',
        corConcluido: settings.agenda_cor_concluido || '#6366f1',
        corCancelado: settings.agenda_cor_cancelado || '#ef4444',
        filtros: {
            todos: settings.agenda_filtro_todos !== false,
            confirmados: settings.agenda_filtro_confirmados !== false,
            pendentes: settings.agenda_filtro_pendentes !== false,
            concluidos: settings.agenda_filtro_concluidos !== false,
            cancelados: settings.agenda_filtro_cancelados !== false
        }
    };
    return cachedAgendaSettings;
}

export function clearAgendaSettingsCache() {
    cachedAgendaSettings = null;
}

// (Removido hexToRgba local)

export async function loadMyAppointments() {
  try {
    const settings = getAgendaSettings();
    const section = document.getElementById('tab-agendamentos');
    if (section) {
      // Aplicar filtros visíveis (já estavam na UI do HTML, mas podemos manipular aqui se quiséssemos ocultar via settings)
      const filterContainer = document.querySelector('.appointment-filters');
      if (filterContainer && !settings.mostrarFiltros) {
          filterContainer.classList.add('hidden');
      }
    }

    const cliente = getLoggedClient();
    if (!cliente) return;

    const container = document.getElementById('appointments-list');
    if (!container) return;

    // Show skeleton loading
    showSkeleton('appointments-list', 'appointments', 3);

    const tenantId = getTenantId();
    if (!tenantId) {
      container.innerHTML = '<div class="empty-state"><span><i data-lucide="alert-triangle"></i></span><p>Erro ao identificar loja</p></div>';
      if (window.lucide) lucide.createIcons();
      return;
    }

    // Configurar filtros dinâmicos de status na UI
    const filtersDiv = document.querySelector('.appointment-filters');
    if (filtersDiv) {
      filtersDiv.classList.toggle('hidden', !settings.mostrarFiltros);
      if (settings.mostrarFiltros) {
        const btnTodos = filtersDiv.querySelector('[data-filter="todos"]');
        if (btnTodos) btnTodos.classList.toggle('hidden', !settings.filtros.todos);

        const btnConf = filtersDiv.querySelector('[data-filter="confirmed"]');
        if (btnConf) btnConf.classList.toggle('hidden', !settings.filtros.confirmados);

        const btnPend = filtersDiv.querySelector('[data-filter="pending"]');
        if (btnPend) btnPend.classList.toggle('hidden', !settings.filtros.pendentes);

        const btnCompl = filtersDiv.querySelector('[data-filter="completed"]');
        if (btnCompl) btnCompl.classList.toggle('hidden', !settings.filtros.concluidos);

        const btnCanc = filtersDiv.querySelector('[data-filter="cancelled"]');
        if (btnCanc) btnCanc.classList.toggle('hidden', !settings.filtros.cancelados);
      }
    }

    // Limpar telefone e codificar email
    const phone = cliente.telefone ? cliente.telefone.replace(/\D/g, '') : '';
    const email = cliente.email ? encodeURIComponent(cliente.email) : '';

    // Construir query com filtros seguros
    let query = `/rest/v1/appointments?tenant_id=eq.${tenantId}&select=*,services(name,price,duration)&order=appointment_date.desc,appointment_time.desc`;

    const filters = [];
    if (phone) filters.push(`client_phone.eq.${phone}`);
    // client_email was removed from DB, querying it throws 400 error.
    // We only use client_phone now.

    if (filters.length > 0) {
      query += `&or=(${filters.join(',')})`;
    }

    const data = await supaFetch(query);

    myAppointments = data || [];

    // Remove skeleton loading
    hideSkeleton('appointments-list');

    renderAppointments();
    updateUpcomingAppointmentsWidget();
  } catch (e) {
    console.error('Erro ao carregar agendamentos:', e);
    showToast('Erro ao carregar agendamentos', 'error');
    const container = document.getElementById('appointments-list');
    if (container) {
      container.innerHTML = '<div class="empty-state"><span><i data-lucide="alert-triangle"></i></span><p>Erro ao carregar</p></div>';
      if (window.lucide) lucide.createIcons();
    }
  }
}

function getStatusLabel(status) {
  const labels = {
    'confirmed': '<i data-lucide="check-circle" class="icon-sm"></i> Confirmado',
    'pending': '<i data-lucide="clock" class="icon-sm"></i> Pendente',
    'cancelled': '<i data-lucide="x-circle" class="icon-sm"></i> Cancelado',
    'completed': '<i data-lucide="check" class="icon-sm"></i> Concluído'
  };
  return labels[status] || status;
}

function getStatusColor(status, settings) {
  const colors = {
    'confirmed': settings.corConfirmado,
    'pending': settings.corPendente,
    'completed': settings.corConcluido,
    'cancelled': settings.corCancelado
  };
  return colors[status] || '#a1a1aa';
}

function renderAppointments() {
  const container = document.getElementById('appointments-list');
  if (!container) return;

  const settings = getAgendaSettings();

  let filtered = myAppointments;
  if (appointmentFilter !== 'todos') {
    filtered = myAppointments.filter(a => a.status === appointmentFilter);
  }

  if (filtered.length === 0) {
    container.innerHTML = `<div class="empty-state"><span><i data-lucide="calendar"></i></span><p>${settings.textoVazio}</p></div>`;
    if (window.lucide) lucide.createIcons();
    return;
  }

  container.innerHTML = filtered.map(a => {
    const serviceName = a.services?.name || a.service?.name || 'Serviço';
    const servicePrice = a.services?.price || a.service?.price || 0;
    const statusLabel = getStatusLabel(a.status);
    const statusColor = getStatusColor(a.status, settings);
    const rgbaColor = `rgba(${hexToRgb(statusColor)}, 0.15)`;
    const canCancel = settings.permitirCancelar && (a.status === 'confirmed' || a.status === 'pending');

    // Parse details from notes
    let obsText = '';
    let extrasText = '';
    let totalText = '';

    if (a.notes) {
      const parts = a.notes.split(' | ');
      parts.forEach(p => {
        if (p.startsWith('Extras: ')) {
          extrasText = p.replace('Extras: ', '');
        } else if (p.startsWith('Total: ')) {
          totalText = p.replace('Total: ', '');
        } else {
          obsText = p;
        }
      });
    }

    // Se o total não foi salvo no BD (agendamentos antigos), mostramos apenas o preço base.
    const displayTotal = totalText ? totalText : formatCurrency(servicePrice);

    return `
      <div class="appointment-card status-${a.status}">
        <div class="appointment-info">
          <div class="flex-between-start">
            <div class="flex-col-4">
              <span class="appointment-service">${serviceName}</span>
              <span class="appointment-price text-base">${displayTotal}</span>
            </div>
            <div class="flex-col-end-6">
              <span class="status-badge ${a.status}">${statusLabel}</span>
              ${canCancel ? `
                <button class="btn btn-sm btn-danger btn-cancel-appointment btn-cancel-small" data-id="${a.id}">
                  <i data-lucide="x" class="icon-sm"></i> ${settings.textoCancelar}
                </button>
              ` : ''}
            </div>
          </div>
          
          <div class="appointment-meta">
            <div class="appointment-meta-item">
              <i data-lucide="calendar"></i> ${formatDate(a.appointment_date)}
            </div>
            <div class="appointment-meta-item">
              <i data-lucide="clock"></i> ${formatTime(a.appointment_time)}
            </div>
          </div>

          ${(extrasText || obsText) ? `
          <div class="appointment-extras extras-container">
            ${extrasText ? `
            <div class="extras-list">
              <strong>Adicionais:</strong>
              ${extrasText.split(', ').map(extra => `<span class="extra-item">• ${extra}</span>`).join('')}
            </div>` : ''}
            ${obsText ? `
            <div class="obs-text">
              <strong>Obs:</strong> ${obsText}
            </div>` : ''}
          </div>
          ` : ''}
        </div>
      </div>
    `;
  }).join('');

  // Adicionar listeners para os botões de cancelar
  container.querySelectorAll('.btn-cancel-appointment').forEach(btn => {
    btn.addEventListener('click', (e) => cancelAppointment(e.currentTarget.dataset.id));
  });

  if (window.lucide) lucide.createIcons();
}

// Cancelar agendamento com confirmação personalizada
export async function cancelAppointment(id) {
  try {
    if (!id) {
      showToast('Erro: agendamento não encontrado', 'error');
      return;
    }

    const settings = getAgendaSettings();
    const confirmado = await showConfirm(
      'Cancelar Agendamento',
      settings.textoConfirmarCancel,
      'Sim, cancelar',
      'Manter agendamento'
    );

    if (!confirmado) {
      return;
    }

    showToast('Cancelando agendamento...', 'info');

    await supaFetch(`/rest/v1/appointments?id=eq.${id}`, {
      method: 'PATCH',
      body: { status: 'cancelled' }
    });

    showToast('Agendamento cancelado com sucesso!', 'success');
    await loadMyAppointments();
  } catch (e) {
    console.error('Erro ao cancelar:', e);
    showToast('Erro ao cancelar. Tente novamente.', 'error');
  }
}

export function setAppointmentFilter(filter) {
  appointmentFilter = filter;
  document.querySelectorAll('.filter-btn').forEach(b =>
    b.classList.toggle('active', b.dataset.filter === filter)
  );
  renderAppointments();
}

export function initAgendamentos() {
  if (window._agendamentosInitialized) return;
  window._agendamentosInitialized = true;
  document.querySelectorAll('.filter-btn').forEach(btn => {
    btn.addEventListener('click', () => setAppointmentFilter(btn.dataset.filter));
  });

  // Inicializar Tabs do Drawer
  const tabs = document.querySelectorAll('.drawer-tab');
  const slider = document.querySelector('.drawer-tab-slider');
  
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => {
      // Remover active de todas as abas e paineis
      tabs.forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.drawer-panel').forEach(p => p.classList.remove('active'));
      
      // Adicionar active na clicada
      tab.classList.add('active');
      const targetId = tab.getAttribute('data-target');
      const targetPanel = document.getElementById(targetId);
      if (targetPanel) targetPanel.classList.add('active');
      
      // Mover slider (como são 2 abas, 0% ou 50%)
      if (slider) {
        slider.style.transform = `translateX(${index * 100}%)`;
      }
    });
  });
}

// ────────────────────────── Drawer Area do Cliente ──────────────────────────
export async function openClientAreaDrawer(tabId = 'tab-dados') {
  const cliente = getLoggedClient();
  if (!cliente) {
    showToast('Você precisa estar logado para acessar a área do cliente.', 'warning');
    const { openAuthModal } = await import('./auth.js');
    openAuthModal('login');
    return;
  }

  // Preencher dados do perfil nos inputs
  const nameDisplay = document.getElementById('client-name-display');
  const nameInput = document.getElementById('drawer-client-name');
  const emailInput = document.getElementById('drawer-client-email');
  const phoneInput = document.getElementById('drawer-client-phone');
  const cpfInput = document.getElementById('drawer-client-cpf');

  if (nameDisplay) nameDisplay.textContent = cliente.nome || 'Cliente';
  
  const storeDisplay = document.getElementById('client-store-display');
  if (storeDisplay) {
    try {
      const tenant = JSON.parse(sessionStorage.getItem('vp_tenant') || '{}');
      const storeName = tenant.name || tenant.settings?.title || 'VitrineDesk';
      storeDisplay.textContent = `Cliente ${storeName}`;
    } catch (e) {
      storeDisplay.textContent = 'Cliente VitrineDesk';
    }
  }
  
  const avatarImg = document.getElementById('client-avatar-img');
  const avatarIcon = document.getElementById('client-avatar-icon');
  
  if (cliente.foto_url) {
    if (avatarImg) {
      avatarImg.src = cliente.foto_url;
      avatarImg.classList.remove('hidden');
    }
    if (avatarIcon) avatarIcon.classList.add('hidden');
  } else {
    if (avatarImg) avatarImg.classList.add('hidden');
    if (avatarIcon) avatarIcon.classList.remove('hidden');
  }
  
  if (nameInput) {
    nameInput.value = cliente.nome || '';
    if (cliente.nome) nameInput.closest('.input-group')?.classList.add('has-value', 'valid');
  }
  if (emailInput) {
    emailInput.value = cliente.email || '';
    if (cliente.email) emailInput.closest('.input-group')?.classList.add('has-value', 'valid');
  }
  if (phoneInput) {
    phoneInput.value = cliente.telefone || '';
    if (cliente.telefone) phoneInput.closest('.input-group')?.classList.add('has-value', 'valid');
  }
  if (cpfInput) {
    cpfInput.value = cliente.cpf || '';
    if (cliente.cpf) cpfInput.closest('.input-group')?.classList.add('has-value', 'valid');
  }

  // Abrir o Drawer
  const drawer = document.getElementById('client-area-drawer');
  if (drawer) {
    drawer.classList.add('active');
  }

  // Ativar a aba correta
  const tabBtn = document.querySelector(`.drawer-tab[data-target="${tabId}"]`);
  if (tabBtn) {
    tabBtn.click();
  }

  // Carregar agendamentos
  loadMyAppointments();
}

// (Removido exports do window)

// ────────────────────────── Widget Resumo ──────────────────────────
function updateUpcomingAppointmentsWidget() {
  const section = document.getElementById('section-upcoming-appointments');
  if (!section) return;

  const now = new Date();
  
  // Find the closest future appointment that is not cancelled or completed
  const upcoming = myAppointments.filter(app => {
    if (app.status === 'cancelled' || app.status === 'completed') return false;
    if (!app.appointment_date || !app.appointment_time) return false;
    
    // Parse date correctly considering timezone (appointment_date is YYYY-MM-DD)
    const [year, month, day] = app.appointment_date.split('-');
    const [hour, minute] = app.appointment_time.split(':');
    const appDate = new Date(year, month - 1, day, hour, minute);
    
    return appDate >= now;
  }).sort((a, b) => {
    const dateA = new Date(a.appointment_date + 'T' + a.appointment_time);
    const dateB = new Date(b.appointment_date + 'T' + b.appointment_time);
    return dateA - dateB;
  });

  if (upcoming.length > 0) {
    const nextApp = upcoming[0];
    const serviceName = nextApp.services ? nextApp.services.name : 'Agendamento';
    const [year, month, day] = nextApp.appointment_date.split('-');
    const dataFormatada = `${day}/${month}/${year}`;
    const horaFormatada = nextApp.appointment_time.substring(0, 5);

    document.getElementById('upcoming-service-name').textContent = serviceName;
    document.getElementById('upcoming-date-time').innerHTML = `<i data-lucide="calendar" style="width:14px; height:14px;"></i> ${dataFormatada} às ${horaFormatada}`;
    section.style.display = 'block';
    if (window.lucide) lucide.createIcons();
  } else {
    section.style.display = 'none';
  }
}