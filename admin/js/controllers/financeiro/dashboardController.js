import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class dashboardController {
    constructor(stateManager) {
        this.state = stateManager;
        this.chartInstance = null;
    }

    async init() {
        await this.loadDashboardData();
    }

    async loadDashboardData() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        const today = new Date();
        const year = today.getFullYear();
        const month = today.getMonth() + 1;
        
        const firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(year, month, 0).toISOString().split('T')[0];

        try {
            const { data: transacoes, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('due_date', firstDay)
                .lte('due_date', lastDay);

            if (error) throw error;

            this.updateMetrics(transacoes || []);
            this.renderChart(transacoes || [], year, month);
            this.renderProximosVencimentos(transacoes || []);

        } catch (error) {
            console.error('Erro ao carregar dashboard financeiro:', error);
            window.showToast('Erro ao carregar dados financeiros.', 'error');
        }
    }

    updateMetrics(transacoes) {
        let receitas = 0;
        let despesas = 0;

        transacoes.forEach(t => {
            if (t.type === 'income') receitas += parseFloat(t.amount);
            if (t.type === 'expense') despesas += parseFloat(t.amount);
        });

        const saldo = receitas - despesas;
        
        const formatBRL = (val) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(val);

        document.getElementById('fin-receitas-mes').textContent = formatBRL(receitas);
        document.getElementById('fin-despesas-mes').textContent = formatBRL(despesas);
        
        const elSaldo = document.getElementById('fin-saldo-mes');
        elSaldo.textContent = formatBRL(saldo);
        if (saldo < 0) {
            elSaldo.classList.remove('text-primary');
            elSaldo.classList.add('text-danger');
        } else {
            elSaldo.classList.remove('text-danger');
            elSaldo.classList.add('text-primary');
        }
    }

    renderChart(transacoes, year, month) {
        const ctx = document.getElementById('financeiro-chart');
        if (!ctx) return;

        // Agrupar por dia
        const daysInMonth = new Date(year, month, 0).getDate();
        const labels = Array.from({ length: daysInMonth }, (_, i) => `${i + 1}`);
        const dataReceitas = new Array(daysInMonth).fill(0);
        const dataDespesas = new Array(daysInMonth).fill(0);

        transacoes.forEach(t => {
            const dayIndex = parseInt(t.due_date.split('-')[2], 10) - 1;
            if (t.type === 'income') {
                dataReceitas[dayIndex] += parseFloat(t.amount);
            } else {
                dataDespesas[dayIndex] += parseFloat(t.amount);
            }
        });

        if (this.chartInstance) {
            this.chartInstance.destroy();
        }

        const isDarkMode = document.documentElement.getAttribute('data-theme') === 'dark';
        const textColor = isDarkMode ? '#94a3b8' : '#64748b';
        const gridColor = isDarkMode ? 'rgba(255,255,255,0.05)' : 'rgba(0,0,0,0.05)';

        this.chartInstance = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Receitas',
                        data: dataReceitas,
                        backgroundColor: 'rgba(34, 197, 94, 0.8)', // success
                        borderRadius: 4
                    },
                    {
                        label: 'Despesas',
                        data: dataDespesas,
                        backgroundColor: 'rgba(239, 68, 68, 0.8)', // danger
                        borderRadius: 4
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        labels: { color: textColor, font: { family: 'Inter, sans-serif' } }
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        grid: { color: gridColor },
                        ticks: { color: textColor }
                    },
                    x: {
                        grid: { display: false },
                        ticks: { color: textColor }
                    }
                }
            }
        });
    }

    renderProximosVencimentos(transacoes) {
        const container = document.getElementById('lista-proximos-vencimentos');
        if (!container) return;

        const todayDate = new Date();
        todayDate.setHours(0,0,0,0);
        
        const nextWeek = new Date(todayDate);
        nextWeek.setDate(nextWeek.getDate() + 7);

        // Filtra apenas contas a pagar (expense) pendentes, vencendo nos próximos 7 dias (ou atrasadas)
        const aVencer = transacoes.filter(t => {
            if (t.type !== 'expense' || t.status === 'paid') return false;
            
            const dueDate = new Date(t.due_date + 'T00:00:00');
            return dueDate <= nextWeek;
        });

        // Ordena pela data de vencimento
        aVencer.sort((a, b) => new Date(a.due_date) - new Date(b.due_date));

        if (aVencer.length === 0) {
            container.innerHTML = `
                <div class="flex flex-column align-center justify-center p-4 text-center">
                    <i data-lucide="check-circle-2" class="text-success icon-md mb-2"></i>
                    <p class="text-xs text-muted">Nenhuma conta a vencer nos próximos 7 dias.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        let html = '';
        aVencer.slice(0, 5).forEach(t => {
            const val = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount);
            const dateParts = t.due_date.split('-');
            const dateStr = `${dateParts[2]}/${dateParts[1]}`;
            
            const dueDate = new Date(t.due_date + 'T00:00:00');
            let colorClass = 'text-primary';
            if (dueDate < todayDate) colorClass = 'text-danger font-bold'; // Atrasado
            else if (dueDate.getTime() === todayDate.getTime()) colorClass = 'text-warning font-bold'; // Vence hoje

            html += `
                <div class="flex justify-between align-center p-3 bg-white bg-opacity-5 rounded-lg border-solid border-1 border-placeholder hover:bg-placeholder transition-colors">
                    <div>
                        <p class="text-sm font-bold text-primary">${t.description}</p>
                        <p class="text-xs ${colorClass}">Venc: ${dateStr}</p>
                    </div>
                    <span class="text-sm font-bold text-danger">${val}</span>
                </div>
            `;
        });

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        if (this.chartInstance) {
            this.chartInstance.destroy();
        }
    }
}
