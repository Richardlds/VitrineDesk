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

            // Re-render quando o SWR atualizar o tenant em background
            window.addEventListener('tenantUpdated', () => {
                this.renderAssinaturaAtual();
                this.renderPlanosDisponiveis();
            });
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
        // Filtra os planos inativos. Se `active` não existir no DB (undefined/null), assumimos que é ativo para não quebrar.
        this.planos = (data || []).filter(p => p.active !== false);
    }

    renderAssinaturaAtual() {
        const container = document.getElementById('assinatura-atual-container');
        if (!container) return;

        const tenant = window.globalTenant;
        const planoId = tenant?.settings?.plano_id;
        
        if (!planoId) {
            container.innerHTML = `
                <div class="assinatura-hero" style="background: var(--color-bg-surface, #121212); border: 1px solid var(--color-border, #222222); color: inherit; box-shadow: 0 4px 15px rgba(0,0,0,0.05); text-align: center;">
                    <div style="background: var(--color-danger-light, #fee2e2); padding: 1rem; border-radius: 50%; display: inline-block; margin-bottom: 1rem;">
                        <i data-lucide="alert-triangle" style="color: var(--color-danger, #ef4444); width: 32px; height: 32px;"></i>
                    </div>
                    <h3 class="assinatura-hero-title" style="justify-content: center; color: var(--color-primary, #6366f1); margin-bottom: 0.5rem;">Sem Assinatura</h3>
                    <p class="text-secondary" style="margin: 0 auto; max-width: 400px; font-size: 0.95rem;">Você ainda não assinou nenhum plano. Escolha um plano abaixo para liberar recursos.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons({ root: container });
            return;
        }

        const meuPlano = this.planos.find(p => p.id === planoId);
        const planoNome = meuPlano ? meuPlano.name : 'Desconhecido';
        const planoPreco = meuPlano ? `R$ ${Number(meuPlano.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}/mês` : '';
        const vencimento = tenant?.settings?.vencimento ? new Date(tenant.settings.vencimento).toLocaleDateString('pt-BR') : 'Sem Vencimento';
        // Considera ativo se for 'active', 'trial' ou se não houver status definido mas a loja está ativa
        const isActive = tenant?.subscription_status === 'active' || tenant?.subscription_status === 'trial' || (!tenant?.subscription_status && tenant?.is_active);
        
        const tagClass = isActive ? 'tag-active' : 'tag-inactive';
        const tagText = isActive ? 'Plano Ativo' : 'Inativo / Vencido';

        container.innerHTML = `
            <div class="assinatura-hero">
                <div class="assinatura-hero-content">
                    <div>
                        <h3 class="assinatura-hero-title">
                            ${escapeHTML(planoNome)}
                            <span class="assinatura-tag ${tagClass}">${tagText}</span>
                        </h3>
                        <p class="assinatura-hero-subtitle">Seu plano atual lhe dá acesso aos recursos essenciais para gerenciar e alavancar seu negócio na VitrineDesk.</p>
                        
                        <div class="assinatura-metric-container">
                            <div class="assinatura-metric">
                                <span class="assinatura-metric-label">Valor Atual</span>
                                <span class="assinatura-metric-value">${planoPreco}</span>
                            </div>
                            <div class="assinatura-metric">
                                <span class="assinatura-metric-label">Próximo Vencimento</span>
                                <span class="assinatura-metric-value">${vencimento}</span>
                            </div>
                        </div>
                    </div>
                    
                    <div>
                        <a href="https://wa.me/${(window.globalMaintenanceData?.support_whatsapp || '5511999999999')}?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura!" target="_blank" class="assinatura-btn-support">
                            <i data-lucide="headset"></i> Suporte Financeiro
                        </a>
                    </div>
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

            let benefitsList = ['Acesso aos recursos da plataforma', 'Suporte técnico especializado', 'Atualizações automáticas do sistema'];
            if (p.benefits && p.benefits.trim()) {
                benefitsList = p.benefits.split('\n').map(b => b.trim()).filter(b => b);
            }
            
            let featuresHtml = '';
            benefitsList.forEach(b => {
                featuresHtml += `
                    <li>
                        <i data-lucide="check-circle-2"></i> ${escapeHTML(b)}
                    </li>
                `;
            });

            html += `
                <div class="plan-card ${isAtual ? 'plan-active' : ''}">
                    ${isAtual ? '<div class="plan-badge">Plano Atual</div>' : ''}
                    
                    <h4 class="text-primary font-bold" style="font-size: 1.25rem; margin: 0 0 0.25rem 0;">${escapeHTML(p.name)}</h4>
                    <p class="text-secondary" style="font-size: 0.85rem; margin: 0;">${p.description ? escapeHTML(p.description) : 'Expanda os recursos do seu negócio.'}</p>
                    
                    <div class="plan-price">
                        <span class="plan-price-currency">R$</span>
                        <span>${Number(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span class="plan-price-month">/mês</span>
                    </div>
                    
                    <ul class="plan-features">
                        ${featuresHtml}
                    </ul>

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
