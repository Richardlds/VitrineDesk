import { supaFetch, showToast, formatCurrency, formatDate, getMonthName, escapeHtml, showSkeleton, hideSkeleton } from './utils.js';
import { isLogged, openAuthModal, getLoggedClient } from './auth.js';
import { loadMyAppointments } from './agendamentos.js';
import { getTenantId, selectedBranchId } from './app.js';

// ────────────────────────── Estado do Booking ──────────────────────────
let currentStep = 1;
let bookingState = {
  serviceId: null,
  serviceName: '',
  servicePrice: 0,
  serviceDuration: 0,
  profissionalId: null,
  profissionalName: '',
  selectedDate: null,
  selectedTime: null,
  extras: [],
  tenantId: null
};

let allProfessionals = [];
let allServices = [];

// (Removido getTenantId local)


// ────────────────────────── Lógica de Passos ──────────────────────────

function updateModalUI() {
  const steps = document.querySelectorAll('.booking-step');
  steps.forEach(el => el.classList.remove('active'));

  // Mostrar step atual
  if (steps[currentStep - 1]) {
    steps[currentStep - 1].classList.add('active');
  }

  // Atualizar texto de "Etapa X de 5"
  const stepText = document.getElementById('current-step-text');
  if (stepText) stepText.textContent = currentStep;

  // Botoes do Footer
  const btnBack = document.getElementById('btn-back-booking');
  const btnNext = document.getElementById('btn-next-booking');
  const btnSubmit = document.getElementById('btn-submit-booking');

  if(btnBack) btnBack.classList.toggle('hidden', currentStep <= 1);
  
  if (currentStep === 5) {
    if(btnNext) btnNext.classList.add('hidden');
    if(btnSubmit) btnSubmit.classList.remove('hidden');
  } else if (currentStep === 4) {
    if(btnNext) {
      btnNext.classList.remove('hidden');
      btnNext.disabled = false;
    }
    if(btnSubmit) btnSubmit.classList.add('hidden');
  } else {
    if(btnNext) btnNext.classList.add('hidden'); // Usando auto-avanço
    if(btnSubmit) btnSubmit.classList.add('hidden');
  }
}

function goToStep(step) {
  if (step < 1 || step > 5) return;

  const isForward = step > currentStep;
  const step4 = document.getElementById('step-extras');
  
  if (step === 4 && step4 && step4.classList.contains('empty-extras')) {
    if (isForward) {
      step = 5;
    } else {
      step = 3;
    }
  }

  currentStep = step;
  updateModalUI();
}

// ────────────────────────── Abrir Modal ──────────────────────────

export async function openBookingModal(service) {
  try {
    // Verificar login
    if (!isLogged()) {
      showToast('Faça login para agendar', 'warning');
      openAuthModal('login');
      return;
    }

    const tenantId = getTenantId();
    if (!tenantId) {
      showToast('Erro: loja não identificada', 'error');
      return;
    }

    // Resetar estado
    bookingState = {
      serviceId: service.id,
      serviceName: service.nome || service.name || '',
      servicePrice: parseFloat(service.preco || service.price || 0),
      serviceDuration: parseInt(service.duracao || service.duration || 30),
      profissionalId: null,
      profissionalName: '',
      selectedDate: null,
      selectedTime: null,
      extras: [],
      tenantId: tenantId,
      discount: 0,
      couponCode: ''
    };
    currentStep = 1;
    updateModalUI();

    // Preencher info do serviço no modal
    const titleEl = document.getElementById('booking-service-name');
    const priceEl = document.getElementById('booking-service-price');
    const durationEl = document.getElementById('booking-service-duration');

    if (titleEl) titleEl.textContent = bookingState.serviceName;
    if (priceEl) priceEl.textContent = window.hidePrices ? '' : formatCurrency(bookingState.servicePrice);
    if (durationEl) durationEl.textContent = `${bookingState.serviceDuration} min`;



    // Carregar profissionais
    await loadProfessionals();

    // Renderizar calendário do mês atual
    const hoje = new Date();
    renderCalendar(hoje.getFullYear(), hoje.getMonth());

    // Limpar horários e resumo
    document.getElementById('time-slots-grid').innerHTML =
      '<p class="text-sm-muted">Selecione uma data primeiro</p>';
    updateBookingSummary();

    // Carregar extras (serviços extras do tenant)
    await loadExtras();

    // Abrir modal
    const overlay = document.getElementById('booking-modal');
    if (overlay) overlay.classList.add('active');
  } catch (e) {
    console.error('Erro ao abrir modal de agendamento:', e);
    showToast('Erro ao abrir agendamento', 'error');
  }
}

