import { supabase } from '../core/supabaseClient.js';

const escapeHTML = (str) => {
    return (str || '').replace(/&/g, "&amp;")
                      .replace(/</g, "&lt;")
                      .replace(/>/g, "&gt;")
                      .replace(/"/g, "&quot;")
                      .replace(/'/g, "&#039;");
};

export class notificacoesController {
    constructor() {
        this.sentList = null;
        this.allSentNotifs = [];
        this.currentFilter = 'all';
    }

    async init() {
        if (window.lucide) window.lucide.createIcons();

        const form = document.getElementById('form-send-notification');
        const selectTenant = document.getElementById('select-notif-tenant');
        this.sentList = document.getElementById('sent-notifications-list');

        // 1. Carregar tenants (Lojistas)
        try {
            const { data: tenants, error } = await supabase.from('tenants').select('id, name').order('name');
            if (!error && tenants) {
                tenants.forEach(t => {
                    const opt = document.createElement('option');
                    opt.value = t.id;
                    opt.textContent = t.name;
                    selectTenant.appendChild(opt);
                });
            }
        } catch (err) {
            console.error('Erro ao carregar tenants', err);
        }

        // 2. Disparar Notificação
        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                
                const btn = document.getElementById('btn-submit-notif');
                const originalHtml = btn.innerHTML;
                btn.innerHTML = '<i data-lucide="loader" class="animate-spin icon-sm"></i> Disparando...';
                btn.disabled = true;
                if (window.lucide) window.lucide.createIcons();

                const dest = document.getElementById('select-notif-tenant').value;
                const type = document.getElementById('select-notif-type').value;
                const msg = document.getElementById('input-notif-message').value;

                try {
                    if (dest === 'ALL') {
                        // Pega todos os tenants reais e manda pra cada um
                        const { data: allTenants } = await supabase.from('tenants').select('id');
                        const inserts = allTenants.map(t => ({
                            tenant_id: t.id,
                            type: type,
                            message: msg,
                            read: false
                        }));
                        const { error } = await supabase.from('notifications').insert(inserts);
                        if (error) throw error;
                        window.showToast('Notificação enviada para todos os lojistas!', 'success');
                    } else if (dest === 'GOD') {
                        // Notificação de sistema global
                        const { error } = await supabase.from('notifications').insert({
                            tenant_id: null,
                            type: type,
                            message: msg,
                            read: false
                        });
                        if (error) throw error;
                        window.showToast('Notificação global do sistema enviada!', 'success');
                    } else {
                        // Loja Específica
                        const { error } = await supabase.from('notifications').insert({
                            tenant_id: dest,
                            type: type,
                            message: msg,
                            read: false
                        });
                        if (error) throw error;
                        window.showToast('Notificação enviada para a loja!', 'success');
                    }

                    form.reset();
                    await this.loadRecent();
                } catch (err) {
                    console.error('Erro ao enviar', err);
                    window.showToast('Erro ao enviar notificação.', 'error');
                } finally {
                    btn.innerHTML = originalHtml;
                    btn.disabled = false;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        }

        const selectFilter = document.getElementById('notif-category-select');
        if (selectFilter) {
            selectFilter.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.renderRecent();
            });
        }

        // 3. Carrega Histórico na Inicialização
        await this.loadRecent();

        // 4. Listener para realtime do GOD
        window.addEventListener('new_notification_god', (e) => {
            const newNotif = e.detail;
            if (newNotif) {
                this.allNotifs.unshift(newNotif);
                this.renderRecent();
            }
        });
    }

    async loadRecent() {
        if (!this.sentList) return;
        try {
            const { data, error } = await supabase.from('notifications')
                .select('*, tenants(name)')
                .order('created_at', { ascending: false })
                .limit(50);
            
            if (error) throw error;
            this.allSentNotifs = data || [];
            this.renderRecent();
        } catch (err) {
            console.error(err);
            this.sentList.innerHTML = '<div class="text-center text-danger text-sm p-4">Erro ao carregar histórico.</div>';
        }
    }

    renderRecent() {
        if (!this.allSentNotifs || this.allSentNotifs.length === 0) {
            this.sentList.innerHTML = '<div class="text-center text-secondary text-sm p-4"><i data-lucide="inbox" class="icon-lg opacity-50 mb-2"></i><br>Nenhum disparo recente.</div>';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        const filtered = this.currentFilter === 'all' 
            ? this.allSentNotifs 
            : (this.currentFilter === 'read' ? this.allSentNotifs.filter(n => n.read) 
            : (this.currentFilter === 'unread' ? this.allSentNotifs.filter(n => !n.read) 
            : this.allSentNotifs.filter(n => n.type === this.currentFilter)));

        if (filtered.length === 0) {
            this.sentList.innerHTML = '<div class="text-center text-secondary text-sm p-4"><i data-lucide="filter" class="icon-lg opacity-50 mb-2"></i><br>Nenhuma notificação nesta categoria.</div>';
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        this.sentList.innerHTML = filtered.map(n => {
            const isUpdate = n.type === 'update';
            const destName = n.tenant_id ? (n.tenants?.name || 'Loja Específica') : 'Todos/Sistema';
            return `
                <div class="p-3 rounded-md flex-col gap-1 border border-dashed transition-colors cursor-pointer" onclick="window.openGodNotificationDetail('${n.id}')" style="background: var(--color-bg-base); border-color: var(--color-border);">
                    <div class="flex justify-between align-center">
                        <div class="flex align-center gap-2" style="white-space: nowrap;">
                            <i data-lucide="${isUpdate ? 'zap' : (n.type === 'system' ? 'settings' : 'info')}" class="icon-sm ${isUpdate ? 'text-primary' : 'text-secondary'}" style="flex-shrink: 0;"></i>
                            <span class="text-xs font-bold uppercase" style="color: ${isUpdate ? 'var(--color-primary)' : 'var(--color-text-primary)'}; white-space: nowrap;">${isUpdate ? 'Atualização' : (n.type === 'system' ? 'Aviso do Sistema' : 'Informação Geral')}</span>
                        </div>
                        <span class="text-xs text-secondary opacity-70">${new Date(n.created_at).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</span>
                    </div>
                    <div class="text-xs text-secondary mb-1">Para: <strong>${destName}</strong></div>
                    <p class="text-sm text-primary m-0" style="line-height: 1.4; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;">${escapeHTML(n.message)}</p>
                </div>
            `;
        }).join('');
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        // Cleanup if needed
    }
}
