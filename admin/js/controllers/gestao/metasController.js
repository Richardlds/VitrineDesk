import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class metasController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.progressoCard = null;
        this.modal = null;
        this.form = null;
        this.realtimeChannel = null;
        
        // Paginação
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
    }
    
    async init() {
        this.tableBody = document.getElementById('metas-table-body');
        this.progressoCard = document.getElementById('metas-progresso-card');
        this.modal = document.getElementById('modal-meta');
        this.form = document.getElementById('form-meta');

        this.renderSkeletons();
        await this.loadMetas();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
    }

    renderSkeletons() {
        if (this.progressoCard) {
            this.progressoCard.innerHTML = `<div class="skeleton" style="height: 120px; border-radius: 8px;"></div>`;
        }
        if (this.tableBody) {
            let skeletonsHtml = '';
            for (let i = 0; i < 3; i++) {
                skeletonsHtml += `
                    <tr>
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
    }

    async getFaturamentoReal(mesAno, tenantId) {
        const [yyyy, mm] = mesAno.split('-');
        const start = new Date(yyyy, parseInt(mm) - 1, 1);
        const nextMonth = new Date(start);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        const { data: appts, error } = await supabase
            .from('appointments')
            .select('*, services(price)')
            .eq('tenant_id', tenantId)
            .neq('status', 'cancelled')
            .gte('appointment_date', start.toISOString().split('T')[0])
            .lt('appointment_date', nextMonth.toISOString().split('T')[0]);
            
        if (error) return 0;
        
        let faturamento = 0;
        if (appts) {
            appts.forEach(a => {
                if (a.services && a.services.price) {
                    faturamento += parseFloat(a.services.price);
                }
            });
        }
        return faturamento;
    }

    async getAgendamentosGraficos(mesAno, tenantId) {
        const [yyyy, mm] = mesAno.split('-');
        const start = new Date(yyyy, parseInt(mm) - 1, 1);
        const nextMonth = new Date(start);
        nextMonth.setMonth(nextMonth.getMonth() + 1);
        
        const { data: appts, error } = await supabase
            .from('appointments')
            .select('*, services(name, price), profissionais(nome)')
            .eq('tenant_id', tenantId)
            .neq('status', 'cancelled')
            .gte('appointment_date', start.toISOString().split('T')[0])
            .lt('appointment_date', nextMonth.toISOString().split('T')[0]);
            
        if (error) return [];
        return appts || [];
    }

    async loadMetas() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // Load metas from tenants.settings
            const { data: tenantData, error } = await supabase
                .from('tenants')
                .select('settings')
                .eq('id', tenantId)
                .single();
                
            if (error) throw error;
            
            const settings = tenantData?.settings || {};
            let allMetas = settings.metas || [];
            
            // Sort by mes_ano descending
            allMetas.sort((a, b) => b.mes_ano.localeCompare(a.mes_ano));

            this.totalItems = allMetas.length;
            
            // Local pagination
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage;
            const paginatedData = allMetas.slice(from, to);
            
            // Render Table
            // Melhor: o histórico já passou. Ideal seria armazenar o 'atingido' no DB ao virar o mês,
            // mas como VitrineDesk é dinâmico, vamos calcular em runtime pra mostrar o real.
            
            await this.renderTable(paginatedData, tenantId);
            this.updatePaginationUI();
            
            // Process Progresso Atual (Mês Corrente)
            const today = new Date();
            const currentMonthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
            
            const currentMeta = allMetas.find(m => m.mes_ano === currentMonthStr);
            if (currentMeta) {
                const atingido = await this.getFaturamentoReal(currentMonthStr, tenantId);
                this.renderProgresso(currentMeta.valor_alvo, atingido);
            } else {
                this.renderProgresso(0, 0, true);
            }

            // Charts
            const agendamentosGraficos = await this.getAgendamentosGraficos(currentMonthStr, tenantId);
            this.renderCharts(agendamentosGraficos);

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar metas:', error);
            if (window.showToast) window.showToast('Erro ao carregar metas', 'error');
        }
    }

    renderCharts(appts) {
        const chartsContainer = document.getElementById('metas-charts-container');
        if (!chartsContainer) return;
        
        // Se não houver agendamentos válidos, esconde os gráficos
        const validAppts = appts.filter(a => ['confirmed', 'completed'].includes(a.status));
        if (validAppts.length === 0) {
            chartsContainer.classList.add('d-none');
            return;
        }
        
        chartsContainer.classList.remove('d-none');
        
        // 1. Processar dados para Gráfico de Serviços (Doughnut)
        const faturamentoPorServico = {};
        validAppts.forEach(ag => {
            const sName = ag.services?.name || 'Serviço Avulso';
            const price = parseFloat(ag.services?.price || 0);
            if (!faturamentoPorServico[sName]) faturamentoPorServico[sName] = 0;
            faturamentoPorServico[sName] += price;
        });
        
        const servicosKeys = Object.keys(faturamentoPorServico);
        const servicosValues = Object.values(faturamentoPorServico);
        
        // 2. Processar dados para Gráfico de Profissionais (Bar)
        const faturamentoPorProf = {};
        validAppts.forEach(ag => {
            const pName = ag.profissionais?.nome || 'Não atribuído';
            const price = parseFloat(ag.services?.price || 0);
            if (!faturamentoPorProf[pName]) faturamentoPorProf[pName] = 0;
            faturamentoPorProf[pName] += price;
        });
        
        const proKeys = Object.keys(faturamentoPorProf);
        const proValues = Object.values(faturamentoPorProf);
        
        // Destruir gráficos anteriores se existirem (Chart.js requirement)
        if (this.chartServicos) this.chartServicos.destroy();
        if (this.chartProfissionais) this.chartProfissionais.destroy();
        
        const ctxServicos = document.getElementById('chart-metas-servicos');
        const ctxProfissionais = document.getElementById('chart-metas-profissionais');
        
        const chartOptions = {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { position: 'bottom', labels: { font: { family: 'Inter' } } }
            }
        };

        const colors = [
            '#3b82f6', // primary
            '#10b981', // success
            '#f59e0b', // warning
            '#ef4444', // danger
            '#8b5cf6', // purple
            '#06b6d4', // cyan
            '#f97316'  // orange
        ];
        
        // Gráfico de Serviços
        if (ctxServicos) {
            this.chartServicos = new Chart(ctxServicos, {
                type: 'doughnut',
                data: {
                    labels: servicosKeys,
                    datasets: [{
                        data: servicosValues,
                        backgroundColor: colors,
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    ...chartOptions,
                    cutout: '70%',
                    plugins: {
                        ...chartOptions.plugins,
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ' R$ ' + context.raw.toFixed(2);
                                }
                            }
                        }
                    }
                }
            });
        }
        
        // Gráfico de Profissionais
        if (ctxProfissionais) {
            this.chartProfissionais = new Chart(ctxProfissionais, {
                type: 'bar',
                data: {
                    labels: proKeys,
                    datasets: [{
                        label: 'Faturamento',
                        data: proValues,
                        backgroundColor: '#3b82f6',
                        borderRadius: 6
                    }]
                },
                options: {
                    ...chartOptions,
                    plugins: {
                        legend: { display: false },
                        tooltip: {
                            callbacks: {
                                label: function(context) {
                                    return ' R$ ' + context.raw.toFixed(2);
                                }
                            }
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                callback: function(value) {
                                    return 'R$ ' + value;
                                }
                            },
                            grid: { borderDash: [5, 5] }
                        },
                        x: {
                            grid: { display: false }
                        }
                    }
                }
            });
        }
    }

    renderProgresso(meta, atingido, noMeta = false) {
        if (!this.progressoCard) return;

        if (noMeta) {
            this.progressoCard.innerHTML = `
                <div class="config-card mb-0 bg-bg-surface flex flex-column transition-all" style="border: none; border-top: 4px solid var(--color-border); box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                    <div class="p-4 flex align-center gap-4">
                        <div class="kpi-icon-wrapper bg-placeholder" style="width: 48px; height: 48px;">
                            <i data-lucide="target" class="icon-md text-secondary"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-secondary text-lg mb-1 font-bold">Nenhuma meta definida</h3>
                            <p class="text-sm text-secondary m-0">Configure uma meta de faturamento para engajar a equipe neste mês.</p>
                        </div>
                        <button class="btn btn-primary shadow-sm hover-float" onclick="document.getElementById('btn-configurar-meta').click()">Configurar Meta</button>
                    </div>
                </div>
            `;
            return;
        }

        const percent = meta > 0 ? Math.min((atingido / meta) * 100, 100) : 0;
        let colorVar = 'var(--color-primary)';
        let textClass = 'text-primary';
        let bgLightClass = 'bg-primary-light';
        if (percent >= 100) { colorVar = 'var(--color-success)'; textClass = 'text-success'; bgLightClass = 'bg-success-light'; }
        else if (percent > 70) { colorVar = 'var(--color-primary)'; textClass = 'text-primary'; bgLightClass = 'bg-primary-light'; }
        else if (percent > 40) { colorVar = 'var(--color-warning)'; textClass = 'text-warning'; bgLightClass = 'bg-warning-light'; }
        else { colorVar = 'var(--color-danger)'; textClass = 'text-danger'; bgLightClass = 'bg-placeholder'; }

        this.progressoCard.innerHTML = `
            <div class="config-card mb-0 bg-bg-surface flex flex-column relative transition-all" style="border: none; border-top: 4px solid ${colorVar}; box-shadow: 0 8px 30px rgba(0,0,0,0.06);">
                <div class="p-4 flex align-center gap-4">
                    <div class="kpi-icon-wrapper ${bgLightClass}" style="width: 48px; height: 48px;">
                        <i data-lucide="target" class="icon-md ${textClass}"></i>
                    </div>
                    <div class="flex-1">
                        <div class="flex justify-between align-end mb-2">
                            <div>
                                <span class="text-xs font-bold text-secondary uppercase tracking-widest block mb-1">Progresso Atual</span>
                                <h3 class="text-2xl font-bold text-primary m-0">R$ ${atingido.toFixed(2)} <span class="text-sm font-medium text-secondary">de R$ ${meta.toFixed(2)}</span></h3>
                            </div>
                            <div class="text-xl font-bold ${textClass}">${percent.toFixed(1)}%</div>
                        </div>
                        <div class="progress-bar bg-placeholder rounded-full overflow-hidden w-100" style="height: 8px;">
                            <div class="progress-fill h-100 transition-all duration-500" style="width: ${percent}%; background-color: ${colorVar};"></div>
                        </div>
                        ${percent >= 100 ? `<p class="text-success text-sm mt-3 mb-0 flex align-center gap-1 font-bold"><i data-lucide="award" class="icon-sm"></i> Meta atingida com sucesso!</p>` : ''}
                    </div>
                </div>
            </div>
        `;
    }

    async renderTable(data, tenantId) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-3">Nenhuma meta configurada.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        for (const item of data) {
            // format YYYY-MM to MM/YYYY
            const [yyyy, mm] = item.mes_ano.split('-');
            const mesFormatado = `${mm}/${yyyy}`;
            
            const atingido = await this.getFaturamentoReal(item.mes_ano, tenantId);
            const percent = item.valor_alvo > 0 ? (atingido / item.valor_alvo) * 100 : 0;
            
            let statusConfig = { bgClass: 'bg-danger', lightClass: 'bg-danger-light', textClass: 'text-danger' };
            if (percent >= 100) {
                statusConfig = { bgClass: 'bg-success', lightClass: 'bg-success-light', textClass: 'text-success' };
            } else if (item.mes_ano === `${new Date().getFullYear()}-${String(new Date().getMonth()+1).padStart(2, '0')}`) {
                statusConfig = { bgClass: 'bg-primary', lightClass: 'bg-primary-light', textClass: 'text-primary' };
            }

            html += `
                <tr class="hover-bg-surface transition-colors">
                    <td class="py-3 px-3 border-bottom-dashed w-100">
                        <div class="flex align-center gap-3">
                            <div class="${statusConfig.lightClass} ${statusConfig.textClass} rounded-full flex justify-center align-center shadow-sm flex-shrink-0" style="width: 36px; height: 36px;">
                                <i data-lucide="calendar" class="icon-sm"></i>
                            </div>
                            <div class="flex flex-column flex-1" style="min-width: 0;">
                                <div class="flex justify-between align-center mb-1">
                                    <div class="flex flex-column truncate pr-2">
                                        <span class="font-bold text-primary text-sm truncate">${mesFormatado}</span>
                                        <span class="text-xs text-secondary truncate">Meta: R$ ${parseFloat(item.valor_alvo).toFixed(2)}</span>
                                    </div>
                                    <div class="flex flex-column align-end flex-shrink-0">
                                        <span class="text-xs font-bold ${statusConfig.textClass}">R$ ${atingido.toFixed(2)}</span>
                                        <span class="text-xs text-secondary">${percent.toFixed(0)}%</span>
                                    </div>
                                </div>
                                <div class="w-100 bg-placeholder rounded-full overflow-hidden" style="height: 4px;">
                                    <div class="${statusConfig.bgClass} rounded-full transition-all duration-500" style="width: ${Math.min(percent, 100)}%; height: 100%;"></div>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="text-right py-3 px-3 border-bottom-dashed" style="width: 1%;">
                        <div class="flex justify-end align-center">
                            <button class="btn btn-outline border-dashed text-danger hover-border-danger hover-bg-danger-light transition-colors text-xs px-2 rounded-md cursor-pointer btn-excluir-meta flex align-center justify-center font-bold" style="min-width: 32px; height: 32px;" data-id="${item.mes_ano}" title="Excluir Meta">
                                <i data-lucide="trash-2" class="icon-xs"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        }

        this.tableBody.innerHTML = html;
        
        const btnsExcluir = this.tableBody.querySelectorAll('.btn-excluir-meta');
        btnsExcluir.forEach(btn => {
            btn.addEventListener('click', async () => {
                const mesAno = btn.getAttribute('data-id');
                const conf = await window.showConfirm("Deseja realmente excluir esta meta?", "Aviso", "Excluir");
                if (conf) {
                    try {
                        const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
                        const settings = tenantData?.settings || {};
                        let metas = settings.metas || [];
                        
                        metas = metas.filter(m => m.mes_ano !== mesAno);
                        settings.metas = metas;
                        
                        const { error } = await supabase.from('tenants').update({ settings }).eq('id', tenantId);
                        
                        if (error) throw error;
                        if (window.showToast) window.showToast("Meta excluída!", "success");
                        this.loadMetas();
                    } catch(e) {
                        console.error(e);
                        if (window.showToast) window.showToast("Erro ao excluir meta", "error");
                    }
                }
            });
        });
    }

    async excluirMeta(id) {
        // Logic migrated to local renderTable listener for RLS compatibility
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-meta');
        const elFim = document.getElementById('pag-fim-meta');
        const elTotal = document.getElementById('pag-total-meta');
        const elAtual = document.getElementById('pag-atual-meta');
        const btnPrev = document.getElementById('btn-prev-page-meta');
        const btnNext = document.getElementById('btn-next-page-meta');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadMetas();
            return;
        }

        const startItem = this.totalItems === 0 ? 0 : ((this.currentPage - 1) * this.itemsPerPage) + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        elInicio.textContent = startItem;
        elFim.textContent = endItem;
        elTotal.textContent = this.totalItems;
        elAtual.textContent = `Pág. ${this.currentPage} de ${totalPages}`;

        btnPrev.disabled = this.currentPage === 1 || this.totalItems === 0;
        btnNext.disabled = this.currentPage === totalPages || this.totalItems === 0;
    }

    async saveMeta(e) {
        e.preventDefault();
        
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const mesAno = document.getElementById('input-meta-mes').value;
            const valor = parseFloat(document.getElementById('input-meta-valor').value);
            
            const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            const settings = tenantData?.settings || {};
            let metas = settings.metas || [];
            
            const existingIndex = metas.findIndex(m => m.mes_ano === mesAno);
            if (existingIndex >= 0) {
                metas[existingIndex].valor_alvo = valor;
            } else {
                metas.push({ mes_ano: mesAno, valor_alvo: valor });
            }
            
            settings.metas = metas;
            
            const { error: errorOp } = await supabase.from('tenants').update({ settings }).eq('id', tenantId);
            
            if (errorOp) throw errorOp;

            if (window.showToast) window.showToast('Meta salva com sucesso!', 'success');
            this.closeModal();
            this.loadMetas();
        } catch(err) {
            console.error(err);
            if (window.showToast) window.showToast('Erro ao salvar meta.', 'error');
        }
    }

    openModal() {
        if (!this.modal) return;
        const today = new Date();
        document.getElementById('input-meta-mes').value = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2, '0')}`;
        document.getElementById('input-meta-valor').value = '';
        this.modal.classList.remove('d-none');
    }

    closeModal() {
        if (!this.modal) return;
        this.modal.classList.add('d-none');
        if (this.form) this.form.reset();
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        const channelName = 'metas-channel-' + Date.now();
        this.realtimeChannel = supabase.channel(channelName)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'metas_desempenho',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadMetas();
            })
            // Também ouvir appointments para atualizar a barra viva
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'appointments',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadMetas();
            })
            .subscribe();
    }

    bindEvents() {
        const btnNova = document.getElementById('btn-configurar-meta');
        if (btnNova) btnNova.addEventListener('click', () => this.openModal());

        const btnClose = document.getElementById('btn-close-modal-meta');
        if (btnClose) btnClose.addEventListener('click', () => this.closeModal());

        if (this.form) this.form.addEventListener('submit', (e) => this.saveMeta(e));
        
        // Modal overlay click
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.closeModal();
            });
        }
        
        const btnPrev = document.getElementById('btn-prev-page-meta');
        const btnNext = document.getElementById('btn-next-page-meta');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadMetas();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadMetas();
                }
            });
        }
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
    }
}