// ────────────────────────── Fechar Modal ──────────────────────────

export function closeBookingModal() {
  try {
    const overlay = document.getElementById('booking-modal');
    if (overlay) overlay.classList.remove('active');
  } catch (e) {
    console.error('Erro ao fechar modal:', e);
  }
}

// ────────────────────────── Profissionais ──────────────────────────

async function loadProfessionals() {
  try {
    const container = document.getElementById('prof-grid');
    if (!container) return;

    // Show skeleton loading
    showSkeleton('prof-grid', 'professionals', 3);

    const tenantId = getTenantId();
    const data = await supaFetch(
      `/rest/v1/profissionais?tenant_id=eq.${tenantId}&select=*`
    );

    let loadedProfissionais = data || [];

    if (selectedBranchId) {
      loadedProfissionais = loadedProfissionais.filter(p => {
        if (!p.branch_ids || p.branch_ids.length === 0) return true;
        return p.branch_ids.includes(selectedBranchId);
      });
    }

    allProfessionals = loadedProfissionais;

    // Remove skeleton loading
    hideSkeleton('prof-grid');

    if (allProfessionals.length === 0) {
      container.innerHTML = '<p class="text-sm-muted">Nenhum profissional disponível</p>';
      return;
    }

    container.innerHTML = allProfessionals.map(prof => `
      <div class="prof-select-card" data-action="selectProfessional" data-prof-id="${prof.id}">
        ${prof.foto_url
        ? `<img src="${escapeHtml(prof.foto_url)}" alt="${escapeHtml(prof.nome)}" class="prof-select-avatar">`
        : `<div class="prof-select-avatar-placeholder"><i data-lucide="user"></i></div>`
      }
        <span class="prof-select-name">${escapeHtml(prof.nome || 'Profissional')}</span>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  } catch (e) {
    console.error('Erro ao carregar profissionais:', e);
    showToast('Erro ao carregar profissionais', 'error');
  }
}

// ────────────────────────── Selecionar Profissional ──────────────────────────

export function selectProfessional(profId) {
  try {
    const prof = allProfessionals.find(p => String(p.id) === String(profId));
    if (!prof) return;

    bookingState.profissionalId = String(prof.id);
    bookingState.profissionalName = prof.nome || '';

    document.querySelectorAll('.prof-select-card').forEach(card => {
      card.classList.toggle('selected', card.dataset.profId == profId);
    });

    // Re-renderizar calendário para aplicar dias de folga do novo profissional
    renderCalendar(calendarYear, calendarMonth);

    if (bookingState.selectedDate) {
      loadTimeSlots(bookingState.selectedDate);
    }

    updateBookingSummary();
    setTimeout(() => goToStep(2), 200);
  } catch (e) {
    console.error('Erro ao selecionar profissional:', e);
  }
}

// ────────────────────────── Calendário ──────────────────────────

let calendarYear, calendarMonth;

function renderCalendar(year, month) {
  try {
    calendarYear = year;
    calendarMonth = month;

    const monthYearEl = document.getElementById('calendar-month-year');
    const gridEl = document.getElementById('calendar-grid');
    if (!monthYearEl || !gridEl) return;

    monthYearEl.textContent = `${getMonthName(month)} ${year}`;

    const hoje = new Date();
    hoje.setHours(0, 0, 0, 0);

    const primeiroDia = new Date(year, month, 1);
    const ultimoDia = new Date(year, month + 1, 0);
    const diasNoMes = ultimoDia.getDate();
    const diaSemanaInicio = primeiroDia.getDay(); // 0=Dom

    // Labels dos dias
    const labels = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
    let html = labels.map(l => `<div class="calendar-day-label">${l}</div>`).join('');

    // Dias vazios antes do primeiro dia
    for (let i = 0; i < diaSemanaInicio; i++) {
      html += '<div class="calendar-day empty"></div>';
    }

    // Dias do mês
    for (let d = 1; d <= diasNoMes; d++) {
      const date = new Date(year, month, d);
      date.setHours(0, 0, 0, 0);
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = date.getTime() === hoje.getTime();
      const isPast = date < hoje;

      let classes = 'calendar-day';
      if (isPast) classes += ' disabled';
      
      // Verificação de Folgas e Dias Fechados do Profissional Selecionado
      const prof = allProfessionals.find(p => String(p.id) === String(bookingState.profissionalId));
      let isFolga = false;
      let isClosed = false;

      if (prof) {
        isFolga = prof.folgas && prof.folgas.some(f => f.data === dateStr);
        const dayKeys = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sab'];
        const diaSemana = dayKeys[date.getDay()];
        const workHours = prof.horarios && prof.horarios[diaSemana];
        isClosed = workHours && (workHours.ativo === false || workHours.fechado === true);
      }

      if (isFolga || isClosed) classes += ' disabled folga-fechado';
      if (isToday) classes += ' today';
      if (bookingState.selectedDate === dateStr && !isFolga && !isClosed) classes += ' selected';

      const clickAttr = (isPast || isFolga || isClosed) ? '' : `data-action="selectDate" data-date="${dateStr}"`;
      const titleAttr = isFolga ? 'Profissional de Folga' : (isClosed ? 'Não atende neste dia' : '');

      html += `<div class="${classes}" data-date="${dateStr}" ${clickAttr} title="${titleAttr}">${d}</div>`;
    }

    gridEl.innerHTML = html;
  } catch (e) {
    console.error('Erro ao renderizar calendário:', e);
  }
}

function prevMonth() {
  let m = calendarMonth - 1;
  let y = calendarYear;
  if (m < 0) { m = 11; y--; }
  renderCalendar(y, m);
}

function nextMonth() {
  let m = calendarMonth + 1;
  let y = calendarYear;
  if (m > 11) { m = 0; y++; }
  renderCalendar(y, m);
}

export function selectDate(dateStr) {
  try {
    bookingState.selectedDate = dateStr;
    bookingState.selectedTime = null;

    // Atualizar visual do calendário
    document.querySelectorAll('.calendar-day').forEach(d => {
      d.classList.toggle('selected', d.dataset.date === dateStr);
    });

    // Carregar horários para esta data
    loadTimeSlots(dateStr);
    updateBookingSummary();
    setTimeout(() => goToStep(3), 200);
  } catch (e) {
    console.error('Erro ao selecionar data:', e);
  }
}

// ────────────────────────── Horários Disponíveis ──────────────────────────

async function loadTimeSlots(dateStr) {
  try {
    const container = document.getElementById('time-slots-grid');
    if (!container) return;

    // Show skeleton loading
    showSkeleton('time-slots-grid', 'timeSlots');

    const tenantId = getTenantId();

    // Buscar agendamentos existentes para o dia
    let query = `/rest/v1/appointments?tenant_id=eq.${tenantId}&appointment_date=eq.${dateStr}&status=neq.cancelled&select=appointment_time,duration,profissional_id`;
    const agendamentos = await supaFetch(query) || [];

    // Obter configuração de horários do tenant
    const tenant = JSON.parse(sessionStorage.getItem('vp_tenant') || '{}');
    const settings = tenant.settings || {};
    const horarioInicio = settings.horario_inicio || '08:00';
    const horarioFim = settings.horario_fim || '20:00';
    const intervalo = parseInt(settings.intervalo || 30);

    // ═══════════════════════════════════════════
    // ✅ NOVO: Calcular horário mínimo (agora)
    // ═══════════════════════════════════════════
    const agora = new Date();
    const hoje = new Date(agora);
    hoje.setHours(0, 0, 0, 0);

    const dataSelecionada = new Date(dateStr + 'T00:00:00');
    dataSelecionada.setHours(0, 0, 0, 0);

    // Se for hoje, o horário mínimo é agora + 30min
    let horaMinima = 0; // minutos desde meia-noite
    if (dataSelecionada.getTime() === hoje.getTime()) {
      horaMinima = agora.getHours() * 60 + agora.getMinutes() + 30; // 30min de folga
    }

    // Gerar slots
    const slots = [];
    const [hiH, hiM] = horarioInicio.split(':').map(Number);
    const [hfH, hfM] = horarioFim.split(':').map(Number);
    const inicioMin = hiH * 60 + hiM;
    const fimMin = hfH * 60 + hfM;

    for (let m = inicioMin; m < fimMin; m += intervalo) {
      const h = String(Math.floor(m / 60)).padStart(2, '0');
      const min = String(m % 60).padStart(2, '0');
      const hora = `${h}:${min}`;

      let isPast = false;
      // Horários passados (exibe cinza desabilitado)
      if (dataSelecionada.getTime() === hoje.getTime() && m < horaMinima) {
        isPast = true;
      }

      // Verificar se o slot está ocupado
      const ocupado = checkConflict(hora, bookingState.serviceDuration, agendamentos);
      slots.push({ hora, ocupado, isPast });
    }

    // Remove skeleton loading
    hideSkeleton('time-slots-grid');

    if (slots.length === 0) {
      container.innerHTML = '<p class="text-sm-muted">Nenhum horário disponível para hoje</p>';
      return;
    }

    container.innerHTML = slots.map(s => {
      let stateClass = 'free';
      if (s.isPast) stateClass = 'past';
      else if (s.ocupado) stateClass = 'occupied';

      return `
      <div class="time-slot ${stateClass}"
           ${stateClass === 'free' ? `data-action="selectTime" data-time="${s.hora}"` : ''}
           data-time="${s.hora}">
         ${s.hora}
      </div>
      `;
    }).join('');
  } catch (e) {
    console.error('Erro ao carregar horários:', e);
    showToast('Erro ao carregar horários', 'error');
  }
}

function checkConflict(hora, duracao, agendamentos) {
  try {
    const [h, m] = hora.split(':').map(Number);
    const inicio = h * 60 + m;
    const fim = inicio + duracao;

    for (const ag of agendamentos) {
      // Se tem profissional selecionado, filtrar por ele
      if (bookingState.profissionalId && ag.profissional_id !== bookingState.profissionalId) {
        continue;
      }

      const [aH, aM] = (ag.appointment_time || '00:00').split(':').map(Number);
      const aInicio = aH * 60 + aM;
      const aFim = aInicio + (ag.duration || 30);

      // Verificar sobreposição
      if (inicio < aFim && fim > aInicio) {
        return true;
      }
    }
    return false;
  } catch (e) {
    console.error('Erro ao verificar conflito:', e);
    return false;
  }
}

export function selectTime(time) {
  try {
    bookingState.selectedTime = time;

    document.querySelectorAll('.time-slot').forEach(s => {
      s.classList.toggle('selected', s.dataset.time === time);
    });

    updateBookingSummary();
    setTimeout(() => goToStep(4), 200);
  } catch (e) {
    console.error('Erro ao selecionar horário:', e);
  }
}

// ────────────────────────── Extras ──────────────────────────

async function loadExtras() {
  try {
    const container = document.getElementById('extras-list');
    if (!container) return;

    const tenantId = getTenantId();

    // Buscar serviços que podem ser extras (excluindo o serviço atual)
    const data = await supaFetch(
      `/rest/v1/services?tenant_id=eq.${tenantId}&is_active=eq.true&id=neq.${bookingState.serviceId}&select=*`
    );

    if (!data || data.length === 0) {
      // Se não tem extras, talvez pular direto para a etapa 5
      const step4 = document.getElementById('step-extras');
      if (step4) step4.classList.add('empty-extras');
      return;
    }
    const step4 = document.getElementById('step-extras');
    if (step4) step4.classList.remove('empty-extras');

    container.innerHTML = data.map(extra => `
      <div class="extra-item">
        <div class="extra-info">
          <input type="checkbox" class="extra-checkbox"
                 data-action="toggleExtraService"
                 data-extra-id="${extra.id}"
                 data-extra-name="${escapeHtml(extra.nome || extra.name)}"
                 data-extra-price="${extra.preco || extra.price || 0}"
                 data-extra-duration="${extra.duracao || extra.duration || 15}">
          <span class="extra-name">${escapeHtml(extra.nome || extra.name)}</span>
        </div>
        <span class="extra-price">${formatCurrency(extra.preco || extra.price || 0)}</span>
      </div>
    `).join('');
  } catch (e) {
    console.error('Erro ao carregar extras:', e);
    const container = document.getElementById('extras-list');
    const section = container?.closest('.booking-section');
    if (section) section.classList.add('hidden');
  }
}

export function toggleExtraService(checkbox) {
  try {
    const id = parseInt(checkbox.dataset.extraId);
    const name = checkbox.dataset.extraName;
    const price = parseFloat(checkbox.dataset.extraPrice);
    const duration = parseInt(checkbox.dataset.extraDuration);

    if (checkbox.checked) {
      bookingState.extras.push({ id, name, price, duration });
    } else {
      bookingState.extras = bookingState.extras.filter(e => e.id !== id);
    }

    updateBookingSummary();
    
  } catch (e) {
    console.error('Erro ao alternar extra:', e);
  }
}

// ────────────────────────── Cálculos ──────────────────────────

function calcTotalDuration() {
  let total = bookingState.serviceDuration || 0;
  for (const extra of bookingState.extras) {
    total += extra.duration || 0;
  }
  return total;
}

function calcTotalPrice() {
  let total = bookingState.servicePrice || 0;
  for (const extra of bookingState.extras) {
    total += extra.price || 0;
  }
  return total;
}

// ────────────────────────── Resumo ──────────────────────────

function updateBookingSummary() {
  try {
    const el = document.getElementById('booking-summary');
    if (!el) return;

    let totalPrice = calcTotalPrice();
    const totalDuration = calcTotalDuration();

    let html = `
      <div class="summary-row">
        <span>Serviço</span>
        <span>${escapeHtml(bookingState.serviceName)}</span>
      </div>
    `;

    if (bookingState.profissionalName) {
      html += `
        <div class="summary-row">
          <span>Profissional</span>
          <span>${escapeHtml(bookingState.profissionalName)}</span>
        </div>
      `;
    }

    if (bookingState.selectedDate) {
      html += `
        <div class="summary-row">
          <span>Data</span>
          <span>${formatDate(bookingState.selectedDate)}</span>
        </div>
      `;
    }

    if (bookingState.selectedTime) {
      html += `
        <div class="summary-row">
          <span>Horário</span>
          <span>${bookingState.selectedTime}</span>
        </div>
      `;
    }

    if (bookingState.extras && bookingState.extras.length > 0) {
      html += bookingState.extras.map(e => `
        <div class="flex-between">
          <span class="text-primary">+ ${escapeHtml(e.nome || e.name)}</span>
          <span class="text-primary">${window.hidePrices ? '' : formatCurrency(e.preco || e.price || 0)}</span>
        </div>`).join('');
    }

    let desconto = 0;
    let descontoTexto = '';
    
    if (bookingState.discountData) {
      if (bookingState.discountData.desconto_percentual) {
        desconto = totalPrice * (bookingState.discountData.desconto_percentual / 100);
        descontoTexto = `(${bookingState.discountData.desconto_percentual}%)`;
      } else if (bookingState.discountData.desconto_fixo) {
        desconto = bookingState.discountData.desconto_fixo;
      }
      
      // Prevent negative total
      if (desconto > totalPrice) {
         desconto = totalPrice;
      }
      
      totalPrice = totalPrice - desconto;
      
      html += `
        <div class="flex-between skel-mt-2">
          <span class="text-success">Desconto ${descontoTexto}</span>
          <span class="text-success">- ${formatCurrency(desconto)}</span>
        </div>
      `;
    }

    html += `
      <div class="summary-row">
        <span>Duração total</span>
        <span>${totalDuration} min</span>
      </div>
      <div class="summary-row summary-total">
        <span>Total</span>
        <span>${formatCurrency(totalPrice)}</span>
      </div>
    `;

    el.innerHTML = html;
  } catch (e) {
    console.error('Erro ao atualizar resumo:', e);
  }
}

// ────────────────────────── Submissão ──────────────────────────

async function submitBooking() {
  try {
    const cliente = getLoggedClient();
    if (!cliente) {
      showToast('Faça login para agendar', 'warning');
      return;
    }

    if (!bookingState.profissionalId) {
      showToast('Selecione um profissional', 'warning');
      return;
    }
    if (!bookingState.selectedDate) {
      showToast('Selecione uma data', 'warning');
      return;
    }
    if (!bookingState.selectedTime) {
      showToast('Selecione um horário', 'warning');
      return;
    }

    const btnSubmit = document.getElementById('btn-submit-booking');
    if (btnSubmit) {
      btnSubmit.disabled = true;
      btnSubmit.innerHTML = '<i data-lucide="loader" class="lucide-spin"></i> Processando...';
      if (window.lucide) lucide.createIcons();
    }

    const observacoes = document.getElementById('booking-notes')?.value?.trim() || '';

    const extrasTexto = bookingState.extras.length > 0
      ? 'Extras: ' + bookingState.extras.map(e => `${e.name || e.nome} (+${formatCurrency(e.price || e.preco || 0)})`).join(', ')
      : '';

    // Calculate final total (including discount) to save it in notes
    let finalTotal = calcTotalPrice();
    if (bookingState.discountData) {
      let desc = 0;
      if (bookingState.discountData.desconto_percentual) {
        desc = finalTotal * (bookingState.discountData.desconto_percentual / 100);
      } else if (bookingState.discountData.desconto_fixo) {
        desc = bookingState.discountData.desconto_fixo;
      }
      if (desc > finalTotal) desc = finalTotal;
      finalTotal -= desc;
    }
    const totalTexto = `Total: ${formatCurrency(finalTotal)}`;

    const tenantId = getTenantId();

    const appointment = {
      tenant_id: tenantId,
      client_name: cliente.nome || 'Cliente',
      client_phone: cliente.telefone || '',
      service_id: bookingState.serviceId,
      profissional_id: bookingState.profissionalId || null,
      appointment_date: bookingState.selectedDate,
      appointment_time: bookingState.selectedTime,
      duration: calcTotalDuration(),
      status: 'confirmed',
      notes: [observacoes, extrasTexto, totalTexto].filter(Boolean).join(' | ') || null,
      branch_id: selectedBranchId || null
    };

    const result = await supaFetch('/rest/v1/appointments', {
      method: 'POST',
      body: appointment
    });

    if (result && result.length > 0) {
      showToast('Agendamento realizado com sucesso!', 'success');
      closeBookingModal();
      
      // Limpar campos
      const notes = document.getElementById('booking-notes');
      if(notes) notes.value = '';

      try {
        loadMyAppointments();
      } catch (err) {
        console.warn('Could not load appointments module:', err);
      }

    } else {
      showToast('Erro ao criar agendamento', 'error');
    }
  } catch (e) {
    console.error('Erro ao submeter agendamento:', e);
    showToast('Erro ao agendar. Tente novamente.', 'error');
  } finally {
    const btnSubmit = document.getElementById('btn-submit-booking');
    if (btnSubmit) {
      btnSubmit.disabled = false;
      btnSubmit.innerHTML = '<i data-lucide="check"></i> Confirmar Agendamento';
      if (window.lucide) lucide.createIcons();
    }
  }
}

// ────────────────────────── Inicialização ──────────────────────────

export function initBooking() {
  if (window._bookingInitialized) return;
  window._bookingInitialized = true;
  try {
    document.querySelectorAll('[data-close-booking]').forEach(btn => {
      btn.addEventListener('click', closeBookingModal);
    });

    const bookingModal = document.getElementById('booking-modal');
    if (bookingModal) {
      bookingModal.addEventListener('click', (e) => {
        if (e.target === bookingModal) closeBookingModal();
      });
    }

    document.getElementById('cal-prev')?.addEventListener('click', prevMonth);
    document.getElementById('cal-next')?.addEventListener('click', nextMonth);
    document.getElementById('btn-submit-booking')?.addEventListener('click', submitBooking);

    document.getElementById('btn-back-booking')?.addEventListener('click', () => goToStep(currentStep - 1));
    document.getElementById('btn-next-booking')?.addEventListener('click', () => goToStep(currentStep + 1));
    
    // Logica do cupom
    document.getElementById('btn-apply-coupon')?.addEventListener('click', async () => {
      const btn = document.getElementById('btn-apply-coupon');
      const originalBtnText = btn.innerHTML;
      const code = document.getElementById('coupon-code')?.value.toUpperCase();
      const msg = document.getElementById('coupon-message');
      
      if (!code) {
        msg.textContent = 'Digite um cupom válido.';
        msg.className = 'coupon-msg coupon-error';
        bookingState.discount = 0;
        bookingState.discountData = null;
        bookingState.couponCode = '';
        updateBookingSummary();
        return;
      }
      
      try {
        const tenantId = getTenantId();
        msg.textContent = 'Validando...';
        msg.className = 'coupon-msg';
        btn.innerHTML = '<i data-lucide="loader-2" class="lucide-spin"></i>';
        btn.disabled = true;
        if (window.lucide) lucide.createIcons();
        
        const result = await supaFetch(`/rest/v1/cupons?tenant_id=eq.${tenantId}&codigo=eq.${code}&select=*`);
        
        if (!result || result.length === 0) {
          bookingState.discount = 0;
          bookingState.discountData = null;
          bookingState.couponCode = '';
          msg.textContent = 'Cupom inválido ou inexistente.';
          msg.className = 'coupon-msg coupon-error';
        } else {
          const cupom = result[0];
          
          if (cupom.valido_ate) {
             const hoje = new Date();
             hoje.setHours(0,0,0,0);
             const exp = new Date(cupom.valido_ate);
             exp.setHours(23,59,59,999);
             if (hoje > exp) {
               bookingState.discount = 0;
               bookingState.discountData = null;
               bookingState.couponCode = '';
               msg.textContent = 'Cupom expirado.';
               msg.className = 'coupon-msg coupon-error';
               updateBookingSummary();
               return;
             }
          }
          
          bookingState.couponCode = code;
          bookingState.discountData = cupom; 
          
          if (cupom.desconto_percentual) {
            msg.textContent = `Cupom aplicado! Desconto de ${cupom.desconto_percentual}%`;
          } else if (cupom.desconto_fixo) {
            msg.textContent = `Cupom aplicado! Desconto de R$ ${cupom.desconto_fixo.toFixed(2).replace('.', ',')}`;
          }
          msg.className = 'coupon-msg coupon-success';
        }
      } catch(e) {
          console.error('Erro ao validar cupom:', e);
          msg.textContent = 'Erro ao validar cupom.';
          msg.className = 'coupon-msg coupon-error';
          bookingState.discount = 0;
          bookingState.discountData = null;
          bookingState.couponCode = '';
      } finally {
          btn.innerHTML = originalBtnText;
          btn.disabled = false;
          if (window.lucide) lucide.createIcons();
      }
      updateBookingSummary();
    });

  } catch (e) {
    console.error('Erro ao inicializar booking:', e);
  }
}

// (Removido exports do window)