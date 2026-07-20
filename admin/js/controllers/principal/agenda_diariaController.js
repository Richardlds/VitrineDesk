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
            return;
        }

        // Define as colunas dinamicamente
        wrapper.style.display = 'grid';
        wrapper.style.gridTemplateColumns = `80px repeat(${visibleProfs.length}, minmax(200px, 1fr))`;

        const visibleAppointments = this.appointments.filter(apt => {
            if (this.currentStatusFilter === 'pending') {
                if (apt.status === 'completed' || apt.status === 'cancelled') return false;
            } else if (this.currentStatusFilter === 'completed') {
                if (apt.status !== 'completed') return false;
            } else {
                if (apt.status === 'cancelled') return false;
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
                        const durationText = (apt.services && apt.services.duration) ? `${apt.services.duration}min` : '';
                        const realTime = apt.appointment_time.substring(0, 5);

                        html += `
                            <div class="matrix-card ${statusClass}" data-id="${apt.id}"${cardHeightStyle}>
                                <div class="font-bold text-sm line-clamp-1">${realTime} - ${clientName}</div>
                                <div class="text-xs opacity-80 line-clamp-1">${serviceName} ${durationText ? '('+durationText+')' : ''}</div>
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
                if (id && window.router) {
                    window.pendingAppointmentToView = id;
                    window.router.navigate('principal/agendamentos');
                }
            });
        });

        wrapper.querySelectorAll('.matrix-slot-empty').forEach(el => {
            el.addEventListener('click', () => {
                // Aqui podemos no futuro abrir o modal direto
                window.router.navigate('principal/agendamentos'); 
            });
        });

        if (window.lucide) window.lucide.createIcons();
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
