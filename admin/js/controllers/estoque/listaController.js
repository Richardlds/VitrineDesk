import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class listaController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.items = [];
    }

    async init() {
        this.bindEvents();
        await this.loadItems();
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    bindEvents() {
        const btnNovo = document.getElementById('btn-novo-item');
        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                window.location.hash = '#/estoque/cadastro';
            });
        }

        const searchInput = document.getElementById('search-estoque');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                // Implement search filtering
            });
        }
    }

    async loadItems() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // This will fail until the Supabase migration is executed by the user.
            // We wrap it in a try-catch so the UI doesn't crash entirely.
            const { data, error } = await supabase
                .from('inventory_items')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (error) {
                console.warn('Tabela inventory_items pode não existir ainda. Aguardando migração.', error);
                this.renderEmptyState('Tabelas de estoque não configuradas. Por favor, execute o script SQL no Supabase.');
                return;
            }

            this.items = data || [];
            this.renderTable();
        } catch (e) {
            console.error('Erro ao carregar estoque:', e);
            this.renderEmptyState('Erro ao carregar itens de estoque.');
        }
    }

    renderTable() {
        const tbody = document.getElementById('estoque-table-body');
        if (!tbody) return;

        if (this.items.length === 0) {
            this.renderEmptyState('Nenhum item cadastrado no estoque.');
            return;
        }

        tbody.innerHTML = this.items.map(item => `
            <tr class="border-bottom-dashed hover:bg-placeholder transition-colors">
                <td class="py-3 px-4 text-sm font-medium text-secondary">${item.sku || '-'}</td>
                <td class="py-3 px-4 text-sm font-bold text-primary">${item.name}</td>
                <td class="py-3 px-4 text-sm text-secondary capitalize">${item.type}</td>
                <td class="py-3 px-4 text-sm text-secondary text-right">R$ ${(item.base_price || 0).toFixed(2)}</td>
                <td class="py-3 px-4 text-sm font-bold text-center ${item.stock_quantity > 0 ? 'text-success' : 'text-error'}">
                    ${item.stock_quantity}
                </td>
                <td class="py-3 px-4 text-right">
                    <button class="btn bg-transparent border-none text-secondary hover:text-primary cursor-pointer p-1" title="Editar">
                        <i data-lucide="edit" class="icon-sm"></i>
                    </button>
                </td>
            </tr>
        `).join('');
        
        if (window.lucide) window.lucide.createIcons();
    }

    renderEmptyState(message) {
        const tbody = document.getElementById('estoque-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-5">${message}</td></tr>`;
        }
    }

    destroy() {
        // Limpar eventos globais se necessário
    }
}
