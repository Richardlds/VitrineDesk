export class dashboardController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tenantId = null;
    }

    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
    }

    async init() {
        console.log("Dashboard inicializado.");
        
        // Obter tenantId
        const { supabase, getCurrentTenantId } = await import('../../core/supabaseClient.js');
        this.tenantId = await getCurrentTenantId();
        if (!this.tenantId) return;

        this.supabase = supabase;

        await this.loadData();
        
        // Renderiza os icones Lucide se disponíveis
        if (window.lucide) {
            window.lucide.createIcons();
        }

        // Botão de Copiar Link da Loja
        const btnCopyLink = document.getElementById('btn-dashboard-copy-link');
        if (btnCopyLink) {
            btnCopyLink.addEventListener('click', () => {
                const slug = window.currentTenantSlug || 'loja';
                const baseUrl = window.location.origin;
                const vitrineUrl = `${baseUrl}/${slug}`;
                
                navigator.clipboard.writeText(vitrineUrl).then(() => {
                    if (window.showToast) window.showToast('Link da loja copiado para a área de transferência!', 'success');
                }).catch(err => {
                    console.error('Erro ao copiar link:', err);
                    if (window.showToast) window.showToast('Erro ao copiar link. Tente novamente.', 'error');
                });
            });
        }
    }

    async loadData() {
        const today = new Date();
        const todayStr = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0') + '-' + String(today.getDate()).padStart(2, '0');
        
        const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);
        const firstDayOfMonthStr = firstDayOfMonth.getFullYear() + '-' + String(firstDayOfMonth.getMonth() + 1).padStart(2, '0') + '-' + '01';

        const firstDayOfWeek = new Date(today);
        firstDayOfWeek.setDate(today.getDate() - today.getDay());
        const firstDayOfWeekStr = firstDayOfWeek.getFullYear() + '-' + String(firstDayOfWeek.getMonth() + 1).padStart(2, '0') + '-' + String(firstDayOfWeek.getDate()).padStart(2, '0');

        // 1. Agendamentos de Hoje
        const { data: appointmentsToday } = await this.supabase
            .from('appointments')
            .select('*, profissionais(nome), services(name, price)')
            .eq('tenant_id', this.tenantId)
            .eq('appointment_date', todayStr)
            .order('appointment_time', { ascending: true });

        // 2. Agendamentos do Mês (Para Ticket Médio e Rankings)
        const { data: appointmentsMonth } = await this.supabase
            .from('appointments')
            .select('*, profissionais(nome), services(name, price)')
            .eq('tenant_id', this.tenantId)
            .gte('appointment_date', firstDayOfMonthStr);

        // 3. Clientes Novos
        const { count: countNovosClientesMes } = await this.supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', this.tenantId)
            .gte('created_at', firstDayOfMonthStr);

        const { count: countNovosClientesSemana } = await this.supabase
            .from('clientes')
            .select('*', { count: 'exact', head: true })
            .eq('tenant_id', this.tenantId)
            .gte('created_at', firstDayOfWeekStr);

        // 4. Assinaturas Ativas
        const { data: activeSubscriptions } = await this.supabase
            .from('client_subscriptions')
            .select('*, tenant_client_plans(price)')
            .eq('tenant_id', this.tenantId)
            .eq('status', 'active');

        // 5. Agendamentos dos últimos 7 dias (Para o Gráfico)
        const last7Days = new Date(today);
        last7Days.setDate(today.getDate() - 6);
        const last7DaysStr = last7Days.getFullYear() + '-' + String(last7Days.getMonth() + 1).padStart(2, '0') + '-' + String(last7Days.getDate()).padStart(2, '0');
        
        const { data: appointments7Days } = await this.supabase
            .from('appointments')
            .select('appointment_date, services(price), status')
            .eq('tenant_id', this.tenantId)
            .gte('appointment_date', last7DaysStr)
            .lte('appointment_date', todayStr);

        this.renderCards(appointmentsToday || [], appointmentsMonth || [], countNovosClientesMes || 0, countNovosClientesSemana || 0, activeSubscriptions || []);
        this.renderChart7Days(appointments7Days || [], last7Days);
        this.renderAgendamentos(appointmentsToday || []);
        this.renderRankings(appointmentsMonth || []);
    }

    renderCards(apptsToday, apptsMonth, novosClientesMes, novosClientesSemana, activeSubscriptions) {
        // Faturamento Hoje
        const faturamentoHoje = apptsToday
            .filter(a => ['completed', 'confirmed'].includes(a.status))
            .reduce((sum, a) => sum + parseFloat(a.services?.price || 0), 0);

        // Agendamentos Hoje
        const qtdAgendamentosHoje = apptsToday.length;

        // Assinaturas e MRR
        let mrr = 0;
        activeSubscriptions.forEach(sub => {
            if (sub.tenant_client_plans && sub.tenant_client_plans.price) {
                mrr += parseFloat(sub.tenant_client_plans.price);
            }
        });

        const fmtMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        const elFat = document.getElementById('dash-faturamento-hoje');
        if (elFat) elFat.textContent = fmtMoney.format(faturamentoHoje);

        const elAgend = document.getElementById('dash-agendamentos-hoje');
        if (elAgend) elAgend.textContent = qtdAgendamentosHoje;

        const elNovos = document.getElementById('dash-novos-clientes');
        if (elNovos) elNovos.textContent = novosClientesMes;

        const elNovosSemana = document.getElementById('dash-novos-clientes-semana');
        if (elNovosSemana) elNovosSemana.textContent = `+${novosClientesSemana} na semana`;

        const elAssinaturas = document.getElementById('dash-assinaturas-ativas');
        if (elAssinaturas) elAssinaturas.textContent = activeSubscriptions.length;

        const elMRR = document.getElementById('dash-assinaturas-mrr');
        if (elMRR) elMRR.innerHTML = `<i data-lucide="dollar-sign" style="width:12px;height:12px;"></i> MRR: ${fmtMoney.format(mrr)}`;
    }

    renderChart7Days(appts7Days, startDate) {
        const elChart = document.getElementById('dash-chart-7d');
        if (!elChart || typeof ApexCharts === 'undefined') return;
        elChart.innerHTML = '';

        // Preparar dados (últimos 7 dias)
        const dailyRevenue = {};
        for (let i = 0; i < 7; i++) {
            const d = new Date(startDate);
            d.setDate(d.getDate() + i);
            const dateStr = d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
            dailyRevenue[dateStr] = 0;
        }

        appts7Days.forEach(appt => {
            if (['completed', 'confirmed'].includes(appt.status)) {
                if (dailyRevenue[appt.appointment_date] !== undefined) {
                    dailyRevenue[appt.appointment_date] += parseFloat(appt.services?.price || 0);
                }
            }
        });

        const sortedDays = Object.keys(dailyRevenue).sort();
        const seriesData = sortedDays.map(dia => dailyRevenue[dia]);
        const labels = sortedDays.map(dia => {
            const [y, m, d] = dia.split('-');
            return `${d}/${m}`;
        });

        const optChart = {
            series: [{
                name: 'Faturamento Diário',
                data: seriesData
            }],
            chart: {
                type: 'bar',
                height: 250,
                toolbar: { show: false },
                fontFamily: 'inherit',
                background: 'transparent'
            },
            colors: ['#3B82F6'],
            plotOptions: {
                bar: {
                    borderRadius: 4,
                    columnWidth: '50%'
                }
            },
            dataLabels: { enabled: false },
            xaxis: {
                categories: labels,
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

        const chart = new ApexCharts(elChart, optChart);
        chart.render();
    }

    renderAgendamentos(apptsToday) {
        const listContainer = document.getElementById('dashboard-agendamentos-list');
        if (!listContainer) return;
        
        if (apptsToday.length === 0) {
            listContainer.innerHTML = `<p class="text-secondary text-center py-3">Nenhum agendamento para hoje.</p>`;
            return;
        }

        const statusMap = {
            'scheduled': { label: 'Agendado', color: 'var(--color-primary)', bg: 'var(--color-primary-light)' },
            'confirmed': { label: 'Confirmado', color: 'var(--color-success)', bg: 'var(--color-success-light)' },
            'completed': { label: 'Concluído', color: 'var(--color-success)', bg: 'var(--color-success-light)' },
            'cancelled': { label: 'Cancelado', color: 'var(--color-danger)', bg: 'var(--color-danger-light)' },
            'no_show': { label: 'No-show', color: 'var(--color-warning)', bg: 'var(--color-warning-light)' }
        };

        const fmtMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        let html = '';
        apptsToday.forEach(ag => {
            const statusInfo = statusMap[ag.status] || { label: ag.status, color: 'var(--color-text-secondary)', bg: 'var(--color-bg-hover)' };
            const profName = ag.profissionais?.nome || 'N/A';
            const servName = ag.services?.name || 'Serviço';
            const servPrice = fmtMoney.format(ag.services?.price || 0);
            const timeStr = ag.appointment_time ? ag.appointment_time.substring(0, 5) : '00:00';
            
            html += `
                <div class="flex justify-between align-center p-3 rounded" style="background: var(--color-bg-base); border-left: 4px solid ${statusInfo.color};">
                    <div class="flex-column gap-1">
                        <span class="font-bold" style="color: var(--color-text-primary); font-size: 1rem;">${timeStr} - ${this.escapeHTML(ag.client_name || 'Sem nome')}</span>
                        <span class="text-secondary flex align-center gap-1" style="font-size: 0.85rem;"><i data-lucide="scissors" style="width: 14px; height: 14px;"></i> ${this.escapeHTML(servName)} com <b style="color: var(--color-text-primary);">${this.escapeHTML(profName)}</b></span>
                    </div>
                    <div class="flex-column align-end gap-1">
                        <span class="font-medium rounded px-2" style="background: ${statusInfo.bg}; color: ${statusInfo.color}; font-size: 0.75rem; padding: 2px 0;">${statusInfo.label}</span>
                        <span class="font-bold text-primary" style="font-size: 0.9rem;">${servPrice}</span>
                    </div>
                </div>
            `;
        });
        
        listContainer.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    renderRankings(apptsMonth) {
        const fatContainer = document.getElementById('dashboard-ranking-faturamento');
        const agContainer = document.getElementById('dashboard-ranking-agendamentos');
        
        const faturamentoPorProfissional = {};
        const qtdPorProfissional = {};

        apptsMonth.forEach(ag => {
            if (!ag.profissionais) return;
            const pId = ag.profissional_id;
            const pName = ag.profissionais.nome;
            
            if (!faturamentoPorProfissional[pId]) faturamentoPorProfissional[pId] = { nome: pName, valor: 0 };
            if (!qtdPorProfissional[pId]) qtdPorProfissional[pId] = { nome: pName, qtd: 0 };
            
            qtdPorProfissional[pId].qtd += 1;
            
            if (['completed', 'confirmed'].includes(ag.status)) {
                faturamentoPorProfissional[pId].valor += (ag.services?.price || 0);
            }
        });

        const rankingFaturamento = Object.values(faturamentoPorProfissional).sort((a, b) => b.valor - a.valor);
        const rankingAgendamentos = Object.values(qtdPorProfissional).sort((a, b) => b.qtd - a.qtd);

        const fmtMoney = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

        const renderItem = (prof, index, isValor) => {
            const pos = index + 1;
            let badgeColor = pos === 1 ? 'var(--color-warning)' : (pos === 2 ? '#94a3b8' : (pos === 3 ? '#b45309' : 'var(--color-bg-hover)'));
            let badgeTextColor = pos <= 3 ? '#ffffff' : 'var(--color-text-secondary)';
            let avatarLetter = prof.nome ? prof.nome.charAt(0).toUpperCase() : '?';
            
            return `
                <div class="flex align-center gap-3 py-2 border-bottom-dashed border-border">
                    <div class="flex align-center justify-center font-bold rounded-full" style="width: 26px; height: 26px; background: ${badgeColor}; color: ${badgeTextColor}; font-size: 0.8rem; box-shadow: ${pos === 1 ? '0 0 10px rgba(245, 158, 11, 0.3)' : 'none'}; flex-shrink: 0;">
                        ${pos}º
                    </div>
                    <div class="flex align-center justify-center rounded-full bg-primary-light text-primary font-bold" style="width: 40px; height: 40px; font-size: 1.1rem; flex-shrink: 0;">
                        ${avatarLetter}
                    </div>
                    <div class="flex-1 flex-column" style="min-width: 0;">
                        <span class="font-bold text-truncate" style="font-size: 0.95rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escapeHTML(prof.nome)}</span>
                        <span class="text-secondary" style="font-size: 0.8rem;">${isValor ? 'Faturamento' : 'Agendamentos'}</span>
                    </div>
                    <div class="flex-column align-end flex-shrink-0">
                        <span class="font-bold text-primary" style="font-size: 1rem;">${isValor ? fmtMoney.format(prof.valor) : prof.qtd}</span>
                        ${!isValor ? '<span class="text-secondary" style="font-size: 0.75rem;">atendimentos</span>' : ''}
                    </div>
                </div>
            `;
        };

        if (fatContainer) {
            if (rankingFaturamento.length === 0) {
                fatContainer.innerHTML = '<p class="text-secondary text-center py-2">Sem dados</p>';
            } else {
                fatContainer.innerHTML = rankingFaturamento.slice(0, 5).map((p, i) => renderItem(p, i, true)).join('');
            }
        }

        if (agContainer) {
            if (rankingAgendamentos.length === 0) {
                agContainer.innerHTML = '<p class="text-secondary text-center py-2">Sem dados</p>';
            } else {
                agContainer.innerHTML = rankingAgendamentos.slice(0, 5).map((p, i) => renderItem(p, i, false)).join('');
            }
        }
    }
}
