import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';
const escapeHTML = (str) => str ? str.replace(/[&<>'"`]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;' }[tag] || tag)) : '';


export class assinaturaController {
    constructor() {
        this.planos = [];
    }

    async init() {
        try {
            await this.carregarPlanos();
            this.renderAssinaturaAtual();
            this.renderPlanosDisponiveis();
            this.bindEvents();
        } catch (error) {
            console.error('Erro ao iniciar modulo de assinatura:', error);
            window.showToast('Erro ao carregar os planos.', 'error');
        }
    }

    async carregarPlanos() {
        // Busca os planos da plataforma (God Panel)
        const { data, error } = await supabase
            .from('plans')
            .select('*')
            .order('price', { ascending: true });

        if (error) throw error;
        this.planos = data || [];
    }

    renderAssinaturaAtual() {
        const container = document.getElementById('assinatura-atual-container');
        if (!container) return;

        const tenant = window.globalTenant;
        const planoId = tenant?.settings?.plano_id;
        
        if (!planoId) {
            container.innerHTML = `
                <div class="flex flex-column align-center text-center p-2">
                    <div class="bg-danger-light p-3 rounded-full mb-3 inline-block">
                        <i data-lucide="alert-triangle" class="text-danger"></i>
                    </div>
                    <h4 class="text-primary font-bold mb-2">Sem Assinatura</h4>
                    <p class="text-sm text-secondary">Você ainda não assinou nenhum plano. Escolha um plano abaixo para liberar recursos.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons({ root: container });
            return;
        }

        const meuPlano = this.planos.find(p => p.id === planoId);
        const planoNome = meuPlano ? meuPlano.name : 'Desconhecido';
        const planoPreco = meuPlano ? `R$ ${Number(meuPlano.price).toFixed(2)}/mês` : '';
        const vencimento = tenant?.settings?.vencimento ? new Date(tenant.settings.vencimento).toLocaleDateString('pt-BR') : 'Sem Vencimento';
        
        let badgeHtml = '';
        if (tenant?.subscription_status === 'active') {
            badgeHtml = `<span class="status-badge bg-success-light text-success border-none shadow-sm ml-2">Ativo</span>`;
        } else {
            badgeHtml = `<span class="status-badge bg-danger-light text-danger border-none shadow-sm ml-2">Inativo / Vencido</span>`;
        }

        container.innerHTML = `
            <div class="text-left w-100">
                <div class="flex justify-between align-start mb-3">
                    <div>
                        <h4 class="text-primary font-bold text-lg m-0">${escapeHTML(planoNome)}</h4>
                        <p class="text-secondary text-sm m-0 mt-1">${planoPreco}</p>
                    </div>
                    ${badgeHtml}
                </div>
                
                <div class="p-3 bg-white rounded-md border-dashed mt-4 flex flex-column gap-2">
                    <div class="flex justify-between align-center">
                        <span class="text-sm text-secondary">Status:</span>
                        <span class="text-sm font-bold text-primary capitalize">${escapeHTML(tenant?.subscription_status || 'Free')}</span>
                    </div>
                    <div class="flex justify-between align-center">
                        <span class="text-sm text-secondary">Vencimento:</span>
                        <span class="text-sm font-bold text-primary">${vencimento}</span>
                    </div>
                </div>

                <div class="mt-4 pt-3 border-top-dashed text-center">
                    <a href="https://wa.me/${(window.globalMaintenanceData?.support_whatsapp || '5511999999999')}?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura!" target="_blank" class="btn btn-outline text-secondary text-sm py-2 px-4 rounded-md">
                        <i data-lucide="help-circle" class="mr-2 icon-sm"></i> Suporte Financeiro
                    </a>
                </div>
            </div>
        `;
        
        if (window.lucide) window.lucide.createIcons({ root: container });
    }

    renderPlanosDisponiveis() {
        const list = document.getElementById('planos-disponiveis-list');
        if (!list) return;

        if (this.planos.length === 0) {
            list.innerHTML = `<div class="text-center p-3 text-secondary text-sm">Nenhum plano disponível na plataforma no momento.</div>`;
            return;
        }

        const tenant = window.globalTenant;
        const planoAtualId = tenant?.settings?.plano_id;
        
        let html = '';
        this.planos.forEach(p => {
            const isAtual = p.id === planoAtualId;
            const actionBtn = isAtual 
                ? `<button class="btn btn-outline w-100 rounded-md py-2 font-medium" disabled>Plano Atual</button>`
                : `<button class="btn btn-primary w-100 rounded-md py-2 font-medium btn-assinar" data-id="${p.id}" data-name="${escapeHTML(p.name)}" data-price-id="${p.stripe_price_id || ''}">Mudar para este plano</button>`;

            html += `
                <div class="p-4 bg-white rounded-md border-dashed ${isAtual ? 'border-primary' : 'border-placeholder'} relative">
                    ${isAtual ? '<div class="absolute top-0 right-0 bg-primary text-white text-xs px-2 py-1" style="border-bottom-left-radius: 8px;">Atual</div>' : ''}
                    <div class="flex justify-between align-start mb-3">
                        <h4 class="text-primary font-bold m-0">${escapeHTML(p.name)}</h4>
                        <span class="text-primary font-bold">R$ ${Number(p.price).toFixed(2)}/mês</span>
                    </div>
                    <p class="text-sm text-secondary mb-4">${p.description ? escapeHTML(p.description) : 'Acesso aos módulos da plataforma'}</p>
                    
                    ${actionBtn}
                </div>
            `;
        });

        list.innerHTML = html;

        // Binds de assinar
        list.querySelectorAll('.btn-assinar').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const planId = e.target.getAttribute('data-id');
                const planName = e.target.getAttribute('data-name');
                const priceId = e.target.getAttribute('data-price-id');
                this.assinarPlano(planId, planName, priceId);
            });
        });
    }

    async assinarPlano(planId, planName, priceId) {
        if (!priceId) {
            window.showToast('Este plano não possui integração de pagamento ativa. Contate o suporte.', 'error');
            return;
        }

        const btn = document.querySelector(`.btn-assinar[data-id="${planId}"]`);
        if (btn) btn.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Gerando link...';

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error("Tenant não identificado");
            
            const baseUrl = window.location.origin;

            const response = await fetch('/api/stripe/platform/create-checkout', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    priceId: priceId,
                    planId: planId,
                    tenantId: tenantId,
                    successUrl: `${baseUrl}/admin/index.html?module=sistema/assinatura&success=true`,
                    cancelUrl: `${baseUrl}/admin/index.html?module=sistema/assinatura&canceled=true`
                })
            });

            const data = await response.json();
            if (!response.ok) throw new Error(data.error || 'Falha ao criar sessão');

            window.location.href = data.url;
        } catch (error) {
            console.error('Erro no checkout:', error);
            window.showToast(error.message, 'error');
            if (btn) btn.innerHTML = `Mudar para este plano`;
        }
    }

    bindEvents() {
        // Adicione outros eventos se necessário
    }
}
