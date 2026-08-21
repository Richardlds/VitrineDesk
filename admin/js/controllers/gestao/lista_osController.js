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
                <div class="los-skeleton-card">
                    <div class="los-sk" style="width:70px;"></div>
                    <div class="los-sk" style="width:60%;"></div>
                    <div class="los-sk" style="width:80px;"></div>
                    <div class="los-sk" style="width:70px;"></div>
                    <div class="los-sk" style="width:70px;"></div>
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

            let badgeClass = 'status-andamento';
            if (o.status === 'Concluída')    badgeClass = 'status-concluida';
            else if (o.status === 'Cancelada')  badgeClass = 'status-cancelada';
            else if (o.status === 'Pendente')   badgeClass = 'status-pendente';

            return `
            <div class="los-card os-row-click" data-id="${o.id}" data-status="${o.status}">
                <span class="los-card-id">#${shortId}</span>
                <div class="los-card-main">
                    <span class="los-card-customer">${escapeHTML(o.customer_name)}</span>
                    <span class="los-card-date">
                        <i data-lucide="calendar" class="icon-xs"></i>${dateStr}
                    </span>
                </div>
                <span class="los-badge ${badgeClass}">
                    <span class="los-badge-dot"></span>
                    ${o.status}
                </span>
                <span class="los-card-value">R$ ${totalStr}</span>
                <div class="los-card-actions">
                    <button class="los-action-btn btn-view-os" data-id="${o.id}" title="Ver Detalhes" aria-label="Ver detalhes da OS">
                        <i data-lucide="eye" class="icon-xs"></i>
                    </button>
                    <button class="los-action-btn btn-print-os" data-id="${o.id}" title="Reimprimir" aria-label="Reimprimir OS">
                        <i data-lucide="printer" class="icon-xs"></i>
                    </button>
                    <button class="los-action-btn danger btn-delete-os" data-id="${o.id}" title="Excluir OS" aria-label="Excluir OS">
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
        let badgeClass = 'status-andamento';
        if (order.status === 'Concluída')  badgeClass = 'status-concluida';
        else if (order.status === 'Cancelada') badgeClass = 'status-cancelada';
        else if (order.status === 'Pendente')  badgeClass = 'status-pendente';
        statusEl.className = `los-badge ${badgeClass}`;
        statusEl.innerHTML = `<span class="los-badge-dot"></span>${order.status}`;

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
            <tr>
                <td>${escapeHTML(item.item_name)}</td>
                <td>${item.quantity}</td>
                <td>R$ ${item.subtotal.toFixed(2)}</td>
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
