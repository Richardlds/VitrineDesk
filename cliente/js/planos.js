import { supaFetch } from './utils.js';
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
        const data = await supaFetch(`/rest/v1/client_subscriptions?tenant_id=eq.${getTenantId()}&client_id=eq.${getLoggedClient().id}&status=eq.active&select=*,tenant_client_plans(*)`);
        
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
    tenantPlans.forEach(plan => {
        // If user already has this active plan, skip or show as current
        if (activeSubscription && activeSubscription.plan_id === plan.id) {
            return; // Already showing above
        }

        let benefits = [];
        if (plan.discount_percentage > 0) benefits.push(`Desconto de ${plan.discount_percentage}% nos serviços`);
        if (plan.free_appointments_per_month > 0) benefits.push(`${plan.free_appointments_per_month} Agendamentos grátis/mês`);
        
        html += `
            <div class="service-card glass-card">
                <div class="service-info" style="padding: 16px;">
                    <div class="flex-between-start mb-2">
                        <h5 class="font-bold text-md text-primary m-0">${plan.name}</h5>
                        <span class="font-bold text-primary">R$ ${Number(plan.price).toFixed(2)}/mês</span>
                    </div>
                    ${plan.description ? `<p class="text-sm text-secondary mb-2">${plan.description}</p>` : ''}
                    <ul class="text-sm text-secondary mb-3 pl-3" style="list-style-position: inside;">
                        ${benefits.map(b => `<li style="list-style-type: disc; margin-bottom: 4px;">${b}</li>`).join('')}
                    </ul>
                    <button class="btn btn-primary btn-block py-2 rounded-md font-medium text-sm btn-assinar-plano" data-plan-id="${plan.id}" data-price-id="${plan.stripe_price_id}">
                        Assinar Agora
                    </button>
                </div>
            </div>
        `;
    });

    const fallbackHtml = '<div class="text-center text-secondary p-3 w-100">Você já assinou o plano disponível.</div>';
    
    if (listContainer) listContainer.innerHTML = html || fallbackHtml;
    if (homeGrid) homeGrid.innerHTML = html || fallbackHtml;
    
    // Bind click events (Home e Drawer)
    const btns = document.querySelectorAll('.btn-assinar-plano');
    btns.forEach(btn => {
        btn.addEventListener('click', async (e) => {
            if (!getLoggedClient()) {
                if (window.showToast) window.showToast('Faça login primeiro!', 'warning');
                const drawer = document.getElementById('client-area-drawer');
                if (drawer) drawer.classList.remove('active');
                
                const loginModal = document.getElementById('login-modal');
                if (loginModal) loginModal.classList.add('active');
                return;
            }
            
            const planId = e.target.dataset.planId;
            if (window.showToast) window.showToast('Redirecionando para o pagamento...', 'info');
            // ... integra??o stripe (pendente)
        });
    });
}

// Escutar evento de login para recarregar
document.addEventListener('userStateChanged', () => {
    initPlanos();
});
