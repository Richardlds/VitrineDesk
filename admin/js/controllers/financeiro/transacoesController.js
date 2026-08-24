import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class transacoesController {
    constructor(stateManager) {
        this.state = stateManager;
        this.transacoes = [];
    }

    async init() {
        window.currentController = this;
        this.bindEvents();
        this.setInitialFilters();
        await this.loadTransacoes();
    }

    setInitialFilters() {
        const today = new Date();
        const monthStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}`;
        document.getElementById('filtro-mes-transacao').value = monthStr;
        
        // Listeners para filtros
        document.getElementById('filtro-mes-transacao').addEventListener('change', () => this.loadTransacoes());
        document.getElementById('filtro-tipo-transacao').addEventListener('change', () => this.renderTable());
        document.getElementById('filtro-status-transacao').addEventListener('change', () => this.renderTable());
    }

    bindEvents() {
        // Modal Nova Transação
        document.getElementById('btn-nova-transacao').addEventListener('click', () => {
            this.openModal();
        });

        // Controle da visibilidade da "Data de Pagamento"
        document.getElementById('transacao-status').addEventListener('change', (e) => {
            const divData = document.getElementById('div-data-pagamento');
            const inputData = document.getElementById('transacao-pagamento');
            if (e.target.value === 'paid') {
                divData.classList.remove('d-none');
                if (!inputData.value) {
                    inputData.value = new Date().toISOString().split('T')[0]; // Preenche data atual
                }
            } else {
                divData.classList.add('d-none');
                inputData.value = '';
            }
        });

        // Form Submit
        document.getElementById('form-transacao').addEventListener('submit', async (e) => {
            e.preventDefault();
            await this.saveTransacao();
        });
    }

    async loadTransacoes() {
        const tbody = document.getElementById('table-body-transacoes');
        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="text-center py-5">
                    <i data-lucide="loader" class="animate-spin text-secondary icon-md mx-auto mb-2"></i>
                    <p class="text-muted text-sm">Carregando transações...</p>
                </td>
            </tr>
        `;
        if (window.lucide) window.lucide.createIcons();

        const monthStr = document.getElementById('filtro-mes-transacao').value; // YYYY-MM
        const [year, month] = monthStr.split('-');
        
        // Calcular o primeiro e o último dia do mês para o filtro
        const firstDay = new Date(year, month - 1, 1).toISOString().split('T')[0];
        const lastDay = new Date(year, month, 0).toISOString().split('T')[0];

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error('Tenant não encontrado');

            const { data, error } = await supabase
                .from('financial_transactions')
                .select('*')
                .eq('tenant_id', tenantId)
                .gte('due_date', firstDay)
                .lte('due_date', lastDay)
                .order('due_date', { ascending: false });

            if (error) throw error;
            
            this.transacoes = data || [];
            this.renderTable();
        } catch (error) {
            console.error('Erro ao carregar transações:', error);
            window.showToast('Erro ao carregar financeiro.', 'error');
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-danger">Erro ao carregar dados.</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('table-body-transacoes');
        
        const tipoFiltro = document.getElementById('filtro-tipo-transacao').value;
        const statusFiltro = document.getElementById('filtro-status-transacao').value;

        // Filtragem no cliente
        let filtered = this.transacoes.filter(t => {
            if (tipoFiltro !== 'all' && t.type !== tipoFiltro) return false;
            if (statusFiltro !== 'all' && t.status !== statusFiltro) return false;
            return true;
        });

        if (filtered.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center py-8">
                        <i data-lucide="inbox" class="icon-lg text-placeholder mb-2"></i>
                        <p class="text-muted text-sm font-medium">Nenhuma transação encontrada neste período.</p>
                    </td>
                </tr>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        let html = '';
        filtered.forEach(t => {
            // Formatar valores
            const isIncome = t.type === 'income';
            const valueColor = isIncome ? 'text-success' : 'text-danger';
            const valuePrefix = isIncome ? '+' : '-';
            const formattedValue = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(t.amount);
            
            // Formatar Data
            const dueDateParts = t.due_date.split('-');
            const formattedDate = `${dueDateParts[2]}/${dueDateParts[1]}/${dueDateParts[0]}`; // DD/MM/YYYY

            // Formatar Status
            const isPaid = t.status === 'paid';
            const statusBadge = isPaid 
                ? '<span class="status-badge bg-success-light text-success border-solid border-1 border-success"><i data-lucide="check-circle" class="icon-xs"></i> Pago</span>' 
                : '<span class="status-badge bg-warning-light text-warning border-solid border-1 border-warning"><i data-lucide="clock" class="icon-xs"></i> Pendente</span>';

            html += `
                <tr class="hover:bg-placeholder transition-colors">
                    <td class="p-3 text-sm font-medium">${formattedDate}</td>
                    <td class="p-3 text-sm font-bold text-primary">${t.description}</td>
                    <td class="p-3 text-xs text-secondary">${t.category}</td>
                    <td class="p-3 text-sm font-bold text-right ${valueColor}">${valuePrefix} ${formattedValue}</td>
                    <td class="p-3 text-center">${statusBadge}</td>
                    <td class="p-3 text-center">
                        <div class="flex justify-center gap-2">
                            <button class="btn bg-primary-light text-primary hover:bg-primary hover:text-white rounded px-2 py-1 flex align-center transition-colors" onclick="window.currentController.openModal('${t.id}')" title="Editar">
                                <i data-lucide="edit-3" class="icon-sm m-0"></i>
                            </button>
                            <button class="btn bg-danger-light text-danger hover:bg-danger hover:text-white rounded px-2 py-1 flex align-center transition-colors" onclick="window.currentController.deleteTransacao('${t.id}')" title="Excluir">
                                <i data-lucide="trash-2" class="icon-sm m-0"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    openModal(id = null) {
        document.getElementById('transacao-id').value = '';
        document.getElementById('transacao-descricao').value = '';
        document.getElementById('transacao-valor').value = '';
        document.getElementById('transacao-vencimento').value = new Date().toISOString().split('T')[0];
        document.getElementById('transacao-tipo').value = 'expense';
        document.getElementById('transacao-categoria').value = 'Outros';
        document.getElementById('transacao-status').value = 'pending';
        document.getElementById('transacao-pagamento').value = '';
        document.getElementById('div-data-pagamento').classList.add('d-none');
        document.getElementById('modal-transacao-title').innerHTML = '<i data-lucide="file-plus" class="icon-sm"></i> Nova Transação';

        if (id) {
            const t = this.transacoes.find(x => x.id === id);
            if (t) {
                document.getElementById('transacao-id').value = t.id;
                document.getElementById('transacao-descricao').value = t.description;
                document.getElementById('transacao-valor').value = t.amount;
                document.getElementById('transacao-vencimento').value = t.due_date;
                document.getElementById('transacao-tipo').value = t.type;
                document.getElementById('transacao-categoria').value = t.category;
                document.getElementById('transacao-status').value = t.status;
                if (t.status === 'paid') {
                    document.getElementById('div-data-pagamento').classList.remove('d-none');
                    document.getElementById('transacao-pagamento').value = t.payment_date || '';
                }
                document.getElementById('modal-transacao-title').innerHTML = '<i data-lucide="edit" class="icon-sm"></i> Editar Transação';
            }
        }

        document.getElementById('modal-transacao').classList.remove('d-none');
        if (window.lucide) window.lucide.createIcons();
    }

    async saveTransacao() {
        const btn = document.getElementById('btn-salvar-transacao');
        const id = document.getElementById('transacao-id').value;
        const tenantId = await getCurrentTenantId();
        
        const payload = {
            tenant_id: tenantId,
            description: document.getElementById('transacao-descricao').value.trim(),
            amount: parseFloat(document.getElementById('transacao-valor').value),
            type: document.getElementById('transacao-tipo').value,
            category: document.getElementById('transacao-categoria').value,
            due_date: document.getElementById('transacao-vencimento').value,
            status: document.getElementById('transacao-status').value,
        };

        if (payload.status === 'paid') {
            payload.payment_date = document.getElementById('transacao-pagamento').value || payload.due_date;
        } else {
            payload.payment_date = null;
        }

        if (!payload.description || isNaN(payload.amount) || payload.amount <= 0 || !payload.due_date) {
            window.showToast('Preencha todos os campos obrigatórios corretamente.', 'warning');
            return;
        }

        btn.disabled = true;
        btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Salvando...';

        try {
            if (id) {
                const { error } = await supabase.from('financial_transactions').update(payload).eq('id', id).eq('tenant_id', tenantId);
                if (error) throw error;
                window.showToast('Transação atualizada com sucesso!', 'success');
            } else {
                const { error } = await supabase.from('financial_transactions').insert([payload]);
                if (error) throw error;
                window.showToast('Transação salva com sucesso!', 'success');
            }

            document.getElementById('modal-transacao').classList.add('d-none');
            await this.loadTransacoes();
        } catch (error) {
            console.error('Erro ao salvar transação:', error);
            window.showToast('Erro ao salvar transação. Verifique sua conexão.', 'error');
        } finally {
            btn.disabled = false;
            btn.innerHTML = '<i data-lucide="save"></i> Salvar Transação';
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async deleteTransacao(id) {
        if (!confirm('Tem certeza que deseja excluir esta transação? Isso afetará os relatórios financeiros.')) return;

        const tenantId = await getCurrentTenantId();
        try {
            const { error } = await supabase.from('financial_transactions').delete().eq('id', id).eq('tenant_id', tenantId);
            if (error) throw error;
            
            window.showToast('Transação excluída.', 'success');
            this.transacoes = this.transacoes.filter(t => t.id !== id);
            this.renderTable();
        } catch (error) {
            console.error('Erro ao excluir:', error);
            window.showToast('Erro ao excluir transação.', 'error');
        }
    }

    destroy() {
        // Remover referência global se existir, e limpar listeners pesados (o DOM cuida da maioria ao recriar)
        window.currentController = null;
    }
}
