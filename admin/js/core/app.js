import { Router } from './Router.js';
import { StateManager } from './StateManager.js';
import { supabase, getCurrentTenantId } from './supabaseClient.js';

document.addEventListener('DOMContentLoaded', () => {
    if (window.lucide) window.lucide.createIcons();
});

class AdminApp {
    constructor() {
        this.state = new StateManager();
        this.init();
    }

    async init() {
        // Verifica se está logado no God Mode instantaneamente (localStorage)
        const impersonateId = localStorage.getItem('impersonate_tenant_id');
        if (impersonateId) {
            const godBanner = document.createElement('div');
            godBanner.innerHTML = `
                <div style="background: #dc2626; color: #fff; padding: 8px 16px; text-align: center; font-weight: bold; font-size: 14px; position: relative; z-index: 1000; display: flex; justify-content: center; align-items: center; gap: 10px; width: 100%;">
                    <span><i data-lucide="zap" style="width: 16px; height: 16px; margin-right: 4px;"></i> <strong>GOD MODE:</strong> Você está logado na loja (${impersonateId}). Todas as ações serão registradas como ROOT.</span>
                    <button id="btn-exit-god-mode" style="background: rgba(0,0,0,0.3); border: none; color: white; padding: 4px 10px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: bold;">Sair</button>
                </div>
            `;
            document.body.insertBefore(godBanner, document.body.firstChild);

            document.getElementById('btn-exit-god-mode').addEventListener('click', () => {
                localStorage.removeItem('impersonate_tenant_id');
                window.location.href = '/admingod/';
            });
        }

        this.initSidebar();
        await this.initUserProfile();
        this.router = new Router(this.state);
        this.initGlobalSearch();
        this.initLogout();
    }

