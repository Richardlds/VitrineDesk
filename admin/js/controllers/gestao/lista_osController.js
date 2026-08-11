import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class lista_osController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.allOrders = [];
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

        const searchInput = document.getElementById('search-os');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => this.handleSearch(e.target.value));
        }
    }

    async loadOrders() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const tbody = document.getElementById('lista-os-tbody');
            if (tbody) {
                tbody.innerHTML = Array.from({ length: 5 }, () => `
                    <tr class="sk-row">
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                        <td class="py-2 px-3"><div class="skeleton h-20px w-100 rounded-sm"></div></td>
                    </tr>
                `).join('');
            }

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
            this.renderOrders(this.allOrders);

        } catch (e) {
            console.error('Erro geral ao carregar OS:', e);
        }
    }

    handleSearch(query) {
        const term = query.toLowerCase().trim();
        if (!term) {
            this.renderOrders(this.allOrders);
            return;
        }

        const filtered = this.allOrders.filter(o => 
            (o.customer_name && o.customer_name.toLowerCase().includes(term)) ||
            (o.id && o.id.toLowerCase().includes(term))
        );
        this.renderOrders(filtered);
    }

    renderOrders(orders) {
        const tbody = document.getElementById('lista-os-tbody');
        const emptyState = document.getElementById('lista-os-empty');
        if (!tbody || !emptyState) return;

        if (orders.length === 0) {
            tbody.innerHTML = '';
            emptyState.classList.remove('d-none');
            return;
        }

        emptyState.classList.add('d-none');
        
        tbody.innerHTML = orders.map(o => {
            const shortId = o.id.substring(0, 8).toUpperCase();
            const dateStr = new Date(o.created_at).toLocaleDateString('pt-BR');
            const totalStr = o.total_amount ? o.total_amount.toFixed(2) : '0.00';
            
            return `
            <tr class="border-bottom-dashed">
                <td class="py-3 px-3 text-sm font-bold text-primary">#${shortId}</td>
                <td class="py-3 px-3 text-sm text-secondary">${o.customer_name}</td>
                <td class="py-3 px-3 text-sm text-secondary">${dateStr}</td>
                <td class="py-3 px-3">
                    <span class="badge bg-success-light text-success px-2 py-1 rounded-full text-xs font-bold">
                        ${o.status === 'completed' ? 'Concluída' : o.status}
                    </span>
                </td>
                <td class="py-3 px-3 text-sm font-bold text-primary text-right">R$ ${totalStr}</td>
                <td class="py-3 px-3 text-center">
                    <button class="btn bg-primary-light text-primary border-none cursor-pointer p-1 rounded-sm btn-print-os" data-id="${o.id}" title="Reimprimir">
                        <i data-lucide="printer" class="icon-sm"></i>
                    </button>
                </td>
            </tr>
            `;
        }).join('');

        if (window.lucide) window.lucide.createIcons();

        // Bind print events
        document.querySelectorAll('.btn-print-os').forEach(btn => {
            btn.addEventListener('click', () => this.reprintOs(btn.dataset.id));
        });
    }

    async reprintOs(id) {
        if (window.showToast) window.showToast('Carregando dados para impressão...', 'info');
        try {
            const tenantId = await getCurrentTenantId();
            
            // Buscar detalhes da OS
            const { data: orderData, error: orderErr } = await supabase
                .from('service_orders')
                .select('*')
                .eq('id', id)
                .single();

            if (orderErr) throw orderErr;

            // Buscar itens da OS
            const { data: itemsData, error: itemsErr } = await supabase
                .from('service_order_items')
                .select('*')
                .eq('order_id', id);

            if (itemsErr) throw itemsErr;

            // Para usar a impressão existente, poderíamos injetar o HTML aqui,
            // mas como a tela de lista não tem o #print-layout nativamente nela, 
            // precisamos renderizá-lo e depois chamar window.print().
            // Solução limpa: Salvar o id no localStorage e redirecionar para uma rota de impressão
            // Ou criar um modal de preview de impressão.
            
            // Para ser rápido e usar o mesmo código, vamos apenas colocar o HTML invisível na tela:
            let printContainer = document.getElementById('print-layout-container');
            if (!printContainer) {
                printContainer = document.createElement('div');
                printContainer.id = 'print-layout-container';
                printContainer.className = 'print-only';
                document.body.appendChild(printContainer);
            }

            // Precisamos dos dados da loja
            const { data: tenantData } = await supabase.from('tenants').select('name, logo_url, settings').eq('id', tenantId).single();
            const shopName = tenantData?.name || 'VitrineDesk';
            
            let tenantHeader = '';
            let tenantLogo = '';
            
            if (tenantData?.logo_url) {
                tenantLogo = `<img src="${tenantData.logo_url}" style="max-height: 70px; max-width: 150px; object-fit: contain;">`;
            }

            const setts = tenantData?.settings || {};
            const cnpj = setts.cnpj ? `CNPJ: ${setts.cnpj}<br>` : '';
            const end = setts.endereco ? `${setts.endereco}<br>` : '';
            const cont = setts.email ? `Contato: ${setts.email}` : '';

            printContainer.innerHTML = `
                <div class="print-header flex justify-between" style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 20px;">
                    <div style="text-align: left; display: flex; align-items: center; gap: 15px;">
                        ${tenantLogo}
                        <div>
                            <h1 class="print-title" style="font-size: 20px; margin-bottom: 4px;">${shopName}</h1>
                            <p style="font-size: 12px; margin: 0; line-height: 1.4; color: #333;">
                                ${cnpj}${end}${cont}
                            </p>
                        </div>
                    </div>
                    <div style="text-align: right; min-width: 150px;">
                        <p style="margin: 0; font-size: 16px; font-weight: bold;">OS #${orderData.id.substring(0, 8).toUpperCase()}</p>
                        <p style="margin: 5px 0 0; font-size: 12px;">Data: ${new Date(orderData.created_at).toLocaleDateString('pt-BR')} às ${new Date(orderData.created_at).toLocaleTimeString('pt-BR')}</p>
                    </div>
                </div>

                <div class="print-info" style="display: flex; justify-content: space-between; margin-bottom: 10px; font-size: 14px;">
                    <div>
                        <strong>Cliente:</strong> <span>${orderData.customer_name}</span><br>
                        <strong>Telefone:</strong> <span>${orderData.customer_phone || '-'}</span>
                    </div>
                    <div style="text-align: right;">
                        <strong>Status:</strong> ${orderData.status === 'completed' ? 'Concluído' : orderData.status}
                    </div>
                </div>

                <table style="width: 100%; border-collapse: collapse; margin-top: 15px; margin-bottom: 15px;">
                    <thead>
                        <tr>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; background-color: #f5f5f5 !important; -webkit-print-color-adjust: exact; font-weight: bold;">Qtd</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px; background-color: #f5f5f5 !important; -webkit-print-color-adjust: exact; font-weight: bold;">Descrição do Item/Serviço</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; background-color: #f5f5f5 !important; -webkit-print-color-adjust: exact; font-weight: bold;">Vl Unit.</th>
                            <th style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px; background-color: #f5f5f5 !important; -webkit-print-color-adjust: exact; font-weight: bold;">Subtotal</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${itemsData.map(item => `
                            <tr>
                                <td style="border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px;">${item.quantity}</td>
                                <td style="border: 1px solid #ddd; padding: 8px; text-align: left; font-size: 12px;">${item.item_name}</td>
                                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px;">R$ ${item.unit_price.toFixed(2)}</td>
                                <td style="border: 1px solid #ddd; padding: 8px; text-align: right; font-size: 12px;">R$ ${item.subtotal.toFixed(2)}</td>
                            </tr>
                        `).join('')}
                    </tbody>
                </table>

                <div style="text-align: right; font-size: 16px; margin-top: 10px;">
                    <strong>Total Geral:</strong> <span>R$ ${(orderData.total_amount || 0).toFixed(2)}</span>
                </div>

                <div style="margin-top: 30px; font-size: 12px; border-top: 1px solid #ccc; padding-top: 10px;">
                    <strong>Observações / Termos:</strong>
                    <p style="white-space: pre-line; margin-top: 5px;">${orderData.notes || 'Sem observações.'}</p>
                </div>

                <div style="display: flex; justify-content: space-around; margin-top: 40px;">
                    <div style="margin-top: 50px; width: 250px; border-top: 1px solid #000; text-align: center; font-size: 12px;">Assinatura do Responsável</div>
                    <div style="margin-top: 50px; width: 250px; border-top: 1px solid #000; text-align: center; font-size: 12px;">Assinatura do Cliente</div>
                </div>
            `;

            setTimeout(() => {
                window.print();
            }, 500);

        } catch (e) {
            console.error('Erro ao reimprimir:', e);
            if (window.showToast) window.showToast('Erro ao preparar OS para impressão.', 'error');
        }
    }

    destroy() {
        // Remove print container se existir
        const printContainer = document.getElementById('print-layout-container');
        if (printContainer) printContainer.remove();
    }
}
