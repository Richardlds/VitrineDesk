import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class dashboardController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.timerId = null;
        this.chartInstance = null;
        this.currentDateFilter = new Date().toISOString().split('T')[0];
        
        // Estado do Filtro da Equipe
        this.teamAppointments = [];
        this.teamMembers = [];
        this.currentTeamFilter = 'todos';
    }
    
    async init() {
        this.bindEvents();
        await this.loadDashboardData();
    }
    
    async loadDashboardData() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error("Tenant não encontrado");
            const activeBranchId = localStorage.getItem('active_branch_id');

            // Pegar o primeiro dia do mês para os KPIs mensais
            const date = new Date();
            const firstDay = new Date(date.getFullYear(), date.getMonth(), 1).toISOString();
            
            // Buscar Agendamentos do Mês e calcular Receita
            let queryAppts = supabase
                .from('appointments')
                .select('*, services(name, price)')
                .eq('tenant_id', tenantId)
                .gte('created_at', firstDay);
            
            if (activeBranchId) {
                queryAppts = queryAppts.eq('branch_id', activeBranchId);
            }

            const { data: appts, error: apptsError } = await queryAppts;
                
            if (apptsError) throw apptsError;

            // Buscar Novos Clientes no Mês
            // Clientes are global per tenant typically, but if we need to filter by branch we can. 
            // The `clientes` table might not have branch_id. Let's leave it as global for now.
            const { count: novosClientes, error: clientesError } = await supabase
                .from('clientes')
                .select('*', { count: 'exact', head: true })
                .eq('tenant_id', tenantId)
                .gte('created_at', firstDay);

            if (clientesError) throw clientesError;

            let receita = 0;
            let agendamentos = appts ? appts.length : 0;
            
            if (appts) {
                appts.forEach(a => {
                    if (a.services && a.services.price) {
                        receita += Number(a.services.price);
                    }
                });
            }
            
            let ticketMedio = agendamentos > 0 ? (receita / agendamentos) : 0;

            const kpis = {
                receita,
                agendamentos,
                ticketMedio,
                novosClientes: novosClientes || 0
            };

            this.renderKpis(kpis);
            
            // Carregar agendamentos da lista separadamente usando o filtro
            await this.loadAppointmentsForDate(tenantId, this.currentDateFilter);
            
            // Carregar os próximos clientes da equipe
            await this.loadTeamNextAppointments(tenantId);

            this.renderChart(appts || []);
            
            if (window.lucide) {
                window.lucide.createIcons();
            }

        } catch (error) {
            console.error('Erro ao carregar dados do dashboard:', error);
            if (window.showToast) window.showToast('Erro ao carregar os dados reais do painel', 'error');
            
            // Renderiza tudo zerado como fallback
            this.renderKpis({ receita: 0, agendamentos: 0, ticketMedio: 0, novosClientes: 0 });
            this.renderAppointments([]);
            this.renderChart([]);
            if (window.lucide) window.lucide.createIcons();
        }
    }

    renderKpis(data) {
        const kpiContainer = document.getElementById('dashboard-kpis');
        if (!kpiContainer) return;

        let html = `
            <div class="config-card p-4 hover-float transition-all mb-0 flex flex-column justify-between border-none">
                <div class="flex justify-between align-center mb-3">
                    <div class="w-10 h-10 rounded-full bg-success-light flex align-center justify-center">
                        <i data-lucide="dollar-sign" class="text-success"></i>
                    </div>
                    <span class="badge bg-success-light text-success text-xs font-bold px-2 py-1 rounded">Este Mês</span>
                </div>
                <div>
                    <h3 class="text-3xl font-bold text-success mb-1">R$ ${data.receita.toFixed(2)}</h3>
                    <p class="text-secondary text-sm m-0">Receita Bruta</p>
                </div>
            </div>

            <div class="config-card p-4 hover-float transition-all mb-0 flex flex-column justify-between border-none">
                <div class="flex justify-between align-center mb-3">
                    <div class="w-10 h-10 rounded-full bg-primary-light flex align-center justify-center">
                        <i data-lucide="calendar-check" class="text-primary"></i>
                    </div>
                    <span class="badge bg-primary-light text-primary text-xs font-bold px-2 py-1 rounded">Agendados</span>
                </div>
                <div>
                    <h3 class="text-3xl font-bold text-primary mb-1">${data.agendamentos}</h3>
                    <p class="text-secondary text-sm m-0">Volume de Serviços</p>
                </div>
            </div>

            <div class="config-card p-4 hover-float transition-all mb-0 flex flex-column justify-between border-none">
                <div class="flex justify-between align-center mb-3">
                    <div class="w-10 h-10 rounded-full bg-placeholder flex align-center justify-center">
                        <i data-lucide="receipt" class="text-secondary"></i>
                    </div>
                    <span class="badge bg-placeholder text-secondary text-xs font-bold px-2 py-1 rounded">Média</span>
                </div>
                <div>
                    <h3 class="text-3xl font-bold text-primary mb-1">R$ ${data.ticketMedio.toFixed(2)}</h3>
                    <p class="text-secondary text-sm m-0">Ticket Médio</p>
                </div>
            </div>

            <div class="config-card p-4 hover-float transition-all mb-0 flex flex-column justify-between border-none">
                <div class="flex justify-between align-center mb-3">
                    <div class="w-10 h-10 rounded-full bg-warning-light flex align-center justify-center">
                        <i data-lucide="user-plus" class="text-warning"></i>
                    </div>
                    <span class="badge bg-warning-light text-warning text-xs font-bold px-2 py-1 rounded">Novos</span>
                </div>
                <div>
                    <h3 class="text-3xl font-bold text-warning mb-1">${data.novosClientes}</h3>
                    <p class="text-secondary text-sm m-0">Clientes Cadastrados</p>
                </div>
            </div>
        `;

        kpiContainer.innerHTML = html;
    }

    async loadAppointmentsForDate(tenantId, dateStr) {
        try {
            const listContainer = document.getElementById('upcoming-appointments-list');
            if (listContainer) listContainer.innerHTML = `<div class="text-center text-secondary py-3"><i data-lucide="loader" class="animate-spin icon-sm"></i> Carregando...</div>`;
            if (window.lucide) window.lucide.createIcons();
            const activeBranchId = localStorage.getItem('active_branch_id');

            let query = supabase
                .from('appointments')
                .select('id, appointment_time, client_name, client_phone, services(name), profissionais(nome, foto_url)')
                .eq('tenant_id', tenantId)
                .eq('appointment_date', dateStr)
                .order('appointment_time', { ascending: true });

            if (activeBranchId) {
                query = query.eq('branch_id', activeBranchId);
            }

            const { data: appts, error } = await query;

            if (error) throw error;

            const mappedAppointments = (appts || []).map(a => ({
                id: a.id,
                hora: a.appointment_time ? a.appointment_time.substring(0, 5) : '--:--',
                cliente: a.client_name || 'Desconhecido',
                telefone: a.client_phone || 'Sem contato',
                servico: (a.services && a.services.name) ? a.services.name : 'Serviço Padrão',
                cor: (a.services && a.services.color) ? a.services.color : 'var(--color-primary)',
                profissional: (a.profissionais && a.profissionais.nome) ? a.profissionais.nome : 'Sem Profissional',
                profissionalAvatar: (a.profissionais && a.profissionais.foto_url) ? a.profissionais.foto_url : null
            }));

            this.renderAppointments(mappedAppointments);
        } catch (e) {
            console.error("Erro ao carregar agendamentos do dia", e);
            this.renderAppointments([]);
        }
    }

    renderAppointments(appointments) {
        const listContainer = document.getElementById('upcoming-appointments-list');
        if (!listContainer) return;

        if (appointments.length === 0) {
            listContainer.innerHTML = `<p class="text-secondary text-center py-3">Nenhum agendamento para hoje.</p>`;
            return;
        }

        let html = '';
        appointments.forEach((apt, index) => {
            const orderLabel = `${index + 1}º`;
            const avatarHtml = apt.profissionalAvatar 
                ? `<img src="${apt.profissionalAvatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border: 1px solid var(--color-border);" title="${apt.profissional}">`
                : `<div style="width:20px; height:20px; border-radius:50%; background:var(--color-primary-light); color:var(--color-primary); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;" title="${apt.profissional}">${apt.profissional.substring(0,2).toUpperCase()}</div>`;
            
            // Format phone number nicely
            let phoneFmt = apt.telefone.replace(/\D/g, '');
            if(phoneFmt.length === 11) {
                phoneFmt = `(${phoneFmt.substring(0,2)}) ${phoneFmt.substring(2,7)}-${phoneFmt.substring(7,11)}`;
            } else {
                phoneFmt = apt.telefone;
            }

            html += `
                <div class="dash-apt-card" data-id="${apt.id}" style="border-left: 4px solid ${apt.cor}; position: relative; padding: 12px 16px;">
                    <div class="dash-apt-time" style="background: transparent; color: var(--color-text-primary); border-radius: 8px; padding: 0; min-width: 50px; border: 1px solid var(--color-border);">
                        <strong style="font-size: 1rem; color: ${apt.cor}; padding: 6px 0; display: block; text-align: center; border-bottom: 1px solid var(--color-border); width: 100%;">${apt.hora}</strong>
                        <span style="display: block; text-align: center; font-size: 0.65rem; padding: 4px 0; color: var(--color-text-secondary); font-weight: bold;">${orderLabel}</span>
                    </div>
                    
                    <div class="dash-apt-details" style="display: flex; flex-direction: column; gap: 4px;">
                        <div class="dash-apt-title" style="font-size: 1.05rem; margin-bottom: 0;">${apt.cliente}</div>
                        <div class="flex gap-3 mt-1" style="flex-wrap: wrap;">
                            <div class="dash-apt-info-row" style="color: var(--color-text-secondary); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                                <i data-lucide="phone" style="width:12px; height:12px;"></i> ${phoneFmt}
                            </div>
                            <div class="dash-apt-info-row" style="color: var(--color-text-secondary); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                                <i data-lucide="scissors" style="width:12px; height:12px;"></i> 
                                <span style="background: ${apt.cor}20; color: ${apt.cor}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${apt.servico}</span>
                            </div>
                        </div>
                    </div>

                    <div class="dash-apt-action flex align-center gap-2">
                        <div class="flex align-center gap-2 bg-placeholder px-2 py-1 rounded" style="font-size: 0.8rem; color: var(--color-text-secondary);">
                            ${avatarHtml}
                            <span class="d-none d-sm-inline">${apt.profissional.split(' ')[0]}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
    }

    async loadTeamNextAppointments(tenantId) {
        try {
            const listContainer = document.getElementById('team-next-appointments-list');
            if (!listContainer) return;
            
            listContainer.innerHTML = `<div class="text-center text-secondary py-3"><i data-lucide="loader" class="animate-spin icon-sm"></i> Carregando...</div>`;
            if (window.lucide) window.lucide.createIcons();
            
            const activeBranchId = localStorage.getItem('active_branch_id');
            const date = new Date();
            const todayStr = date.toISOString().split('T')[0];
            const timeNow = date.toTimeString().split(' ')[0].substring(0, 5);

            // 1. Buscar a equipe para renderizar os avatares (filtros)
            let profQuery = supabase
                .from('profissionais')
                .select('id, nome, foto_url')
                .eq('tenant_id', tenantId)
                .eq('ativo', true)
                .order('nome', { ascending: true });

            if (activeBranchId) {
                profQuery = profQuery.contains('branch_ids', JSON.stringify([activeBranchId]));
            }

            const { data: profs, error: profsError } = await profQuery;
            if (!profsError && profs) {
                this.teamMembers = profs;
            } else {
                this.teamMembers = [];
            }
            
            this.renderTeamFilters();

            // 2. Buscar os agendamentos futuros
            let query = supabase
                .from('appointments')
                .select('id, appointment_date, appointment_time, client_name, client_phone, profissional_id, services(name), profissionais(nome, foto_url)')
                .eq('tenant_id', tenantId)
                .gte('appointment_date', todayStr)
                .order('appointment_date', { ascending: true })
                .order('appointment_time', { ascending: true })
                .limit(40);

            if (activeBranchId) {
                query = query.eq('branch_id', activeBranchId);
            }

            const { data: appts, error } = await query;
            if (error) throw error;

            let futureAppts = appts || [];
            
            this.teamAppointments = futureAppts.map(a => {
                const dateParts = a.appointment_date.split('-');
                return {
                    id: a.id,
                    data_br: `${dateParts[2]}/${dateParts[1]}`,
                    hora: a.appointment_time ? a.appointment_time.substring(0, 5) : '--:--',
                    cliente: a.client_name || 'Desconhecido',
                    telefone: a.client_phone || '',
                    servico: (a.services && a.services.name) ? a.services.name : 'Serviço Padrão',
                    cor: (a.services && a.services.color) ? a.services.color : 'var(--color-primary)',
                    profissional_id: a.profissional_id,
                    profissional: (a.profissionais && a.profissionais.nome) ? a.profissionais.nome : 'Sem Profissional',
                    profissionalAvatar: (a.profissionais && a.profissionais.foto_url) ? a.profissionais.foto_url : null
                };
            });

            this.renderTeamAppointments();
        } catch (e) {
            console.error("Erro ao carregar próximos da equipe", e);
            const listContainer = document.getElementById('team-next-appointments-list');
            if(listContainer) listContainer.innerHTML = `<p class="text-secondary text-center py-3">Erro ao carregar dados.</p>`;
        }
    }

    renderTeamFilters() {
        const container = document.getElementById('team-filters-container');
        if (!container) return;

        // Container scrollável para pílulas
        let html = `<div class="dash-team-filters">`;

        // Pílula "Todos"
        const isTodos = this.currentTeamFilter === 'todos';
        html += `
            <div class="dash-team-pill team-filter-btn ${isTodos ? 'active' : ''}" data-id="todos">
                <i data-lucide="users" style="width:14px; height:14px;"></i> Todos
            </div>
        `;

        this.teamMembers.forEach(m => {
            const isActive = this.currentTeamFilter === String(m.id);
            
            // eslint-disable-next-line no-useless-assignment
            let avatarContent = `<i data-lucide="user" style="width:12px; height:12px;"></i>`;
            if (m.foto_url) {
                avatarContent = `<img src="${m.foto_url}" style="width:100%; height:100%; border-radius:50%; object-fit:cover;">`;
            } else {
                const init = m.nome.substring(0, 2).toUpperCase();
                avatarContent = init;
            }

            html += `
                <div class="dash-team-pill team-filter-btn ${isActive ? 'active' : ''}" data-id="${m.id}" title="${m.nome}">
                    <div class="dash-team-avatar">${avatarContent}</div>
                    <span>${m.nome.split(' ')[0]}</span>
                </div>
            `;
        });
        
        html += `</div>`;

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        const btns = container.querySelectorAll('.team-filter-btn');
        btns.forEach(btn => {
            btn.addEventListener('click', () => {
                this.currentTeamFilter = btn.getAttribute('data-id');
                this.renderTeamFilters();
                this.renderTeamAppointments();
            });
        });
    }

    renderTeamAppointments() {
        const listContainer = document.getElementById('team-next-appointments-list');
        if (!listContainer) return;

        let filtered = this.teamAppointments;
        if (this.currentTeamFilter !== 'todos') {
            filtered = filtered.filter(a => String(a.profissional_id) === this.currentTeamFilter);
        }

        filtered = filtered.slice(0, 6); // Limite visual

        if (filtered.length === 0) {
            listContainer.innerHTML = `<p class="text-secondary text-center py-3">Nenhum agendamento futuro encontrado.</p>`;
            return;
        }

        let html = '';
        filtered.forEach(apt => {
            const shortId = String(apt.id).substring(0, 6);
            const avatarHtml = apt.profissionalAvatar 
                ? `<img src="${apt.profissionalAvatar}" style="width:20px; height:20px; border-radius:50%; object-fit:cover; border: 1px solid var(--color-border);" title="${apt.profissional}">`
                : `<div style="width:20px; height:20px; border-radius:50%; background:var(--color-primary-light); color:var(--color-primary); display:flex; align-items:center; justify-content:center; font-size:10px; font-weight:bold;" title="${apt.profissional}">${apt.profissional.substring(0,2).toUpperCase()}</div>`;
            
            // Format phone number nicely
            let phoneFmt = apt.telefone.replace(/\D/g, '');
            if(phoneFmt.length === 11) {
                phoneFmt = `(${phoneFmt.substring(0,2)}) ${phoneFmt.substring(2,7)}-${phoneFmt.substring(7,11)}`;
            } else {
                phoneFmt = apt.telefone || 'Sem contato';
            }

            html += `
                <div class="dash-apt-card" data-id="${apt.id}" style="border-left: 4px solid ${apt.cor}; position: relative; padding: 12px 16px;">
                    <div class="dash-apt-time" style="background: transparent; color: var(--color-text-primary); border-radius: 8px; padding: 0; min-width: 50px; border: 1px solid var(--color-border);">
                        <strong style="font-size: 1rem; color: ${apt.cor}; padding: 6px 0; display: block; text-align: center; border-bottom: 1px solid var(--color-border); width: 100%;">${apt.hora}</strong>
                        <span style="display: block; text-align: center; font-size: 0.65rem; padding: 4px 0; color: var(--color-text-secondary);">${apt.data_br}</span>
                    </div>
                    
                    <div class="dash-apt-details" style="display: flex; flex-direction: column; gap: 4px;">
                        <div class="dash-apt-title" style="font-size: 1.05rem; margin-bottom: 0;">${apt.cliente}</div>
                        <div class="flex gap-3 mt-1" style="flex-wrap: wrap;">
                            <div class="dash-apt-info-row" style="color: var(--color-text-secondary); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                                <i data-lucide="phone" style="width:12px; height:12px;"></i> ${phoneFmt}
                            </div>
                            <div class="dash-apt-info-row" style="color: var(--color-text-secondary); font-size: 0.8rem; display: flex; align-items: center; gap: 4px;">
                                <i data-lucide="scissors" style="width:12px; height:12px;"></i> 
                                <span style="background: ${apt.cor}20; color: ${apt.cor}; padding: 2px 6px; border-radius: 4px; font-weight: 500;">${apt.servico}</span>
                            </div>
                        </div>
                    </div>

                    <div class="dash-apt-action flex align-center gap-2">
                        <div class="flex align-center gap-2 bg-placeholder px-2 py-1 rounded" style="font-size: 0.8rem; color: var(--color-text-secondary);">
                            ${avatarHtml}
                            <span class="d-none d-sm-inline">${apt.profissional.split(' ')[0]}</span>
                        </div>
                    </div>
                </div>
            `;
        });

        listContainer.innerHTML = html;
        if(window.lucide) window.lucide.createIcons();
    }

    renderChart(appointments) {
        const chartContainer = document.getElementById('chart-container');
        if (!chartContainer) return;
        
        // Setup Canvas
        chartContainer.innerHTML = '<canvas id="dashboard-chart" class="w-100" style="max-height: 300px;"></canvas>';
        const ctx = document.getElementById('dashboard-chart').getContext('2d');

        // Agrupar agendamentos por dia
        const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
        const dailyCounts = Array(daysInMonth).fill(0);
        
        appointments.forEach(apt => {
            if (apt.appointment_date) {
                // extrair o dia (Y-m-d)
                const day = parseInt(apt.appointment_date.split('-')[2], 10);
                if (day >= 1 && day <= daysInMonth) {
                    dailyCounts[day - 1]++;
                }
            }
        });
        
        const labels = Array.from({length: daysInMonth}, (_, i) => `${i + 1}`);

        // Destroy previous chart if exists
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        // Criar o Chart
        this.chartInstance = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Agendamentos',
                    data: dailyCounts,
                    borderColor: '#6366f1',
                    backgroundColor: 'rgba(99, 102, 241, 0.1)',
                    borderWidth: 2,
                    tension: 0.4,
                    fill: true
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: false
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            stepSize: 1,
                            color: '#a1a1aa'
                        },
                        grid: {
                            color: 'rgba(255,255,255,0.05)'
                        }
                    },
                    x: {
                        ticks: {
                            color: '#a1a1aa'
                        },
                        grid: {
                            display: false
                        }
                    }
                }
            }
        });
    }

    bindEvents() {
        const btnRefresh = document.getElementById('btn-refresh-dashboard');
        const btnNovoAgendamento = document.getElementById('btn-novo-agendamento-dash');
        
        if (btnRefresh) {
            btnRefresh.addEventListener('click', async () => {
                const originalHtml = btnRefresh.innerHTML;
                btnRefresh.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i>`;
                if(window.lucide) window.lucide.createIcons();
                
                await this.loadDashboardData();
                
                btnRefresh.innerHTML = originalHtml;
                if(window.lucide) window.lucide.createIcons();
                
                if (window.showToast) window.showToast('Dashboard atualizado', 'success');
            });
        }

        if (btnNovoAgendamento) {
            btnNovoAgendamento.addEventListener('click', () => {
                // Simula o clique no botão do menu lateral para usar o Router automaticamente
                const navBtn = document.querySelector('.nav-item[data-tab="principal/agendamentos"]');
                if (navBtn) {
                    navBtn.click();
                }
            });
        }
        
        const filterDateInput = document.getElementById('dash-filter-date');
        if (filterDateInput) {
            filterDateInput.value = this.currentDateFilter;
            filterDateInput.addEventListener('change', async (e) => {
                this.currentDateFilter = e.target.value;
                const tenantId = await getCurrentTenantId();
                if (tenantId) await this.loadAppointmentsForDate(tenantId, this.currentDateFilter);
            });
        }

        const apptList = document.getElementById('upcoming-appointments-list');
        if (apptList) {
            apptList.addEventListener('click', (e) => {
                const card = e.target.closest('.dash-apt-card');
                if (card) {
                    const id = card.getAttribute('data-id');
                    if (id) {
                        window.pendingAppointmentToView = id;
                        const navBtn = document.querySelector('.nav-item[data-tab="principal/agendamentos"]');
                        if (navBtn) navBtn.click();
                    }
                }
            });
        }
    }
    
    destroy() {
        if (this.timerId) {
            clearInterval(this.timerId);
            this.timerId = null;
        }
    }
}
