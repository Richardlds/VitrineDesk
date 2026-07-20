import { Router } from './Router.js';
import { supabase } from './supabaseClient.js';

class SuperAdminApp {
    constructor() {
        // Inicialização básica sem disparar rotas
        this.router = new Router();
        this.initSidebar();
        this.initLogout();
    }

    async boot() {
        // 1. Tentar carregar a sessão master e montar o header
        const isAuthenticated = await this.initUserProfile();

        // 2. Só dispara o router (injetar tela) se estiver autenticado
        if (isAuthenticated) {
            this.router.handleRoute();
        }
    }

    async initUserProfile() {
        const nameEl = document.getElementById('profile-name-ph');
        const emailEl = document.getElementById('profile-email-ph');
        const avatarEl = document.getElementById('profile-avatar-ph');
        if (!nameEl) return false;

        try {
            const { data: authData } = await supabase.auth.getUser();

            if (!authData?.user) {
                window.location.href = '/admingod/login';
                return false;
            }

            // A role ou claim que define se o usuário é superadmin.
            // Aqui estamos assumindo que o login foi validado pelo Supabase.
            const userEmail = authData.user.email;

            if (nameEl) nameEl.textContent = 'Master Admin';
            if (emailEl) emailEl.textContent = userEmail;
            
            if (avatarEl) {
                avatarEl.classList.remove('skeleton', 'sk-avatar');
                avatarEl.className = "w-40px h-40px rounded-full bg-danger flex align-center justify-center text-white font-bold shadow-sm bg-gradient-danger";
                avatarEl.innerHTML = `<i data-lucide="zap" class="icon-sm"></i>`;
            }
            if (window.lucide) window.lucide.createIcons();

            this.initGodNotifications();
            return true;

        } catch (error) {
            console.error('Erro ao verificar sessão do Super Admin:', error);
            window.location.href = '/admingod/login';
            return false;
        }
    }

    initSidebar() {
        const toggles = document.querySelectorAll('.menu-toggle');
        const sidebar = document.getElementById('sidebar');

        if (sidebar && toggles.length > 0) {
            toggles.forEach(btn => {
                btn.addEventListener('click', () => {
                    sidebar.classList.toggle('open');
                });
            });
        }
    }

