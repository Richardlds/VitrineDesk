import { supabase } from '../core/supabaseClient.js';

export class relatoriosController {
    constructor() {
        this.chartMrr = null;
        this.chartPlanos = null;
    }

    async init() {
        try {
            await this.loadMetricsAndCharts();
            this.bindEvents();
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao inicializar relatórios:', error);
            if (window.showToast) window.showToast('Erro ao carregar módulo de Relatórios.', 'error');
        }
    }

    bindEvents() {
        const btnExport = document.getElementById('btn-export-reports');
        if (btnExport) {
            btnExport.addEventListener('click', () => {
                this.exportReportsCSV();
            });
        }
    }

    async exportReportsCSV() {
        try {
            if (window.showToast) window.showToast('Gerando Relatório...', 'info');
            
            const { data: tenants, error } = await supabase
                .from('tenants')
                .select('id, name, created_at, approval_status, settings')
                .order('created_at', { ascending: false });

            if (error) throw error;

            let csvContent = "data:text/csv;charset=utf-8,";
            csvContent += "ID,Loja,Data_Criacao,Status,Plano\n";

            tenants.forEach(t => {
                const date = new Date(t.created_at).toLocaleDateString('pt-BR');
                const plano = (t.settings?.plano || 'gratuito').toUpperCase();
                const status = t.approval_status || 'desconhecido';
                const row = `${t.id},"${t.name}",${date},${status},${plano}`;
                csvContent += row + "\n";
            });

            const encodedUri = encodeURI(csvContent);
            const link = document.createElement("a");
            link.setAttribute("href", encodedUri);
            link.setAttribute("download", `relatorio_vitrinedesk_${new Date().getTime()}.csv`);
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            if (window.showToast) window.showToast('Relatório exportado com sucesso!', 'success');
        } catch (error) {
            console.error('Erro ao exportar:', error);
            if (window.showToast) window.showToast('Erro ao exportar relatório.', 'error');
        }
    }

    async loadMetricsAndCharts() {
        try {
            // Buscar todas as lojas para montar os gráficos reais
            const { data: tenants, error } = await supabase
                .from('tenants')
                .select('id, name, created_at, approval_status, settings')
                .order('created_at', { ascending: false });

            if (error) throw error;

            let countPro = 0;
            let countStarter = 0;
            let countFree = 0;
            let churned = 0;

            const now = new Date();
            const recentTenants = [];

            tenants.forEach(t => {
                const plano = (t.settings?.plano || 'gratuito').toLowerCase();
                if (plano === 'pro') countPro++;
                else if (plano === 'starter') countStarter++;
                else countFree++;

                // Lojas reprovadas ou banidas
                if (t.approval_status === 'rejected' || t.settings?.banned) {
                    churned++;
                }

                // Recentes (últimos 30 dias)
                const createdDate = new Date(t.created_at);
                const diffTime = Math.abs(now - createdDate);
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)); 
                if (diffDays <= 30) {
                    recentTenants.push(t);
                }
            });

            // Regras de negócio fictícias para os KPIs
            // PRO = 97/mes, Starter = 47/mes
            const mrr = (countPro * 97) + (countStarter * 47);
            const grossRevenueAnualizado = mrr * 12;
            const payingCustomers = countPro + countStarter;
            const arpu = payingCustomers > 0 ? (mrr / payingCustomers) : 0;
            const churnRate = tenants.length > 0 ? ((churned / tenants.length) * 100).toFixed(1) : 0;

            document.getElementById('kpi-gross-revenue').textContent = grossRevenueAnualizado.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('kpi-arpu').textContent = arpu.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
            document.getElementById('kpi-churn').textContent = `${churnRate}%`;

