import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

function escapeHTML(str) {
    if (typeof str !== 'string') return str ? String(str) : '';
    return str.replace(/[&<>"']/g, tag => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;'
    }[tag] || tag));
}

export class lista_osController {
    constructor(stateManager) {
        this.state = stateManager;
        this.allOrders = [];
        this.filteredOrders = [];
        this.currentPage = 1;
        this.itemsPerPage = 10;
        
        // Elementos de Filtro
        this.filterSearch = document.getElementById('filter-search');
        this.filterStatus = document.getElementById('filter-status');
        this.filterDateStart = document.getElementById('filter-date-start');
        this.filterDateEnd = document.getElementById('filter-date-end');
    }

    async init() {
        this.bindEvents();
        await this.loadOrders();

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    bindEvents() {
        const btnNovaOs = document.getElementById('btn-nova-os-redirect');
        if (btnNovaOs) {
            btnNovaOs.addEventListener('click', () => {
                window.location.hash = '#/gestao/os';
            });
        }

        // Filtros
        if (this.filterSearch) this.filterSearch.addEventListener('input', () => this.applyFilters());
        if (this.filterStatus) this.filterStatus.addEventListener('change', () => this.applyFilters());
        if (this.filterDateStart) this.filterDateStart.addEventListener('change', () => this.applyFilters());
        if (this.filterDateEnd) this.filterDateEnd.addEventListener('change', () => this.applyFilters());

        // Modal
        const btnCloseDetails = document.getElementById('btn-close-os-details');
        const modalDetails = document.getElementById('modal-os-details');
        if (btnCloseDetails) {
            btnCloseDetails.addEventListener('click', () => {
                modalDetails.classList.add('d-none');
            });
        }
        if (modalDetails) {
            modalDetails.addEventListener('click', (e) => {
                if (e.target === modalDetails) {
                    modalDetails.classList.add('d-none');
                }
            });
        }

        // Paginação
        const btnPrevPage = document.getElementById('btn-prev-page');
        const btnNextPage = document.getElementById('btn-next-page');

        if (btnPrevPage) {
            btnPrevPage.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.renderOrders();
                }
            });
        }
        if (btnNextPage) {
            btnNextPage.addEventListener('click', () => {
                const totalPages = Math.ceil(this.filteredOrders.length / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.renderOrders();
                }
            });
        }
    }

    async loadOrders() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            this.showSkeleton();

            const { data, error } = await supabase
                .from('service_orders')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (error) {
                console.error('Erro ao carregar OS:', error);
                if (window.showToast) window.showToast('Erro ao carregar o histórico de OS.', 'error');
                return;
            }

            this.allOrders = data || [];
            this.applyFilters();
        } catch (e) {
            console.error('Erro geral ao carregar OS:', e);
        }
    }

    showSkeleton() {
        const container = document.getElementById('lista-os-card-container');
        if (container) {
            container.innerHTML = Array.from({ length: 5 }, () => `
                <div class="config-card p-3 flex justify-between align-center border-dashed">
                    <div class="flex flex-column gap-2" style="flex: 1;">
                        <div class="skeleton w-32px h-16px rounded-sm"></div>
                        <div class="skeleton" style="width: 150px; height: 16px; border-radius: 4px;"></div>
                    </div>
                    <div class="skeleton w-48px h-24px rounded-full"></div>
                    <div class="skeleton" style="width: 80px; height: 16px; border-radius: 4px; margin-left: 20px;"></div>
                    <div class="flex gap-2" style="margin-left: 20px;">
                        <div class="skeleton w-24px h-24px rounded-full"></div>
                        <div class="skeleton w-24px h-24px rounded-full"></div>
                    </div>
                </div>
            `).join('');
        }
    }

    applyFilters() {
        const term = this.filterSearch ? this.filterSearch.value.toLowerCase().trim() : '';
        const status = this.filterStatus ? this.filterStatus.value : 'todos';
        
        let start = this.filterDateStart ? this.filterDateStart.value : '';
        let end = this.filterDateEnd ? this.filterDateEnd.value : '';

        // Ajuste de Timezone se houver datas
        let startDate = null;
        let endDate = null;
        if (start) {
            startDate = new Date(start + 'T00:00:00');
        }
        if (end) {
            endDate = new Date(end + 'T23:59:59');
        }

        this.filteredOrders = this.allOrders.filter(o => {
            // Busca por texto
            const matchText = !term || 
                (o.customer_name && o.customer_name.toLowerCase().includes(term)) ||
                (o.id && o.id.toLowerCase().includes(term));
            
            // Busca por status
            const matchStatus = status === 'todos' || o.status === status;

            // Busca por datas
            let matchDate = true;
            if (startDate || endDate) {
                const orderDate = new Date(o.created_at);
                if (startDate && orderDate < startDate) matchDate = false;
                if (endDate && orderDate > endDate) matchDate = false;
            }

            return matchText && matchStatus && matchDate;
        });

        this.currentPage = 1;
        this.renderOrders();
    }

    renderOrders() {
        const container = document.getElementById('lista-os-card-container');
        const emptyState = document.getElementById('lista-os-empty');
        const pagination = document.getElementById('lista-os-pagination');

        if (!container || !emptyState) return;

        if (this.filteredOrders.length === 0) {
            container.innerHTML = '';
            emptyState.classList.remove('d-none');
            if (pagination) pagination.classList.add('d-none');
            return;
        }

        emptyState.classList.add('d-none');
        if (pagination) pagination.classList.remove('d-none');

        const totalItems = this.filteredOrders.length;
        const totalPages = Math.ceil(totalItems / this.itemsPerPage);

        if (this.currentPage > totalPages && totalPages > 0) {
            this.currentPage = totalPages;
        }

        const startIndex = (this.currentPage - 1) * this.itemsPerPage;
        const endIndex = Math.min(startIndex + this.itemsPerPage, totalItems);
        const paginatedOrders = this.filteredOrders.slice(startIndex, endIndex);

        // Atualizar interface de paginação
        const pageInfo = document.getElementById('lista-os-page-info');
        if (pageInfo) {
            pageInfo.textContent = `Mostrando ${startIndex + 1} a ${endIndex} de ${totalItems}`;
        }

        const btnPrevPage = document.getElementById('btn-prev-page');
        const btnNextPage = document.getElementById('btn-next-page');

        if (btnPrevPage) {
            btnPrevPage.disabled = this.currentPage === 1;
        }
        if (btnNextPage) {
            btnNextPage.disabled = this.currentPage === totalPages;
        }

        container.innerHTML = paginatedOrders.map(o => {
            const shortId = o.id.substring(0, 8).toUpperCase();
            const dateStr = new Date(o.created_at).toLocaleDateString('pt-BR');
            const totalStr = o.total_amount ? o.total_amount.toFixed(2) : '0.00';

            let badgeBg = 'bg-primary-light';
            let badgeText = 'text-primary';
            if (o.status === 'Concluída') { badgeBg = 'bg-success-light'; badgeText = 'text-success'; }
            else if (o.status === 'Cancelada') { badgeBg = 'bg-danger-light'; badgeText = 'text-danger'; }
            else if (o.status === 'Pendente') { badgeBg = 'bg-warning-light'; badgeText = 'text-warning'; }

            return `
            <div class="config-card p-3 flex flex-wrap justify-between align-center gap-3 hover:bg-placeholder transition cursor-pointer os-row-click" data-id="${o.id}" data-status="${o.status}">
                <div class="flex flex-column gap-1" style="min-width: 200px; flex: 1;">
                    <div class="flex align-center gap-2">
                        <span class="text-xs font-bold text-secondary">#${shortId}</span>
                        <span class="status-badge ${badgeBg} ${badgeText} text-xs font-bold px-2 py-1 rounded-full">${o.status}</span>
                    </div>
                    <span class="font-bold text-primary text-sm">${escapeHTML(o.customer_name)}</span>
                    <span class="text-xs text-secondary flex align-center gap-1">
                        <i data-lucide="calendar" class="icon-xs"></i>${dateStr}
                    </span>
                </div>
                
                <span class="font-bold text-success" style="font-size: 1.1rem; min-width: 100px; text-align: right;">R$ ${totalStr}</span>
                
                <div class="flex gap-2 align-center">
                    <button class="btn bg-white border border-border text-primary cursor-pointer w-32px h-32px rounded-full flex align-center justify-center shadow-sm hover:bg-primary-light btn-view-os" data-id="${o.id}" title="Ver Detalhes">
                        <i data-lucide="eye" class="icon-xs"></i>
                    </button>
                    <button class="btn bg-white border border-border text-primary cursor-pointer w-32px h-32px rounded-full flex align-center justify-center shadow-sm hover:bg-primary-light btn-print-os" data-id="${o.id}" title="Reimprimir">
                        <i data-lucide="printer" class="icon-xs"></i>
                    </button>
                    <button class="btn bg-white border border-border text-danger cursor-pointer w-32px h-32px rounded-full flex align-center justify-center shadow-sm hover:bg-danger-light btn-delete-os" data-id="${o.id}" title="Excluir OS">
                        <i data-lucide="trash-2" class="icon-xs"></i>
                    </button>
                </div>
            </div>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        this.bindDynamicEvents();
    }

    bindDynamicEvents() {
        // Bind print events
        document.querySelectorAll('.btn-print-os').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.reprintOs(btn.dataset.id);
            });
        });

        // Bind delete events
        document.querySelectorAll('.btn-delete-os').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.deleteOs(btn.dataset.id);
            });
        });

        // Bind row clicks
        document.querySelectorAll('.os-row-click').forEach(row => {
            row.addEventListener('click', () => this.openOsDetails(row.dataset.id));
        });
        
        // Bind view button clicks
        document.querySelectorAll('.btn-view-os').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.openOsDetails(btn.dataset.id);
            });
        });
    }

    async openOsDetails(id) {
        try {
            if (window.showToast) window.showToast('Carregando detalhes...', 'info');

            // 1. Fetch OS order
            const tenantId = await getCurrentTenantId();
            const { data: orderData, error: orderError } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', id)
                .eq('tenant_id', tenantId)
                .single();

            if (orderError) throw orderError;

            // 2. Fetch OS items
            const { data: itemsData, error: itemsError } = await supabase
                .from('service_order_items')
                .select('*')
                .eq('service_order_id', id);

            if (itemsError) throw itemsError;

            this.fillModal(orderData, itemsData);

        } catch (e) {
            console.error('Erro ao carregar detalhes:', e);
            if (window.showToast) window.showToast('Erro ao carregar os detalhes desta OS.', 'error');
        }
    }

    fillModal(order, items) {
        document.getElementById('modal-os-title').textContent = `OS #${order.id.substring(0, 8).toUpperCase()}`;
        document.getElementById('modal-os-date').textContent =
            `${new Date(order.created_at).toLocaleDateString('pt-BR')} às ${new Date(order.created_at).toLocaleTimeString('pt-BR')}`;

        const statusEl = document.getElementById('modal-os-status');
        let badgeBg = 'bg-primary-light';
        let badgeText = 'text-primary';
        if (order.status === 'Concluída') { badgeBg = 'bg-success-light'; badgeText = 'text-success'; }
        else if (order.status === 'Cancelada') { badgeBg = 'bg-danger-light'; badgeText = 'text-danger'; }
        else if (order.status === 'Pendente') { badgeBg = 'bg-warning-light'; badgeText = 'text-warning'; }
        statusEl.className = `status-badge ${badgeBg} ${badgeText} text-xs font-bold px-2 py-1 rounded-full`;
        statusEl.textContent = order.status;

        document.getElementById('modal-os-customer').textContent = order.customer_name || '—';
        document.getElementById('modal-os-phone').textContent = order.customer_phone || '—';

        const notesEl = document.getElementById('modal-os-notes');
        const notesContainer = document.getElementById('modal-os-notes-container');
        if (order.notes) {
            notesEl.textContent = order.notes;
            notesContainer.classList.remove('d-none');
        } else {
            notesContainer.classList.add('d-none');
        }

        const tbody = document.getElementById('modal-os-items-body');
        tbody.innerHTML = (items || []).map(item => `
            <tr class="border-bottom-dashed border-border">
                <td class="py-2 px-3 text-sm text-primary font-medium">${escapeHTML(item.item_name)}</td>
                <td class="py-2 px-3 text-center text-secondary text-sm">${item.quantity}</td>
                <td class="py-2 px-3 text-right text-primary text-sm font-bold">R$ ${item.subtotal.toFixed(2)}</td>
            </tr>
        `).join('');

        document.getElementById('modal-os-total').textContent = `R$ ${order.total_amount.toFixed(2)}`;

        const modal = document.getElementById('modal-os-details');
        modal.classList.remove('d-none');

        if (window.lucide) window.lucide.createIcons();
    }

    reprintOs(id) {
        if (window.showToast) window.showToast('Reimprimindo OS...', 'info');
        // Implementar impressão
        console.log("Reimprimir", id);
    }

    async deleteOs(id) {
        if (!confirm('Deseja realmente EXCLUIR esta Ordem de Serviço? O estoque dos itens vendidos será ESTORNADO.')) {
            return;
        }

        try {
            if (window.showToast) window.showToast('Excluindo...', 'info');
            const tenantId = await getCurrentTenantId();

            // Fetch items para estornar
            const { data: items } = await supabase
                .from('service_order_items')
                .select('inventory_item_id, quantity')
                .eq('service_order_id', id);

            if (items && items.length > 0) {
                for (const item of items) {
                    if (item.inventory_item_id) {
                        const { data: invData } = await supabase
                            .from('inventory_items')
                            .select('quantity')
                            .eq('id', item.inventory_item_id)
                            .single();
                        
                        if (invData) {
                            await supabase
                                .from('inventory_items')
                                .update({ quantity: invData.quantity + item.quantity })
                                .eq('id', item.inventory_item_id);
                        }
                    }
                }
            }

            const { error } = await supabase
                .from('service_orders')
                .delete()
                .eq('id', id)
                .eq('tenant_id', tenantId);

            if (error) throw error;

            if (window.showToast) window.showToast('OS excluída e estoque estornado com sucesso!', 'success');
            
            // Remove da lista em memoria localmente e re-filtra
            this.allOrders = this.allOrders.filter(o => o.id !== id);
            this.applyFilters();
            
        } catch (e) {
            console.error('Erro ao excluir:', e);
            if (window.showToast) window.showToast('Erro ao excluir OS.', 'error');
        }
    }

    destroy() {
        // Remover listeners se necessário
    }
}
