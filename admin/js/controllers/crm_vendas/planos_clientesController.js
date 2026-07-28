import { supabase, getCurrentTenantId, uploadImageToSupabase } from '../../core/supabaseClient.js';

export class planos_clientesController {
    constructor(stateManager) {
        this.state = stateManager;
        this.tenantId = null;
        this.plans = [];
        this.editingPlanId = null;
    }

    async init() {
        this.tenantId = await getCurrentTenantId();
        this.bindEvents();
        await this.loadPlans();
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

        tbody.innerHTML = `
            <tr>
                <td colspan="6" class="p-3 text-center">
                    <div class="skeleton w-100 h-40px mb-2"></div>
                    <div class="skeleton w-100 h-40px"></div>
                </td>
            </tr>
        `;

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
    }

    async handleSavePlan(e) {
        e.preventDefault();
        const btnSalvar = document.getElementById('btn-salvar-plano');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm mr-2"></i> Salvando...`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const nome = document.getElementById('input-plano-nome').value.trim();
            const descricao = document.getElementById('input-plano-descricao').value.trim();
            const preco = parseFloat(document.getElementById('input-plano-preco').value);
            const desconto = parseFloat(document.getElementById('input-plano-desconto').value) || 0;
            const gratis = parseInt(document.getElementById('input-plano-gratis').value, 10) || 0;

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
                    imageUrl = await uploadImageToSupabase(fileInput.files[0], 'avatars', this.tenantId);
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
                const response = await fetch('/api/stripe/create-plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: nome, price: preco, tenantId: this.tenantId })
                });
                
                if (!response.ok) throw new Error('Erro ao criar no Stripe');
                const stripeData = await response.json();

                const { error } = await supabase
                    .from('tenant_client_plans')
                    .insert([{
                        tenant_id: this.tenantId,
                        name: nome,
                        description: descricao,
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
    }
}
