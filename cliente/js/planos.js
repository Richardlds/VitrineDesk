import { supaFetch, showToast, showConfirm, escapeHtml, getSupabaseAuthClient } from './utils.js';
import { getTenantId } from './app.js';
import { getLoggedClient } from './auth.js';

let tenantPlans = [];
let activeSubscription = null;
let realtimeChannel = null;

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

    // Check for checkout success and poll if necessary
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('checkout') === 'success') {
        window.history.replaceState({}, document.title, window.location.pathname);
        
        if (!activeSubscription) {
            showToast('Processando sua assinatura, aguarde...', 'info');
            let attempts = 0;
            const maxAttempts = 5;
            
            while (attempts < maxAttempts && !activeSubscription) {
                attempts++;
                await new Promise(r => setTimeout(r, 2000));
                await loadActiveSubscription();
            }
            
            if (activeSubscription) {
                showToast('Assinatura ativada com sucesso!', 'success');
            } else {
                showToast('Ainda processando... Por favor, recarregue a página em alguns instantes.', 'warning');
            }
        } else {
            showToast('Assinatura ativada com sucesso!', 'success');
        }
    }
    renderPlanos();
    
    // Configurar atualização em tempo real (Supabase Realtime)
    if (getLoggedClient() && !realtimeChannel) {
        try {
            const supabase = getSupabaseAuthClient();
            realtimeChannel = supabase.channel('custom-client-subscription-channel')
                .on(
                    'postgres_changes',
                    { 
                        event: '*', 
                        schema: 'public', 
                        table: 'client_subscriptions',
                        filter: `client_id=eq.${getLoggedClient().id}` 
                    },
                    async (payload) => {
                        console.log('Realtime update recebido para assinatura:', payload);
                        await loadActiveSubscription();
                        renderPlanos();
                    }
                )
                .subscribe();
        } catch (err) {
            console.error('Erro ao configurar realtime:', err);
        }
    }
}