    initLogout() {
        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', async () => {
                const { error } = await supabase.auth.signOut();
                if (error) console.error('Erro ao fazer logout:', error.message);
                window.location.href = '/admingod/login';
            });
        }
    }

    initGodNotifications() {
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
                                <option value="all">Categorias (GOD)</option>
                                <option value="tenant_signup">Novos Lojistas</option>
                                <option value="billing">Financeiro</option>
                                <option value="support">Suporte</option>
                                <option value="system">Avisos de Sistema</option>
                                <option value="update">Atualizações</option>
                            </select>
                            <select id="drawer-status-select" class="w-100 bg-placeholder border-dashed rounded-md px-2 py-2 text-primary outline-none text-sm cursor-pointer drawer-filter-select" style="flex: 1;">
                                <option value="all">Lidas/Não Lidas</option>
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

        let currentDrawerCategory = 'all';
        let currentDrawerStatus = 'all';

        const escapeHTML = (str) => str ? str.replace(/[&<>'"`]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;' }[tag] || tag)) : '';

        const renderDrawerNotifications = () => {
            if (!cachedNotifs || cachedNotifs.length === 0) {
                drawerList.innerHTML = '<div class="p-8 text-center text-secondary flex-col align-center justify-center h-100"><i data-lucide="bell-off" class="icon-lg opacity-50 mb-3"></i><p class="text-sm">Nenhuma notificação por aqui.</p></div>';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            const filtered = cachedNotifs.filter(n => {
                const matchCategory = currentDrawerCategory === 'all' || n.type === currentDrawerCategory;
                const matchStatus = currentDrawerStatus === 'all' || (currentDrawerStatus === 'unread' ? !n.read : n.read);
                return matchCategory && matchStatus;
            });

            if (filtered.length === 0) {
                drawerList.innerHTML = '<div class="p-8 text-center text-secondary flex-col align-center justify-center h-100"><i data-lucide="filter" class="icon-lg opacity-50 mb-3"></i><p class="text-sm">Nenhuma notificação nos filtros selecionados.</p></div>';
                if (window.lucide) window.lucide.createIcons();
                return;
            }

            drawerList.innerHTML = filtered.map(n => {
                const isUpdate = n.type === 'update';
                let icon = isUpdate ? 'zap' : (n.type === 'system' ? 'settings' : 'info');
                let colorClass = isUpdate ? 'text-primary' : 'text-secondary';
                let label = isUpdate ? 'Atualização' : (n.type === 'system' ? 'Aviso do Sistema' : 'Informação Geral');
                let textColor = isUpdate ? 'var(--color-primary)' : 'var(--color-text-primary)';

                if (n.type === 'tenant_signup') {
                    icon = 'user-plus';
                    label = 'Novo Lojista';
                    colorClass = 'text-success';
                    textColor = 'var(--color-success)';
                } else if (n.type === 'billing') {
                    icon = 'dollar-sign';
                    label = 'Financeiro';
                } else if (n.type === 'support') {
                    icon = 'life-buoy';
                    label = 'Suporte';
                    colorClass = 'text-warning';
                    textColor = 'var(--color-warning)';
                } else if (n.type === 'alert' || n.type === 'system') {
                    icon = 'alert-triangle';
                    label = 'Alerta de Sistema';
                    colorClass = 'text-danger';
                    textColor = 'var(--color-danger)';
                }

                return `
                <div class="notif-card ${n.read ? '' : 'unread'} cursor-pointer" onclick="window.openGodNotificationDetail('${n.id}')">
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

        const drawerSelect = document.getElementById('drawer-category-select');
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
            drawerOverlay.classList.add('open');
            drawerPanel.classList.add('open');
            loadDrawerNotifications();
        };
        const closeDrawer = () => {
            drawerOverlay.classList.remove('open');
            drawerPanel.classList.remove('open');
        };

        btnNotif?.addEventListener('click', openDrawer);
        btnCloseDrawer?.addEventListener('click', closeDrawer);
        drawerOverlay?.addEventListener('click', closeDrawer);

        btnReadAllDrawer?.addEventListener('click', async () => {
            btnReadAllDrawer.innerHTML = '<i data-lucide="loader" class="animate-spin icon-xs"></i> Lidas';
            if (window.lucide) window.lucide.createIcons();
            try {
                // GOD é tenant nulo
                await supabase.from('notifications').update({ read: true }).eq('type', 'superadmin_alert').eq('read', false);
                badgeNotif.classList.add('d-none');
                cachedNotifs.forEach(n => n.read = true);
                renderDrawerNotifications();
                showToast('Notificações marcadas como lidas', 'success');
            } catch (err) {
                console.error(err);
            } finally {
                btnReadAllDrawer.innerHTML = '<i data-lucide="check-check" class="icon-xs"></i>';
                if (window.lucide) window.lucide.createIcons();
            }
        });

        const btnClearAllDrawer = document.getElementById('btn-clear-all-drawer');
        btnClearAllDrawer?.addEventListener('click', async () => {
            showToast('Limpando notificações...', 'info');
            try {
                await supabase.from('notifications').delete().eq('type', 'superadmin_alert');
                cachedNotifs = [];
                badgeNotif.classList.add('d-none');
                renderDrawerNotifications();
                showToast('Notificações limpas!', 'success');
            } catch (err) {
                console.error(err);
                showToast('Erro ao limpar notificações', 'error');
            }
        });

        // Limpeza automática (7 dias) no banco (executa background)
        setTimeout(async () => {
            const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            await supabase.from('notifications').delete().eq('type', 'superadmin_alert').lt('created_at', sevenDaysAgo);
        }, 3000);

        const checkUnreadNotifications = async () => {
            try {
                const { count, error } = await supabase.from('notifications')
                    .select('*', { count: 'exact', head: true })
                    .eq('type', 'superadmin_alert')
                    .eq('read', false);
                if (!error && count > 0) badgeNotif.classList.remove('d-none');
                else badgeNotif.classList.add('d-none');
            } catch (e) { }
        };

        // Supabase Realtime para notificações Master (God)
        const setupRealtimeNotifications = () => {
            supabase.channel('god-notifications')
                .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'notifications', filter: `type=eq.superadmin_alert` }, (payload) => {
                    const newNotif = payload.new;

                    badgeNotif.classList.remove('d-none');
                    // Add pop animation
                    badgeNotif.classList.remove('badge-pop');
                    void badgeNotif.offsetWidth; // trigger reflow
                    badgeNotif.classList.add('badge-pop');
                    
                    if (window.playNotificationSound) window.playNotificationSound(4);

                    if (cachedNotifs && Array.isArray(cachedNotifs)) {
                        cachedNotifs.unshift(newNotif);
                        if (document.getElementById('drawer-notifications').classList.contains('open')) {
                            renderDrawerNotifications();
                        }
                    }

                    window.dispatchEvent(new CustomEvent('new_notification_god', { detail: newNotif }));

                    const isUpdate = newNotif.type === 'update';
                    const toastHtml = `
                        <div style="display: flex; flex-direction: column; gap: 4px;">
                            <strong class="text-sm">Nova Notificação Recebida!</strong>
                            <span style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
                                ${newNotif.message}
                            </span>
                            <span style="font-size: 10px; color: var(--color-primary); font-weight: bold; margin-top: 2px;">Clique para abrir detalhes</span>
                        </div>
                    `;
                    showToast(toastHtml, isUpdate ? 'warning' : 'info', () => {
                        if (typeof window.openGodNotificationDetail === 'function') {
                            window.openGodNotificationDetail(newNotif.id);
                        }
                    });
                })
                .subscribe();
        };
        setupRealtimeNotifications();



        const loadDrawerNotifications = async () => {
            drawerList.innerHTML = '<div class="p-6 text-center text-secondary"><i data-lucide="loader" class="animate-spin icon-sm"></i><p class="mt-2 text-sm">Carregando...</p></div>';
            if (window.lucide) window.lucide.createIcons();
            try {
                const { data: notifs, error } = await supabase.from('notifications')
                    .select('*')
                    .eq('type', 'superadmin_alert')
                    .order('created_at', { ascending: false })
                    .limit(20);
                if (error) throw error;
                cachedNotifs = notifs;
                renderDrawerNotifications();
            } catch (e) {
                drawerList.innerHTML = '<div class="p-4 text-center text-danger text-sm">Erro ao carregar notificações.</div>';
            }
        };

        window.injectMockNotification = (type = 'superadmin_alert', msg = 'Este é um teste de notificação visual do GOD Mode.') => {
            const newNotif = {
                id: 'mock-' + Date.now(),
                type: type,
                message: msg,
                read: false,
                created_at: new Date().toISOString()
            };
            
            badgeNotif?.classList.remove('d-none');
            // Add pop animation
            badgeNotif?.classList.remove('badge-pop');
            void badgeNotif?.offsetWidth; // trigger reflow
            badgeNotif?.classList.add('badge-pop');
            
            if (window.playNotificationSound) window.playNotificationSound(4);
            
            if (cachedNotifs && Array.isArray(cachedNotifs)) {
                cachedNotifs.unshift(newNotif);
                if (document.getElementById('drawer-notifications')?.classList.contains('open')) {
                    renderDrawerNotifications();
                }
            }
            window.dispatchEvent(new CustomEvent('new_notification_god', { detail: newNotif }));
            
            const toastHtml = `
                <div style="display: flex; flex-direction: column; gap: 4px;">
                    <strong class="text-sm">Nova Notificação Recebida!</strong>
                    <span style="font-size: 12px; opacity: 0.9; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 250px;">
                        ${msg}
                    </span>
                    <span style="font-size: 10px; color: var(--color-primary); font-weight: bold; margin-top: 2px;">Clique para abrir detalhes</span>
                </div>
            `;
            if (window.showToast) window.showToast(toastHtml, 'info');
        };

        // Injeta HTML do Pop-up (mesmo do admin para manter consistência)
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
        const closePopup = () => modalNotifPopup.classList.add('d-none');
        document.getElementById('btn-close-notif-popup')?.addEventListener('click', closePopup);
        document.getElementById('btn-ok-notif-popup')?.addEventListener('click', closePopup);
        modalNotifPopup?.addEventListener('click', (e) => { if (e.target === modalNotifPopup) closePopup(); });

        window.openGodNotificationDetail = async (id) => {
            closeDrawer();
            let notif = cachedNotifs.find(n => n.id === id);
            if (!notif) {
                const { data } = await supabase.from('notifications').select('*').eq('id', id).single();
                if (data) notif = data;
            }
            if (notif) {
                document.getElementById('popup-notif-message').textContent = notif.message;
                document.getElementById('popup-notif-date').textContent = new Date(notif.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
                const typeLabel = document.getElementById('popup-notif-type');
                const title = document.getElementById('popup-notif-title');
                const icon = document.getElementById('popup-notif-icon');
                
                const isUpdate = notif.type === 'update';
                let iconName = isUpdate ? 'zap' : (notif.type === 'system' ? 'settings' : 'info');
                let colorClass = isUpdate ? 'var(--color-primary)' : 'var(--color-text-primary)';
                let labelText = isUpdate ? 'Atualização' : (notif.type === 'system' ? 'Aviso do Sistema' : 'Informação Geral');

                if (notif.type === 'tenant_signup') {
                    iconName = 'user-plus'; labelText = 'Novo Lojista'; colorClass = 'var(--color-success)';
                } else if (notif.type === 'billing') {
                    iconName = 'dollar-sign'; labelText = 'Financeiro'; colorClass = 'var(--color-text-primary)';
                } else if (notif.type === 'support') {
                    iconName = 'life-buoy'; labelText = 'Suporte'; colorClass = 'var(--color-warning)';
                } else if (notif.type === 'alert' || notif.type === 'system') {
                    iconName = 'alert-triangle'; labelText = 'Alerta'; colorClass = 'var(--color-danger)';
                }

                title.textContent = labelText;
                typeLabel.textContent = notif.type.toUpperCase();
                typeLabel.style.color = colorClass;
                icon.setAttribute('data-lucide', iconName);
                icon.style.color = colorClass;
                
                if (window.lucide) window.lucide.createIcons();
                modalNotifPopup.classList.remove('d-none');

                // Botão Excluir
                const btnDelete = document.getElementById('btn-delete-notif-popup');
                btnDelete.onclick = async () => {
                    const originalHtml = btnDelete.innerHTML;
                    btnDelete.innerHTML = '<i data-lucide="loader" class="animate-spin icon-sm"></i>';
                    if (window.lucide) window.lucide.createIcons();
                    try {
                        if (!id.toString().startsWith('mock-')) {
                            await supabase.from('notifications').delete().eq('id', id);
                        }
                        cachedNotifs = cachedNotifs.filter(n => n.id !== id);
                        checkUnreadNotifications();
                        renderDrawerNotifications();
                        closePopup();
                        showToast('Notificação excluída!', 'success');

                        const navLink = document.querySelector('a[data-route="notificacoes"]');
                        if (navLink && document.querySelector('#sent-notifications-list')) navLink.click();
                    } catch (e) {
                        console.error(e);
                        showToast('Erro ao excluir', 'error');
                        btnDelete.innerHTML = originalHtml;
                        if (window.lucide) window.lucide.createIcons();
                    }
                };

                if (!notif.read && notif.target === 'master') {
                    notif.read = true;
                    supabase.from('notifications').update({ read: true }).eq('id', id).then(() => {
                        checkUnreadNotifications();
                        loadDrawerNotifications();
                    });
                }
            }
        };

        checkUnreadNotifications();
    }
}

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

// Global Toast functionality
window.showToast = function (message, type = 'success', onClick = null) {
    // Remove toast anterior se existir
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;

    // Ícone dependendo do tipo
    let iconName = 'check-circle';
    if (type === 'error' || type === 'danger') iconName = 'alert-circle';
    if (type === 'warning') iconName = 'alert-triangle';

    toast.innerHTML = `
        <div class="flex align-center gap-2">
            <i data-lucide="${iconName}"></i>
            <span>${message}</span>
        </div>
    `;

    if (typeof onClick === 'function') {
        toast.style.cursor = 'pointer';
        toast.addEventListener('click', onClick);
    }

    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons();
    
    // Trigger reflow to ensure the transition happens
    toast.offsetHeight;
    toast.classList.add('show');

    setTimeout(() => {
        toast.classList.remove('show');
        setTimeout(() => toast.remove(), 400); // 400ms matches the CSS transition time
    }, 3000);
};

// Global Confirm functionality
window.showConfirm = function (message, onConfirm) {
    const modal = document.getElementById('global-confirm-modal');
    const msgEl = document.getElementById('global-confirm-message');
    const btnOk = document.getElementById('btn-global-confirm-ok');
    const btnCancel = document.getElementById('btn-global-confirm-cancel');

    if (!modal) {
        console.error('Global Confirm Modal not found!');
        return;
    }

    msgEl.textContent = message;
    modal.classList.remove('d-none');

    // Clean up old event listeners by cloning nodes if necessary, or just overwrite onclick
    btnOk.onclick = () => {
        modal.classList.add('d-none');
        onConfirm();
    };

    btnCancel.onclick = () => {
        modal.classList.add('d-none');
    };
};

// Global Prompt functionality
window.showPrompt = function (message, placeholder, onConfirm) {
    const modal = document.getElementById('global-prompt-modal');
    const msgEl = document.getElementById('global-prompt-message');
    const inputEl = document.getElementById('input-global-prompt');
    const btnOk = document.getElementById('btn-global-prompt-ok');
    const btnCancel = document.getElementById('btn-global-prompt-cancel');

    if (!modal) {
        console.error('Global Prompt Modal not found!');
        return;
    }

    msgEl.textContent = message;
    inputEl.placeholder = placeholder || 'Digite aqui...';
    inputEl.value = '';
    modal.classList.remove('d-none');
    inputEl.focus();

    btnOk.onclick = () => {
        modal.classList.add('d-none');
        onConfirm(inputEl.value);
    };

    btnCancel.onclick = () => {
        modal.classList.add('d-none');
        onConfirm(null);
    };

    inputEl.onkeyup = (e) => {
        if (e.key === 'Enter') {
            btnOk.click();
        } else if (e.key === 'Escape') {
            btnCancel.click();
        }
    };
};

// Start App
document.addEventListener('DOMContentLoaded', async () => {
    window.superAdminApp = new SuperAdminApp();
    if (window.lucide) window.lucide.createIcons();
    await window.superAdminApp.boot();
});