            this.renderCharts(countPro, countStarter, countFree, mrr);
            this.renderRecentTable(recentTenants);

        } catch (error) {
            console.error('Erro ao buscar dados dos relatórios:', error);
            document.getElementById('table-body-recent-tenants').innerHTML = `
                <tr><td colspan="4" class="py-4 text-center text-danger">Erro ao carregar dados.</td></tr>
            `;
        }
    }

    renderCharts(pro, starter, free, currentMrr) {
        if (typeof Chart === 'undefined') {
            console.warn('Chart.js não está carregado.');
            return;
        }

        // Gráfico de Pizza (Distribuição)
        const ctxPlanos = document.getElementById('chart-plan-distribution')?.getContext('2d');
        if (ctxPlanos) {
            if (this.chartPlanos) this.chartPlanos.destroy();
            this.chartPlanos = new Chart(ctxPlanos, {
                type: 'doughnut',
                data: {
                    labels: ['PRO', 'Starter', 'Gratuito'],
                    datasets: [{
                        data: [pro, starter, free],
                        backgroundColor: ['#6366f1', '#06b6d4', 'rgba(255, 255, 255, 0.1)'],
                        borderWidth: 0,
                        hoverOffset: 4
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { position: 'bottom', labels: { color: '#a1a1aa' } }
                    },
                    cutout: '70%'
                }
            });
        }

        // Gráfico de Linha (Simulação de Crescimento de MRR baseada no MRR atual)
        const ctxMrr = document.getElementById('chart-mrr-growth')?.getContext('2d');
        if (ctxMrr) {
            if (this.chartMrr) this.chartMrr.destroy();
            
            // Simula dados dos ultimos 6 meses que culminam no MRR atual
            const baseMrr = currentMrr;
            const mrrData = [
                baseMrr * 0.4, 
                baseMrr * 0.5, 
                baseMrr * 0.65, 
                baseMrr * 0.8, 
                baseMrr * 0.9, 
                baseMrr
            ].map(v => Math.round(v));

            this.chartMrr = new Chart(ctxMrr, {
                type: 'line',
                data: {
                    labels: ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun'],
                    datasets: [{
                        label: 'MRR (R$)',
                        data: mrrData,
                        borderColor: '#10b981',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        borderWidth: 2,
                        fill: true,
                        tension: 0.4,
                        pointBackgroundColor: '#10b981',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        legend: { display: false }
                    },
                    scales: {
                        y: { 
                            beginAtZero: true, 
                            grid: { color: 'rgba(255, 255, 255, 0.05)' },
                            ticks: { color: '#a1a1aa' }
                        },
                        x: { 
                            grid: { display: false },
                            ticks: { color: '#a1a1aa' }
                        }
                    }
                }
            });
        }
    }

    renderRecentTable(recentTenants) {
        const tbody = document.getElementById('table-body-recent-tenants');
        if (!tbody) return;

        if (recentTenants.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-secondary">Nenhuma loja criada nos últimos 30 dias.</td></tr>';
            return;
        }

        let html = '';
        recentTenants.slice(0, 10).forEach(t => {
            const dateStr = new Date(t.created_at).toLocaleDateString('pt-BR');
            const plano = (t.settings?.plano || 'gratuito').toUpperCase();
            const badgePlano = plano === 'GRATUITO' ? 'bg-placeholder text-secondary' : 'bg-primary-light text-primary';
            
            let statusBadge = '<span class="badge bg-success-light text-success px-2 py-1 rounded text-xs">Ativa</span>';
            if (t.approval_status === 'pending') {
                statusBadge = '<span class="badge bg-warning-light text-warning px-2 py-1 rounded text-xs">Pendente</span>';
            } else if (t.settings?.banned) {
                statusBadge = '<span class="badge bg-danger-light text-danger px-2 py-1 rounded text-xs font-bold">Banida</span>';
            }

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-bold text-primary">${t.name}</div>
                    </td>
                    <td class="py-3 px-4 text-center text-secondary">${dateStr}</td>
                    <td class="py-3 px-4 text-center">
                        <span class="badge ${badgePlano} px-2 py-1 rounded text-xs font-bold">${plano}</span>
                    </td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        if (this.chartMrr) this.chartMrr.destroy();
        if (this.chartPlanos) this.chartPlanos.destroy();
    }
}