export async function loadActiveSubscription() {
    if (!getLoggedClient()) return;
    
    try {
        const tenantId = getTenantId();
        const clientId = getLoggedClient().id;
        
        // Em vez de bater direto na API (que não existe no frontend estático), usamos supaFetch para a tabela client_subscriptions.
        // O banco (Supabase) tem RLS, então, se a política permitir que o usuário leia sua própria assinatura, isso funcionará perfeitamente.
        const data = await supaFetch(`/rest/v1/client_subscriptions?tenant_id=eq.${tenantId}&client_id=eq.${clientId}&status=eq.active&select=*,plan:tenant_client_plans(*)`);
        
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
    const homeSection = document.getElementById('section-planos');
    const homeGrid = document.getElementById('home-plans-grid');
    
    // Novas UI do plano
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
        const plan = activeSubscription.plan;
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
                    <h5 class="text-primary font-bold text-lg mb-1">${escapeHtml(plan.name)}</h5>
                    <p class="text-secondary text-sm mb-2">${benefitsText.join(' &bull; ')}</p>
                    <div class="flex justify-between align-center mt-3 pt-3 border-top-dashed">
                        <span class="text-xs text-muted">Válido até: ${periodEnd}</span>
                        <span class="status-badge bg-success-light text-success border-none shadow-sm">Ativo</span>
                    </div>
                `;
            }
            
            // Exibição visual estrita no perfil
            if (profileBadge && profilePlanName) {
                profilePlanName.textContent = plan.name;
                profileBadge.classList.remove('hidden');
            }
        }
    } else {
        if (activeContainer) activeContainer.innerHTML = 'Você ainda não possui nenhum plano ativo.';
        if (profileBadge) profileBadge.classList.add('hidden');
    }

    // Lógica para esconder a Seção da Home
    if (tenantPlans.length === 0 || hidePlanos) {
        if (homeSection) homeSection.classList.add('hidden');
        if (listContainer) listContainer.innerHTML = '<div class="text-center text-secondary p-3">Nenhum plano disponível no momento.</div>';
        return;
    } else {
        if (homeSection) homeSection.classList.remove('hidden');
        
        // Adiciona link no menu superior se não existir
        const navLinks = document.querySelector('.nav-links');
        if (navLinks && !document.getElementById('nav-link-planos')) {
            const planosLink = document.createElement('a');
            planosLink.href = '#section-planos';
            planosLink.className = 'nav-link';
            planosLink.id = 'nav-link-planos';
            planosLink.textContent = 'Planos';
            planosLink.setAttribute('data-action', 'scrollTo');
            planosLink.setAttribute('data-target', 'section-planos');
            navLinks.insertBefore(planosLink, navLinks.lastElementChild);
        }
    }

    // Render Available Plans
    let html = '';
    let hasAvailablePlans = tenantPlans.length > 0;
    
    tenantPlans.forEach((plan, index) => {
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
        
        let cardStyle = isCurrentPlan ? 'border: 2px solid var(--primary); box-shadow: var(--neon-glow-hover);' : 'border: 1px solid var(--border);';
        let badgeHtml = isCurrentPlan ? `<div style="position: absolute; top: -12px; left: 50%; transform: translateX(-50%); background: linear-gradient(135deg, var(--primary), var(--secondary)); color: white; padding: 6px 16px; border-radius: 20px; font-size: 0.75rem; font-weight: 800; text-transform: uppercase; letter-spacing: 1px; box-shadow: 0 4px 15px color-mix(in srgb, var(--primary) 40%, transparent); z-index: 10;">Meu Plano</div>` : '';
        
        let buttonHtml = isCurrentPlan 
            ? `<button class="btn btn-secondary w-100" style="margin-top: 20px; opacity: 0.7; cursor: default;" disabled><i data-lucide="check" class="icon-sm"></i> Plano Ativo</button>`
            : `<button class="btn btn-primary w-100 btn-assinar-plano" style="margin-top: 20px;" data-plan-id="${plan.id}" data-price-id="${plan.stripe_price_id}">Assinar Agora</button>`;
        
        let imageHtml = plan.image_url 
            ? `<img src="${escapeHtml(plan.image_url)}" alt="${escapeHtml(plan.name)}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; border: 3px solid var(--primary); margin: 0 auto; display: block; box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 30%, transparent);">` 
            : `<div style="width: 80px; height: 80px; border-radius: 50%; border: 3px solid var(--primary); display: flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--primary) 10%, transparent); color: var(--primary); margin: 0 auto; box-shadow: 0 4px 20px color-mix(in srgb, var(--primary) 30%, transparent);"><i data-lucide="star" style="width: 32px; height: 32px;"></i></div>`;

        const checkIcon = `<i data-lucide="check-circle-2" style="width: 18px; height: 18px; color: var(--primary); flex-shrink: 0; margin-top: 1px;"></i>`;
        
        // Premium animation
        const animDelay = index * 0.1;

        html += `
            <article class="glass-card" style="position: relative; padding: 32px 24px; height: 100%; display: flex; flex-direction: column; ${cardStyle} opacity: 0; animation: fadeIn 0.6s cubic-bezier(0.2, 0.8, 0.2, 1) forwards; animation-delay: ${animDelay}s; transform-origin: center; transition: transform 0.3s ease, border-color 0.3s ease, box-shadow 0.3s ease;" onmouseenter="this.style.transform='translateY(-5px)'" onmouseleave="this.style.transform='translateY(0)'">
                ${badgeHtml}
                
                <div style="text-align: center; margin-bottom: 24px;">
                    ${imageHtml}
                    <h3 style="margin: 16px 0 8px; font-size: 1.25rem; font-weight: 700; font-family: var(--font-title); letter-spacing: -0.02em;">${escapeHtml(plan.name)}</h3>
                    <div style="font-size: 2rem; font-weight: 800; color: var(--text-main); font-family: var(--font-title); line-height: 1;">
                        R$ ${Number(plan.price).toFixed(2)}<span style="font-size: 0.85rem; font-weight: 500; color: var(--text-muted); margin-left: 4px;">/mês</span>
                    </div>
                </div>
                
                <div style="flex-grow: 1; padding: 16px; background: color-mix(in srgb, var(--text-main) 2%, transparent); border-radius: 12px; margin-bottom: 8px;">
                    <ul style="list-style: none; padding: 0; margin: 0; display: flex; flex-direction: column; gap: 14px;">
                        ${benefits.map(b => `<li style="display: flex; gap: 10px; font-size: 0.9rem; color: var(--text-main); line-height: 1.4; text-align: left; align-items: flex-start;">${checkIcon}<span style="opacity: 0.9;">${escapeHtml(b)}</span></li>`).join('')}
                    </ul>
                </div>
                
                ${buttonHtml}
            </article>
        `;
    });

    const fallbackHtml = '<div class="text-center text-muted p-3 w-full" style="grid-column: 1 / -1;">Nenhum plano disponível.</div>';
    
    if (listContainer) listContainer.innerHTML = html || fallbackHtml;
    if (homeGrid) homeGrid.innerHTML = html || fallbackHtml;
    
    // IMPORTANT: Create Lucide icons after injecting dynamic HTML
    if (window.lucide) {
        window.lucide.createIcons();
    }
    
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

            if (activeSubscription) {
                const confirmed = await showConfirm('Atenção', 'Você já possui uma assinatura ativa. Ao assinar um novo plano, uma nova cobrança será iniciada. Lembre-se de solicitar o cancelamento do plano anterior ao estabelecimento.', 'Continuar', 'Cancelar');
                if (!confirmed) return;
            }

            showToast('Redirecionando para o pagamento...', 'info');
            try {
                const originalText = btn.innerHTML;
                btn.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="animate-spin" style="width: 20px; height: 20px; margin: 0 auto;"><path d="M21 12a9 9 0 1 1-6.219-8.56"></path></svg>`;
                btn.disabled = true;

                const supabaseAuth = getSupabaseAuthClient();
                const { data: sessionData } = await supabaseAuth.auth.getSession();
                const token = sessionData?.session?.access_token || '';

                const response = await fetch('/api/stripe/create-subscription-checkout', {
                    method: 'POST',
                    headers: { 
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${token}`
                    },
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
