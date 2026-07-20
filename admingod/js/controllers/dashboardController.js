import { supabase } from '../core/supabaseClient.js';

export class dashboardController {
    constructor() {
        this.chartInstance = null;
    }

    async init() {
        try {
            this.bindEvents(); // Vincula cliques imediatamente
            await this.loadMetrics(); // Carrega dados em background
        } catch (error) {
            console.error('Erro ao carregar Dashboard:', error);
            if (window.showToast) window.showToast('Erro ao carregar métricas globais.', 'error');
        }
    }

    async loadMetrics() {
        try {
            // 1. Tenants Totais e Cálculo de Vencidos/Trial + Gráfico (Agrupado)
            const { data: tenantsData, error: tenantsError } = await supabase
                .from('tenants')
                .select('id, created_at, approval_status, settings');

            if (tenantsError) throw tenantsError;

            let totalTenants = 0;
            let trialTenants = 0;
            let expiredTenants = 0;
            let newTenants = 0;

            const now = new Date();
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);

            // Variáveis para o Gráfico (Últimos 6 meses)
            const monthlyCounts = {};
            for (let i = 5; i >= 0; i--) {
                const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                const monthName = d.toLocaleDateString('pt-BR', { month: 'short' });
                monthlyCounts[monthName] = 0;
            }

            tenantsData.forEach(t => {
                totalTenants++;

                // Novas Lojas no Mês
                const createdDate = new Date(t.created_at);
                if (createdDate >= startOfMonth) newTenants++;

                // Dados para o Gráfico
                const monthName = createdDate.toLocaleDateString('pt-BR', { month: 'short' });
                if (monthlyCounts[monthName] !== undefined) {
                    monthlyCounts[monthName]++;
                }

                // Status: Vencido vs Trial
                if (t.approval_status === 'pending') {
                    trialTenants++;
                } else if (t.settings && t.settings.vencimento) {
                    const venc = new Date(t.settings.vencimento);
                    if (venc < now) {
                        expiredTenants++;
                    }
                }
            });

            const elTotalTenants = document.getElementById('kpi-total-tenants');
            if (elTotalTenants) elTotalTenants.textContent = totalTenants;
            
            const elNewTenants = document.getElementById('kpi-new-tenants');
            if (elNewTenants) elNewTenants.textContent = newTenants;
            
            const elTrialTenants = document.getElementById('kpi-trial-tenants');
            if (elTrialTenants) elTrialTenants.textContent = trialTenants;
            
            const elExpiredTenants = document.getElementById('kpi-expired-tenants');
            if (elExpiredTenants) elExpiredTenants.textContent = expiredTenants;

            // Renderizar Gráfico
            this.renderChart(Object.keys(monthlyCounts), Object.values(monthlyCounts));

        } catch (error) {
            console.error('Erro ao buscar Tenants:', error);
        }

        // 2. Clientes Totais
        try {
            const { count } = await supabase.from('clientes').select('*', { count: 'exact', head: true });
            const elTotalClients = document.getElementById('kpi-total-clients');
            if (elTotalClients) elTotalClients.textContent = count || 0;
        } catch (e) { console.error('Erro clientes:', e); }

        // 3. Agendamentos Totais
        try {
            const { count } = await supabase.from('appointments').select('*', { count: 'exact', head: true });
            const elTotalAppointments = document.getElementById('kpi-total-appointments');
            if (elTotalAppointments) elTotalAppointments.textContent = count || 0;
        } catch (e) { console.error('Erro appointments:', e); }

        // 4. Tickets Pendentes
        try {
            const { count } = await supabase.from('support_tickets')
                .select('*', { count: 'exact', head: true })
                .in('status', ['open', 'in_progress', 'aberto', 'pendente']);
            const elTotalTickets = document.getElementById('kpi-total-tickets');
            if (elTotalTickets) elTotalTickets.textContent = count || 0;
        } catch (e) { console.error('Erro tickets:', e); }

        // 5. Mensagens (Leads Não Lidos)
        try {
            const { count } = await supabase.from('site_contacts')
                .select('*', { count: 'exact', head: true })
                .eq('status', 'unread');
            const el = document.getElementById('kpi-unread-messages');
            if (el) el.textContent = count || 0;
        } catch (e) { console.error('Erro leads:', e); }
    }

    renderChart(labels, data) {
        const ctx = document.getElementById('chart-tenants');
        if (!ctx || !window.Chart) return;

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: 'Novas Lojas Criadas',
                    data: data,
                    backgroundColor: 'rgba(99, 102, 241, 0.8)', // primary color
                    borderColor: 'rgba(99, 102, 241, 1)',
                    borderWidth: 1,
                    borderRadius: 4
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
                        ticks: { stepSize: 1, color: '#a1a1aa' },
                        grid: { color: 'rgba(255,255,255,0.05)' }
                    },
                    x: {
                        ticks: { color: '#a1a1aa' },
                        grid: { display: false }
                    }
                }
            }
        });
    }

    bindEvents() {
        const contentArea = document.getElementById('app-content');
        if (contentArea) {
            // Delegação de eventos pura no container da SPA
            contentArea.addEventListener('click', (e) => {
                const btnSend = e.target.closest('#btn-send-broadcast');
                if (btnSend) {
                    this.sendBroadcast();
                }
            });
        }
    }

    async sendBroadcast() {
        const messageEl = document.getElementById('broadcast-message');
        const typeEl = document.getElementById('broadcast-type');

        const message = messageEl.value.trim();
        const type = typeEl.value;

        if (!message) {
            if (window.showToast) window.showToast('Digite uma mensagem para o broadcast.', 'warning');
            return;
        }

        if (window.showConfirm) {
            window.showConfirm(`Deseja enviar este aviso global (${type}) para todas as lojas agora?`, async () => {
                try {
                    // Pega todas as lojas para disparar a notificação
                    const { data: tenants, error: errTenants } = await supabase.from('tenants').select('id');
                    if (errTenants) throw errTenants;

                    if (tenants && tenants.length > 0) {
                        const notifications = tenants.map(t => ({
                            tenant_id: t.id,
                            type: type,
                            title: 'Mensagem do Sistema',
                            message: message,
                            is_read: false
                        }));

                        const { error } = await supabase.from('notifications').insert(notifications);
                        if (error) throw error;
                    }

                    if (window.showToast) window.showToast('Broadcast enviado com sucesso para toda a rede!', 'success');
                    messageEl.value = '';
                } catch (error) {
                    console.error('Erro ao enviar broadcast:', error);
                    if (window.showToast) window.showToast('Erro ao enviar o broadcast.', 'error');
                }
            });
        }
    }

    destroy() {
        // Limpeza se necessário
    }
}
