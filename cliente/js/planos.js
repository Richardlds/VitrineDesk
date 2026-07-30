import { supaFetch, showToast } from './utils.js';
import { getTenantId } from './app.js';
import { getLoggedClient } from './auth.js';

let tenantPlans = [];
let activeSubscription = null;

export async function initPlanos() {
    const tenantId = getTenantId();
    if (!tenantId) return;

    try {
        // Load available plans
        const plans = await supaFetch(`/rest/v1/tenant_client_plans?tenant_id=eq.${tenantId}&active=eq.true&order=price.asc&select=*`);
        if (plans && Array.isArray(plans)) {
            tenantPlans = plans;
        }
    } catch(err) {
        console.error('Erro ao buscar planos:', err);
    }

    // Load user active subscription if logged in
    await loadActiveSubscription();

    renderPlanos();
}

export async function loadActiveSubscription() {
    if (!getLoggedClient()) return;
    
    try {
        const tenantId = getTenantId();
        const clientId = getLoggedClient().id;
        
        // Em vez de bater direto no Supabase (que sofre RLS para cliente anônimo), usamos a API
        const response = await fetch(`/api/client/get-subscription?tenantId=${tenantId}&clientId=${clientId}`);
        if (!response.ok) throw new Error('Falha ao buscar assinatura na API');
        
        const data = await response.json();
        
        if (data && data.length > 0) {
            activeSubscription = data[0];
            window.activeClientSubscription = data[0]; // Export global for booking logic
        } else {
            activeSubscription = null;
            window.activeClientSubscription = null;
        }
    } catch(err) {
        console.error('Erro ao carregar assinatura:', err);
        activeSubscription = null;
        window.activeClientSubscription = null;
    }
}

