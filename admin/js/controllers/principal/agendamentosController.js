import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class agendamentosController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        
        // Pagination state
        this.currentPage = 1;
        this.pageSize = 10;
        this.totalItems = 0;
        
        // Filter state
        this.currentView = 'list';
        this.filterDate = 'todos';
        this.filterDateCustom = '';
        this.filterStatus = 'todos';
        this.filterProfessional = 'todos';
        this.filterService = 'todos';
        this.searchQuery = '';
        
        // Form Options
        this.servicesOptions = [];
        this.professionalsOptions = [];
        
        // Calendar State
        this.currentDateCalendar = new Date(); // Month currently being viewed

        this.searchTimeout = null;
        this.fullDataForCalendar = []; // store month's data for calendar
    }
    
    async init() {
        this.tableBody = document.getElementById('appointments-table-body');
        
        this.bindEvents();
        await this.loadFormOptions();
        this.renderSkeletons();
        await this.loadAgendamentos();

        if (window.pendingAppointmentToView) {
            const aptId = window.pendingAppointmentToView;
            window.pendingAppointmentToView = null;
            setTimeout(() => this.openViewModal(aptId), 100);
        }
    }

    async loadFormOptions() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // Fetch Services
            const { data: srvs } = await supabase.from('services').select('id, name').eq('tenant_id', tenantId);
            this.servicesOptions = srvs || [];
            
            // Fetch Professionals
            const { data: profs } = await supabase.from('profissionais').select('id, nome').eq('tenant_id', tenantId);
            this.professionalsOptions = profs || [];

            this.populateSelects();
        } catch (error) {
            console.error('Erro ao carregar selects do form', error);
        }
    }

    populateSelects() {
        const srvSelect = document.getElementById('apt-service-id');
        const profSelect = document.getElementById('apt-professional-id');
        const filterSrv = document.getElementById('filter-service');
        const filterProf = document.getElementById('filter-professional');

        const srvHtml = this.servicesOptions.map(s => `<option value="${s.id}">${s.name}</option>`).join('');
        const profHtml = this.professionalsOptions.map(p => `<option value="${p.id}">${p.nome}</option>`).join('');

        if (srvSelect) srvSelect.innerHTML = `<option value="">Selecione um serviço</option>` + srvHtml;
        if (profSelect) profSelect.innerHTML = `<option value="">Qualquer Profissional</option>` + profHtml;
        
        if (filterSrv) filterSrv.innerHTML = `<option value="todos">Qualquer Serviço</option>` + srvHtml;
        if (filterProf) filterProf.innerHTML = `<option value="todos">Qualquer Profissional</option>` + profHtml;
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        let skeletonsHtml = '';
        for (let i = 0; i < (this.pageSize || 5); i++) {
            skeletonsHtml += `
                <tr>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                </tr>
            `;
        }
        this.tableBody.innerHTML = skeletonsHtml;
    }
    
    async loadAgendamentos() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error("Tenant não encontrado");
            const activeBranchId = localStorage.getItem('active_branch_id');

            // Build Query for List View
            let query = supabase
                .from('appointments')
                .select('*, services(name), profissionais(nome, foto_url)', { count: 'exact' })
                .eq('tenant_id', tenantId);

            if (activeBranchId) {
                query = query.eq('branch_id', activeBranchId);
            }

            // Filtros de Lista
            if (this.filterDate !== 'todos') {
                const today = new Date();
                if (this.filterDate === 'hoje') {
                    const todayStr = today.toISOString().split('T')[0];
                    query = query.eq('appointment_date', todayStr);
                } else if (this.filterDate === 'amanha') {
                    const tomorrow = new Date(today);
                    tomorrow.setDate(tomorrow.getDate() + 1);
                    const tomorrowStr = tomorrow.toISOString().split('T')[0];
                    query = query.eq('appointment_date', tomorrowStr);
                } else if (this.filterDate === 'semana') {
                    const todayStr = today.toISOString().split('T')[0];
                    const nextWeek = new Date(today);
                    nextWeek.setDate(nextWeek.getDate() + 7);
                    const nextWeekStr = nextWeek.toISOString().split('T')[0];
                    query = query.gte('appointment_date', todayStr).lte('appointment_date', nextWeekStr);
                } else if (this.filterDate === 'mes') {
                    const firstDay = new Date(today.getFullYear(), today.getMonth(), 1).toISOString().split('T')[0];
                    const lastDay = new Date(today.getFullYear(), today.getMonth() + 1, 0).toISOString().split('T')[0];
                    query = query.gte('appointment_date', firstDay).lte('appointment_date', lastDay);
                } else if (this.filterDate === 'especifica' && this.filterDateCustom) {
                    query = query.eq('appointment_date', this.filterDateCustom);
                }
            }

            if (this.filterStatus !== 'todos') {
                query = query.ilike('status', this.filterStatus);
            }
            if (this.filterProfessional !== 'todos') {
                query = query.eq('profissional_id', this.filterProfessional);
            }
            if (this.filterService !== 'todos') {
                query = query.eq('service_id', this.filterService);
            }
            if (this.searchQuery) {
                query = query.ilike('client_name', `%${this.searchQuery}%`);
            }

            query = query.order('appointment_date', { ascending: false }).order('appointment_time', { ascending: false });

            // Paginação da Lista
            const from = (this.currentPage - 1) * this.pageSize;
            const to = from + this.pageSize - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;
            
            this.totalItems = count || 0;
            const mappedData = this.mapData(data);
            this.renderTable(mappedData);
            this.renderPaginationUI();

            // Fetch current month data for calendar regardless of list filters
            await this.loadCalendarData(tenantId);
            this.renderCalendar();

            if (window.lucide) window.lucide.createIcons();

        } catch (error) {
            console.error('Erro ao carregar agendamentos:', error);
            if (window.showToast) window.showToast('Erro ao carregar agendamentos', 'error');
            this.renderTable([]);
        }
    }

    async loadCalendarData(tenantId) {
        // Fetch all appointments for the currently viewed month
        const year = this.currentDateCalendar.getFullYear();
        const month = this.currentDateCalendar.getMonth();
        const firstDay = new Date(year, month, 1).toISOString().split('T')[0];
        const lastDay = new Date(year, month + 1, 0).toISOString().split('T')[0];

        const { data, error } = await supabase
            .from('appointments')
            .select('*, services(name)')
            .eq('tenant_id', tenantId)
            .gte('appointment_date', firstDay)
            .lte('appointment_date', lastDay);
        
        if (!error) {
            this.fullDataForCalendar = data || [];
        }
    }

    mapData(data) {
        return (data || []).map(apt => ({
            id: apt.id,
            cliente: apt.client_name || 'Sem Nome',
            telefone: apt.client_phone || '---',
            servico: (apt.services && apt.services.name) ? apt.services.name : '---',
            profissional: (apt.profissionais && apt.profissionais.nome) ? apt.profissionais.nome : 'Sem Profissional',
            profissionalAvatar: (apt.profissionais && apt.profissionais.foto_url) ? apt.profissionais.foto_url : null,
            data: apt.appointment_date ? this.formatDateBR(apt.appointment_date) : '---',
            hora: apt.appointment_time ? apt.appointment_time.substring(0, 5) : '--:--',
            status: apt.status || 'pending',
            raw: apt
        }));
    }

    formatDateBR(dateStr) {
        if (!dateStr) return '';
        const [year, month, day] = dateStr.split('-');
        return `${day}/${month}/${year}`;
    }

    renderTable(data) {
        if (!this.tableBody) return;
        if (data.length === 0) {
            this.tableBody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-3">Nenhum agendamento encontrado para os filtros atuais.</td></tr>`;
            return;
        }

        let html = '';
        data.forEach(item => {
            const statusConfig = this.getStatusConfig(item.status);
            
            const avatarHtml = item.profissionalAvatar 
                ? `<img src="${item.profissionalAvatar}" style="width:24px; height:24px; border-radius:50%; object-fit:cover; border: 1px solid var(--color-border);" title="${item.profissional}">`
                : `<div style="width:24px; height:24px; border-radius:50%; background:var(--color-primary-light); color:var(--color-primary); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;" title="${item.profissional}">${item.profissional.substring(0,2).toUpperCase()}</div>`;

            html += `
                <tr>
                    <td>
                        <div class="font-medium text-primary">${item.cliente}</div>
                        <div class="text-xs text-secondary">${item.telefone}</div>
                    </td>
                    <td class="text-sm">${item.servico}</td>
                    <td>
                        <div class="flex align-center gap-2 text-sm">
                            ${avatarHtml}
                            ${item.profissional}
                        </div>
                    </td>
                    <td>
                        <div class="font-medium text-sm">${item.data}</div>
                        <div class="text-xs text-secondary">${item.hora}</div>
                    </td>
                    <td class="text-center">
                        <span class="status-badge ${statusConfig.bgClass} ${statusConfig.textClass}">${statusConfig.label}</span>
                    </td>
                    <td class="text-right">
                        <button data-action="view" data-id="${item.id}" class="btn action-btn bg-transparent border-none text-secondary cursor-pointer" title="Ver Detalhes">
                            <i data-lucide="eye" class="icon-sm pointer-events-none"></i>
                        </button>
                        <button data-action="edit" data-id="${item.id}" class="btn action-btn bg-transparent border-none text-primary cursor-pointer" title="Editar">
                            <i data-lucide="edit" class="icon-sm pointer-events-none"></i>
                        </button>
                    </td>
                </tr>
            `;
        });
        this.tableBody.innerHTML = html;
        // Salvar data bruta em memoria para o modal
        this.currentTableData = data;
    }

    renderPaginationUI() {
        const infoEl = document.getElementById('pagination-info');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        if (!infoEl || !btnPrev || !btnNext) return;

        const totalPages = Math.ceil(this.totalItems / this.pageSize) || 1;
        infoEl.textContent = `Página ${this.currentPage} de ${totalPages} (${this.totalItems} registros)`;
        btnPrev.disabled = this.currentPage <= 1;
        btnNext.disabled = this.currentPage >= totalPages;
    }

    renderCalendar() {
        const grid = document.getElementById('calendar-grid');
        const monthLabel = document.getElementById('calendar-month-year');
        if (!grid || !monthLabel) return;

        const year = this.currentDateCalendar.getFullYear();
        const month = this.currentDateCalendar.getMonth();
        
        const monthNames = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
        monthLabel.textContent = `${monthNames[month]} ${year}`;

        const firstDay = new Date(year, month, 1).getDay(); // 0 (Sun) to 6 (Sat)
        const daysInMonth = new Date(year, month + 1, 0).getDate();

        let html = '';
        const daysOfWeek = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
        daysOfWeek.forEach(d => {
            html += `<div class="text-center text-secondary font-bold text-sm py-2">${d}</div>`;
        });

        // Empty slots before 1st
        for (let i = 0; i < firstDay; i++) {
            html += `<div class="bg-placeholder border-dashed border-none rounded-md" style="opacity: 0.3; min-height: 80px;"></div>`;
        }

        const today = new Date();
        const isCurrentMonth = (today.getMonth() === month && today.getFullYear() === year);

        // Days
        for (let day = 1; day <= daysInMonth; day++) {
            const isToday = isCurrentMonth && day === today.getDate();
            const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            
            // Find appointments for this day
            const dayAppts = this.fullDataForCalendar.filter(a => a.appointment_date === dateStr);
            dayAppts.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));

            let apptsHtml = '';
            dayAppts.slice(0, 3).forEach(apt => {
                const time = apt.appointment_time ? apt.appointment_time.substring(0, 5) : '--:--';
                apptsHtml += `<div class="text-xs bg-primary-light text-primary mb-1 p-1 rounded-sm truncate" title="${apt.client_name}">
                                <strong>${time}</strong> ${apt.client_name}
                              </div>`;
            });
            if (dayAppts.length > 3) {
                apptsHtml += `<div class="text-xs text-secondary text-center">+${dayAppts.length - 3} mais</div>`;
            }

            html += `
                <div class="bg-placeholder rounded-md p-2 relative flex flex-column cursor-pointer day-cell transition-all hover:border-secondary border-solid ${isToday ? 'border-primary' : 'border-transparent'}" style="min-height: 100px; border-width: 1px;" data-date="${dateStr}">
                    <div class="font-bold text-secondary mb-1 ${isToday ? 'text-primary' : ''}">${day}</div>
                    <div class="flex-1 flex flex-column gap-1 overflow-hidden pointer-events-none">
                        ${apptsHtml}
                    </div>
                </div>
            `;
        }

        grid.innerHTML = html;
    }

    openDailyView(dateStr) {
        document.getElementById('calendar-month-view').classList.add('d-none');
        const dailyContainer = document.getElementById('calendar-daily-view');
        dailyContainer.classList.remove('d-none');

        const dateObj = new Date(dateStr + "T12:00:00"); // avoid tz offset issues
        const title = document.getElementById('daily-view-title');
        title.textContent = `Agenda: ${this.formatDateBR(dateStr)}`;

        const timelineEl = document.getElementById('daily-timeline-container');
        
        // Obter agendamentos do dia
        const dayAppts = this.fullDataForCalendar.filter(a => a.appointment_date === dateStr);
        dayAppts.sort((a, b) => (a.appointment_time || '').localeCompare(b.appointment_time || ''));

        if (dayAppts.length === 0) {
            timelineEl.innerHTML = `<div class="text-center text-secondary py-4">Nenhum agendamento para este dia.</div>`;
            return;
        }

        let html = '';
        dayAppts.forEach(apt => {
            const time = apt.appointment_time ? apt.appointment_time.substring(0, 5) : '--:--';
            const statusConfig = this.getStatusConfig(apt.status);
            
            // Verifica se está acontecendo agora, se passou ou se é futuro (para colorir o dot)
            let statusClass = '';
            const today = new Date();
            const todayStr = today.toISOString().split('T')[0];
            if (dateStr < todayStr) {
                statusClass = 'past';
            } else if (dateStr === todayStr) {
                const nowTime = today.getHours().toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0');
                if (time < nowTime) statusClass = 'past';
                else if (time >= nowTime && time <= (today.getHours()+1).toString().padStart(2, '0') + ':' + today.getMinutes().toString().padStart(2, '0')) {
                    statusClass = 'active'; // Acontecendo na proxima hora
                }
            }

            const serviceName = (apt.services && apt.services.name) ? apt.services.name : '---';
            let profName = 'Sem Profissional';
            if (apt.profissionais && apt.profissionais.nome) {
                profName = apt.profissionais.nome;
            } else if (apt.profissional_id) {
                const p = this.professionalsOptions.find(pr => pr.id === apt.profissional_id);
                if (p) profName = p.nome;
            }

            html += `
                <div class="timeline-item ${statusClass}">
                    <div class="timeline-dot"></div>
                    <div class="timeline-time">${time}</div>
                    <div class="timeline-card cursor-pointer" onclick="document.querySelector('#appointments-table').dispatchEvent(new CustomEvent('openView', {detail: '${apt.id}'}))">
                        <div class="flex justify-between align-start mb-2">
                            <div>
                                <h4 class="m-0 text-primary">${apt.client_name || 'Sem Nome'}</h4>
                                <div class="m-0 text-secondary text-sm flex align-center gap-3 mt-1">
                                    <span class="flex align-center gap-1"><i data-lucide="scissors" class="icon-sm"></i> ${serviceName}</span>
                                    <span class="flex align-center gap-1"><i data-lucide="user" class="icon-sm"></i> ${profName}</span>
                                </div>
                            </div>
                            <span class="status-badge ${statusConfig.bgClass} ${statusConfig.textClass}">${statusConfig.label}</span>
                        </div>
                    </div>
                </div>
            `;
        });
        
        timelineEl.innerHTML = html;
        if(window.lucide) window.lucide.createIcons();
    }

    closeDailyView() {
        document.getElementById('calendar-daily-view').classList.add('d-none');
        document.getElementById('calendar-month-view').classList.remove('d-none');
    }

    getStatusConfig(status) {
        if (!status) status = 'pending'; // Fallback mapping for nulls
        switch (status.toLowerCase()) {
            case 'confirmed': return { label: 'Confirmado', bgClass: 'bg-primary-light', textClass: 'text-primary' };
            case 'pending': return { label: 'Pendente', bgClass: 'bg-warning-light', textClass: 'text-warning' };
            case 'completed': return { label: 'Concluído', bgClass: 'bg-success-light', textClass: 'text-success' };
            case 'cancelled': return { label: 'Cancelado', bgClass: 'bg-placeholder', textClass: 'text-secondary' };
            default: return { label: 'Pendente', bgClass: 'bg-warning-light', textClass: 'text-warning' }; // Strict fallback
        }
    }

    // Modal de Visualização (Read-Only)
    async openViewModal(aptId) {
        const modal = document.getElementById('view-apt-modal');
        if (!modal) return;

        let apt = (this.currentTableData || []).find(a => a.id == aptId);
        // Se não encontrar na memória local (ex: veio do calendario q puxou td o mes), tentamos achar na lista full
        let rawApt = apt ? apt.raw : null;
        if (!rawApt) {
            rawApt = this.fullDataForCalendar.find(a => a.id == aptId);
        }
        
        // Se ainda não achou, busca no banco (ex: clicou no dashboard e o modal abriu na agendamentos)
        if (!rawApt) {
            try {
                const tenantId = await getCurrentTenantId();
                const { data } = await supabase
                    .from('appointments')
                    .select('*, services(name), profissionais(nome)')
                    .eq('id', aptId)
                    .eq('tenant_id', tenantId)
                    .maybeSingle();
                rawApt = data;
            } catch (e) {
                console.error("Erro ao buscar agendamento pelo ID:", e);
            }
        }

        if (rawApt) {
            const clientName = rawApt.client_name || 'Sem Nome';
            const initial = clientName.charAt(0).toUpperCase();
            const phone = rawApt.client_phone || '';
            
            document.getElementById('view-client-initial').textContent = initial;
            document.getElementById('view-client-name').textContent = clientName;
            document.getElementById('view-client-phone').textContent = phone || 'Sem telefone';
            
            // Ocultar extra info e limpar até carregar
            const extraInfoEl = document.getElementById('view-client-extra-info');
            if (extraInfoEl) extraInfoEl.classList.add('d-none');
            
            // Tentar buscar o cliente real no banco pelo telefone (ou nome se não houver telefone?) 
            // O ideal é por telefone para ser preciso.
            if (phone) {
                try {
                    const tenantId = await getCurrentTenantId();
                    const { data: cliente } = await supabase
                        .from('clientes')
                        .select('cpf, data_nascimento, is_blacklisted, blacklist_motivo')
                        .eq('tenant_id', tenantId)
                        .eq('telefone', phone)
                        .maybeSingle();

                    if (cliente) {
                        const cpfEl = document.getElementById('view-client-cpf');
                        const dobEl = document.getElementById('view-client-dob');
                        const notesEl = document.getElementById('view-client-notes');

                        if (cpfEl) cpfEl.textContent = cliente.cpf || 'Não informado';
                        if (dobEl) {
                            dobEl.textContent = cliente.data_nascimento 
                                ? this.formatDateBR(cliente.data_nascimento) 
                                : 'Não informada';
                        }
                        if (notesEl) {
                            if (cliente.is_blacklisted) {
                                notesEl.innerHTML = `<span class="text-error font-bold">Bloqueado/Blacklist:</span> ${cliente.blacklist_motivo || ''}`;
                            } else {
                                notesEl.textContent = 'Sem observações críticas.';
                            }
                        }
                        
                        if (extraInfoEl) extraInfoEl.classList.remove('d-none');
                    }
                } catch (e) {
                    console.error("Erro ao buscar dados extras do cliente", e);
                }
            }
            
            document.getElementById('view-service').textContent = (rawApt.services && rawApt.services.name) ? rawApt.services.name : '---';
            
            // Profissional nome
            let profName = 'Sem Profissional';
            if (rawApt.profissionais && rawApt.profissionais.nome) {
                profName = rawApt.profissionais.nome;
            } else if (rawApt.profissional_id) {
                // Tentando buscar no form options caso n venha no join (pq calendario não puxou profissional no join para economizar, mas temos nas options)
                const p = this.professionalsOptions.find(pr => pr.id === rawApt.profissional_id);
                if (p) profName = p.nome;
            }
            document.getElementById('view-professional').textContent = profName;
            
            const dateStr = rawApt.appointment_date ? this.formatDateBR(rawApt.appointment_date) : '--/--/----';
            const timeStr = rawApt.appointment_time ? rawApt.appointment_time.substring(0, 5) : '--:--';
            document.getElementById('view-datetime').textContent = `${dateStr} às ${timeStr}`;

            const statusConfig = this.getStatusConfig(rawApt.status);
            document.getElementById('view-status-badge-container').innerHTML = `
                <span class="status-badge ${statusConfig.bgClass} ${statusConfig.textClass}">${statusConfig.label}</span>
            `;

            const btnEdit = document.getElementById('btn-edit-from-view');
            btnEdit.onclick = () => {
                this.closeViewModal();
                this.openModal(aptId);
            };

            modal.classList.remove('d-none');
            if(window.lucide) window.lucide.createIcons();
        }
    }

    closeViewModal() {
        const modal = document.getElementById('view-apt-modal');
        if (modal) modal.classList.add('d-none');
    }

    // Modal de Criação / Edição Logic
    openModal(aptId = null) {
        const modal = document.getElementById('appointment-modal');
        const form = document.getElementById('appointment-form');
        const title = document.getElementById('modal-apt-title');
        if (!modal || !form) return;

        form.reset();

        if (aptId) {
            title.textContent = "Editar Agendamento";
            // Find data in memory
            let rawApt = null;
            const apt = (this.currentTableData || []).find(a => a.id == aptId);
            if (apt) rawApt = apt.raw;
            if (!rawApt) rawApt = this.fullDataForCalendar.find(a => a.id == aptId);

            if (rawApt) {
                document.getElementById('apt-id').value = rawApt.id;
                document.getElementById('apt-client-name').value = rawApt.client_name || '';
                document.getElementById('apt-client-phone').value = rawApt.client_phone || '';
                document.getElementById('apt-service-id').value = rawApt.service_id || '';
                document.getElementById('apt-professional-id').value = rawApt.profissional_id || '';
                document.getElementById('apt-date').value = rawApt.appointment_date || '';
                document.getElementById('apt-time').value = rawApt.appointment_time ? rawApt.appointment_time.substring(0, 5) : '';
                document.getElementById('apt-status').value = rawApt.status || 'pending';
                
                // Buscar dados extras do cliente pelo telefone
                if (rawApt.client_phone) {
                    getCurrentTenantId().then(tenantId => {
                        supabase.from('clientes')
                            .select('cpf, data_nascimento')
                            .eq('tenant_id', tenantId)
                            .eq('telefone', rawApt.client_phone)
                            .maybeSingle()
                            .then(({ data }) => {
                                document.getElementById('apt-client-cpf').value = data?.cpf || '';
                                document.getElementById('apt-client-dob').value = data?.data_nascimento || '';
                            });
                    });
                }
            }
        } else {
            title.textContent = "Novo Agendamento";
            document.getElementById('apt-id').value = '';
            document.getElementById('apt-status').value = 'pending';
        }

        modal.classList.remove('d-none');
    }

    closeModal() {
        const modal = document.getElementById('appointment-modal');
        if (modal) modal.classList.add('d-none');
    }

    async saveAppointment(e) {
        e.preventDefault();
        
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error("Tenant não encontrado");

            const id = document.getElementById('apt-id').value;
            
            // Sanitize values
            const serviceId = document.getElementById('apt-service-id').value;
            const profId = document.getElementById('apt-professional-id').value;
            let timeVal = document.getElementById('apt-time').value;
            if (timeVal && timeVal.length === 5) timeVal += ':00'; // Formato HH:MM:SS necessário em alguns bancos postgres

            const clientName = document.getElementById('apt-client-name').value;
            const clientPhone = document.getElementById('apt-client-phone').value;
            const clientCpf = document.getElementById('apt-client-cpf').value;
            const clientDob = document.getElementById('apt-client-dob').value;

            const activeBranchId = localStorage.getItem('active_branch_id');

            const payload = {
                tenant_id: tenantId,
                client_name: clientName,
                client_phone: clientPhone,
                appointment_date: document.getElementById('apt-date').value,
                appointment_time: timeVal,
                status: document.getElementById('apt-status').value
            };
            
            if (activeBranchId) {
                payload.branch_id = activeBranchId;
            }
            
            // Apenas incluir se tiverem um UUID válido para evitar erro 400 de FK ou null string
            if (serviceId) payload.service_id = serviceId;
            else payload.service_id = null;
            if (profId) payload.profissional_id = profId;
            else payload.profissional_id = null;

            const btnSave = document.getElementById('btn-save-apt');
            const originalHtml = btnSave.innerHTML;
            btnSave.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
            btnSave.disabled = true;
            if(window.lucide) window.lucide.createIcons();

            let error;
            if (id) {
                // Update
                const res = await supabase.from('appointments').update(payload).eq('id', id).eq('tenant_id', tenantId);
                error = res.error;
            } else {
                // Insert
                const res = await supabase.from('appointments').insert([payload]);
                error = res.error;
            }

            // Sincronizar dados do cliente na tabela 'clientes' se tiver telefone
            if (!error && clientPhone) {
                const clientPayload = {
                    tenant_id: tenantId,
                    nome: clientName,
                    telefone: clientPhone,
                };
                if (clientCpf) clientPayload.cpf = clientCpf;
                if (clientDob) clientPayload.data_nascimento = clientDob;

                // Tenta atualizar, se não existir (ou não afetar linhas), insere
                const { data: existingClient } = await supabase.from('clientes')
                    .select('id')
                    .eq('tenant_id', tenantId)
                    .eq('telefone', clientPhone)
                    .maybeSingle();

                if (existingClient) {
                    await supabase.from('clientes').update(clientPayload).eq('id', existingClient.id);
                } else {
                    await supabase.from('clientes').insert([clientPayload]);
                }
            }

            btnSave.innerHTML = originalHtml;
            btnSave.disabled = false;
            if(window.lucide) window.lucide.createIcons();

            if (error) {
                console.error("Erro completo do Supabase:", JSON.stringify(error));
                throw error;
            }

            if (window.showToast) window.showToast('Agendamento salvo com sucesso!', 'success');
            this.closeModal();
            
            // Reload list and calendar
            this.renderSkeletons();
            this.loadAgendamentos();

        } catch (error) {
            console.error('Erro ao salvar:', error);
            let msg = 'Erro ao salvar agendamento';
            if (error && error.message) msg += ': ' + error.message;
            if (window.showToast) window.showToast(msg, 'error');
            const btnSave = document.getElementById('btn-save-apt');
            btnSave.disabled = false;
            btnSave.innerHTML = `<i data-lucide="save" class="icon-sm"></i> Salvar Agendamento`;
            if(window.lucide) window.lucide.createIcons();
        }
    }

    bindEvents() {
        // Toggle View (Lista/Calendario)
        const btnList = document.getElementById('btn-view-list');
        const btnCal = document.getElementById('btn-view-calendar');
        const viewList = document.getElementById('view-list-container');
        const viewCal = document.getElementById('view-calendar-container');

        const setView = (view) => {
            this.currentView = view;
            if (view === 'list') {
                btnList.classList.add('active');
                btnList.classList.remove('text-secondary');
                btnCal.classList.remove('active');
                btnCal.classList.add('text-secondary');
                viewList.classList.remove('d-none');
                viewCal.classList.add('d-none');
            } else {
                btnCal.classList.add('active');
                btnCal.classList.remove('text-secondary');
                btnList.classList.remove('active');
                btnList.classList.add('text-secondary');
                viewCal.classList.remove('d-none');
                viewList.classList.add('d-none');
            }
        };

        if (btnList) btnList.addEventListener('click', () => setView('list'));
        if (btnCal) btnCal.addEventListener('click', () => setView('calendar'));

        // Calendário Prev/Next Month
        const btnCalPrev = document.getElementById('btn-cal-prev');
        const btnCalNext = document.getElementById('btn-cal-next');
        
        if (btnCalPrev) btnCalPrev.addEventListener('click', async () => {
            this.currentDateCalendar.setMonth(this.currentDateCalendar.getMonth() - 1);
            const tenantId = await getCurrentTenantId();
            await this.loadCalendarData(tenantId);
            this.renderCalendar();
        });
        if (btnCalNext) btnCalNext.addEventListener('click', async () => {
            this.currentDateCalendar.setMonth(this.currentDateCalendar.getMonth() + 1);
            const tenantId = await getCurrentTenantId();
            await this.loadCalendarData(tenantId);
            this.renderCalendar();
        });

        // Clique nos dias do calendário
        const grid = document.getElementById('calendar-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const cell = e.target.closest('.day-cell');
                if (!cell) return;
                const dateStr = cell.getAttribute('data-date');
                if (dateStr) this.openDailyView(dateStr);
            });
        }

        // Voltar do Daily View
        const btnBackMonth = document.getElementById('btn-back-month');
        if (btnBackMonth) btnBackMonth.addEventListener('click', () => this.closeDailyView());

        // Evento custom para o timeline card abrir o modal
        const table = document.getElementById('appointments-table');
        if (table) {
            table.addEventListener('openView', (e) => {
                this.openViewModal(e.detail);
            });
        }

        // Filtros
        const dateFilter = document.getElementById('filter-date');
        const dateCustom = document.getElementById('filter-date-custom');
        const statusFilter = document.getElementById('filter-status');
        const profFilter = document.getElementById('filter-professional');
        const servFilter = document.getElementById('filter-service');
        
        const applyFilters = () => {
            if (dateFilter) {
                this.filterDate = dateFilter.value;
                if (this.filterDate === 'especifica') {
                    dateCustom.classList.remove('d-none');
                    if (!dateCustom.value) return; // wait user selection
                } else {
                    dateCustom.classList.add('d-none');
                }
            }
            if (dateCustom) this.filterDateCustom = dateCustom.value;
            if (statusFilter) this.filterStatus = statusFilter.value;
            if (profFilter) this.filterProfessional = profFilter.value;
            if (servFilter) this.filterService = servFilter.value;
            
            this.currentPage = 1;
            this.renderSkeletons();
            this.loadAgendamentos();
        };

        if (dateFilter) dateFilter.addEventListener('change', applyFilters);
        if (dateCustom) dateCustom.addEventListener('change', applyFilters);
        if (statusFilter) statusFilter.addEventListener('change', applyFilters);
        if (profFilter) profFilter.addEventListener('change', applyFilters);
        if (servFilter) servFilter.addEventListener('change', applyFilters);

        // Search com debounce
        const searchInput = document.getElementById('search-client');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    this.currentPage = 1;
                    this.renderSkeletons();
                    this.loadAgendamentos();
                }, 500);
            });
        }

        // Paginação
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

        if (btnPrev) btnPrev.addEventListener('click', () => {
            if (this.currentPage > 1) {
                this.currentPage--;
                this.renderSkeletons();
                this.loadAgendamentos();
            }
        });
        if (btnNext) btnNext.addEventListener('click', () => {
            const totalPages = Math.ceil(this.totalItems / this.pageSize);
            if (this.currentPage < totalPages) {
                this.currentPage++;
                this.renderSkeletons();
                this.loadAgendamentos();
            }
        });

        // Botões de Ação na Tabela (Editar / Ver)
        if (this.tableBody) {
            this.tableBody.addEventListener('click', (e) => {
                const btn = e.target.closest('.action-btn');
                if (!btn) return;
                const action = btn.getAttribute('data-action');
                const id = btn.getAttribute('data-id');
                if (action === 'edit') this.openModal(id);
                if (action === 'view') this.openViewModal(id);
            });
        }

        // Botão Novo Agendamento (Topo da tela)
        const btnNovoTop = document.querySelector('.admin-section > .flex > .btn-primary');
        if (btnNovoTop) btnNovoTop.addEventListener('click', () => this.openModal());

        // Modal Controls
        const btnCloseModal = document.getElementById('btn-close-apt-modal');
        const btnCancelModal = document.getElementById('btn-cancel-apt');
        const formModal = document.getElementById('appointment-form');

        const btnCloseView = document.getElementById('btn-close-view-modal');
        const btnOkView = document.getElementById('btn-ok-view');

        if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeModal());
        if (btnCancelModal) btnCancelModal.addEventListener('click', () => this.closeModal());
        if (formModal) formModal.addEventListener('submit', (e) => this.saveAppointment(e));

        if (btnCloseView) btnCloseView.addEventListener('click', () => this.closeViewModal());
        if (btnOkView) btnOkView.addEventListener('click', () => this.closeViewModal());
    }
    
    destroy() {
        clearTimeout(this.searchTimeout);
    }
}
