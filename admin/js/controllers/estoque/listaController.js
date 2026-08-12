import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class listaController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.items = [];
        this.itemToDelete = null; // Guarda o ID do item a ser excluído
    }

    async init() {
        this.loadSavedThreshold();
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
        const typeSelect = document.getElementById('filter-type');
        const statusSelect = document.getElementById('filter-status');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderTable());
        }
        if (typeSelect) {
            typeSelect.addEventListener('change', () => this.renderTable());
        }
        if (statusSelect) {
            statusSelect.addEventListener('change', () => this.renderTable());
        }

        // Lógica de edição do Limite de Alerta
        const btnEditThreshold = document.getElementById('btn-edit-threshold');
        const btnSaveThreshold = document.getElementById('btn-save-threshold');
        const alertInput = document.getElementById('input-alert-threshold');
        const alertText = document.getElementById('alert-threshold-text');

        const displayMode = document.getElementById('alert-display-mode');
        const editMode = document.getElementById('alert-edit-mode');

        if (btnEditThreshold && btnSaveThreshold && displayMode && editMode) {
            btnEditThreshold.addEventListener('click', () => {
                displayMode.classList.add('d-none');
                editMode.classList.remove('d-none');
                if (alertInput) alertInput.focus();
            });

            btnSaveThreshold.addEventListener('click', () => {
                let val = parseInt(alertInput.value);
                if (isNaN(val) || val < 1) val = 1;
                alertInput.value = val;
                if (alertText) alertText.textContent = val;

                // Salvar preferência
                localStorage.setItem('vitrinedesk_alert_threshold', val);

                editMode.classList.add('d-none');
                displayMode.classList.remove('d-none');

                this.updateKPIs();
            });

            // Permite salvar pressionando Enter
            if (alertInput) {
                alertInput.addEventListener('keydown', (e) => {
                    if (e.key === 'Enter') {
                        e.preventDefault();
                        btnSaveThreshold.click();
                    }
                });
            }
        }

        // Delegação de eventos para a tabela (Ações: Editar / Excluir)
        const tbody = document.getElementById('estoque-table-body');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btnEdit = e.target.closest('.btn-edit-item');
                const btnDelete = e.target.closest('.btn-delete-item');

                if (btnEdit) {
                    const itemId = btnEdit.dataset.id;
                    // Redireciona para tela de edição
                    window.location.hash = `#/estoque/cadastro?id=${itemId}`;
                }

                if (btnDelete) {
                    const itemId = btnDelete.dataset.id;
                    const itemName = btnDelete.dataset.name;
                    this.openDeleteModal(itemId, itemName);
                }
            });
        }

        // Modal de Exclusão
        const btnCloseModal = document.getElementById('btn-close-modal-delete-estoque');
        const btnCancelDelete = document.getElementById('btn-cancel-delete-estoque');
        const btnConfirmDelete = document.getElementById('btn-confirm-delete-estoque');

        if (btnCloseModal) btnCloseModal.addEventListener('click', () => this.closeDeleteModal());
        if (btnCancelDelete) btnCancelDelete.addEventListener('click', () => this.closeDeleteModal());
        if (btnConfirmDelete) btnConfirmDelete.addEventListener('click', () => this.confirmDelete());
    }

    loadSavedThreshold() {
        const saved = localStorage.getItem('vitrinedesk_alert_threshold');
        if (saved) {
            const alertInput = document.getElementById('input-alert-threshold');
            const alertText = document.getElementById('alert-threshold-text');
            if (alertInput) alertInput.value = saved;
            if (alertText) alertText.textContent = saved;
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
            this.updateKPIs();
            this.renderTable();
        } catch (e) {
            console.error('Erro ao carregar estoque:', e);
            this.renderEmptyState('Erro ao carregar itens de estoque.');
        }
    }

    updateKPIs() {
        // Pega o valor definido pelo lojista a partir do texto de visualização
        const alertText = document.getElementById('alert-threshold-text');
        const alertThreshold = alertText ? parseInt(alertText.textContent) || 5 : 5;

        const total = this.items.length;
        const baixo = this.items.filter(item => item.stock_quantity > 0 && item.stock_quantity < alertThreshold).length;
        const zerado = this.items.filter(item => item.stock_quantity === undefined || item.stock_quantity <= 0).length;

        const elTotal = document.getElementById('kpi-total');
        const elBaixo = document.getElementById('kpi-baixo');
        const elZerado = document.getElementById('kpi-zerado');

        if (elTotal) elTotal.textContent = total;
        if (elBaixo) elBaixo.textContent = baixo;
        if (elZerado) elZerado.textContent = zerado;

        // Atualiza a paginação (temporariamente baseada no total, já que trazemos tudo)
        const pagInicio = document.getElementById('pag-inicio-estoque');
        const pagFim = document.getElementById('pag-fim-estoque');
        const pagTotal = document.getElementById('pag-total-estoque');

        if (pagInicio) pagInicio.textContent = total > 0 ? 1 : 0;
        if (pagFim) pagFim.textContent = total;
        if (pagTotal) pagTotal.textContent = total;
    }

    renderTable() {
        const tbody = document.getElementById('estoque-table-body');
        if (!tbody) return;

        // Recuperar valores dos filtros
        const searchInput = document.getElementById('search-estoque');
        const typeSelect = document.getElementById('filter-type');
        const statusSelect = document.getElementById('filter-status');

        const searchTerm = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const filterType = typeSelect ? typeSelect.value : 'all';
        const filterStatus = statusSelect ? statusSelect.value : 'all';

        // Pegar limiar de alerta
        const alertText = document.getElementById('alert-threshold-text');
        const alertThreshold = alertText ? parseInt(alertText.textContent) || 5 : 5;

        // Filtrar itens
        const filteredItems = this.items.filter(item => {
            // Filtro de Busca
            const matchesSearch = !searchTerm ||
                (item.name && item.name.toLowerCase().includes(searchTerm)) ||
                (item.sku && item.sku.toLowerCase().includes(searchTerm));

            // Filtro de Tipo
            const matchesType = filterType === 'all' || item.type === filterType;

            // Filtro de Status
            let itemStatus = 'ideal';
            if (item.stock_quantity <= 0) itemStatus = 'zerado';
            else if (item.stock_quantity < alertThreshold) itemStatus = 'baixo';

            const matchesStatus = filterStatus === 'all' || itemStatus === filterStatus;

            return matchesSearch && matchesType && matchesStatus;
        });

        if (filteredItems.length === 0) {
            this.renderEmptyState('Nenhum item encontrado com os filtros atuais.');
            return;
        }

        tbody.innerHTML = filteredItems.map(item => {
            let statusBadge = '';
            if (item.stock_quantity <= 0) {
                statusBadge = '<span class="bg-danger-light text-danger font-bold text-xs px-2 py-1 rounded-sm" style="white-space: nowrap;">Zerado</span>';
            } else if (item.stock_quantity < alertThreshold) {
                statusBadge = '<span class="bg-warning-light text-warning font-bold text-xs px-2 py-1 rounded-sm" style="white-space: nowrap;">Estoque Baixo</span>';
            } else {
                statusBadge = '<span class="bg-success-light text-success font-bold text-xs px-2 py-1 rounded-sm" style="white-space: nowrap;">Ideal</span>';
            }

            return `
            <tr class="border-bottom-dashed hover:bg-placeholder transition-colors">
                <td class="py-3 px-4 text-sm font-medium text-secondary">${item.sku || '-'}</td>
                <td class="py-3 px-4 text-sm font-bold text-primary">${item.name}</td>
                <td class="py-3 px-4 text-sm text-secondary capitalize">${item.type}</td>
                <td class="py-3 px-4 text-sm text-secondary text-right">R$ ${(item.base_price || 0).toFixed(2)}</td>
                <td class="py-3 px-4 text-sm font-bold text-center ${item.stock_quantity > 0 ? 'text-success' : 'text-danger'}">
                    ${item.stock_quantity}
                </td>
                <td class="py-3 px-4 text-center">
                    ${statusBadge}
                </td>
                <td class="py-3 px-4 text-right flex justify-end gap-2">
                    <button class="btn bg-transparent border-none text-secondary hover:text-primary hover:bg-primary-light transition-colors rounded-sm cursor-pointer p-2 flex align-center justify-center btn-edit-item" data-id="${item.id}" title="Editar" style="width: 32px; height: 32px;">
                        <i data-lucide="edit" class="icon-sm"></i>
                    </button>
                    <button class="btn bg-transparent border-none text-secondary hover:text-danger hover:bg-danger-light transition-colors rounded-sm cursor-pointer p-2 flex align-center justify-center btn-delete-item" data-id="${item.id}" data-name="${item.name}" title="Excluir" style="width: 32px; height: 32px;">
                        <i data-lucide="trash-2" class="icon-sm"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    renderEmptyState(message) {
        const tbody = document.getElementById('estoque-table-body');
        if (tbody) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary py-5">${message}</td></tr>`;
        }
    }

    openDeleteModal(id, name) {
        this.itemToDelete = id;
        const modal = document.getElementById('modal-delete-estoque');
        const nameEl = document.getElementById('delete-item-name');

        if (modal && nameEl) {
            nameEl.textContent = name;
            modal.classList.remove('d-none');
        }
    }

    closeDeleteModal() {
        this.itemToDelete = null;
        const modal = document.getElementById('modal-delete-estoque');
        if (modal) modal.classList.add('d-none');
    }

    async confirmDelete() {
        if (!this.itemToDelete) return;

        const btnConfirm = document.getElementById('btn-confirm-delete-estoque');
        if (btnConfirm) btnConfirm.disabled = true;

        try {
            const tenantId = await getCurrentTenantId();
            const { error } = await supabase
                .from('inventory_items')
                .delete()
                .eq('id', this.itemToDelete)
                .eq('tenant_id', tenantId);

            if (error) throw error;

            if (window.showToast) window.showToast('Item excluído com sucesso!', 'success');

            // Recarregar itens da tabela
            await this.loadItems();
        } catch (error) {
            console.error('Erro ao excluir item:', error);
            if (window.showToast) window.showToast('Erro ao excluir item: ' + error.message, 'error');
        } finally {
            if (btnConfirm) btnConfirm.disabled = false;
            this.closeDeleteModal();
        }
    }

    destroy() {
        // Limpar eventos globais se necessário
    }
}
