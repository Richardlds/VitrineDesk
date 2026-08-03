import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class agenda_diariaController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.realtimeChannel = null;
        
        this.appointments = [];
        this.profissionais = [];
        this.storeSettings = { openHour: 8, closeHour: 20 }; // Padrão
        
        // Filtros Ativos
        this.currentProfFilter = 'all';
        this.currentStatusFilter = 'all';
        this.currentDate = new Date();
    }
    
    async init() {
        
        await this.loadStoreSettings();
        await this.loadProfissionais();
        
        this.bindFilters();
        this.bindDateNavigation();
        
        this.updateDateDisplay();
        await this.loadInitialTimeline();
        await this.subscribeToRealtimeEvents();
        
        if (window.lucide) window.lucide.createIcons();
    }

    async loadStoreSettings() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase
                .from('tenants')
                .select('settings')
                .eq('id', tenantId)
                .single();

            if (!error && data && data.settings) {
                if (data.settings.opening_time) this.storeSettings.openHour = parseInt(data.settings.opening_time.split(':')[0]);
                if (data.settings.closing_time) this.storeSettings.closeHour = parseInt(data.settings.closing_time.split(':')[0]);
            }
        } catch (error) {
            console.log('Configurações da loja não encontradas, usando padrão 08:00 - 20:00.');
        }
    }

    bindDateNavigation() {
        const btnOntem = document.getElementById('btn-date-ontem');
        const btnHoje = document.getElementById('btn-date-hoje');
        const btnAmanha = document.getElementById('btn-date-amanha');
        const datePicker = document.getElementById('input-date-picker');

        const setDateAndLoad = (daysOffset) => {
            const date = new Date();
            date.setDate(date.getDate() + daysOffset);
            this.currentDate = date;
            this.updateDateDisplay();
            this.loadInitialTimeline();
        };

        if (btnOntem) btnOntem.addEventListener('click', () => setDateAndLoad(-1));
        if (btnHoje) btnHoje.addEventListener('click', () => setDateAndLoad(0));
        if (btnAmanha) btnAmanha.addEventListener('click', () => setDateAndLoad(1));

        if (datePicker) {
            datePicker.addEventListener('change', (e) => {
                if (e.target.value) {
                    const [year, month, day] = e.target.value.split('-');
                    this.currentDate = new Date(year, month - 1, day);
                    this.updateDateDisplay();
                    this.loadInitialTimeline();
                }
            });
        }
    }

    updateDateDisplay() {
        const btnOntem = document.getElementById('btn-date-ontem');
        const btnHoje = document.getElementById('btn-date-hoje');
        const btnAmanha = document.getElementById('btn-date-amanha');
        
        const resetBtn = (btn) => {
            if(!btn) return;
            btn.className = "btn btn-outline text-secondary border-dashed px-3 py-1 text-sm rounded-md cursor-pointer";
        };
        const activeBtn = (btn) => {
            if(!btn) return;
            btn.className = "btn bg-primary-light text-primary border border-primary px-3 py-1 text-sm rounded-md font-bold cursor-pointer";
        };

        resetBtn(btnOntem);
        resetBtn(btnHoje);
        resetBtn(btnAmanha);

        // O JS Date offset issue handler
        const formatD = (d) => {
            const y = d.getFullYear();
            const m = (d.getMonth() + 1).toString().padStart(2, '0');
            const day = d.getDate().toString().padStart(2, '0');
            return `${y}-${m}-${day}`;
        };
        
        const currentStr = formatD(this.currentDate);
        
        const dOntem = new Date(); dOntem.setDate(dOntem.getDate() - 1);
        const dHoje = new Date();
        const dAmanha = new Date(); dAmanha.setDate(dAmanha.getDate() + 1);

        if (currentStr === formatD(dOntem)) activeBtn(btnOntem);
        else if (currentStr === formatD(dHoje)) activeBtn(btnHoje);
        else if (currentStr === formatD(dAmanha)) activeBtn(btnAmanha);
        
        // Sincronizar o datepicker nativo
        const datePicker = document.getElementById('input-date-picker');
        if (datePicker) datePicker.value = currentStr;
    }

    bindFilters() {
        const statusBtns = document.querySelectorAll('#filter-status .agenda-filter-pill');
        statusBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                statusBtns.forEach(b => b.classList.remove('active'));
                const target = e.target;
                target.classList.add('active');
                
                this.currentStatusFilter = target.getAttribute('data-status');
                this.renderSlots();
            });
        });
    }

    renderProfFilters() {
        const filterProfsContainer = document.getElementById('filter-profs');
        if (!filterProfsContainer) return;

        let html = `
            <span class="text-xs text-secondary font-medium mr-1 uppercase">Equipe:</span>
            <button class="agenda-filter-pill flex align-center gap-1 ${this.currentProfFilter === 'all' ? 'active' : ''}" data-prof="all">Todos</button>
        `;

        this.profissionais.forEach(prof => {
            const shortName = prof.nome ? prof.nome.split(' ')[0] : 'Prof.';
            const isActive = this.currentProfFilter === prof.id ? 'active' : '';
            
            let photoHtml = '';
            if (prof.foto_url) {
                photoHtml = `<img src="${prof.foto_url}" class="avatar-sm pointer-events-none">`;
            } else if (prof.nome) {
                const inicial = prof.nome.charAt(0).toUpperCase();
                photoHtml = `<div class="avatar-sm pointer-events-none bg-primary text-white">${inicial}</div>`;
            }
            
            html += `<button class="agenda-filter-pill flex align-center gap-1 ${isActive}" data-prof="${prof.id}">
                        ${photoHtml} ${shortName}
                     </button>`;
        });

        filterProfsContainer.innerHTML = html;

        filterProfsContainer.querySelectorAll('.agenda-filter-pill').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.target.closest('.agenda-filter-pill');
                if (!target) return;
                this.currentProfFilter = target.getAttribute('data-prof');
                this.renderProfFilters(); 
                this.renderSlots();
            });
        });
    }
    
    async loadProfissionais() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;
            const activeBranchId = localStorage.getItem('active_branch_id');

            let query = supabase
                .from('profissionais')
                .select('id, nome, foto_url')
                .eq('tenant_id', tenantId)
                .order('nome', { ascending: true });

            if (activeBranchId) {
                query = query.contains('branch_ids', JSON.stringify([activeBranchId]));
            }

            const { data, error } = await query;

            if (error) throw error;
            this.profissionais = data || [];
            
            this.renderProfFilters();
        } catch (error) {
            console.error('Erro ao carregar profissionais', error);
        }
    }

    async loadInitialTimeline() {
        const loading = document.getElementById('agenda-loading');
        if (loading) loading.classList.remove('opacity-0', 'd-none');

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;
            const activeBranchId = localStorage.getItem('active_branch_id');

            const targetDateStr = this.currentDate.toISOString().split('T')[0];

            let query = supabase
                .from('appointments')
                .select('*, services(name, duration), profissionais(id, nome, foto_url)')
                .eq('tenant_id', tenantId)
                .eq('appointment_date', targetDateStr)
                .order('appointment_time', { ascending: true });

            if (activeBranchId) {
                query = query.eq('branch_id', activeBranchId);
            }

            const { data, error } = await query;

            if (error) throw error;
            this.appointments = data || [];
            
            this.renderSlots();
            
        } catch (error) {
            console.error('Erro ao buscar agendamentos', error);
        } finally {
            if (loading) {
                loading.classList.add('opacity-0');
                setTimeout(() => loading.classList.add('d-none'), 300);
            }
        }
    }

    renderSlots() {
        const wrapper = document.getElementById('agenda-matrix-wrapper');
        if (!wrapper) return;

        const visibleProfs = this.profissionais.filter(prof => {
            if (this.currentProfFilter === 'all') return true;
            return prof.id === this.currentProfFilter;
        });

        if (visibleProfs.length === 0) {
            wrapper.style.display = 'block';
            wrapper.innerHTML = `<div class="p-4 text-center text-secondary">Nenhum profissional para exibir.</div>`;
            
            const listWrapper = document.getElementById('agenda-list-wrapper');
            if (listWrapper) {
                listWrapper.innerHTML = `<div class="p-4 text-center text-secondary bg-placeholder rounded-md">Nenhum profissional para exibir.</div>`;
            }
            return;
        }

        // Define as colunas dinamicamente
        wrapper.style.display = ''; // Limpa o display style para usar a classe do CSS (d-md-grid)
        wrapper.style.gridTemplateColumns = `80px repeat(${visibleProfs.length}, minmax(200px, 1fr))`;

        const visibleAppointments = this.appointments.filter(apt => {
            if (this.currentStatusFilter === 'pending') {
                if (apt.status === 'completed' || apt.status === 'cancelled') return false;
            } else if (this.currentStatusFilter === 'completed') {
                if (apt.status !== 'completed') return false;
            } else {
                if (apt.status === 'cancelled') return false;
            }
            
            if (this.currentProfFilter !== 'all' && apt.profissional_id !== this.currentProfFilter) {
                return false;
            }
            
            return true;
        });

        let html = '';

        // 1. HEADER (Topo)
        html += `<div class="matrix-header-time"></div>`; // Canto superior esquerdo vazio
        visibleProfs.forEach(prof => {
            const shortName = prof.nome ? prof.nome.split(' ')[0] : 'Prof.';
            let photoHtml = `<div class="avatar-md bg-placeholder text-secondary"><i data-lucide="user" class="icon-sm"></i></div>`;
            
            if (prof.foto_url) {
                photoHtml = `<img src="${prof.foto_url}" class="avatar-md">`;
            } else if (prof.nome) {
                const inicial = prof.nome.charAt(0).toUpperCase();
                photoHtml = `<div class="avatar-md bg-primary text-white">${inicial}</div>`;
            }

            html += `
                <div class="matrix-header-prof">
                    ${photoHtml}
                    <span class="font-bold text-primary text-sm">${shortName}</span>
                </div>
            `;
        });

        const profBusyUntil = {};

        // 2. CORPO (Horários na esquerda e Células cruzadas)
        for (let h = this.storeSettings.openHour; h <= this.storeSettings.closeHour; h++) {
            ['00', '30'].forEach(m => {
                if (h === this.storeSettings.closeHour && m === '30') return; // Encerra na hora redonda
                
                const slotTime = `${h.toString().padStart(2, '0')}:${m}`;
                const nextSlotTime = m === '00' ? `${h.toString().padStart(2, '0')}:30` : `${(h+1).toString().padStart(2, '0')}:00`;
                const isHalfHour = m === '30';
                
                // A) Eixo Y: Célula de Tempo
                html += `<div class="matrix-cell-time ${isHalfHour ? 'half-hour' : ''}">${slotTime}</div>`;
                
                // B) Eixo X: Célula de cada profissional neste tempo
                visibleProfs.forEach(prof => {
                    // Verifica se está ocupado por um agendamento anterior (span)
                    if (profBusyUntil[prof.id] && slotTime < profBusyUntil[prof.id]) {
                        return; // Pula a renderização desta célula pois foi mesclada
                    }

                    const apt = visibleAppointments.find(a => {
                        if (a.profissional_id !== prof.id) return false;
                        if (!a.appointment_time) return false;
                        const time = a.appointment_time.substring(0, 5);
                        return time >= slotTime && time < nextSlotTime;
                    });

                    let cellStyle = '';
                    let cardHeightStyle = '';
                    
                    if (apt) {
                        const duration = (apt.services && apt.services.duration) ? parseInt(apt.services.duration) : 30;
                        let slotsToSpan = Math.ceil(duration / 30);
                        if (slotsToSpan < 1) slotsToSpan = 1;

                        if (slotsToSpan > 1) {
                            cellStyle = ` style="grid-row: span ${slotsToSpan};"`;
                            cardHeightStyle = ` style="height: 100%; box-sizing: border-box;"`;
                            
                            // Calcula até que horas está ocupado
                            let currentTotalMins = h * 60 + parseInt(m);
                            let endTotalMins = currentTotalMins + (slotsToSpan * 30);
                            let endH = Math.floor(endTotalMins / 60);
                            let endM = endTotalMins % 60;
                            profBusyUntil[prof.id] = `${endH.toString().padStart(2, '0')}:${endM.toString().padStart(2, '0')}`;
                        }
                    }

                    html += `<div class="matrix-cell-slot"${cellStyle}>`;

                    if (apt) {
                        let statusClass = apt.status === 'completed' ? 'status-completed' : '';
                        const clientName = apt.client_name || 'Sem Nome';
                        const serviceName = (apt.services && apt.services.name) ? apt.services.name : 'Serviço';
                        
                        const realTime = apt.appointment_time.substring(0, 5);
                        let durationMins = (apt.services && apt.services.duration) ? parseInt(apt.services.duration) : 30;
                        
                        // Cálculo de Início e Fim para exibir no Card
                        let startH = parseInt(realTime.substring(0, 2));
                        let startM = parseInt(realTime.substring(3, 5));
                        let totalStartMin = (startH * 60) + startM;
                        let totalEndMin = totalStartMin + durationMins;
                        let endH = Math.floor(totalEndMin / 60).toString().padStart(2, '0');
                        let endM = (totalEndMin % 60).toString().padStart(2, '0');
                        let endTimeStr = `${endH}:${endM}`;

                        html += `
                            <div class="matrix-card ${statusClass}" data-id="${apt.id}"${cardHeightStyle}>
                                <div class="font-bold text-xs opacity-80 mb-1 flex align-center gap-1">
                                    <i data-lucide="clock" class="icon-sm" style="width: 12px; height: 12px;"></i> ${realTime} - ${endTimeStr}
                                </div>
                                <div class="font-bold text-sm line-clamp-1">${clientName}</div>
                                <div class="text-xs opacity-80 line-clamp-1">${serviceName}</div>
                                ${apt.status === 'completed' ? '<div class="mt-1"><i data-lucide="check-circle" class="icon-sm text-success"></i></div>' : ''}
                            </div>
                        `;
                    } else {
                        html += `
                            <div class="matrix-slot-empty" data-time="${slotTime}" data-prof="${prof.id}">
                                <i data-lucide="plus" class="icon-sm"></i>
                            </div>
                        `;
                    }

                    html += `</div>`; // .matrix-cell-slot
                });
            });
        }

        wrapper.innerHTML = html;

        // Bind clicks
        wrapper.querySelectorAll('.matrix-card').forEach(el => {
            el.addEventListener('click', () => {
                const id = el.getAttribute('data-id');
                const apt = this.appointments.find(a => a.id === id);
                if (apt) {
                    this.openAppointmentDetails(apt);
                }
            });
        });

        wrapper.querySelectorAll('.matrix-slot-empty').forEach(el => {
            el.addEventListener('click', () => {
                // Aqui podemos no futuro abrir o modal direto
                window.router.navigate('principal/agendamentos'); 
            });
        });

        // 3. RENDERIZAR LISTA MOBILE
        const listWrapper = document.getElementById('agenda-list-wrapper');
        if (listWrapper) {
            let listHtml = '';
            if (visibleAppointments.length === 0) {
                listHtml = `<div class="p-4 text-center text-secondary bg-placeholder rounded-md">Nenhum agendamento para exibir.</div>`;
            } else {
                // Ordenar por horário
                const sortedApts = [...visibleAppointments].sort((a, b) => a.appointment_time.localeCompare(b.appointment_time));
                
                sortedApts.forEach(apt => {
                    const prof = this.profissionais.find(p => p.id === apt.profissional_id);
                    const profName = prof ? (prof.nome || 'Profissional') : 'Profissional';
                    const time = apt.appointment_time.substring(0, 5);
                    const serviceName = apt.services ? apt.services.name : 'Serviço';
                    const duration = apt.services ? parseInt(apt.services.duration) : 30;
                    const clientName = apt.client_name || 'Sem Nome';
                    
                    let statusClass = apt.status === 'completed' ? 'text-success bg-success-light' : 'text-warning bg-warning-light';
                    let statusText = apt.status === 'completed' ? 'Concluído' : (apt.status === 'pending' ? 'Pendente' : 'Confirmado');

                    listHtml += `
                        <div class="config-card p-3 flex flex-column gap-2 cursor-pointer border-left-solid hover:bg-hover transition" style="border-left-width: 4px; border-left-color: var(--color-primary);" onclick="window.controllers.agendaDiariaController.openAppointmentDetails('${apt.id}')">
                            <div class="flex justify-between align-center border-bottom-dashed pb-2">
                                <div class="font-bold text-lg text-primary">${time} <span class="text-xs font-normal text-secondary ml-1">(${duration} min)</span></div>
                                <span class="badge ${statusClass} px-2 py-1 rounded text-xs">${statusText}</span>
                            </div>
                            <div class="flex justify-between align-center mt-2">
                                <span class="font-bold text-base line-height-1">${clientName}</span>
                                <span class="text-sm text-secondary font-medium"><i data-lucide="scissors" class="icon-sm inline-block" style="vertical-align: middle;"></i> ${serviceName}</span>
                            </div>
                            <div class="flex align-center gap-2 mt-2 pt-2 border-top-dashed">
                                <div class="bg-primary-light text-primary rounded-full flex align-center justify-center font-bold text-xs" style="width: 24px; height: 24px;">${profName.charAt(0).toUpperCase()}</div>
                                <span class="text-sm text-secondary font-medium">${profName}</span>
                            </div>
                        </div>
                    `;
                });
            }
            listWrapper.innerHTML = listHtml;
        }

        if (window.lucide) window.lucide.createIcons();
    }

    openAppointmentDetails(apt) {
        const modal = document.getElementById('modal-appointment-details');
        const content = document.getElementById('modal-appt-content');
        if (!modal || !content) return;

        const clientName = apt.client_name || 'Sem Nome';
        const serviceName = (apt.services && apt.services.name) ? apt.services.name : 'Serviço';
        const profName = (apt.profissionais && apt.profissionais.nome) ? apt.profissionais.nome : 'Profissional';
        const price = (apt.services && apt.services.price) ? `R$ ${parseFloat(apt.services.price).toFixed(2).replace('.', ',')}` : 'Não informado';
        
                        
        const realTime = apt.appointment_time.substring(0, 5);
        let durationMins = (apt.services && apt.services.duration) ? parseInt(apt.services.duration) : 30;
        
        let startH = parseInt(realTime.substring(0, 2));
        let startM = parseInt(realTime.substring(3, 5));
        let totalStartMin = (startH * 60) + startM;
        let totalEndMin = totalStartMin + durationMins;
        let endH = Math.floor(totalEndMin / 60).toString().padStart(2, '0');
        let endM = (totalEndMin % 60).toString().padStart(2, '0');
        let endTimeStr = `${endH}:${endM}`;
        
        let statusBadge = '<span class="bg-warning-light text-warning px-2 py-1 rounded-sm text-xs font-bold">Pendente</span>';
        if (apt.status === 'completed') statusBadge = '<span class="bg-success-light text-success px-2 py-1 rounded-sm text-xs font-bold">Concluído</span>';
        if (apt.status === 'cancelled') statusBadge = '<span class="bg-danger-light text-danger px-2 py-1 rounded-sm text-xs font-bold">Cancelado</span>';

        let dateFormatted = 'Data não informada';
        if (apt.appointment_date) {
            const [y, m, d] = apt.appointment_date.split('-');
            dateFormatted = `${d}/${m}/${y}`;
        }

        content.innerHTML = `
            <!-- Sessão: Dados do Cliente -->
            <div class="grid grid-md-2 gap-3 mb-3">
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Nome do Cliente</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary flex align-center min-h-40px gap-2">
                        <div class="bg-primary text-white rounded-full w-24px h-24px flex align-center justify-center text-xs font-bold">${clientName.charAt(0).toUpperCase()}</div>
                        <span class="font-bold">${clientName}</span>
                    </div>
                </div>
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Telefone (Contato)</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary flex align-center min-h-40px font-medium">
                        ${(apt.clientes && apt.clientes.telefone) ? apt.clientes.telefone : '---'}
                    </div>
                </div>
            </div>

            <!-- Sessão: Dados do Serviço -->
            <div class="grid grid-md-2 gap-3 mb-3">
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Serviço Solicitado</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary flex align-center min-h-40px font-medium">
                        ${serviceName}
                    </div>
                </div>
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Profissional Responsável</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary flex align-center min-h-40px font-medium">
                        ${profName}
                    </div>
                </div>
            </div>

            <div class="grid grid-md-2 gap-3 mb-3">
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Data e Hora</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary flex align-center min-h-40px font-medium">
                        ${dateFormatted} às ${realTime} - ${endTimeStr}
                    </div>
                </div>
                <div class="form-group">
                    <label class="text-sm text-secondary font-medium block mb-1">Status do Agendamento</label>
                    <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 flex align-center min-h-40px">
                        ${statusBadge}
                    </div>
                </div>
            </div>

            <!-- Observações -->
            ${apt.notes ? `
            <div class="form-group mb-2">
                <label class="text-sm text-secondary font-medium block mb-1">Observações do Agendamento</label>
                <div class="w-100 bg-placeholder border-none rounded-md px-3 py-2 text-primary font-medium line-height-1-5">
                    ${apt.notes}
                </div>
            </div>
            ` : ''}
        `;

        if (window.lucide) window.lucide.createIcons();
        modal.classList.remove('d-none');
        
        // Listener para o botão de editar que navega pra página principal de agendamentos
        const btnEdit = document.getElementById('btn-edit-appt');
        if (btnEdit) {
            btnEdit.onclick = () => {
                modal.classList.add('d-none');
                if (window.router) {
                    window.pendingAppointmentToView = apt.id;
                    window.router.navigate('principal/agendamentos');
                }
            };
        }
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        this.realtimeChannel = supabase.channel('agenda-diaria-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'appointments',
                filter: `tenant_id=eq.${tenantId}` 
            }, payload => {
                const data = payload.new || payload.old;
                if (!data) return;

                const today = new Date().toISOString().split('T')[0];
                if (data.appointment_date === today) {
                    this.loadInitialTimeline(); // Atualiza tudo (banco, re-render)
                }
            })
            .subscribe();
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
            this.realtimeChannel = null;
        }
    }
}