    async initUserProfile() {
        const nameEl = document.getElementById('profile-name-ph');
        const emailEl = document.getElementById('profile-email-ph');
        const avatarEl = document.getElementById('profile-avatar-ph');
        if (!nameEl) return;

        try {
            const tenantId = await getCurrentTenantId();
            
            if (!tenantId) {
                document.body.innerHTML = `<div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--color-bg-site, #050505); color: var(--color-text-primary, #fff); font-family: sans-serif; text-align: center; padding: 20px;"><h1 style="color: #ef4444; margin-bottom: 10px;">⚠️ Loja Não Encontrada</h1><p style="color: var(--color-text-secondary, #9ca3af); max-width: 400px; line-height: 1.5;">Não encontramos nenhuma loja vinculada ao seu usuário. Se você acabou de se cadastrar, ocorreu um erro na criação da loja.</p><button id="btn-logout-missing-tenant" style="margin-top:20px; padding: 10px 20px; background:#6366f1; color:#fff; border-radius:8px; text-decoration:none; font-weight:bold; cursor: pointer; border: none;">Sair e Voltar ao Login</button></div>`;
                document.getElementById('btn-logout-missing-tenant').addEventListener('click', async () => {
                    await supabase.auth.signOut();
                    window.location.href = '/login.html';
                });
                throw new Error("Tenant não encontrado");
            }
            
            // --- INÍCIO SWR (Stale-While-Revalidate) ---
            const cacheKey = `vitrine_profile_${tenantId}`;
            const cachedDataStr = localStorage.getItem(cacheKey);
            let tenant = null, maintenanceData = null, authData = null, plan = null, branch = null;
            let loadedFromCache = false;

            if (cachedDataStr) {
                try {
                    const parsed = JSON.parse(cachedDataStr);
                    tenant = parsed.tenant;
                    maintenanceData = parsed.maintenanceData;
                    authData = parsed.authData;
                    plan = parsed.plan;
                    branch = parsed.branch;
                    loadedFromCache = true;
                } catch(e) {}
            }

            const fetchFreshData = async () => {
                const [
                    { data: t },
                    { data: mData }
                ] = await Promise.all([
                    supabase.from('tenants').select('*').eq('id', tenantId).maybeSingle(),
                    supabase.from('master_settings').select('maintenance_mode, support_whatsapp').eq('id', 1).maybeSingle()
                ]);

                const { data: sessionData } = await supabase.auth.getSession();
                const aData = { user: sessionData?.session?.user };

                if (mData?.maintenance_mode) {
                    document.body.innerHTML = `<div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--color-bg-site, #050505); color: var(--color-text-primary, #fff); font-family: sans-serif; text-align: center; padding: 20px;"><h1 style="color: var(--color-primary, #6366f1); margin-bottom: 10px;">🛠️ Sistema em Manutenção</h1><p style="color: var(--color-text-secondary, #9ca3af); max-width: 400px; line-height: 1.5;">Nossa equipe está realizando melhorias na plataforma. O painel voltará ao normal em instantes.</p></div>`;
                    throw new Error("Manutenção");
                }

                const vencimento = t?.settings?.vencimento;
                if (vencimento && new Date(vencimento) < new Date()) {
                    const supportWpp = mData?.support_whatsapp || '5511999999999';
                    document.body.innerHTML = `<div style="height: 100vh; display: flex; flex-direction: column; align-items: center; justify-content: center; background: var(--color-bg-site, #050505); color: var(--color-text-primary, #fff); font-family: sans-serif; text-align: center; padding: 20px;"><h1 style="color: #ef4444; margin-bottom: 10px;">⚠️ Assinatura Vencida</h1><p style="color: var(--color-text-secondary, #9ca3af); max-width: 400px; line-height: 1.5;">O plano da sua loja expirou. Por favor, regularize sua assinatura para continuar utilizando o painel.</p><a href="https://wa.me/${supportWpp}?text=Ol%C3%A1%2C%20preciso%20regularizar%20minha%20assinatura!" target="_blank" style="margin-top:20px; padding: 10px 20px; background:#6366f1; color:#fff; border-radius:8px; text-decoration:none; font-weight:bold;">Falar com o Suporte</a>${localStorage.getItem('impersonate_tenant_id') ? `<button onclick="localStorage.removeItem('impersonate_tenant_id'); window.location.href='/admingod/'" style="margin-top: 20px; background: rgba(255,255,255,0.1); border: none; color: #fff; padding: 8px 16px; border-radius: 4px; cursor: pointer;">Voltar ao God Mode</button>` : ''}</div>`;
                    throw new Error("Assinatura Vencida");
                }

                let pPromise = Promise.resolve({ data: null });
                let bPromise = Promise.resolve({ data: null });

                if (t?.settings?.plano_id) {
                    pPromise = supabase.from('plans').select('id, name, features').eq('id', t.settings.plano_id).maybeSingle();
                }

                const activeBranchId = localStorage.getItem('active_branch_id');
                if (activeBranchId) {
                    bPromise = supabase.from('branches').select('name').eq('id', activeBranchId).maybeSingle();
                }

                const [{ data: p }, { data: b }] = await Promise.all([pPromise, bPromise]);

                if (activeBranchId && !b) {
                    localStorage.removeItem('active_branch_id');
                }

                const freshData = { tenant: t, maintenanceData: mData, authData: aData, plan: p, branch: b };
                localStorage.setItem(cacheKey, JSON.stringify(freshData));
                
                // Update badge se SWR trouxer dado novo em background
                const planBadge = document.getElementById('tenant-plan-badge');
                if (planBadge && p?.name) {
                    planBadge.textContent = p.name;
                    planBadge.classList.remove('d-none');
                }
                
                return freshData;
            };

            if (!loadedFromCache) {
                const fresh = await fetchFreshData();
                tenant = fresh.tenant;
                maintenanceData = fresh.maintenanceData;
                authData = fresh.authData;
                plan = fresh.plan;
                branch = fresh.branch;
            } else {
                setTimeout(fetchFreshData, 100);
            }
            // --- FIM SWR ---

            let planFeatures = plan?.features || {};

            // Exibir plano (se existir) na interface (Badge no Header Sidebar)
            const planBadge = document.getElementById('tenant-plan-badge');
            if (planBadge) {
                if (plan?.name) {
                    planBadge.textContent = plan.name;
                    planBadge.classList.remove('d-none');
                } else {
                    planBadge.classList.add('d-none');
                }
            }

            // Mesclar com os overrides do God Mode
            const menuOverrides = tenant?.settings?.menu_overrides || {};
            window.allowedMenus = {}; // Variável global para o Router

            // Todos os itens do menu (Default = allow caso não tenha plano, ou deny dependendo da regra de negócio. Assumiremos deny por segurança se o plano existir, mas allow para retrocompatibilidade se não houver plano.)
            const allNavItems = document.querySelectorAll('.nav-item');

            allNavItems.forEach(item => {
                const modId = item.getAttribute('data-tab');
                // eslint-disable-next-line no-useless-assignment
                let isAllowed = true;
                // Default deny if there are plans in the system but tenant has no plan/features.
                // If tenant has no plan_id, we can either allow or deny. Let's strictly deny by default unless overridden.
                if (tenant?.settings?.plano_id) {
                    isAllowed = planFeatures[modId] === true;
                } else {
                    isAllowed = false; // Block everything if no plan is selected
                }

                // Overrides mandam
                if (menuOverrides[modId] === 'allow') isAllowed = true;
                if (menuOverrides[modId] === 'deny') isAllowed = false;

                // Exceção: Dashboard e Configurações Gerais devem estar sempre liberados APENAS se o lojista não tiver um plano!
                if (!tenant?.settings?.plano_id) {
                    if (modId === 'principal/dashboard' || modId === 'sistema/configuracoes') {
                        isAllowed = true;
                    }
                }

                window.allowedMenus[modId] = isAllowed;

                if (!isAllowed) {
                    item.classList.add('d-none');
                } else {
                    item.classList.remove('d-none');
                }
            });

            // Esconder seções vazias
            document.querySelectorAll('.nav-section').forEach(section => {
                let next = section.nextElementSibling;
                let hasVisibleChild = false;
                while (next && !next.classList.contains('nav-section')) {
                    if (next.classList.contains('nav-item') && !next.classList.contains('d-none')) {
                        hasVisibleChild = true;
                        break;
                    }
                    next = next.nextElementSibling;
                }
                if (!hasVisibleChild) {
                    section.classList.add('d-none');
                } else {
                    section.classList.remove('d-none');
                }
            });

            const escapeHTML = (str) => {
                if (!str) return '';
                return str.toString()
                    .replace(/&/g, '&amp;')
                    .replace(/</g, '&lt;')
                    .replace(/>/g, '&gt;')
                    .replace(/"/g, '&quot;')
                    .replace(/'/g, '&#039;');
            };

            const storeName = escapeHTML(tenant?.name || 'Loja VitrineDesk');
            const userEmail = escapeHTML(authData?.user?.email || 'admin@loja.com');
            const initial = storeName.charAt(0).toUpperCase();

            if (nameEl) nameEl.textContent = storeName;
            if (emailEl) emailEl.textContent = userEmail;
            
            if (avatarEl) {
                avatarEl.classList.remove('skeleton', 'sk-avatar');
                avatarEl.className = "w-48px h-48px rounded-full bg-primary flex align-center justify-center text-white font-bold shadow-sm";
                
                if (tenant?.logo_url) {
                    avatarEl.style.backgroundImage = `url('${escapeHTML(tenant.logo_url)}')`;
                    avatarEl.style.backgroundSize = 'cover';
                    avatarEl.style.backgroundPosition = 'center';
                    avatarEl.innerHTML = '';
                } else {
                    avatarEl.style.background = 'linear-gradient(135deg, var(--primary) 0%, var(--primary-hover) 100%)';
                    avatarEl.innerHTML = `<i data-lucide="store" class="icon-md"></i>`;
                }
            }
            if (window.lucide) window.lucide.createIcons();

            window.currentTenantSlug = tenant?.slug || 'loja';

            // Atualiza Filial na Topbar
            if (branch && branch.name) {
                const branchContainer = document.getElementById('topbar-active-branch');
                const branchName = document.getElementById('topbar-active-branch-name');
                if (branchContainer && branchName) {
                    branchName.textContent = branch.name;
                    branchContainer.classList.remove('d-none');
                }
            }

            // Ação do Botão "Minha Vitrine"
            const btnVitrine = document.getElementById('btn-vitrine-link');
            if (btnVitrine) {
                btnVitrine.addEventListener('click', () => {
                    const baseUrl = window.location.href.split('/admin')[0];
                    const vitrineUrl = `${baseUrl}/vitrinedesk/${window.currentTenantSlug}`;

                    // Abrir em nova aba
                    window.open(vitrineUrl, '_blank');

                    // Opcional: Ainda copiar para a área de transferência
                    navigator.clipboard.writeText(vitrineUrl).catch(() => { });
                });
            }

            // Modal ou Toast de informações da Loja ao clicar
            const btnProfile = document.getElementById('btn-tenant-profile');
            if (btnProfile) {
                if (!document.getElementById('modal-perfil-loja')) {
                    const modalHtml = `
                        <div id="modal-perfil-loja" class="modal-overlay d-none">
                            <div class="modal-content config-card" style="max-width: 600px; width: 90%;">
                                <div class="flex justify-between align-center mb-4 border-bottom-dashed pb-3">
                                    <h3 id="modal-perfil-title">Detalhes da Loja</h3>
                                    <button id="btn-close-modal-perfil" class="btn bg-transparent border-none text-secondary cursor-pointer">
                                        <i data-lucide="x"></i>
                                    </button>
                                </div>
                                
                                <form id="form-perfil-loja">
                                    <div class="mb-3">
                                        <label class="font-medium text-sm text-secondary mb-1 inline-block">Nome da Loja</label>
                                        <input type="text" id="input-loja-nome" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm" value="${escapeHTML(tenant?.name || '')}" placeholder="Nome Oficial da Loja" required>
                                    </div>
                                    
                                    <div class="grid grid-md-2 mb-3">
                                        <div>
                                            <label class="font-medium text-sm text-secondary mb-1 inline-block">WhatsApp</label>
                                            <input type="tel" id="input-loja-whatsapp" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm" value="${escapeHTML(tenant?.whatsapp || '')}" placeholder="(11) 99999-9999">
                                        </div>
                                        <div>
                                            <label class="font-medium text-sm text-secondary mb-1 inline-block">Instagram</label>
                                            <input type="text" id="input-loja-instagram" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm" value="${escapeHTML(tenant?.instagram || '')}" placeholder="@sualoja">
                                        </div>
                                    </div>

                                    <div class="mb-4">
                                        <label class="font-medium text-sm text-secondary mb-1 inline-block">Endereço Público</label>
                                        <textarea id="input-loja-endereco" rows="3" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm resize-none" placeholder="Rua, Número, Bairro - Cidade/UF">${escapeHTML(tenant?.endereco || '')}</textarea>
                                    </div>

                                    <!-- Plano Status -->
                                    <div class="p-3 mb-4 rounded-md flex justify-between align-center bg-placeholder border-dashed">
                                        <div class="text-left">
                                            <p class="text-xs text-secondary mb-1">Assinatura Atual: <span class="font-bold text-primary capitalize">${escapeHTML(tenant?.plan_id || 'Free')}</span></p>
                                        </div>
                                        <span class="status-badge ${tenant?.subscription_status === 'active' ? 'bg-success-light text-success' : 'bg-danger-light text-danger'} border-none shadow-sm">${tenant?.subscription_status === 'active' ? 'Ativo' : 'Inativo'}</span>
                                    </div>

                                    <div class="flex justify-between gap-3 mt-4">
                                        <button type="submit" id="btn-salvar-perfil" class="btn btn-primary flex-1 py-3 rounded-lg cursor-pointer flex align-center justify-center gap-2">
                                            Salvar Alterações
                                        </button>
                                    </div>
                                </form>
                            </div>
                        </div>
                    `;
                    document.body.insertAdjacentHTML('beforeend', modalHtml);
                    if (window.lucide) window.lucide.createIcons();

                    const modalPerfil = document.getElementById('modal-perfil-loja');
                    document.getElementById('btn-close-modal-perfil').addEventListener('click', () => {
                        modalPerfil.classList.add('d-none');
                    });
                    modalPerfil.addEventListener('click', (e) => {
                        if (e.target === modalPerfil) modalPerfil.classList.add('d-none');
                    });

                    // Handler de Salvamento
                    document.getElementById('form-perfil-loja').addEventListener('submit', async (e) => {
                        e.preventDefault();
                        const btnSalvar = document.getElementById('btn-salvar-perfil');
                        const originalHtml = btnSalvar.innerHTML;
                        btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
                        if (window.lucide) window.lucide.createIcons();

                        const updates = {
                            name: document.getElementById('input-loja-nome').value.trim(),
                            whatsapp: document.getElementById('input-loja-whatsapp').value.trim(),
                            instagram: document.getElementById('input-loja-instagram').value.trim(),
                            endereco: document.getElementById('input-loja-endereco').value.trim()
                        };

                        try {
                            const { error } = await supabase.from('tenants').update(updates).eq('id', tenantId);
                            if (error) throw error;

                            if (window.showToast) window.showToast('Dados da loja atualizados com sucesso!');
                            setTimeout(() => window.location.reload(), 1500);
                        } catch (err) {
                            console.error('Erro ao atualizar loja:', err);
                            if (window.showToast) window.showToast('Erro ao atualizar os dados. Tente novamente.', 'error');
                        } finally {
                            btnSalvar.innerHTML = originalHtml;
                            if (window.lucide) window.lucide.createIcons();
                        }
                    });
                }

                btnProfile.addEventListener('click', () => {
                    document.getElementById('modal-perfil-loja').classList.remove('d-none');
                });
            }

            // Inicializa Notificações com Lazy Load para não travar a Main Thread
            setTimeout(() => {
                this.initNotifications(tenantId);
            }, 2500);

        } catch(error) {
            console.error('Erro ao carregar perfil:', error);
            
            if (error.message === "Tenant não encontrado" || error.message === "Manutenção" || error.message === "Assinatura Vencida") {
                throw error; // Impede que o Router carregue o app-content
            }
            
            if (nameEl) nameEl.textContent = "Erro";
            if (avatarEl) {
                avatarEl.classList.remove('skeleton', 'sk-avatar');
                avatarEl.innerHTML = `<i data-lucide="store" class="icon-sm"></i>`;
            }
        }

    }

    initNotifications(tenantId) {
        // --- Sistema de Notificações (Drawer) ---
        const btnNotif = document.getElementById('btn-notifications');
        const badgeNotif = document.getElementById('notifications-badge');

        let cachedNotifs = [];

        // Injeta HTML do Drawer Lateral
        if (!document.getElementById('drawer-notifications')) {
            const drawerHtml = `
                <style>
                    .drawer-overlay {
                        position: fixed; top: 0; left: 0; right: 0; bottom: 0;
                        background: rgba(0,0,0,0.5); z-index: 99998;
                        opacity: 0; pointer-events: none; transition: opacity 0.3s;
                    }
                    .drawer-overlay.open { opacity: 1; pointer-events: auto; }
                    
                    .drawer-panel {
                        position: fixed; top: 0; right: -450px; bottom: 0; width: 400px; max-width: 100vw;
                        background: var(--color-bg-base); z-index: 99999;
                        box-shadow: -10px 0 40px rgba(0,0,0,0.5);
                        transition: right 0.3s cubic-bezier(0.16, 1, 0.3, 1);
                        display: flex; flex-direction: column;
                    }
                    .drawer-panel.open { right: 0; }
                    
                    .drawer-header {
                        padding: 24px 24px 16px 24px;
                        display: flex; flex-direction: column; gap: 16px;
                        background: var(--color-bg-surface);
                    }
                    
                    .drawer-content {
                        flex: 1; overflow-y: auto; padding: 10px; background: var(--color-bg-base);
                    }
                    
                    .notif-card {
                        background: rgba(255, 255, 255, 0.02);
                        backdrop-filter: blur(8px);
                        -webkit-backdrop-filter: blur(8px);
                        border: 1px solid rgba(255, 255, 255, 0.05);
                        border-radius: 12px; padding: 16px; margin-bottom: 12px;
                        transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
                        box-shadow: 0 4px 12px rgba(0, 0, 0, 0.2);
                    }
                    .notif-card:hover {
                        transform: translateY(-2px);
                        background: rgba(255, 255, 255, 0.05);
                        border-color: rgba(255, 255, 255, 0.1);
                        box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3);
                    }
                    .notif-card.unread { 
                        border-left: 4px solid var(--color-primary);
                        background: linear-gradient(90deg, rgba(99, 102, 241, 0.1) 0%, rgba(255, 255, 255, 0.02) 100%);
                    }
                    
                    .drawer-action-btn {
                        background: transparent;
                        border: none;
                        color: var(--color-text-secondary);
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        padding: 8px;
                        border-radius: 8px;
                    }
                    .drawer-action-btn.read-all:hover {
                        background: rgba(99, 102, 241, 0.15);
                        color: var(--color-primary);
                        transform: scale(1.05);
                    }
                    .drawer-action-btn.clear-all:hover {
                        background: rgba(239, 68, 68, 0.15);
                        color: var(--color-danger);
                        transform: scale(1.05);
                    }
                    .drawer-close-btn {
                        background: rgba(255,255,255,0.05);
                        border: none;
                        color: var(--color-text-secondary);
                        cursor: pointer;
                        transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
                        border-radius: 50%;
                        width: 36px;
                        height: 36px;
                        display: flex;
                        align-items: center;
                        justify-content: center;
                        margin-left: 8px;
                    }
                    .drawer-close-btn:hover {
                        background: var(--color-danger);
                        color: #fff;
                        transform: scale(1.1) rotate(90deg);
                    }
                </style>
                <div id="drawer-notif-overlay" class="drawer-overlay"></div>
                <div id="drawer-notifications" class="drawer-panel">
                    <div class="drawer-header">
                        <div class="flex justify-between align-center">
                            <h3 class="font-bold text-lg text-primary flex align-center gap-2 m-0"><i data-lucide="bell" class="icon-sm"></i> Notificações</h3>
                            <div class="flex align-center gap-3">
                                <button id="btn-read-all-drawer" class="drawer-action-btn read-all" title="Marcar todas como lidas">
                                    <i data-lucide="check-check" class="icon-sm"></i>
                                </button>
                                <button id="btn-clear-all-drawer" class="drawer-action-btn clear-all" title="Limpar todas as notificações">
                                    <i data-lucide="trash-2" class="icon-sm"></i>
                                </button>
                                <button id="btn-close-drawer" class="drawer-close-btn" title="Fechar">
                                    <i data-lucide="x" class="icon-sm"></i>
                                </button>
                            </div>
                        </div>
                        <div class="px-4 pb-3 flex gap-2" style="border-bottom: 1px solid var(--color-border);">
                            <select id="drawer-category-select" class="w-100 bg-placeholder border-dashed rounded-md px-2 py-2 text-primary outline-none text-sm cursor-pointer drawer-filter-select" style="flex: 1;">
                                <option value="all">Todas Categorias</option>
                                <option value="appointment">Agendamentos</option>
                                <option value="billing">Financeiro</option>
                                <option value="system">Sistema e Avisos</option>
                                <option value="update">Atualizações</option>
                            </select>
                            <select id="drawer-status-select" class="w-100 bg-placeholder border-dashed rounded-md px-2 py-2 text-primary outline-none text-sm cursor-pointer drawer-filter-select" style="flex: 1;">
                                <option value="all">Todas (Lidas/Não Lidas)</option>
                                <option value="unread">Não Lidas</option>
                                <option value="read">Já Lidas</option>
                            </select>
                        </div>
                    </div>
                    <div id="drawer-notif-list" class="drawer-content custom-scrollbar">
                        <div class="p-4 text-center text-secondary text-sm"><i data-lucide="loader" class="animate-spin icon-sm"></i> Carregando...</div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', drawerHtml);
        }

        const drawerOverlay = document.getElementById('drawer-notif-overlay');
        const drawerPanel = document.getElementById('drawer-notifications');
        const drawerList = document.getElementById('drawer-notif-list');
        const btnCloseDrawer = document.getElementById('btn-close-drawer');
        const btnReadAllDrawer = document.getElementById('btn-read-all-drawer');
        const btnClearAllDrawer = document.getElementById('btn-clear-all-drawer');
        const drawerSelect = document.getElementById('drawer-category-select');

        let currentDrawerCategory = 'all';
        let currentDrawerStatus = 'all';

        const escapeHTML = (str) => str ? str.replace(/[&<>'"`]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;' }[tag] || tag)) : '';

        const renderDrawerNotifications = () => {
            if (!cachedNotifs || cachedNotifs.length === 0) {
                if(drawerList) drawerList.innerHTML = '<div class="p-8 text-center text-secondary flex-col align-center justify-center h-100"><i data-lucide="bell-off" class="icon-lg opacity-50 mb-3"></i><p class="text-sm">Nenhuma notificação por aqui.</p></div>';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            const filtered = cachedNotifs.filter(n => {
                const matchCategory = currentDrawerCategory === 'all' || n.type === currentDrawerCategory;
                const matchStatus = currentDrawerStatus === 'all' || (currentDrawerStatus === 'unread' ? !n.read : n.read);
                return matchCategory && matchStatus;
            });

            if (filtered.length === 0) {
                if(drawerList) drawerList.innerHTML = '<div class="p-8 text-center text-secondary flex-col align-center justify-center h-100"><i data-lucide="filter" class="icon-lg opacity-50 mb-3"></i><p class="text-sm">Nenhuma notificação nos filtros selecionados.</p></div>';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            if(drawerList) drawerList.innerHTML = filtered.map(n => {
                const isUpdate = n.type === 'update';
                let icon = isUpdate ? 'zap' : (n.type === 'system' ? 'settings' : 'info');
                let colorClass = isUpdate ? 'text-primary' : 'text-secondary';
                let label = isUpdate ? 'Atualização' : (n.type === 'system' ? 'Aviso do Sistema' : 'Informação Geral');
                let textColor = isUpdate ? 'var(--color-primary)' : 'var(--color-text-primary)';

                if (n.type === 'appointment') {
                    icon = 'calendar';
                    label = 'Agendamento';
                } else if (n.type === 'billing') {
                    icon = 'credit-card';
                    label = 'Financeiro';
                } else if (n.type === 'alert') {
                    icon = 'alert-triangle';
                    label = 'Alerta';
                    colorClass = 'text-warning';
                    textColor = 'var(--color-warning)';
                }

                return `
                <div class="notif-card ${n.read ? '' : 'unread'} cursor-pointer" onclick="window.openNotificationDetail('${n.id}')">
                    <div class="flex justify-between align-start mb-2">
                        <div class="flex align-center gap-2" style="white-space: nowrap;">
                            <i data-lucide="${icon}" class="icon-sm ${colorClass}" style="flex-shrink: 0;"></i>
                            <span class="text-xs font-bold uppercase" style="color: ${textColor}; white-space: nowrap;">${label}</span>
                        </div>
                        <span class="text-xs text-secondary opacity-70">${new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                    <p class="text-sm text-primary m-0" style="line-height: 1.5; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; opacity: ${n.read ? '0.8' : '1'};">${escapeHTML(n.message)}</p>
                </div>
                `;
            }).join('');
            
            if (window.lucide) window.lucide.createIcons();
        };

        if (drawerSelect) {
            drawerSelect.addEventListener('change', (e) => {
                currentDrawerCategory = e.target.value;
                renderDrawerNotifications();
            });
        }
        
        const drawerStatusSelect = document.getElementById('drawer-status-select');
        if (drawerStatusSelect) {
            drawerStatusSelect.addEventListener('change', (e) => {
                currentDrawerStatus = e.target.value;
                renderDrawerNotifications();
            });
        }

        const openDrawer = () => {
            if (drawerOverlay) drawerOverlay.classList.add('open');
            if (drawerPanel) drawerPanel.classList.add('open');
            
            const profileMenu = document.querySelector('.user-dropdown-menu');
            if (profileMenu && !profileMenu.classList.contains('d-none')) {
                profileMenu.classList.add('d-none');
            }
        };
        window.openNotificationDrawer = openDrawer;

        const closeDrawer = () => {
            if (drawerOverlay) drawerOverlay.classList.remove('open');
            if (drawerPanel) drawerPanel.classList.remove('open');
        };

        btnNotif?.addEventListener('click', openDrawer);
        btnCloseDrawer?.addEventListener('click', closeDrawer);
        drawerOverlay?.addEventListener('click', closeDrawer);

        const checkUnreadNotifications = () => {
            const unreadCount = cachedNotifs.filter(n => !n.read).length;
            if (unreadCount > 0) badgeNotif?.classList.remove('d-none');
            else badgeNotif?.classList.add('d-none');
        };

        btnReadAllDrawer?.addEventListener('click', async () => {
            btnReadAllDrawer.innerHTML = '<i data-lucide="loader" class="animate-spin icon-xs"></i> Lidas';
            if (window.lucide) window.lucide.createIcons();
            try {
                if (tenantId) {
                    await supabase.from('notifications').update({ read: true }).eq('tenant_id', tenantId).eq('read', false);
                    badgeNotif?.classList.add('d-none');
                    cachedNotifs.forEach(n => n.read = true);
                    renderDrawerNotifications();
                    if (window.showToast) window.showToast('Notificações marcadas como lidas', 'success');
                }
            } catch (err) {
                console.error(err);
            } finally {
                btnReadAllDrawer.innerHTML = '<i data-lucide="check-check" class="icon-xs"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        });

        btnClearAllDrawer?.addEventListener('click', async () => {
            if (!confirm('Tem certeza que deseja excluir TODAS as notificações?')) return;
            
            if (window.showToast) window.showToast('Limpando notificações...', 'info');
            try {
                if (tenantId) {
                    await supabase.from('notifications').delete().eq('tenant_id', tenantId);
                    cachedNotifs = [];
                    badgeNotif?.classList.add('d-none');
                    renderDrawerNotifications();
                    if (window.showToast) window.showToast('Notificações limpas!', 'success');
                }
            } catch (err) {
                console.error(err);
                if (window.showToast) window.showToast('Erro ao limpar notificações', 'error');
            }
        });

        setTimeout(async () => {
            if(tenantId) {
                const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
                await supabase.from('notifications').delete().eq('tenant_id', tenantId).lt('created_at', sevenDaysAgo);
            }
        }, 3000);

        const loadDrawerNotifications = async () => {
            if (drawerList) drawerList.innerHTML = '<div class="p-6 text-center text-secondary"><i data-lucide="loader" class="animate-spin icon-sm"></i><p class="mt-2 text-sm">Carregando...</p></div>';
            if (window.lucide) window.lucide.createIcons();
            try {
                const { data: notifs, error } = await supabase.from('notifications')
                    .select('*')
                    .or(`tenant_id.eq.${tenantId},tenant_id.is.null`)
                    .neq('type', 'superadmin_alert')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                cachedNotifs = notifs || [];
                
                renderDrawerNotifications();
                checkUnreadNotifications();
            } catch (e) {
                if (drawerList) drawerList.innerHTML = '<div class="p-4 text-center text-danger text-sm">Erro ao carregar notificações.</div>';
            }
        };

        const setupRealtimeNotifications = () => {
            supabase.channel('admin-notifications')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications' }, (payload) => {
                    const newNotif = payload.new;
                    if (newNotif.type !== 'superadmin_alert' && (newNotif.tenant_id === tenantId || newNotif.tenant_id === null)) {
                        if (badgeNotif) {
                            badgeNotif.classList.remove('d-none');
                            badgeNotif.classList.remove('badge-pop');
                            void badgeNotif.offsetWidth; // trigger reflow
                            badgeNotif.classList.add('badge-pop');
                        }
                        
                        if (window.playNotificationSound) window.playNotificationSound(4);
                        if (cachedNotifs && Array.isArray(cachedNotifs)) {
                            cachedNotifs.unshift(newNotif);
                            if (drawerPanel && drawerPanel.classList.contains('open')) {
                                renderDrawerNotifications();
                            }
                        }
                        window.dispatchEvent(new CustomEvent('new_notification', { detail: newNotif }));
                        const isUpdate = newNotif.type === 'update';
                        const toastHtml = `
                            <div style="display: flex; flex-direction: column; gap: 4px;" onclick="window.openNotificationDetail('${newNotif.id}')" class="cursor-pointer">
                                <strong class="text-sm">Nova Notificação Recebida!</strong>
                                <span style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
                                    ${escapeHTML(newNotif.message)}
                                </span>
                                <span style="font-size: 10px; color: var(--color-primary); font-weight: bold; margin-top: 2px;">Clique para abrir detalhes</span>
                            </div>
                        `;
                        if (window.showToast) window.showToast(toastHtml, isUpdate ? 'warning' : 'info', () => {
                            if (typeof window.openNotificationDetail === 'function') {
                                window.openNotificationDetail(newNotif.id);
                            }
                        });
                    }
                })
                .subscribe();
        };

        window.injectMockNotification = (type = 'appointment', msg = 'Este é um teste de notificação visual do VitrineDesk.') => {
            const newNotif = {
                id: 'mock-' + Date.now(),
                tenant_id: tenantId,
                type: type,
                message: msg,
                read: false,
                created_at: new Date().toISOString()
            };
            
            badgeNotif?.classList.remove('d-none');
            badgeNotif?.classList.remove('badge-pop');
            void badgeNotif?.offsetWidth; // trigger reflow
            badgeNotif?.classList.add('badge-pop');
            
            if (window.playNotificationSound) window.playNotificationSound(4);
            
            if (cachedNotifs && Array.isArray(cachedNotifs)) {
                cachedNotifs.unshift(newNotif);
                if (drawerPanel && drawerPanel.classList.contains('open')) {
                    renderDrawerNotifications();
                }
            }
            window.dispatchEvent(new CustomEvent('new_notification', { detail: newNotif }));
            
            const isUpdate = newNotif.type === 'update';
            const toastHtml = `
                <div style="display: flex; flex-direction: column; gap: 4px;" onclick="window.openNotificationDetail('${newNotif.id}')" class="cursor-pointer">
                    <strong class="text-sm">Nova Notificação Recebida!</strong>
                    <span style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
                        ${escapeHTML(newNotif.message)}
                    </span>
                    <span style="font-size: 10px; color: var(--color-primary); font-weight: bold; margin-top: 2px;">Clique para abrir detalhes</span>
                </div>
            `;
            if (window.showToast) window.showToast(toastHtml, isUpdate ? 'warning' : 'info', () => {
                if (typeof window.openNotificationDetail === 'function') {
                    window.openNotificationDetail(newNotif.id);
                }
            });
        };

        setupRealtimeNotifications();
        loadDrawerNotifications();

        if (!document.getElementById('modal-notif-detail')) {
            const notifModalHtml = `
                <div id="modal-notif-detail" class="modal-overlay d-none flex align-center justify-center" style="z-index: 100000; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.7); backdrop-filter: blur(12px); -webkit-backdrop-filter: blur(12px);">
                    <div class="flex-col relative" style="background: rgba(25, 25, 25, 0.85); width: 450px; max-width: 90vw; border-radius: 24px; overflow: hidden; box-shadow: 0 30px 60px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.08); backdrop-filter: blur(20px);">
                        
                        <!-- Big Icon Header -->
                        <div class="flex justify-center align-center" style="height: 120px; background: linear-gradient(180deg, rgba(255,255,255, 0.05) 0%, transparent 100%); position: relative;">
                            <div id="popup-notif-icon-wrapper" class="flex align-center justify-center rounded-full" style="width: 64px; height: 64px; background: rgba(255,255,255, 0.05); border: 1px solid rgba(255,255,255, 0.1); box-shadow: 0 0 20px rgba(0,0,0, 0.2);">
                                <i id="popup-notif-icon" data-lucide="bell" style="width: 32px; height: 32px; color: var(--color-text-primary);"></i>
                            </div>
                            
                            <button id="btn-close-notif-popup" class="btn bg-transparent border-none text-secondary cursor-pointer hover:text-white absolute rounded-full w-32px h-32px flex align-center justify-center transition-colors" style="top: 16px; right: 16px; background: rgba(255,255,255,0.05);">
                                <i data-lucide="x" class="icon-sm"></i>
                            </button>
                        </div>

                        <div class="px-8 pb-4 text-center">
                            <span id="popup-notif-type" class="text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full mb-3 inline-block" style="background: rgba(255,255,255, 0.1); color: var(--color-text-primary); border: 1px solid rgba(255,255,255, 0.1);">Aviso</span>
                            <h3 id="popup-notif-title" class="font-bold text-xl text-white m-0 mb-2">Notificação</h3>
                            <span id="popup-notif-date" class="text-xs text-secondary opacity-70">00/00/0000</span>
                        </div>
                        
                        <div class="px-8 py-4">
                            <div style="background: rgba(0, 0, 0, 0.3); border-radius: 16px; padding: 24px; border: 1px solid rgba(255,255,255,0.03);">
                                <p id="popup-notif-message" class="text-sm text-secondary m-0 text-center" style="white-space: pre-wrap; line-height: 1.7; font-size: 15px;"></p>
                            </div>
                        </div>
                        
                        <div class="p-6 flex gap-4 justify-center mt-2">
                            <button id="btn-delete-notif-popup" class="btn bg-transparent text-danger border border-danger text-sm px-6 py-3 font-bold cursor-pointer hover:bg-danger hover:text-white rounded-xl transition-all" style="flex: 1;">Excluir</button>
                            <button id="btn-ok-notif-popup" class="btn btn-primary rounded-xl text-sm px-6 py-3 font-bold cursor-pointer border-none shadow-lg transition-all hover:brightness-110" style="flex: 2;">Estou Ciente</button>
                        </div>
                    </div>
                </div>
            `;
            document.body.insertAdjacentHTML('beforeend', notifModalHtml);
        }
        const modalNotifPopup = document.getElementById('modal-notif-detail');
        const closePopup = () => modalNotifPopup?.classList.add('d-none');
        document.getElementById('btn-close-notif-popup')?.addEventListener('click', closePopup);
        document.getElementById('btn-ok-notif-popup')?.addEventListener('click', closePopup);
        modalNotifPopup?.addEventListener('click', (e) => { if (e.target === modalNotifPopup) closePopup(); });

        window.openNotificationDetail = async (id) => {
            try {
                closeDrawer();
                let notif = cachedNotifs.find(n => n.id === id);
                if (!notif) {
                    const { data, error } = await supabase.from('notifications').select('*').eq('id', id).single();
                    if (error) throw error;
                    notif = data;
                }

                if (!notif.read) {
                    if (!id.toString().startsWith('mock-')) {
                        await supabase.from('notifications').update({ read: true }).eq('id', id);
                    }
                    if (notif) notif.read = true;
                    checkUnreadNotifications();
                    renderDrawerNotifications();
                }

                const title = document.getElementById('popup-notif-title');
                const typeLabel = document.getElementById('popup-notif-type');
                const msg = document.getElementById('popup-notif-message');
                const date = document.getElementById('popup-notif-date');
                const icon = document.getElementById('popup-notif-icon');
                const btnDelete = document.getElementById('btn-delete-notif-popup');

                const iconWrapper = document.getElementById('popup-notif-icon-wrapper');

                const isUpdate = notif.type === 'update';
                let iconName = isUpdate ? 'zap' : (notif.type === 'system' ? 'settings' : 'info');
                let colorClass = isUpdate ? 'var(--color-primary)' : 'var(--color-text-primary)';
                let labelText = isUpdate ? 'Atualização' : (notif.type === 'system' ? 'Aviso do Sistema' : 'Informação Geral');

                if (notif.type === 'appointment') { iconName = 'calendar'; labelText = 'Agendamento'; colorClass = 'var(--color-text-primary)'; }
                if (notif.type === 'billing') { iconName = 'credit-card'; labelText = 'Financeiro'; colorClass = 'var(--color-text-primary)'; }
                if (notif.type === 'alert') { iconName = 'alert-triangle'; labelText = 'Alerta'; colorClass = 'var(--color-warning)'; }

                title.textContent = labelText; // The big centered text
                typeLabel.textContent = notif.type.toUpperCase(); // The small pill above title
                typeLabel.style.color = colorClass;
                msg.textContent = notif.message;
                date.textContent = new Date(notif.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

                icon.setAttribute('data-lucide', iconName);
                icon.style.color = colorClass;
                if (window.lucide) window.lucide.createIcons();

                // Delete Logic
                btnDelete.onclick = async () => {
                    btnDelete.innerHTML = '<i data-lucide="loader" class="animate-spin icon-xs"></i>';
                    if (window.lucide) window.lucide.createIcons();
                    try {
                        // Se for uma notificação mock, apenas remove localmente
                        if (!id.toString().startsWith('mock-')) {
                            await supabase.from('notifications').delete().eq('id', id);
                        }
                        cachedNotifs = cachedNotifs.filter(n => n.id !== id);
                        renderDrawerNotifications();
                        checkUnreadNotifications();
                        closePopup();
                        if (window.showToast) window.showToast('Notificação excluída', 'success');
                    } catch (e) {
                        console.error(e);
                        if (window.showToast) window.showToast('Erro ao excluir', 'error');
                    } finally {
                        btnDelete.innerHTML = 'Excluir';
                    }
                };

                modalNotifPopup?.classList.remove('d-none');
                if (window.lucide) window.lucide.createIcons();

            } catch (err) {
                console.error(err);
                if (window.showToast) window.showToast('Erro ao carregar notificação.', 'error');
            }
        };
        checkUnreadNotifications();

    }

    initGlobalSearch() {
        const searchInput = document.getElementById('global-search-input');
        const searchResults = document.getElementById('global-search-results');
        if (!searchInput || !searchResults) return;

        // Base de Telas do Sistema
        const systemPagesIndex = [
            { title: "Dashboard", route: "principal/dashboard", keywords: "inicio home relatorio painel", icon: "layout-dashboard" },
            { title: "Agendamentos", route: "principal/agendamentos", keywords: "agenda horario marcar", icon: "calendar" },
            { title: "Agenda Diária", route: "principal/agenda_diaria", keywords: "hoje dia calendario", icon: "calendar-clock" },
            { title: "Serviços", route: "cadastros/servicos", keywords: "procedimentos tratamentos precos", icon: "scissors" },
            { title: "Equipe", route: "cadastros/equipe", keywords: "funcionarios barbeiros cabeleireiros profs", icon: "users" },
            { title: "Clientes", route: "cadastros/clientes", keywords: "fichas contatos", icon: "contact" },
            { title: "Cupons", route: "crm_vendas/cupons", keywords: "desconto promocao", icon: "ticket" },
            { title: "Marketing", route: "crm_vendas/marketing", keywords: "divulgacao campanhas", icon: "megaphone" },
            { title: "Blacklist", route: "crm_vendas/blacklist", keywords: "bloqueados banidos", icon: "shield-ban" },
            { title: "Relatórios", route: "gestao/relatorios", keywords: "graficos dados financeiro", icon: "bar-chart-3" },
            { title: "Comissões", route: "gestao/comissoes", keywords: "pagamentos porcentagem", icon: "coins" },
            { title: "Metas", route: "gestao/metas", keywords: "objetivos", icon: "target" },
            { title: "Fidelidade", route: "gestao/fidelidade", keywords: "pontos recompensas", icon: "gift" },
            { title: "Minhas Filiais", route: "cadastros/filiais", keywords: "lojas unidades matriz", icon: "store" },
            { title: "Configurações", route: "sistema/configuracoes", keywords: "ajustes preferencias", icon: "settings" },
            { title: "Personalização", route: "sistema/personalizacao", keywords: "cores tema logo design visual", icon: "palette" },
            { title: "Usuários", route: "sistema/usuarios", keywords: "acessos permissoes gerentes", icon: "user-cog" },
            { title: "Suporte", route: "sistema/suporte", keywords: "ajuda chamados whatsapp ticket", icon: "life-buoy" }
        ];

        // Atalho Ctrl+K para focar a barra
        document.addEventListener('keydown', (e) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
                e.preventDefault();
                searchInput.focus();
            }
        });

        // Fechar dropdown ao clicar fora
        document.addEventListener('click', (e) => {
            if (!searchInput.contains(e.target) && !searchResults.contains(e.target)) {
                searchResults.classList.add('d-none');
            }
        });

        // Focar input reabre o dropdown se tiver texto
        searchInput.addEventListener('focus', () => {
            if (searchInput.value.trim().length > 0) {
                searchResults.classList.remove('d-none');
            }
        });

        // Lógica Principal de Busca
        searchInput.addEventListener('input', (e) => {
            const searchTerm = e.target.value.trim().toLowerCase();
            
            // Disparar evento customizado globalmente para módulos locais (ex: Cliente table)
            const event = new CustomEvent('globalSearch', { detail: { term: searchTerm } });
            window.dispatchEvent(event);

            if (searchTerm.length === 0) {
                searchResults.classList.add('d-none');
                searchResults.innerHTML = '';
                return;
            }

            // Filtrar as funções do sistema
            const matchedPages = systemPagesIndex.filter(page => {
                return page.title.toLowerCase().includes(searchTerm) || 
                       page.keywords.includes(searchTerm) ||
                       page.route.toLowerCase().includes(searchTerm);
            });

            // Renderizar Resultados
            searchResults.innerHTML = '';
            
            if (matchedPages.length > 0) {
                // Título de Seção "Telas / Funções"
                searchResults.innerHTML += `
                    <div class="px-3 py-2 text-xs font-bold text-secondary uppercase bg-placeholder border-bottom-dashed">
                        Telas do Sistema
                    </div>
                `;

                matchedPages.forEach(page => {
                    // Ignora menus restritos pelo plano (Router.js usa window.allowedMenus)
                    if (window.allowedMenus && window.allowedMenus[page.route] === false) return;

                    const itemHtml = `
                        <div class="search-result-item flex align-center gap-3 px-3 py-2 cursor-pointer hover-bg" data-route="${page.route}" onclick="document.querySelector('[data-tab=\\'${page.route}\\']')?.click(); document.getElementById('global-search-results').classList.add('d-none'); document.getElementById('global-search-input').value = '';">
                            <i data-lucide="${page.icon}" class="icon-sm text-primary"></i>
                            <div class="flex-1">
                                <p class="text-sm font-medium text-primary m-0">${page.title}</p>
                                <p class="text-xs text-secondary m-0">Ir para ${page.title}</p>
                            </div>
                        </div>
                    `;
                    searchResults.innerHTML += itemHtml;
                });
            } else {
                searchResults.innerHTML = `
                    <div class="p-4 text-center text-secondary text-sm">
                        Nenhuma tela encontrada para "<strong>${searchTerm}</strong>".<br>
                        A busca em cadastros locais (ex: Clientes) já foi acionada.
                    </div>
                `;
            }

            if (window.lucide) window.lucide.createIcons();
            searchResults.classList.remove('d-none');
            searchResults.classList.add('flex'); // Garante formato de coluna se d-none for removido
        });
    }

    initLogout() {
        const btnLogout = document.querySelector('.btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                const confirmSair = await window.showConfirm('Tem certeza que deseja sair do sistema?', 'Sim, sair', 'Cancelar');
                if (!confirmSair) return;

                const originalHtml = btnLogout.innerHTML;
                btnLogout.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Saindo...`;
                if (window.lucide) window.lucide.createIcons();

                try {
                    await supabase.auth.signOut();
                    window.location.href = '../login.html';
                } catch (error) {
                    console.error('Erro ao deslogar:', error);
                    window.location.href = '../login.html';
                }
            });
        }
    }

    initSidebar() {
        const sidebar = document.getElementById('sidebar');
        const toggles = document.querySelectorAll('.menu-toggle');

        toggles.forEach(toggle => {
            toggle.addEventListener('click', () => {
                sidebar.classList.toggle('open');
            });
        });

        // Fechar sidebar mobile ao clicar fora
        document.addEventListener('click', (e) => {
            if (window.innerWidth < 992 && sidebar.classList.contains('open')) {
                if (!sidebar.contains(e.target) && !e.target.closest('.menu-toggle')) {
                    sidebar.classList.remove('open');
                }
            }
        });
    }
}

// ==========================================================================
//   Global Utilities (Toasts, Prompts)
// ==========================================================================

window.playNotificationSound = function(profile = 4) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        if (!AudioContext) return;
        
        if (!window.__globalAudioCtx) {
            window.__globalAudioCtx = new AudioContext();
        }
        const ctx = window.__globalAudioCtx;
        
        if (ctx.state === 'suspended') {
            ctx.resume();
        }
        
        if (profile === 1) {
            // 1. Soft Pop / Bloop
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(800, ctx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(300, ctx.currentTime + 0.15);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.2);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.2);
            
        } else if (profile === 2) {
            // 2. Chime / Sino Suave
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.05);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 1.0);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 1.0);
            
        } else if (profile === 3) {
            // 3. Digital Beep (Classic)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = 'square';
            osc.frequency.setValueAtTime(600, ctx.currentTime);
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.01);
            gain.gain.setValueAtTime(0.1, ctx.currentTime + 0.1);
            gain.gain.setValueAtTime(0, ctx.currentTime + 0.11);
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.start();
            osc.stop(ctx.currentTime + 0.15);
            
        } else if (profile === 4) {
            // 4. Success Chord (Duplo Tom)
            const osc1 = ctx.createOscillator();
            const osc2 = ctx.createOscillator();
            const gain = ctx.createGain();
            osc1.type = 'triangle';
            osc2.type = 'triangle';
            osc1.frequency.setValueAtTime(523.25, ctx.currentTime); // C5
            osc2.frequency.setValueAtTime(659.25, ctx.currentTime + 0.1); // E5 (toca depois)
            
            gain.gain.setValueAtTime(0, ctx.currentTime);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.05);
            gain.gain.linearRampToValueAtTime(0.2, ctx.currentTime + 0.1);
            gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.15);
            gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.5);
            
            osc1.connect(gain);
            osc2.connect(gain);
            gain.connect(ctx.destination);
            
            osc1.start(ctx.currentTime);
            osc1.stop(ctx.currentTime + 0.3);
            osc2.start(ctx.currentTime + 0.1);
            osc2.stop(ctx.currentTime + 0.5);
        }
    } catch (e) {
        console.error("Web Audio API error:", e);
    }
};

// Desbloquear áudio no primeiro clique do usuário
document.addEventListener('click', () => {
    if (window.__globalAudioCtx && window.__globalAudioCtx.state === 'suspended') {
        window.__globalAudioCtx.resume();
    }
}, { once: true });

window.testSound = function(profileNumber) {
    window.playNotificationSound(profileNumber);
    console.log("Tocando perfil de som:", profileNumber);
};

window.showToast = function (message, type = 'success', onClick = null) {
    // Tocar som correspondente
    let soundProfile = 1; // info
    if (type === 'success') soundProfile = 4;
    if (type === 'error' || type === 'danger') soundProfile = 3;
    if (type === 'warning') soundProfile = 2;
    if (window.playNotificationSound) {
        window.playNotificationSound(soundProfile);
    }

    // Remove toast anterior se existir
    const existingToast = document.querySelector('.toast-container');
    if (existingToast) existingToast.remove();

    const toast = document.createElement('div');
    toast.className = `toast-container toast-${type}`;
    if (onClick) {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', onClick);
    }

    // Ícone dependendo do tipo
    let iconName = 'check-circle';
    if (type === 'error' || type === 'danger') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';
    if (type === 'info') iconName = 'info';

    toast.innerHTML = `
        <div class="flex align-center gap-2">
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        </div>
    `;

    document.body.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();

    // Fade out após 3.5s
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
};

window.showConfirm = function (message, confirmText = 'Confirmar', cancelText = 'Cancelar') {
    return new Promise((resolve) => {
        // Remove existing modal if any
        const existing = document.getElementById('global-confirm-modal');
        if (existing) existing.remove();

        const overlay = document.createElement('div');
        overlay.id = 'global-confirm-modal';
        overlay.className = 'modal-overlay';

        overlay.innerHTML = `
            <div class="modal-content config-card text-center" style="max-width: 400px; padding: 30px 20px;">
                <div class="flex justify-center mb-3 text-warning">
                    <i data-lucide="alert-triangle" style="width: 48px; height: 48px;"></i>
                </div>
                <h3 class="mb-2 text-primary font-bold text-lg">Atenção</h3>
                <p class="text-secondary text-sm mb-4">${message}</p>
                <div class="flex gap-3 justify-center">
                    <button class="btn bg-placeholder text-secondary border-none rounded-lg px-4 py-2 cursor-pointer btn-cancelar">
                        ${cancelText}
                    </button>
                    <button class="btn bg-error-light text-error border-none rounded-lg px-4 py-2 cursor-pointer btn-confirmar">
                        ${confirmText}
                    </button>
                </div>
            </div>
        `;

        document.body.appendChild(overlay);
        if (window.lucide) window.lucide.createIcons();

        const btnConfirm = overlay.querySelector('.btn-confirmar');
        const btnCancel = overlay.querySelector('.btn-cancelar');

        const fechar = (result) => {
            overlay.classList.add('d-none');
            setTimeout(() => overlay.remove(), 200);
            resolve(result);
        };

        btnConfirm.addEventListener('click', () => fechar(true));
        btnCancel.addEventListener('click', () => fechar(false));
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) fechar(false);
        });
    });
};

// Inicializa quando o DOM estiver pronto
document.addEventListener('DOMContentLoaded', () => {
    window.app = new AdminApp();
});