function renderPlanos() {
    const listContainer = document.getElementById('available-plans-list');
    const activeContainer = document.getElementById('active-subscription-card');
    
    // Novas UI do plano
    const homeSection = document.getElementById('section-planos');
    const homeGrid = document.getElementById('home-plans-grid');
    const profileBadge = document.getElementById('profile-active-plan-badge');
    const profilePlanName = document.getElementById('profile-active-plan-name');
    
    // Verificando visibilidade configurada pelo Lojista
    const tenantStr = sessionStorage.getItem('vp_tenant');
    let hidePlanos = false;
    if (tenantStr) {
        try {
            const tenantObj = JSON.parse(tenantStr);
            hidePlanos = tenantObj.settings?.visibilidade?.hide_planos === true;
        } catch (e) {}
    }

    // Render Active Subscription no Modal e Perfil
    if (!getLoggedClient()) {
        if (activeContainer) activeContainer.innerHTML = 'Faça login para ver sua assinatura.';
        if (profileBadge) profileBadge.classList.add('hidden');
    } else if (activeSubscription) {
        const plan = activeSubscription.tenant_client_plans;
        if (!plan) {
            if (activeContainer) activeContainer.innerHTML = 'Plano indisponível (pode ter sido excluído).';
        } else {
            const periodEnd = new Date(activeSubscription.current_period_end).toLocaleDateString('pt-BR');
            
            let benefitsText = [];
            if (plan.discount_percentage > 0) benefitsText.push(`${plan.discount_percentage}% de desconto`);
            if (plan.free_appointments_per_month > 0) {
                const restantes = plan.free_appointments_per_month - (activeSubscription.used_free_appointments_this_cycle || 0);
                benefitsText.push(`${restantes} agendamento(s) grátis restante(s) neste ciclo`);
            }

            if (activeContainer) {
                activeContainer.innerHTML = `
                    <h5 class="text-primary font-bold text-lg mb-1">${plan.name}</h5>
                    <p class="text-secondary text-sm mb-2">${benefitsText.join(' ? ')}</p>
                    <div class="flex justify-between align-center mt-3 pt-3 border-top-dashed">
                        <span class="text-xs text-muted">Válido até: ${periodEnd}</span>
                        <span class="status-badge bg-success-light text-success border-none shadow-sm">Ativo</span>
                    </div>
                `;
            }
            
            // Exibi??o visual estrita no perfil
            if (profileBadge && profilePlanName) {
                profilePlanName.textContent = plan.name;
                profileBadge.classList.remove('hidden');
            }
        }
    } else {
        if (activeContainer) activeContainer.innerHTML = 'Voc? ainda n?o possui nenhum plano ativo.';
        if (profileBadge) profileBadge.classList.add('hidden');
    }

    // L?gica para esconder a Se??o da Home
    if (tenantPlans.length === 0 || hidePlanos) {
        if (homeSection) homeSection.classList.add('hidden');
        if (listContainer) listContainer.innerHTML = '<div class="text-center text-secondary p-3">Nenhum plano disponível no momento.</div>';
        return;
    } else {
        if (homeSection) homeSection.classList.remove('hidden');
        
        // Adiciona link no menu superior se n?o existir
        const navLinks = document.querySelector('.nav-links');
        if (navLinks && !document.getElementById('nav-link-planos')) {
            const planosLink = document.createElement('a');
            planosLink.href = '#section-planos';
            planosLink.className = 'nav-link';
            planosLink.id = 'nav-link-planos';
            planosLink.textContent = 'Planos';
            navLinks.insertBefore(planosLink, navLinks.lastElementChild);
        }
    }

    // Render Available Plans
    let html = '';
    let hasAvailablePlans = tenantPlans.length > 0;
    
    tenantPlans.forEach(plan => {
        const isCurrentPlan = activeSubscription && activeSubscription.plan_id === plan.id;

        let benefits = [];
        if (plan.discount_percentage > 0) benefits.push(`Desconto de ${plan.discount_percentage}% em outros serviços`);
        if (plan.free_appointments_per_month > 0) {
            let srvText = (plan.included_services && plan.included_services.length > 0) ? ' nos serviços selecionados' : '';
            benefits.push(`${plan.free_appointments_per_month} Agendamentos grátis/mês${srvText}`);
        }
        
        if (plan.features && Array.isArray(plan.features)) {
            plan.features.forEach(feat => {
                if (feat.trim()) benefits.push(feat.trim());
            });
        }
        
        let cardStyle = isCurrentPlan ? 'border: 2px solid var(--primary); box-shadow: 0 0 15px rgba(var(--primary-rgb), 0.3);' : '';
        let badgeHtml = isCurrentPlan ? `<div style="position: absolute; top: -14px; right: 20px; background: linear-gradient(135deg, var(--primary), var(--primary-dark, #0056b3)); color: white; padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; box-shadow: 0 4px 10px rgba(0,0,0,0.2); z-index: 10;">Plano Atual</div>` : '';
        
        let buttonHtml = isCurrentPlan 
            ? `<button class="btn btn-secondary btn-block btn-assinar" disabled>Plano Ativo</button>`
            : `<button class="btn btn-primary btn-block btn-assinar btn-assinar-plano" data-plan-id="${plan.id}" data-price-id="${plan.stripe_price_id}">Assinar Agora</button>`;
        
        let imageHtml = plan.image_url ? `<div class="plan-image-wrapper"><img src="${plan.image_url}" alt="${plan.name}"></div>` : '';

        // Lucide check icon string
        const checkIcon = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>`;

        html += `
            <div class="plan-card" style="${cardStyle}">
                ${badgeHtml}
                ${imageHtml}
                <div class="plan-content">
                    <div class="plan-header">
                        <h5 class="plan-title">${plan.name}</h5>
                        <div class="plan-price">R$ ${Number(plan.price).toFixed(2)}<span>/mês</span></div>
                        ${plan.description ? `<p class="plan-desc">${plan.description}</p>` : ''}
                    </div>
                    
                    <ul class="plan-benefits">
                        ${benefits.map(b => `<li>${checkIcon}<span>${b}</span></li>`).join('')}
                    </ul>
                    
                    ${buttonHtml}
                </div>
            </div>
        `;
    });

    const fallbackHtml = '<div class="text-center text-secondary p-3 w-100">Nenhum plano disponível.</div>';
    
    if (listContainer) listContainer.innerHTML = html || fallbackHtml;
    if (homeGrid) homeGrid.innerHTML = html || fallbackHtml;
    
    // Bind click events (Home e Drawer)
    const btns = document.querySelectorAll('.btn-assinar-plano');
    btns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!getLoggedClient()) {
                showToast('Faça login primeiro para assinar um plano!', 'warning');
                
                const drawer = document.getElementById('client-area-drawer');
                if (drawer) drawer.classList.remove('active');
                
                const loginModal = document.getElementById('login-modal');
                if (loginModal) loginModal.classList.add('active');
                return;
            }
            
            const planId = btn.dataset.planId;
            const priceId = btn.dataset.priceId;
            
            if (!priceId || priceId === 'null' || priceId === 'undefined') {
                showToast('Erro: Este plano não possui integração de pagamento (Stripe) configurada no painel do lojista.', 'error');
                return;
            }

            showToast('Redirecionando para o pagamento...', 'info');
            
            try {
                const originalText = btn.innerHTML;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" style="width: 20px; height: 20px; margin: 0 auto;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
                btn.disabled = true;

                const response = await fetch('/api/stripe/create-subscription-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        priceId: priceId,
                        planId: planId,
                        tenantId: getTenantId(),
                        clientId: getLoggedClient().id,
                        successUrl: window.location.origin + window.location.pathname + '?checkout=success',
                        cancelUrl: window.location.origin + window.location.pathname + '?checkout=cancel'
                    })
                });
                
                if (!response.ok) {
                    const err = await response.json();
                    throw new Error(err.error || 'Erro ao criar checkout');
                }
                
                const data = await response.json();
                window.location.href = data.url;
            } catch (err) {
                console.error(err);
                btn.innerHTML = 'Assinar Agora';
                btn.disabled = false;
                showToast(err.message, 'error');
            }
        });
    });
}

// Escutar evento de login para recarregar
document.addEventListener('userStateChanged', () => {
    initPlanos();
});
