import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class comissoesController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.realtimeChannel = null;
        this.periodo = 'atual';

        // Paginação
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
    }
    
    async init() {
        this.tableBody = document.getElementById('comissoes-table-body');
        
        this.renderSkeletons();
        await this.loadComissoes();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < this.itemsPerPage; i++) {
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
    
    getDateRange() {
        const now = new Date();
        const range = { start: null, end: null };
        if (this.periodo === 'atual') {
            range.start = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
            range.end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();
        } else {
            range.start = new Date(now.getFullYear(), now.getMonth() - 1, 1).toISOString();
            range.end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59).toISOString();
        }
        return range;
    }

    async loadComissoes() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();
            const { start, end } = this.getDateRange();

            let query = supabase
                .from('comissoes')
                .select('*, profissionais(nome)', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .gte('created_at', start)
                .lte('created_at', end)
                .order('created_at', { ascending: false });

            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            this.totalItems = count || 0;
            this.renderTable(data);
            this.updatePaginationUI();
            
            // Para o resumo, vamos puxar o total do mês sem paginação
            const { data: allData, error: errAll } = await supabase
                .from('comissoes')
                .select('valor_comissao, status_pagamento')
                .eq('tenant_id', tenantId)
                .gte('created_at', start)
                .lte('created_at', end);
                
            if (!errAll && allData) {
                this.renderResumo(allData);
            }

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar comissões:', error);
            if (window.showToast) window.showToast('Erro ao carregar comissões', 'error');
        }
    }

    renderResumo(allData) {
        const resumoContainer = document.getElementById('comissoes-resumo');
        if (!resumoContainer) return;

        let totalPendente = 0;
        let totalPago = 0;

        allData.forEach(item => {
            const valor = parseFloat(item.valor_comissao || 0);
            if (item.status_pagamento === 'pago') {
                totalPago += valor;
            } else {
                totalPendente += valor;
            }
        });

        resumoContainer.innerHTML = `
            <div class="config-card flex flex-col justify-center mb-0 border-l-4 border-warning">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">A Pagar (Pendente)</div>
                        <div class="text-xl font-bold text-warning">R$ ${totalPendente.toFixed(2)}</div>
                    </div>
                    <div class="bg-warning-light text-warning p-2 rounded-lg">
                        <i data-lucide="clock" class="icon-sm"></i>
                    </div>
                </div>
            </div>

            <div class="config-card flex flex-col justify-center mb-0 border-l-4 border-success">
                <div class="flex justify-between align-start">
                    <div>
                        <div class="text-secondary text-sm mb-1">Total Pago</div>
                        <div class="text-xl font-bold text-success">R$ ${totalPago.toFixed(2)}</div>
                    </div>
                    <div class="bg-success-light text-success p-2 rounded-lg">
                        <i data-lucide="check-circle" class="icon-sm"></i>
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
                    <td colspan="5" class="text-center text-secondary py-3">Nenhuma comissão encontrada neste período.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const profName = item.profissionais?.nome || 'Profissional Excluído';
            const isPago = item.status_pagamento === 'pago';
            const badgeClass = isPago ? 'bg-success-light text-success' : 'bg-warning-light text-warning';
            const statusLabel = isPago ? 'Pago' : 'Pendente';
            
            const actionBtn = !isPago 
                ? `<button class="btn btn-success text-xs py-1 px-3 rounded cursor-pointer btn-pagar-comissao flex align-center gap-1" data-id="${item.id}">
                     <i data-lucide="check-circle" class="icon-sm"></i> Pagar
                   </button>`
                : `<span class="text-xs text-secondary">Pago em ${new Date(item.data_pagamento).toLocaleDateString('pt-BR')}</span>`;
            
            html += `
                <tr class="${isPago ? 'opacity-70' : ''}">
                    <td class="font-medium text-primary">${profName}</td>
                    <td class="text-sm text-secondary">R$ ${parseFloat(item.valor_servico || 0).toFixed(2)} <span class="text-xs">(${item.percentual_aplicado}%)</span></td>
                    <td class="text-sm font-bold text-primary">R$ ${parseFloat(item.valor_comissao || 0).toFixed(2)}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${statusLabel}</span>
                    </td>
                    <td class="text-right">
                        ${actionBtn}
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnsPagar = this.tableBody.querySelectorAll('.btn-pagar-comissao');
        btnsPagar.forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const conf = await window.showConfirm("Marcar esta comissão como paga?", "Confirmar", "Cancelar");
                if (conf) {
                    await this.marcarComoPago(id);
                }
            });
        });
    }

    async marcarComoPago(id) {
        try {
            const { error } = await supabase
                .from('comissoes')
                .update({ status_pagamento: 'pago', data_pagamento: new Date().toISOString() })
                .eq('id', id);
            
            if (error) throw error;
            if (window.showToast) window.showToast("Comissão marcada como paga!", "success");
            
            this.loadComissoes(); // reload
        } catch(e) {
            console.error(e);
            if (window.showToast) window.showToast("Erro ao processar pagamento.", "error");
        }
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-comissao');
        const elFim = document.getElementById('pag-fim-comissao');
        const elTotal = document.getElementById('pag-total-comissao');
        const elAtual = document.getElementById('pag-atual-comissao');
        const btnPrev = document.getElementById('btn-prev-page-comissao');
        const btnNext = document.getElementById('btn-next-page-comissao');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadComissoes();
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

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        const channelName = 'comissoes-channel-' + Date.now();
        this.realtimeChannel = supabase.channel(channelName)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'comissoes',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadComissoes();
            })
            .subscribe();
    }

    bindEvents() {
        const selectPeriodo = document.getElementById('filtro-mes-comissao');
        if (selectPeriodo) {
            selectPeriodo.addEventListener('change', (e) => {
                this.periodo = e.target.value;
                this.currentPage = 1;
                this.loadComissoes();
            });
        }
        
        const btnPrev = document.getElementById('btn-prev-page-comissao');
        const btnNext = document.getElementById('btn-next-page-comissao');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadComissoes();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadComissoes();
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
