import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class osController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.inventoryItems = [];
        this.cart = [];
    }

    async init() {
        this.bindEvents();
        await this.loadInventory();
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    bindEvents() {
        const searchInput = document.getElementById('os-search-item');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
            searchInput.addEventListener('focus', (e) => this.handleSearch(e.target.value));
            
            // Hide dropdown when clicking outside
            document.addEventListener('click', (e) => {
                if (!e.target.closest('#os-search-item') && !e.target.closest('#os-search-results')) {
                    document.getElementById('os-search-results')?.classList.add('d-none');
                }
            });
        }

        const btnSavePrint = document.getElementById('btn-save-print-os');
        if (btnSavePrint) {
            btnSavePrint.addEventListener('click', () => this.saveAndPrint());
        }

        // Cart events delegation
        const cartBody = document.getElementById('os-cart-body');
        if (cartBody) {
            cartBody.addEventListener('input', (e) => {
                if (e.target.classList.contains('cart-qty-input')) {
                    const id = e.target.dataset.id;
                    let qty = parseInt(e.target.value);
                    if (isNaN(qty) || qty < 1) {
                        qty = 1;
                        e.target.value = 1;
                    }
                    this.updateCartItemQty(id, qty);
                }
            });

            cartBody.addEventListener('click', (e) => {
                const btnRemove = e.target.closest('.btn-remove-cart');
                if (btnRemove) {
                    const id = btnRemove.dataset.id;
                    this.removeFromCart(id);
                }
            });
        }

        const customerNameInput = document.getElementById('os-customer-name');
        if (customerNameInput) {
            customerNameInput.addEventListener('input', () => this.checkFormValidity());
        }
    }

    async loadInventory() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase
                .from('inventory_items')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name', { ascending: true });

            if (error) {
                console.warn('Erro ao carregar estoque:', error);
                return;
            }

            this.inventoryItems = data || [];
        } catch (e) {
            console.error('Erro geral ao carregar estoque:', e);
        }
    }

    handleSearch(query) {
        const resultsContainer = document.getElementById('os-search-results');
        if (!resultsContainer) return;

        const term = query.toLowerCase().trim();
        let filtered = [];

        if (term.length === 0) {
            filtered = this.inventoryItems.slice(0, 10);
        } else {
            filtered = this.inventoryItems.filter(item => 
                (item.name && item.name.toLowerCase().includes(term)) || 
                (item.sku && item.sku.toLowerCase().includes(term))
            ).slice(0, 10); // Limit to 10 results
        }

        if (filtered.length === 0) {
            resultsContainer.innerHTML = '<div class="p-3 text-sm text-secondary text-center">Nenhum item encontrado.</div>';
        } else {
            resultsContainer.innerHTML = filtered.map(item => `
                <div class="p-2 border-bottom-dashed border-border hover:bg-placeholder cursor-pointer flex justify-between align-center search-result-item" data-id="${item.id}" style="transition: background 0.2s;">
                    <div class="flex flex-column">
                        <span class="text-sm font-bold text-primary">${item.name}</span>
                        <span class="text-xs text-secondary">Estoque: ${item.stock_quantity > 0 ? item.stock_quantity : 'Sem estoque'} | R$ ${(item.base_price || 0).toFixed(2)}</span>
                    </div>
                    <button class="btn bg-primary-light text-primary border-none rounded-sm px-2 py-1 text-xs cursor-pointer font-bold">Adicionar</button>
                </div>
            `).join('');

            // Bind click events on results
            resultsContainer.querySelectorAll('.search-result-item').forEach(el => {
                el.addEventListener('click', () => {
                    const id = el.dataset.id;
                    const item = this.inventoryItems.find(i => i.id === id);
                    if (item) this.addToCart(item);
                    
                    // Clear search
                    document.getElementById('os-search-item').value = '';
                    resultsContainer.classList.add('d-none');
                });
            });
        }

        resultsContainer.classList.remove('d-none');
    }

    addToCart(item) {
        // Check if already in cart
        const existing = this.cart.find(i => i.id === item.id);
        
        if (existing) {
            // Update qty
            if (item.stock_quantity > 0 && existing.quantity >= item.stock_quantity && item.type !== 'servico') {
                if (window.showToast) window.showToast('Quantidade máxima em estoque atingida!', 'warning');
                return;
            }
            existing.quantity += 1;
            existing.subtotal = existing.quantity * existing.unit_price;
        } else {
            // Add new
            if (item.stock_quantity <= 0 && item.type !== 'servico') {
                if (window.showToast) window.showToast('Produto sem estoque! Não é possível adicionar à OS.', 'error');
                return; // Bloqueia a adição
            }
            
            const price = item.base_price || 0;
            this.cart.push({
                id: item.id,
                name: item.name,
                unit_price: price,
                quantity: 1,
                subtotal: price,
                is_service: item.type === 'servico',
                max_qty: item.stock_quantity
            });
        }

        this.renderCart();
        this.checkFormValidity();
    }

    updateCartItemQty(id, qty) {
        const item = this.cart.find(i => i.id === id);
        if (item) {
            if (!item.is_service && qty > item.max_qty) {
                if (window.showToast) window.showToast('Quantidade informada maior que o estoque disponível.', 'error');
                item.quantity = item.max_qty; // Força a voltar para o limite máximo
            } else {
                item.quantity = qty;
            }
            item.subtotal = item.quantity * item.unit_price;
            this.renderCart();
        }
    }

    removeFromCart(id) {
        this.cart = this.cart.filter(i => i.id !== id);
        this.renderCart();
        this.checkFormValidity();
    }

    renderCart() {
        const tbody = document.getElementById('os-cart-body');
        const emptyState = document.getElementById('os-empty-cart');
        const totalEl = document.getElementById('os-total-amount');

        if (!tbody || !emptyState || !totalEl) return;

        if (this.cart.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('d-none');
            totalEl.textContent = 'R$ 0,00';
            return;
        }

        emptyState.classList.add('d-none');

        let total = 0;
        tbody.innerHTML = this.cart.map(item => {
            total += item.subtotal;
            return `
            <tr class="border-bottom-dashed">
                <td class="py-2 px-3 text-sm text-primary font-medium">${item.name}</td>
                <td class="py-2 px-3 text-center">
                    <input type="number" min="1" value="${item.quantity}" data-id="${item.id}" class="cart-qty-input bg-placeholder border border-border rounded-sm text-center text-primary text-sm p-1 outline-none" style="width: 50px;">
                </td>
                <td class="py-2 px-3 text-right text-sm text-secondary">R$ ${item.unit_price.toFixed(2)}</td>
                <td class="py-2 px-3 text-right text-sm font-bold text-primary">R$ ${item.subtotal.toFixed(2)}</td>
                <td class="py-2 px-3 text-center">
                    <button class="btn bg-transparent border-none text-danger cursor-pointer p-1 btn-remove-cart" data-id="${item.id}" title="Remover">
                        <i data-lucide="x" class="icon-sm"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        totalEl.textContent = `R$ ${total.toFixed(2)}`;

        if (window.lucide) window.lucide.createIcons();
    }

    checkFormValidity() {
        const btnSavePrint = document.getElementById('btn-save-print-os');
        const customerNameInput = document.getElementById('os-customer-name');
        
        if (!btnSavePrint || !customerNameInput) return;

        const hasCustomer = customerNameInput.value.trim().length > 0;
        const hasItems = this.cart.length > 0;

        btnSavePrint.disabled = !(hasCustomer && hasItems);
    }

    async saveAndPrint() {
        const btnSavePrint = document.getElementById('btn-save-print-os');
        const customerName = document.getElementById('os-customer-name')?.value.trim();
        const customerPhone = document.getElementById('os-customer-phone')?.value.trim();
        const notes = document.getElementById('os-notes')?.value.trim();
        
        if (!customerName || this.cart.length === 0) return;
        
        btnSavePrint.disabled = true;
        const originalText = btnSavePrint.innerHTML;
        btnSavePrint.innerHTML = '<i data-lucide="loader" class="icon-sm" style="animation: spin 1s linear infinite;"></i> Processando...';

        try {
            const tenantId = await getCurrentTenantId();
            
            // Calculate total
            const totalAmount = this.cart.reduce((acc, item) => acc + item.subtotal, 0);

            // 1. Insert into service_orders
            const { data: orderData, error: orderError } = await supabase
                .from('service_orders')
                .insert([{
                    tenant_id: tenantId,
                    customer_name: customerName,
                    customer_phone: customerPhone,
                    total_amount: totalAmount,
                    notes: notes,
                    status: 'completed'
                }])
                .select('id')
                .single();

            if (orderError) throw orderError;
            const orderId = orderData.id;

            // 2. Insert into service_order_items
            const itemsToInsert = this.cart.map(item => ({
                order_id: orderId,
                item_id: item.id,
                item_name: item.name,
                quantity: item.quantity,
                unit_price: item.unit_price,
                subtotal: item.subtotal
            }));

            const { error: itemsError } = await supabase
                .from('service_order_items')
                .insert(itemsToInsert);

            if (itemsError) throw itemsError;

            // 3. Deduct stock for physical items
            for (const item of this.cart) {
                if (!item.is_service) {
                    const newQty = Math.max(0, item.max_qty - item.quantity);
                    const { error: updateError } = await supabase
                        .from('inventory_items')
                        .update({ stock_quantity: newQty })
                        .eq('id', item.id)
                        .eq('tenant_id', tenantId);
                    
                    if (updateError) {
                        console.warn(`Erro ao baixar estoque do item ${item.name}`, updateError);
                    }
                }
            }

            if (window.showToast) window.showToast('OS salva e estoque baixado com sucesso!', 'success');

            // 4. Populate Print Layout
            await this.populatePrintLayout(tenantId, orderId, customerName, customerPhone, notes, totalAmount);

            // 5. Trigger Print
            setTimeout(() => {
                window.print();
                
                // Clear form after printing
                this.clearForm();
            }, 500);

        } catch (error) {
            console.error('Erro ao salvar OS:', error);
            if (window.showToast) window.showToast('Erro ao processar OS. Tabela criada?', 'error');
        } finally {
            btnSavePrint.disabled = false;
            btnSavePrint.innerHTML = originalText;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async populatePrintLayout(tenantId, orderId, customerName, customerPhone, notes, totalAmount) {
        // Obter nome da loja ativo do topbar
        const tenantNameEl = document.getElementById('topbar-active-branch-name');
        const shopName = tenantNameEl ? tenantNameEl.textContent : 'VitrineDesk';

        document.getElementById('print-tenant-name').textContent = shopName;
        document.getElementById('print-os-id').textContent = orderId.substring(0, 8).toUpperCase();
        document.getElementById('print-date').textContent = `Data: ${new Date().toLocaleDateString('pt-BR')} às ${new Date().toLocaleTimeString('pt-BR')}`;
        
        // Obter logo e detalhes do tenant
        try {
            const { data } = await supabase.from('tenants').select('logo_url, settings, name').eq('id', tenantId).single();
            
            const logoEl = document.getElementById('print-tenant-logo');
            if (data && data.logo_url && logoEl) {
                logoEl.src = data.logo_url;
                logoEl.classList.remove('d-none');
            } else if (logoEl) {
                logoEl.classList.add('d-none');
            }

            if (data) {
                if (data.name) document.getElementById('print-tenant-name').textContent = data.name;
                
                const settings = data.settings || {};
                const cnpj = settings.cnpj ? `CNPJ: ${settings.cnpj}` : '';
                const endereco = settings.endereco ? `${settings.endereco}` : '';
                const contato = settings.email ? `Contato: ${settings.email}` : '';
                
                const cnpjEl = document.getElementById('print-tenant-cnpj');
                const addrEl = document.getElementById('print-tenant-address');
                const contEl = document.getElementById('print-tenant-contact');
                
                if (cnpjEl) { cnpjEl.textContent = cnpj; cnpjEl.style.display = cnpj ? 'inline' : 'none'; }
                if (addrEl) { addrEl.textContent = endereco; addrEl.style.display = endereco ? 'inline' : 'none'; }
                if (contEl) { contEl.textContent = contato; contEl.style.display = contato ? 'inline' : 'none'; }
            }
        } catch (e) {
            console.error('Erro ao carregar detalhes do tenant para impressão:', e);
        }
        
        document.getElementById('print-customer-name').textContent = customerName;
        document.getElementById('print-customer-phone').textContent = customerPhone || '-';
        
        document.getElementById('print-total').textContent = `R$ ${totalAmount.toFixed(2)}`;
        document.getElementById('print-notes').textContent = notes || 'Sem observações.';

        const printBody = document.getElementById('print-cart-body');
        printBody.innerHTML = this.cart.map(item => `
            <tr>
                <td style="text-align: center;">${item.quantity}</td>
                <td>${item.name}</td>
                <td style="text-align: right;">R$ ${item.unit_price.toFixed(2)}</td>
                <td style="text-align: right;">R$ ${item.subtotal.toFixed(2)}</td>
            </tr>
        `).join('');
    }

    clearForm() {
        document.getElementById('os-customer-name').value = '';
        document.getElementById('os-customer-phone').value = '';
        document.getElementById('os-notes').value = '';
        document.getElementById('os-search-item').value = '';
        this.cart = [];
        this.renderCart();
        this.checkFormValidity();
        this.loadInventory(); // Reload to get fresh stock quantities
    }

    destroy() {
        // Cleanup if necessary
    }
}
