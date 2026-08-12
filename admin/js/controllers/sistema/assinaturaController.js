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
                <div class="config-card flex flex-column align-center justify-center p-5 text-center">
                    <div class="bg-warning-light p-3 rounded-full mb-3 flex align-center justify-center">
                        <i data-lucide="alert-triangle" class="text-warning icon-md"></i>
                    </div>
                    <h3 class="m-0 text-primary mb-2">Sem Assinatura</h3>
                    <p class="text-secondary text-sm m-0" style="max-width: 400px;">Você ainda não assinou nenhum plano. Escolha um plano abaixo para liberar recursos.</p>
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
        
        const badgeClass = isActive ? 'bg-success-light text-success border border-success' : 'bg-warning-light text-warning border border-warning';
        const tagText = isActive ? 'Plano Ativo' : 'Inativo / Vencido';

        container.innerHTML = `
            <div class="flex justify-between align-center mb-3 mt-2">
                <h3 class="m-0 text-primary" style="font-size: 1.1rem;">Resumo da Assinatura</h3>
                <a href="https://wa.me/${(window.globalMaintenanceData?.support_whatsapp || '5511999999999')}?text=Ol%C3%A1%2C%20preciso%20de%20ajuda%20com%20minha%20assinatura!" target="_blank" class="btn btn-outline text-primary border-primary flex align-center gap-2 py-2 px-3 rounded-md font-medium text-sm transition-colors hover:bg-placeholder" style="text-decoration:none;">
                    <i data-lucide="headset" class="icon-sm"></i> Suporte
                </a>
            </div>
            
            <div class="grid grid-md-3 gap-4 mb-4">
                <div class="config-card p-4 flex flex-column justify-center align-center text-center transition-all hover:border-primary" style="border-top: 4px solid ${isActive ? 'var(--color-success)' : 'var(--color-warning)'}; box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                    <div class="kpi-icon-wrapper ${isActive ? 'bg-success-light' : 'bg-warning-light'} mx-auto mb-3">
                        <i data-lucide="${isActive ? 'shield-check' : 'alert-triangle'}" class="icon-sm ${isActive ? 'text-success' : 'text-warning'}"></i>
                    </div>
                    <h4 class="text-secondary text-xs uppercase m-0" style="letter-spacing: 0.5px;">Plano Atual</h4>
                    <div class="text-primary font-bold text-2xl mt-1">${escapeHTML(planoNome)}</div>
                    <span class="${badgeClass} text-xs px-2 py-1 mt-3 rounded-md font-bold uppercase" style="letter-spacing: 0.5px;">${tagText}</span>
                </div>
                
                <div class="config-card p-4 flex flex-column justify-center align-center text-center transition-all hover:border-primary" style="border-top: 4px solid var(--color-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                    <div class="kpi-icon-wrapper bg-primary-light mx-auto mb-3">
                        <i data-lucide="credit-card" class="icon-sm text-primary"></i>
                    </div>
                    <h4 class="text-secondary text-xs uppercase m-0" style="letter-spacing: 0.5px;">Mensalidade</h4>
                    <div class="text-primary font-bold text-2xl mt-1">${planoPreco.replace('/mês', '')}</div>
                    <span class="text-secondary text-xs mt-3 uppercase font-bold opacity-70">Por mês</span>
                </div>
                
                <div class="config-card p-4 flex flex-column justify-center align-center text-center transition-all hover:border-primary" style="border-top: 4px solid var(--color-primary); box-shadow: 0 4px 15px rgba(0,0,0,0.03);">
                    <div class="kpi-icon-wrapper bg-primary-light mx-auto mb-3">
                        <i data-lucide="calendar" class="icon-sm text-primary"></i>
                    </div>
                    <h4 class="text-secondary text-xs uppercase m-0" style="letter-spacing: 0.5px;">Vencimento</h4>
                    <div class="text-primary font-bold text-2xl mt-1">${vencimento}</div>
                    <span class="text-secondary text-xs mt-3 uppercase font-bold opacity-70">Próxima renovação</span>
                </div>
            </div>
        `;
        
        if (window.lucide) window.lucide.createIcons({ root: container });
    }

    renderPlanosDisponiveis() {
        const list = document.getElementById('planos-disponiveis-list');
        if (!list) return;

        if (this.planos.length === 0) {
            list.innerHTML = `<div class="text-center p-4 bg-placeholder border-dashed rounded-md text-secondary text-sm" style="grid-column: 1 / -1;">Nenhum plano disponível na plataforma no momento.</div>`;
            return;
        }

        const tenant = window.globalTenant;
        const planoAtualId = tenant?.settings?.plano_id;
        
        let html = '';
        this.planos.forEach(p => {
            const isAtual = p.id === planoAtualId;
            const actionBtn = isAtual 
                ? `<button class="btn btn-outline w-100 py-2 rounded-md font-bold text-primary border-primary flex align-center justify-center bg-primary-light" disabled>Plano Atual</button>`
                : `<button class="btn btn-primary w-100 py-2 rounded-md font-bold flex align-center justify-center btn-assinar transition-all hover:bg-primary-dark cursor-pointer shadow-sm" data-id="${p.id}" data-name="${escapeHTML(p.name)}" data-price-id="${p.stripe_price_id || ''}">Mudar para este plano</button>`;

            let benefitsList = ['Acesso aos recursos da plataforma', 'Suporte técnico especializado', 'Atualizações automáticas do sistema'];
            if (p.benefits && p.benefits.trim()) {
                benefitsList = p.benefits.split('\n').map(b => b.trim()).filter(b => b);
            }
            
            let featuresHtml = '';
            benefitsList.forEach(b => {
                featuresHtml += `
                    <li class="flex align-start gap-2 text-sm text-secondary">
                        <i data-lucide="check-circle-2" class="text-success icon-sm flex-shrink-0" style="margin-top: 2px;"></i> 
                        <span>${escapeHTML(b)}</span>
                    </li>
                `;
            });

            const shadowAtual = isAtual ? 'box-shadow: 0 8px 30px rgba(0,0,0,0.06); transform: translateY(-4px);' : 'box-shadow: 0 4px 15px rgba(0,0,0,0.03); transform: translateY(0);';
            const badgeAtual = isAtual ? '<span class="text-white text-xs px-3 py-1 rounded-sm font-bold absolute" style="background-color: var(--color-primary); top: -12px; left: 50%; transform: translateX(-50%); letter-spacing: 1px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">PLANO ATUAL</span>' : '';
            const topBorderColor = isAtual ? 'var(--color-primary)' : 'var(--color-border)';

            html += `
                <div class="config-card flex flex-column p-3 h-100 relative transition-all" style="border: none; border-top: 4px solid ${topBorderColor}; ${shadowAtual}">
                    ${badgeAtual}
                    
                    <div class="text-center mb-3 pb-3 border-bottom-dashed border-placeholder">
                        <div class="kpi-icon-wrapper bg-primary-light mx-auto mb-2" style="width: 28px; height: 28px;">
                            <i data-lucide="boxes" class="text-primary" style="width: 16px; height: 16px;"></i>
                        </div>
                        <h4 class="text-primary font-bold m-0 mb-1" style="font-size: 1.15rem;">${escapeHTML(p.name)}</h4>
                        <p class="text-secondary text-sm m-0" style="line-height: 1.3; min-height: 36px;">${p.description ? escapeHTML(p.description) : 'Expanda os recursos do seu negócio.'}</p>
                    </div>
                    
                    <div class="flex justify-center align-end gap-1 mb-3">
                        <span class="text-primary font-bold text-xs mb-1 opacity-80">R$</span>
                        <span class="text-primary font-bold" style="font-size: 1.6rem; line-height: 1; letter-spacing: -0.5px;">${Number(p.price).toLocaleString('pt-BR', {minimumFractionDigits: 2})}</span>
                        <span class="text-secondary text-xs mb-1 opacity-80">/mês</span>
                    </div>
                    
                    <ul class="flex-1 m-0 p-0 mb-5 flex flex-column gap-3" style="list-style: none;">
                        ${featuresHtml}
                    </ul>

                    <div class="mt-auto">
                        ${actionBtn}
                    </div>
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
