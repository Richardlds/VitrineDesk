import { supaFetch } from './utils.js';

let tenantPlans = [];
let activeSubscription = null;

export async function initPlanos() {
    const tenantId = window.globalTenantId;
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
    if (!window.globalUser) return;
    
    try {
        const data = await supaFetch(`/rest/v1/client_subscriptions?tenant_id=eq.${window.globalTenantId}&client_id=eq.${window.globalUser.id}&status=eq.active&select=*,tenant_client_plans(*)`);
        
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
    
    if (!listContainer || !activeContainer) return;

    // Render Active Subscription
    if (!window.globalUser) {
        activeContainer.innerHTML = 'Faça login para ver sua assinatura.';
    } else if (activeSubscription) {
        const plan = activeSubscription.tenant_client_plans;
        const periodEnd = new Date(activeSubscription.current_period_end).toLocaleDateString('pt-BR');
        
        let benefitsText = [];
        if (plan.discount_percentage > 0) benefitsText.push(`${plan.discount_percentage}% de desconto`);
        if (plan.free_appointments_per_month > 0) {
            const restantes = plan.free_appointments_per_month - (activeSubscription.used_free_appointments_this_cycle || 0);
            benefitsText.push(`${restantes} agendamento(s) grátis restante(s) neste ciclo`);
        }

        activeContainer.innerHTML = `
            <h5 class="text-primary font-bold text-lg mb-1">${plan.name}</h5>
            <p class="text-secondary text-sm mb-2">${benefitsText.join(' • ')}</p>
            <div class="flex justify-between align-center mt-3 pt-3 border-top-dashed">
                <span class="text-xs text-muted">Válido até: ${periodEnd}</span>
                <span class="status-badge bg-success-light text-success border-none shadow-sm">Ativo</span>
            </div>
        `;
    } else {
        activeContainer.innerHTML = 'Você ainda não possui nenhum plano ativo.';
    }

    // Render Available Plans
    if (tenantPlans.length === 0) {
        listContainer.innerHTML = '<div class="text-center text-secondary p-3">Nenhum plano disponível no momento.</div>';
        return;
    }

    let html = '';
    tenantPlans.forEach(plan => {
        // If user already has this active plan, skip or show as current
        if (activeSubscription && activeSubscription.plan_id === plan.id) {
            return; // Already showing above
        }

        let benefits = [];
        if (plan.discount_percentage > 0) benefits.push(`Desconto de ${plan.discount_percentage}% nos serviços`);
        if (plan.free_appointments_per_month > 0) benefits.push(`${plan.free_appointments_per_month} Agendamentos Grátis/mês`);
        
        html += `
            <div class="glass-card p-3 border border-dashed border-primary-light transition-all hover-float">
                <div class="flex justify-between align-start mb-2">
                    <h5 class="font-bold text-md text-primary m-0">${plan.name}</h5>
                    <span class="font-bold text-primary">R$ ${Number(plan.price).toFixed(2)}/mês</span>
                </div>
                ${plan.description ? `<p class="text-sm text-secondary mb-2">${plan.description}</p>` : ''}
                <ul class="text-sm text-secondary mb-3 pl-3">
                    ${benefits.map(b => `<li style="list-style-type: disc; margin-bottom: 4px;">${b}</li>`).join('')}
                </ul>
                <button class="btn btn-primary w-100 py-2 rounded-md font-medium text-sm btn-assinar-plano" data-plan-id="${plan.id}" data-price-id="${plan.stripe_price_id}">
                    Assinar Agora
                </button>
            </div>
        `;
    });

    listContainer.innerHTML = html || '<div class="text-center text-secondary p-3">Você já assinou o plano disponível.</div>';
    
    // Bind click events
    const btns = listContainer.querySelectorAll('.btn-assinar-plano');
    btns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!window.globalUser) {
                if (window.showToast) window.showToast('Faça login primeiro!', 'warning');
                document.getElementById('client-area-drawer').classList.remove('open');
                document.getElementById('auth-modal').classList.add('open');
                return;
            }

            const planId = e.currentTarget.getAttribute('data-plan-id');
            const priceId = e.currentTarget.getAttribute('data-price-id');
            
            const originalText = e.currentTarget.innerHTML;
            e.currentTarget.innerHTML = '<i data-lucide="loader" class="animate-spin icon-sm"></i> Aguarde...';
            if (window.lucide) window.lucide.createIcons();

            try {
                const response = await fetch('/api/stripe/create-subscription-checkout', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        priceId: priceId,
                        clientId: window.globalUser.id,
                        tenantId: window.globalTenantId,
                        planId: planId,
                        successUrl: window.location.href,
                        cancelUrl: window.location.href
                    })
                });

                const data = await response.json();
                if (data.url) {
                    window.location.href = data.url;
                } else {
                    throw new Error('URL de checkout não retornada');
                }
            } catch (err) {
                console.error(err);
                if (window.showToast) window.showToast('Erro ao iniciar assinatura', 'error');
                e.currentTarget.innerHTML = originalText;
            }
        });
    });

    if (window.lucide) window.lucide.createIcons();
}

// Escutar evento de login para recarregar
document.addEventListener('userStateChanged', () => {
    initPlanos();
});
