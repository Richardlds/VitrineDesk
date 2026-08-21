import { supabase, getCurrentTenantId, uploadImageToSupabase } from '../../core/supabaseClient.js';

export class planos_clientesController {
    constructor(stateManager) {
        this.state = stateManager;
        this.tenantId = null;
        this.plans = [];
        this.subscribers = [];
        this.editingPlanId = null;
        this.searchSubscribersTimeout = null;
    }

    async init() {
        this.tenantId = await getCurrentTenantId();
        this.bindEvents();
        await this.loadPlans();
        await this.loadSubscribers();
        await this.loadServices();
    }

    bindEvents() {
        const btnNovo = document.getElementById('btn-novo-plano');
        const modal = document.getElementById('modal-plano');
        const btnClose = document.getElementById('btn-close-modal-plano');
        const form = document.getElementById('form-plano');

        btnNovo?.addEventListener('click', () => this.openModal());
        btnClose?.addEventListener('click', () => this.closeModal());
        modal?.addEventListener('click', (e) => {
            if (e.target === modal) this.closeModal();
        });

        form?.addEventListener('submit', (e) => this.handleSavePlan(e));

        const inputFile = document.getElementById('input-plano-foto');
        if (inputFile) {
            inputFile.addEventListener('change', (e) => this.handleImagePreview(e));
        }

        // Tabs Modal Plano
        const modalTabs = document.querySelectorAll('#modal-plano .tab-plano-btn');
        modalTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-tab-target');
                if(!targetId) return;
                
                // Hide all contents
                document.querySelectorAll('#modal-plano .tab-plano-content').forEach(el => el.style.display = 'none');
                // Remove active from all tabs
                document.querySelectorAll('#modal-plano .tab-plano-btn').forEach(el => el.classList.remove('active'));
                
                // Show target and activate tab
                document.getElementById(targetId).style.display = 'block';
                e.currentTarget.classList.add('active');
            });
        });

        // Tabs da pagina principal
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget));
        });

        // Search & Filter Assinantes
        const searchAssinantes = document.getElementById('search-assinantes');
        const filterAssinantes = document.getElementById('filter-assinantes-status');

        searchAssinantes?.addEventListener('input', () => {
            clearTimeout(this.searchSubscribersTimeout);
            this.searchSubscribersTimeout = setTimeout(() => this.loadSubscribers(), 400);
        });

        filterAssinantes?.addEventListener('change', () => this.loadSubscribers());
    }

    switchTab(activeBtn) {
        // Reset buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'text-primary', 'bg-placeholder');
            btn.classList.add('text-secondary', 'bg-transparent');
            btn.style.borderBottom = 'none';
        });

        // Set active button
        activeBtn.classList.add('active', 'text-primary', 'bg-placeholder');
        activeBtn.classList.remove('text-secondary', 'bg-transparent');
        activeBtn.style.borderBottom = '2px solid var(--color-primary)';

        // Hide all contents
        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('d-none');
        });

        // Show target content
        const targetId = activeBtn.getAttribute('data-tab');
        document.getElementById(targetId)?.classList.remove('d-none');
    }

    handleImagePreview(e) {
        const file = e.target.files[0];
        const previewEl = document.getElementById('preview-plano-img');
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (e) => {
            previewEl.innerHTML = `<img src="${e.target.result}" style="width:100%; height:100%; object-fit:cover;">`;
        };
        reader.readAsDataURL(file);
    }

    async loadServices() {
        try {
            const { data, error } = await supabase
                .from('services')
                .select('id, name')
                .eq('tenant_id', this.tenantId);
            if (error) throw error;
            this.tenantServices = data || [];
        } catch (err) {
            console.error('Erro ao buscar serviços do tenant:', err);
            this.tenantServices = [];
        }
    }

    openModal(plan = null) {
        const modal = document.getElementById('modal-plano');
        const form = document.getElementById('form-plano');
        const title = document.getElementById('modal-plano-title');
        const btnInativar = document.getElementById('btn-inativar-plano');
        const btnSalvar = document.getElementById('btn-salvar-plano');

        form.reset();
        this.editingPlanId = plan ? plan.id : null;

        if (plan) {
            title.textContent = 'Editar Plano';
            document.getElementById('input-plano-nome').value = plan.name;
            document.getElementById('input-plano-descricao').value = plan.description || '';
            document.getElementById('input-plano-vantagens').value = Array.isArray(plan.features) ? plan.features.join('\n') : '';
            document.getElementById('input-plano-preco').value = plan.price;
            document.getElementById('input-plano-desconto').value = plan.discount_percentage || '';
            document.getElementById('input-plano-gratis').value = plan.free_appointments_per_month || '';
            document.getElementById('input-plano-image-url').value = plan.image_url || '';

            const previewEl = document.getElementById('preview-plano-img');
            if (plan.image_url) {
                previewEl.innerHTML = `<img src="${plan.image_url}" style="width:100%; height:100%; object-fit:cover;">`;
            } else {
                previewEl.innerHTML = `<i data-lucide="image" class="text-muted"></i>`;
            }

            this.renderServicesCheckboxes(plan.included_services || []);
            
            // Disable price editing if already created in stripe
            if (plan.stripe_product_id) {
                document.getElementById('input-plano-preco').disabled = true;
            } else {
                document.getElementById('input-plano-preco').disabled = false;
            }

            btnInativar.classList.remove('d-none');
            btnSalvar.textContent = 'Salvar Alterações';
            
            // Inativar handler
            btnInativar.onclick = () => this.togglePlanStatus(plan.id, !plan.active);
            btnInativar.textContent = plan.active ? 'Desativar' : 'Reativar';
            btnInativar.className = plan.active ? 'btn bg-danger-light text-danger w-100 py-3 rounded-lg cursor-pointer border-none' : 'btn bg-success-light text-success w-100 py-3 rounded-lg cursor-pointer border-none';
        } else {
            title.textContent = 'Criar Plano de Assinatura';
            document.getElementById('input-plano-preco').disabled = false;
            document.getElementById('input-plano-image-url').value = '';
            document.getElementById('input-plano-vantagens').value = '';
            document.getElementById('preview-plano-img').innerHTML = `<i data-lucide="image" class="text-muted"></i>`;
            this.renderServicesCheckboxes([]);

            btnInativar.classList.add('d-none');
            btnSalvar.textContent = 'Salvar e Criar no Stripe';
        }

        modal.classList.remove('d-none');
    }

    renderServicesCheckboxes(selectedServiceIds = []) {
        const listDiv = document.getElementById('plano-servicos-list');
        if (!listDiv) return;

        if (!this.tenantServices || this.tenantServices.length === 0) {
            listDiv.innerHTML = '<p class="text-sm text-secondary">Nenhum serviço cadastrado ainda.</p>';
            return;
        }

        let html = '<div class="flex flex-column gap-2">';
        this.tenantServices.forEach(s => {
            const isChecked = selectedServiceIds.includes(s.id) ? 'checked' : '';
            html += `
                <label class="flex align-center gap-2 cursor-pointer">
                    <input type="checkbox" class="cb-included-service" value="${s.id}" ${isChecked}>
                    <span class="text-sm text-secondary">${s.name}</span>
                </label>
            `;
        });
        html += '</div>';
        listDiv.innerHTML = html;
    }

    closeModal() {
        document.getElementById('modal-plano').classList.add('d-none');
    }

    async loadPlans() {
        const tbody = document.getElementById('planos-table-body');
        if (!tbody) return;

        let skeletonHtml = '';
        for (let i = 0; i < 3; i++) {
            skeletonHtml += `
                <tr>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                </tr>
            `;
        }
        tbody.innerHTML = skeletonHtml;

        try {
            const { data, error } = await supabase
                .from('tenant_client_plans')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.plans = data || [];
            this.renderTable();
        } catch (err) {
            console.error('Erro ao carregar planos:', err);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erro ao carregar planos.</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('planos-table-body');
        if (!tbody) return;

        if (this.plans.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary p-5">Nenhum plano cadastrado.</td></tr>`;
            return;
        }

        let html = '';
        this.plans.forEach(plan => {
            const statusClass = plan.active ? 'bg-success-light text-success' : 'bg-danger-light text-danger';
            const statusText = plan.active ? 'Ativo' : 'Inativo';
            const beneficios = [];
            if (plan.discount_percentage > 0) beneficios.push(`${plan.discount_percentage}% desc`);
            if (plan.free_appointments_per_month > 0) beneficios.push(`${plan.free_appointments_per_month} grátis`);
            
            html += `
                <tr class="border-bottom-dashed hover:bg-hover transition-colors">
                    <td class="p-3 text-sm text-primary font-medium">
                        ${plan.name}
                        ${plan.stripe_product_id ? '<i data-lucide="check-circle" class="icon-xs text-success ml-1" title="Sincronizado no Stripe"></i>' : ''}
                    </td>
                    <td class="p-3 text-sm text-secondary">R$ ${Number(plan.price).toFixed(2)}/mês</td>
                    <td class="p-3 text-sm text-secondary text-center">${beneficios.length > 0 ? beneficios.join(' + ') : '-'}</td>
                    <td class="p-3 text-sm text-secondary text-center">--</td>
                    <td class="p-3 text-sm text-center">
                        <span class="status-badge ${statusClass} border-none">${statusText}</span>
                    </td>
                    <td class="p-3 text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer hover:underline text-sm" onclick="window.editPlan('${plan.id}')">Editar</button>
                        <button class="btn bg-transparent border-none text-danger cursor-pointer ml-2 hover:opacity-70" onclick="window.deletePlan('${plan.id}')" title="Excluir">
                            <i data-lucide="trash-2" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // Expõe global para o onclick
        window.editPlan = (id) => {
            const plan = this.plans.find(p => p.id === id);
            if (plan) this.openModal(plan);
        };
        
        window.deletePlan = async (id) => {
            if (window.confirm('Tem certeza que deseja excluir este plano? Esta ação não pode ser desfeita e pode afetar os assinantes atuais.')) {
                await this.deletePlan(id);
            }
        };
    }

    async deletePlan(id) {
        try {
            const btnDelete = document.querySelector(`button[onclick="window.deletePlan('${id}')"]`);
            if (btnDelete) btnDelete.innerHTML = '<span class="loader-sm"></span>';

            const { error } = await supabase
                .from('tenant_client_plans')
                .delete()
                .eq('id', id)
                .eq('tenant_id', this.tenantId);

            if (error) {
                // Se der erro de foreign key, é porque tem assinantes
                if (error.code === '23503') {
                    throw new Error('Não é possível excluir o plano pois existem clientes assinando este plano. Considere inativá-lo.');
                }
                throw error;
            }

            if (window.showToast) window.showToast('Plano excluído com sucesso!', 'success');
            await this.loadPlans();
        } catch (err) {
            console.error('Erro ao excluir plano:', err);
            if (window.showToast) window.showToast(err.message || 'Erro ao excluir plano.', 'error');
            await this.loadPlans(); // Reload to remove loader
        }
    }

    async loadSubscribers() {
        const tbody = document.getElementById('assinantes-table-body');
        if (!tbody) return;

        let skeletonHtml = '';
        for (let i = 0; i < 3; i++) {
            skeletonHtml += `
                <tr>
                    <td class="p-3"><div class="skeleton w-100" style="height: 32px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                    <td class="p-3"><div class="skeleton w-100" style="height: 20px; border-radius: 4px;"></div></td>
                </tr>
            `;
        }
        tbody.innerHTML = skeletonHtml;

        const searchTerm = document.getElementById('search-assinantes')?.value.trim().toLowerCase();
        const filterStatus = document.getElementById('filter-assinantes-status')?.value;

        try {
            // Buscando os assinantes reais da tabela client_subscriptions
            let query = supabase
                .from('client_subscriptions')
                .select(`
                    id,
                    status,
                    created_at,
                    current_period_end,
                    client_id,
                    plan_id,
                    clientes!client_id(nome, email, telefone),
                    tenant_client_plans!plan_id(name)
                `)
                .eq('tenant_id', this.tenantId)
                .order('created_at', { ascending: false });

            if (filterStatus && filterStatus !== 'todos') {
                if (filterStatus === 'ativo') query = query.eq('status', 'active');
                if (filterStatus === 'cancelado') query = query.eq('status', 'canceled');
                if (filterStatus === 'suspenso') query = query.eq('status', 'past_due');
            }

            const { data, error } = await query;
            if (error) {
                // Fallback amigável caso a tabela não exista ainda:
                if (error.code === '42P01' || error.code === 'PGRST116' || error.message?.includes('not found') || error.details?.includes('does not exist')) {
                     tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary p-5">A infraestrutura de assinantes ainda não foi ativada neste banco de dados (tabela não encontrada).</td></tr>`;
                     return;
                }
                // Se for outro erro de postgrest genérico (ex: 404), trata também amigavelmente
                if (error.code && error.code.startsWith('PGRST')) {
                     tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary p-5">A infraestrutura de assinantes ainda não está disponível ou a tabela não foi criada no banco de dados.</td></tr>`;
                     return;
                }
                throw error;
            }

            let filteredData = data || [];

            // Filtro de busca textual no nome do cliente
            if (searchTerm) {
                filteredData = filteredData.filter(sub => {
                    const nome = sub.clientes?.nome?.toLowerCase() || '';
                    const email = sub.clientes?.email?.toLowerCase() || '';
                    return nome.includes(searchTerm) || email.includes(searchTerm);
                });
            }

            this.subscribers = filteredData;
            this.renderSubscribersTable();
        } catch (err) {
            console.error('Erro ao carregar assinantes:', err);
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-danger p-4">Erro ao carregar assinantes.</td></tr>`;
        }
    }

    renderSubscribersTable() {
        const tbody = document.getElementById('assinantes-table-body');
        if (!tbody) return;

        if (this.subscribers.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center text-secondary p-5">Nenhum assinante encontrado.</td></tr>`;
            return;
        }

        let html = '';
        this.subscribers.forEach(sub => {
            let statusClass = 'bg-secondary-light text-secondary';
            let statusText = sub.status || 'Desconhecido';
            
            if (sub.status === 'active') {
                statusClass = 'bg-success-light text-success';
                statusText = 'Ativo';
            } else if (sub.status === 'canceled' || sub.status === 'unpaid') {
                statusClass = 'bg-danger-light text-danger';
                statusText = 'Cancelado';
            } else if (sub.status === 'past_due') {
                statusClass = 'bg-warning-light text-warning';
                statusText = 'Pagamento Pendente';
            } else {
                statusText = sub.status;
            }

            const formatDate = (dateStr) => {
                if (!dateStr) return '-';
                return new Date(dateStr).toLocaleDateString('pt-BR');
            };

            const clientName = sub.clientes?.nome || 'Desconhecido';
            const clientEmail = sub.clientes?.email || '';
            const planName = sub.tenant_client_plans?.name || 'Plano Deletado';

            html += `
                <tr class="border-bottom-dashed hover:bg-hover transition-colors">
                    <td class="p-3 text-sm">
                        <div class="font-medium text-primary">${clientName}</div>
                        ${clientEmail ? `<div class="text-xs text-secondary mt-1">${clientEmail}</div>` : ''}
                    </td>
                    <td class="p-3 text-sm text-secondary font-medium">${planName}</td>
                    <td class="p-3 text-sm text-secondary text-center">${formatDate(sub.created_at)}</td>
                    <td class="p-3 text-sm text-secondary text-center">${formatDate(sub.current_period_end)}</td>
                    <td class="p-3 text-sm text-center">
                        <span class="status-badge ${statusClass} border-none">${statusText}</span>
                    </td>
                    <td class="p-3 text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer hover:underline text-sm" onclick="window.changeSubStatus('${sub.id}')">Alterar Status</button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        window.changeSubStatus = async (id) => {
            const sub = this.subscribers.find(s => s.id === id);
            if (!sub) return;

            const nextStatus = sub.status === 'active' ? 'canceled' : 'active';
            const displayStatus = nextStatus === 'active' ? 'ATIVO' : 'CANCELADO';
            
            if (window.showConfirm) {
                window.showConfirm(`Deseja alterar o status desta assinatura para ${displayStatus}? (Nota: Esta ação não cancela a cobrança na Stripe. É apenas para revogar ou liberar o acesso no sistema)`, async () => {
                    try {
                        const { error } = await supabase
                            .from('client_subscriptions')
                            .update({ status: nextStatus })
                            .eq('id', id);
                            
                        if (error) throw error;
                        
                        if (window.showToast) window.showToast('Status atualizado com sucesso', 'success');
                        this.loadSubscribers();
                    } catch (e) {
                        console.error(e);
                        if (window.showToast) window.showToast('Erro ao atualizar status', 'error');
                    }
                });
            }
        };
    }

    async handleSavePlan(e) {
        e.preventDefault();
        const btnSalvar = document.getElementById('btn-salvar-plano');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm mr-2"></i> Salvando...`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const nome = document.getElementById('input-plano-nome').value.trim();
            const preco = parseFloat(document.getElementById('input-plano-preco').value);
            
            if (!nome) {
                if (window.showToast) window.showToast('O Nome do plano é obrigatório.', 'warning');
                return;
            }
            if (isNaN(preco) || preco <= 0) {
                if (window.showToast) window.showToast('A Mensalidade deve ser maior que zero.', 'warning');
                return;
            }

            const descricao = document.getElementById('input-plano-descricao').value.trim();
            const desconto = parseFloat(document.getElementById('input-plano-desconto').value) || 0;
            const gratis = parseInt(document.getElementById('input-plano-gratis').value, 10) || 0;
            
            const vantagensRaw = document.getElementById('input-plano-vantagens').value;
            const features = vantagensRaw.split('\n').map(v => v.trim()).filter(v => v.length > 0);

            // Get included services
            const includedServices = [];
            document.querySelectorAll('.cb-included-service:checked').forEach(cb => {
                includedServices.push(cb.value);
            });

            // Handle Image Upload
            const fileInput = document.getElementById('input-plano-foto');
            let imageUrl = document.getElementById('input-plano-image-url').value;

            if (fileInput.files.length > 0) {
                btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm mr-2"></i> Fazendo upload...`;
                try {
                    imageUrl = await uploadImageToSupabase(fileInput.files[0], 'tenant-images', this.tenantId);
                } catch (e) {
                    console.error('Falha no upload', e);
                }
            }

            if (this.editingPlanId) {
                // UPDATE (only allows updating name, desc, benefits. Price is disabled).
                const { error } = await supabase
                    .from('tenant_client_plans')
                    .update({
                        name: nome,
                        description: descricao,
                        features: features,
                        discount_percentage: desconto,
                        free_appointments_per_month: gratis,
                        included_services: includedServices,
                        image_url: imageUrl
                    })
                    .eq('id', this.editingPlanId)
                    .eq('tenant_id', this.tenantId);
                
                if (error) throw error;
                if (window.showToast) window.showToast('Plano atualizado com sucesso!', 'success');
            } else {
                // CREATE - also create in Stripe
                btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm mr-2"></i> Criando plano na Stripe...`;
                
                const { data: stripeData, error: stripeError } = await supabase.functions.invoke('create-stripe-plan', {
                    body: { name: nome, price: preco, tenantId: this.tenantId }
                });
                
                if (stripeError) {
                    throw new Error(`Erro ao criar na Stripe: ${stripeError.message}`);
                }
                
                if (!stripeData || stripeData.error) {
                    throw new Error(`Erro retornado pela Stripe: ${stripeData?.error || 'Desconhecido'}`);
                }

                btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm mr-2"></i> Salvando no banco...`;

                const { error } = await supabase
                    .from('tenant_client_plans')
                    .insert([{
                        tenant_id: this.tenantId,
                        name: nome,
                        description: descricao,
                        features: features,
                        price: preco,
                        discount_percentage: desconto,
                        free_appointments_per_month: gratis,
                        included_services: includedServices,
                        image_url: imageUrl,
                        stripe_product_id: stripeData.productId,
                        stripe_price_id: stripeData.priceId
                    }]);
                
                if (error) throw error;
                if (window.showToast) window.showToast('Plano criado e sincronizado com o Stripe!', 'success');
            }

            this.closeModal();
            await this.loadPlans();
        } catch (err) {
            console.error('Erro ao salvar plano:', err);
            if (window.showToast) window.showToast('Erro ao salvar plano', 'error');
        } finally {
            btnSalvar.innerHTML = originalText;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async togglePlanStatus(id, newStatus) {
        try {
            const { error } = await supabase
                .from('tenant_client_plans')
                .update({ active: newStatus })
                .eq('id', id)
                .eq('tenant_id', this.tenantId);
            
            if (error) throw error;
            
            if (window.showToast) window.showToast(`Plano ${newStatus ? 'reativado' : 'desativado'} com sucesso!`);
            this.closeModal();
            await this.loadPlans();
        } catch(err) {
            console.error(err);
            if (window.showToast) window.showToast('Erro ao mudar status do plano', 'error');
        }
    }

    destroy() {
        delete window.editPlan;
        delete window.changeSubStatus;
    }
}
