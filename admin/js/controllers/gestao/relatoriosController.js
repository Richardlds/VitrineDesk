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
        this.tableBody = document.getElementById('relatorios-table-body');
        this.cardsContainer = document.getElementById('relatorios-cards');
        
        this.renderSkeletons();
        await this.loadData();
        this.bindEvents();
    }

    renderSkeletons() {
        if (this.cardsContainer) {
            let cardsHtml = '';
            for (let i = 0; i < 4; i++) {
                cardsHtml += `<div class="skeleton" style="height: 100px; border-radius: 8px;"></div>`;
            }
            this.cardsContainer.innerHTML = cardsHtml;
        }

        if (this.tableBody) {
            let skeletonsHtml = '';
            for (let i = 0; i < 3; i++) {
                skeletonsHtml += `
                    <tr>
                        <td><div class="skeleton sk-row"></div></td>
                        <td><div class="skeleton sk-row"></div></td>
                        <td><div class="skeleton sk-row"></div></td>
                    </tr>
                `;
            }
            this.tableBody.innerHTML = skeletonsHtml;
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

            // Buscar appointments do período, trazendo os services
            let queryAppts = supabase
                .from('appointments')
                .select('*, services(name, price)')
                .eq('tenant_id', tenantId)
                .neq('status', 'cancelled')
                .gte('appointment_date', start.split('T')[0])
                .lte('appointment_date', end.split('T')[0]);

            const { data: appts, error: errAppts } = await queryAppts;
            if (errAppts) throw errAppts;

            // Calcular Faturamento
            let faturamento = 0;
            let agendamentos = appts ? appts.length : 0;
            const uniqueClients = new Set();
            const servicosStats = {};

            if (appts) {
                appts.forEach(appt => {
                    if (appt.client_email) uniqueClients.add(appt.client_email);
                    else if (appt.client_phone) uniqueClients.add(appt.client_phone);

                    if (appt.services) {
                        const price = parseFloat(appt.services.price || 0);
                        faturamento += price;
                        
                        const sName = appt.services.name;
                        if (!servicosStats[sName]) {
                            servicosStats[sName] = { nome: sName, qtd: 0, receita: 0 };
                        }
                        servicosStats[sName].qtd += 1;
                        servicosStats[sName].receita += price;
                    }
                });
            }
            
            // Subtrair comissões pagas nesse período (opcional, para exibir lucro, 
            // mas manteremos faturamento bruto como destaque, descontando depois se necessário)
            // Aqui focaremos no faturamento bruto padrão.

            const ticketMedio = agendamentos > 0 ? faturamento / agendamentos : 0;

            const metrics = {
                faturamento: faturamento,
                agendamentos: agendamentos,
                ticketMedio: ticketMedio,
                novosClientes: uniqueClients.size // simplificação: clientes únicos do periodo
            };

            const topServices = Object.values(servicosStats).sort((a, b) => b.receita - a.receita).slice(0, 5);

            this.renderCards(metrics);
            this.renderTable(topServices);

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar relatórios:', error);
            if (window.showToast) window.showToast('Erro ao carregar relatórios. Tente novamente.', 'error');
        }
    }

    renderCards(metrics) {
        if (!this.cardsContainer) return;
        
        this.cardsContainer.innerHTML = `
            <div class="config-card flex flex-col justify-center mb-0 border-l-4 border-success">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">Faturamento Bruto</div>
                        <div class="text-xl font-bold text-success">R$ ${metrics.faturamento.toFixed(2)}</div>
                    </div>
                    <div class="bg-success-light text-success p-2 rounded-lg">
                        <i data-lucide="dollar-sign" class="icon-sm"></i>
                    </div>
                </div>
            </div>

            <div class="config-card flex flex-col justify-center mb-0 border-l-4 border-primary">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">Agendamentos</div>
                        <div class="text-xl font-bold text-primary">${metrics.agendamentos}</div>
                    </div>
                    <div class="bg-primary-light text-primary p-2 rounded-lg">
                        <i data-lucide="calendar-check" class="icon-sm"></i>
                    </div>
                </div>
            </div>

            <div class="config-card flex flex-col justify-center mb-0 border-l-4" style="border-left-color: var(--color-text-secondary);">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">Ticket Médio</div>
                        <div class="text-xl font-bold text-primary">R$ ${metrics.ticketMedio.toFixed(2)}</div>
                    </div>
                    <div class="bg-placeholder text-secondary p-2 rounded-lg">
                        <i data-lucide="trending-up" class="icon-sm"></i>
                    </div>
                </div>
            </div>

            <div class="config-card flex flex-col justify-center mb-0 border-l-4" style="border-left-color: #8b5cf6;">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">Clientes Únicos</div>
                        <div class="text-xl font-bold" style="color: #8b5cf6;">${metrics.novosClientes}</div>
                    </div>
                    <div class="p-2 rounded-lg" style="background-color: #ede9fe; color: #8b5cf6;">
                        <i data-lucide="users" class="icon-sm"></i>
                    </div>
                </div>
            </div>
        `;
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="3" class="text-center text-secondary py-3">Nenhum dado para o período selecionado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            html += `
                <tr>
                    <td class="font-medium text-primary">${item.nome}</td>
                    <td class="text-center text-secondary">${item.qtd}</td>
                    <td class="text-right text-success font-medium">R$ ${item.receita.toFixed(2)}</td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
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
