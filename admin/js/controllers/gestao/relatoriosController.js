import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class relatoriosController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.cardsContainer = null;
        this.periodo = 'mes';
    }
    
    async init() {
        this.servicesList = document.getElementById('relatorios-services-list');
        this.cardsContainer = document.getElementById('relatorios-cards');
        
        this.renderSkeletons();
        await this.loadData();
        this.bindEvents();
    }

    renderSkeletons() {
        if (this.cardsContainer) {
            let cardsHtml = '';
            for (let i = 0; i < 4; i++) {
                cardsHtml += `<div class="skeleton" style="height: 90px; border-radius: 12px;"></div>`;
            }
            this.cardsContainer.innerHTML = cardsHtml;
        }

        if (this.servicesList) {
            let skeletonsHtml = '';
            for (let i = 0; i < 3; i++) {
                skeletonsHtml += `<div class="cat-skeleton-card mb-2">
                    <div class="skeleton cat-sk-icon"></div>
                    <div class="skeleton cat-sk" style="width: 70%"></div>
                    <div class="skeleton cat-sk" style="width: 50px"></div>
                    <div class="skeleton cat-sk" style="width: 40px"></div>
                    <div class="skeleton cat-sk" style="width: 60px"></div>
                </div>`;
            }
            this.servicesList.innerHTML = skeletonsHtml;
        }
    }
    
    getDateRange() {
        const now = new Date();
        const range = { start: null, end: null };
        
        // Ajuste para pegar inicio e fim do dia considerando timezone
        if (this.periodo === 'hoje') {
            range.start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
            range.end = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59).toISOString();
        } else if (this.periodo === 'semana') {
            const firstDay = new Date(now.setDate(now.getDate() - now.getDay()));
            firstDay.setHours(0,0,0,0);
            range.start = firstDay.toISOString();
            
            const lastDay = new Date(firstDay);
            lastDay.setDate(lastDay.getDate() + 6);
            lastDay.setHours(23,59,59,999);
            range.end = lastDay.toISOString();
        } else if (this.periodo === 'mes') {
            range.start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            range.end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        } else if (this.periodo === 'ano') {
            range.start = new Date(now.getFullYear(), 0, 1).toISOString();
            range.end = new Date(now.getFullYear(), 11, 31, 23, 59, 59).toISOString();
        }
        return range;
    }

    async loadData() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();
            const { start, end } = this.getDateRange();

            // Buscar appointments do período
            let queryAppts = supabase
                .from('appointments')
                .select('*, services(name, price)')
                .eq('tenant_id', tenantId)
                .neq('status', 'cancelled')
                .gte('appointment_date', start.split('T')[0])
                .lte('appointment_date', end.split('T')[0]);

            // Buscar assinaturas ativas para calcular MRR
            let querySubs = supabase
                .from('client_subscriptions')
                .select('*, tenant_client_plans(name, price, id)')
                .eq('tenant_id', tenantId)
                .eq('status', 'active');

            const [resAppts, resSubs] = await Promise.all([queryAppts, querySubs]);
            
            if (resAppts.error) throw resAppts.error;
            if (resSubs.error) throw resSubs.error;

            const appts = resAppts.data;
            const subs = resSubs.data;

            // Calcular Faturamento Agendamentos
            let faturamentoAgendamentos = 0;
            let agendamentos = appts ? appts.length : 0;
            const uniqueClients = new Set();
            const servicosStats = {};
            const faturamentoPorDia = {};

            if (appts) {
                appts.forEach(appt => {
                    if (appt.client_email) uniqueClients.add(appt.client_email);
                    else if (appt.client_phone) uniqueClients.add(appt.client_phone);

                    const dataAppt = appt.appointment_date;
                    if (!faturamentoPorDia[dataAppt]) faturamentoPorDia[dataAppt] = 0;

                    if (appt.services) {
                        const price = parseFloat(appt.services.price || 0);
                        faturamentoAgendamentos += price;
                        faturamentoPorDia[dataAppt] += price;
                        
                        const sName = appt.services.name;
                        if (!servicosStats[sName]) {
                            servicosStats[sName] = { nome: sName, qtd: 0, receita: 0 };
                        }
                        servicosStats[sName].qtd += 1;
                        servicosStats[sName].receita += price;
                    }
                });
            }

            // Calcular Faturamento Assinaturas (MRR)
            let faturamentoAssinaturas = 0;
            let assinaturasAtivas = subs ? subs.length : 0;
            
            if (subs) {
                subs.forEach(sub => {
                    if (sub.tenant_client_plans && sub.tenant_client_plans.price) {
                        faturamentoAssinaturas += parseFloat(sub.tenant_client_plans.price);
                    }
                });
            }
            
            const faturamentoTotal = faturamentoAgendamentos + faturamentoAssinaturas;
            const ticketMedio = agendamentos > 0 ? faturamentoAgendamentos / agendamentos : 0;

            const metrics = {
                faturamento: faturamentoTotal,
                faturamentoAgendamentos: faturamentoAgendamentos,
                faturamentoAssinaturas: faturamentoAssinaturas,
                agendamentos: agendamentos,
                assinaturas: assinaturasAtivas,
                ticketMedio: ticketMedio,
                novosClientes: uniqueClients.size
            };

            const topServices = Object.values(servicosStats).sort((a, b) => b.receita - a.receita).slice(0, 5);

            this.renderCards(metrics);
            this.renderTable(topServices);
            this.renderCharts(faturamentoPorDia, faturamentoAgendamentos, faturamentoAssinaturas);

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error);
            if (window.showToast) window.showToast('Erro ao carregar relatórios. Tente novamente.', 'error');
        }
    }

    renderCharts(faturamentoPorDia, fatAgendamentos, fatAssinaturas) {
        if (typeof ApexCharts === 'undefined') {
            console.warn('ApexCharts não carregado.');
            return;
        }

        // Gráfico de Evolução (Linha/Área)
        const elEvolucao = document.querySelector("#chart-receita-evolucao");
        if (elEvolucao) {
            elEvolucao.innerHTML = '';
            // Ordenar dias
            const sortedDays = Object.keys(faturamentoPorDia).sort();
            const seriesData = sortedDays.map(dia => faturamentoPorDia[dia]);
            const labels = sortedDays.map(dia => {
                const [y, m, d] = dia.split('-');
                return `${d}/${m}`;
            });

            const optEvolucao = {
                series: [{
                    name: 'Agendamentos',
                    data: seriesData.length ? seriesData : [0]
                }],
                chart: {
                    type: 'area',
                    height: 300,
                    toolbar: { show: false },
                    fontFamily: 'inherit',
                    background: 'transparent'
                },
                colors: ['#3B82F6'],
                fill: {
                    type: 'gradient',
                    gradient: {
                        shadeIntensity: 1,
                        opacityFrom: 0.4,
                        opacityTo: 0.05,
                        stops: [0, 90, 100]
                    }
                },
                dataLabels: { enabled: false },
                stroke: { curve: 'smooth', width: 3 },
                xaxis: {
                    categories: labels.length ? labels : ['Nenhum dado'],
                    labels: { style: { colors: 'var(--text-secondary)' } },
                    axisBorder: { show: false },
                    axisTicks: { show: false }
                },
                yaxis: {
                    labels: {
                        style: { colors: 'var(--text-secondary)' },
                        formatter: (val) => 'R$ ' + val.toFixed(0)
                    }
                },
                grid: {
                    borderColor: 'rgba(255, 255, 255, 0.05)',
                    strokeDashArray: 4
                },
                theme: { mode: 'dark' }
            };

            const chartEvolucao = new ApexCharts(elEvolucao, optEvolucao);
            chartEvolucao.render();
        }

        // Gráfico de Composição (Donut)
        const elComposicao = document.querySelector("#chart-receita-composicao");
        if (elComposicao) {
            elComposicao.innerHTML = '';
            
            const hasData = fatAgendamentos > 0 || fatAssinaturas > 0;
            
            const optComposicao = {
                series: hasData ? [fatAgendamentos, fatAssinaturas] : [1, 0],
                labels: ['Agendamentos', 'Assinaturas (MRR)'],
                chart: {
                    type: 'donut',
                    height: 300,
                    fontFamily: 'inherit',
                    background: 'transparent'
                },
                colors: ['#3B82F6', '#10B981'], // Primary (Azul), Success (Verde)
                plotOptions: {
                    pie: {
                        donut: {
                            size: '70%',
                            labels: {
                                show: true,
                                name: { color: 'var(--text-secondary)' },
                                value: {
                                    color: 'var(--text-main)',
                                    formatter: (val) => 'R$ ' + parseFloat(val).toFixed(2)
                                },
                                total: {
                                    show: true,
                                    label: 'Total',
                                    color: 'var(--text-main)',
                                    formatter: function (w) {
                                        const total = w.globals.seriesTotals.reduce((a, b) => a + b, 0);
                                        return hasData ? 'R$ ' + total.toFixed(2) : 'R$ 0.00';
                                    }
                                }
                            }
                        }
                    }
                },
                dataLabels: { enabled: false },
                stroke: { show: false },
                legend: {
                    position: 'bottom',
                    labels: { colors: 'var(--text-main)' }
                },
                theme: { mode: 'dark' }
            };

            const chartComposicao = new ApexCharts(elComposicao, optComposicao);
            chartComposicao.render();
        }
    }

    renderCards(metrics) {
        if (!this.cardsContainer) return;
        
        this.cardsContainer.innerHTML = `
            <div class="metric-card fade-in">
                <div class="flex justify-between align-center mb-1">
                    <span class="kpi-label">Faturamento Total</span>
                    <div class="kpi-icon-wrapper bg-success-light">
                        <i data-lucide="dollar-sign" class="icon-sm text-success"></i>
                    </div>
                </div>
                <div class="kpi-value text-success">R$ ${metrics.faturamento.toFixed(2)}</div>
                <p class="text-xs text-secondary mt-1">Soma de Serviços + Assinaturas</p>
            </div>

            <div class="metric-card fade-in" style="animation-delay: 0.1s;">
                <div class="flex justify-between align-center mb-1">
                    <span class="kpi-label">Receita Recorrente (MRR)</span>
                    <div class="kpi-icon-wrapper bg-primary-light">
                        <i data-lucide="crown" class="icon-sm text-primary"></i>
                    </div>
                </div>
                <div class="kpi-value text-primary">R$ ${metrics.faturamentoAssinaturas.toFixed(2)}</div>
                <p class="text-xs text-secondary mt-1">${metrics.assinaturas} Assinatura(s) Ativa(s)</p>
            </div>

            <div class="metric-card fade-in" style="animation-delay: 0.2s;">
                <div class="flex justify-between align-center mb-1">
                    <span class="kpi-label">Agendamentos</span>
                    <div class="kpi-icon-wrapper" style="background-color: rgba(255,255,255,0.05);">
                        <i data-lucide="calendar-check" class="icon-sm text-secondary"></i>
                    </div>
                </div>
                <div class="kpi-value text-main">${metrics.agendamentos}</div>
                <p class="text-xs text-secondary mt-1">R$ ${metrics.faturamentoAgendamentos.toFixed(2)} faturados</p>
            </div>

            <div class="metric-card fade-in" style="animation-delay: 0.3s;">
                <div class="flex justify-between align-center mb-1">
                    <span class="kpi-label">Ticket Médio (Serviços)</span>
                    <div class="kpi-icon-wrapper" style="background-color: rgba(255,255,255,0.05);">
                        <i data-lucide="trending-up" class="icon-sm text-secondary"></i>
                    </div>
                </div>
                <div class="kpi-value text-main">R$ ${metrics.ticketMedio.toFixed(2)}</div>
                <p class="text-xs text-secondary mt-1">Gasto médio por serviço</p>
            </div>
        `;
    }

    renderTable(data) {
        if (!this.servicesList) return;

        if (!data || data.length === 0) {
            this.servicesList.innerHTML = `
                <div class="cat-empty">
                    <div class="cat-empty-icon">
                        <i data-lucide="inbox" class="w-24px h-24px"></i>
                    </div>
                    <h3 class="text-primary m-0">Nenhum dado encontrado</h3>
                    <p class="text-secondary text-sm m-0">Nenhum serviço foi agendado neste período.</p>
                </div>
            `;
            return;
        }

        let html = '';
        data.forEach((item, index) => {
            let delay = index * 0.05;
            // Destaca os 3 primeiros com cores diferentes
            let status = 'ideal'; // verde default
            if (index === 0) status = 'baixo'; // amarelo para top 1
            if (index === 1) status = 'zerado'; // vermelho para top 2

            html += `
            <div class="cat-card fade-in" data-status="${status}" style="animation-delay: ${delay}s;">
                <div class="cat-card-icon-wrap text-secondary">
                    <i data-lucide="star" class="icon-sm"></i>
                </div>
                
                <div class="cat-card-main">
                    <span class="cat-card-sku">TOP ${index + 1}</span>
                    <div class="cat-card-name">${item.nome}</div>
                    <div class="cat-card-type">Serviço</div>
                </div>

                <div class="cat-card-price text-success">
                    R$ ${item.receita.toFixed(2)}
                </div>

                <div class="cat-card-stock" style="min-width: 60px;">
                    <span class="cat-card-stock-val text-primary">${item.qtd}</span>
                    <span class="cat-card-stock-label" style="text-transform: none; letter-spacing: normal;">Vezes</span>
                </div>

                <div class="cat-badge" style="visibility: hidden;"></div>
                <div class="cat-card-actions" style="display: none;"></div>
            </div>
            `;
        });

        this.servicesList.innerHTML = html;
    }

    bindEvents() {
        const selectPeriodo = document.getElementById('filtro-periodo');
        if (selectPeriodo) {
            selectPeriodo.addEventListener('change', (e) => {
                this.periodo = e.target.value;
                this.loadData();
            });
        }
        
        const btnExport = document.getElementById('btn-export-relatorio');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                if (window.showToast) window.showToast('Exportação iniciada. O download começará em breve.', 'success');
                // Lógica de exportação real exigiria biblioteca externa tipo SheetJS,
                // Aqui podemos apenas logar ou simular
            });
        }
    }

    destroy() {
        // Limpar listeners se necessário
    }
}
