import { supabase } from '../core/supabaseClient.js';

export class mensagensController {
    constructor() {
        this.messages = [];
    }

    async init() {
        try {
            this.bindEvents();
            await this.loadMessages();
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao inicializar mensagens:', error);
            if (window.showToast) window.showToast('Erro ao carregar mensagens.', 'error');
        }
    }

    async loadMessages() {
        const tbody = document.getElementById('table-body-mensagens');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-secondary"><i data-lucide="loader" class="animate-spin mb-2 mx-auto"></i> Carregando mensagens...</td></tr>`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const { data, error } = await supabase
                .from('site_contacts')
                .select('*')
                .order('created_at', { ascending: false });

            if (error) throw error;
            this.messages = data || [];
            this.renderMessages();
        } catch (error) {
            console.error('Erro ao buscar mensagens:', error);
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Erro ao carregar os dados.</td></tr>`;
        }
    }

    renderMessages() {
        const tbody = document.getElementById('table-body-mensagens');
        if (!tbody) return;

        if (this.messages.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-secondary">Nenhuma mensagem recebida ainda.</td></tr>`;
            return;
        }

        let html = '';
        this.messages.forEach(msg => {
            const dateStr = new Date(msg.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });
            
            const isUnread = msg.status === 'unread';
            const rowClass = isUnread ? 'bg-primary-light bg-opacity-10 font-medium' : '';
            const statusBadge = isUnread 
                ? '<span class="badge bg-danger text-white text-xs px-2 py-0.5 rounded-full ml-2">Nova</span>' 
                : '';

            // Resumo da mensagem para não quebrar a tabela
            let snippet = msg.message.substring(0, 80);
            if (msg.message.length > 80) snippet += '...';

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors ${rowClass}">
                    <td class="py-3 px-4 text-sm text-secondary">${dateStr}</td>
                    <td class="py-3 px-4">
                        <div class="text-primary flex align-center">${msg.name} ${statusBadge}</div>
                        <div class="text-xs text-secondary mt-1">${msg.email}</div>
                    </td>
                    <td class="py-3 px-4 text-sm text-secondary" style="max-width: 300px;">
                        ${snippet}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div class="flex justify-center gap-2">
                            <button class="btn bg-primary-light text-primary border-none rounded px-2 py-1 cursor-pointer hover:bg-primary transition-colors hover:text-white btn-view-msg flex align-center gap-1 text-xs font-bold" data-id="${msg.id}" title="Visualizar">
                                <i data-lucide="eye" class="icon-sm m-0"></i> Ler
                            </button>
                            <button class="btn bg-warning-light text-warning border-none rounded px-2 py-1 cursor-pointer hover:bg-warning hover:text-white transition-colors btn-delete-msg flex align-center gap-1 text-xs font-bold" data-id="${msg.id}" title="Excluir Mensagem">
                                <i data-lucide="trash-2" class="icon-sm m-0"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    bindEvents() {
        const btnRefresh = document.getElementById('btn-refresh-mensagens');
        if (btnRefresh) {
            btnRefresh.addEventListener('click', () => this.loadMessages());
        }

        const btnMarkAll = document.getElementById('btn-mark-all-read-msgs');
        if (btnMarkAll) {
            btnMarkAll.addEventListener('click', async () => {
                try {
                    const { error } = await supabase.from('site_contacts').update({ status: 'read' }).eq('status', 'unread');
                    if(error) throw error;
                    if(window.showToast) window.showToast('Todas marcadas como lidas!', 'success');
                    this.loadMessages();
                } catch(err) {
                    console.error(err);
                }
            });
        }

        const btnCloseModal = document.getElementById('btn-close-modal-msg');
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                document.getElementById('modal-ver-mensagem').classList.add('d-none');
            });
        }

        // Tabela actions
        const tbody = document.getElementById('table-body-mensagens');
        if (tbody) {
            tbody.addEventListener('click', async (e) => {
                const btnView = e.target.closest('.btn-view-msg');
                if (btnView) {
                    const id = btnView.getAttribute('data-id');
                    this.viewMessage(id);
                    return;
                }

                const btnDelete = e.target.closest('.btn-delete-msg');
                if (btnDelete) {
                    const id = btnDelete.getAttribute('data-id');
                    if (window.showConfirm) {
                        window.showConfirm('Deseja realmente apagar esta mensagem permanentemente?', async () => {
                            try {
                                const { error } = await supabase.from('site_contacts').delete().eq('id', id);
                                if (error) throw error;
                                if (window.showToast) window.showToast('Mensagem apagada.', 'success');
                                this.loadMessages();
                            } catch (err) {
                                console.error('Erro ao deletar:', err);
                            }
                        });
                    }
                    return;
                }
            });
        }
    }

    async viewMessage(id) {
        const msg = this.messages.find(m => m.id == id);
        if(!msg) return;

        document.getElementById('msg-det-name').textContent = msg.name;
        document.getElementById('msg-det-email').textContent = msg.email;
        
        const wppEl = document.getElementById('msg-det-whatsapp');
        const btnWpp = document.getElementById('btn-reply-whatsapp');
        
        if(msg.whatsapp) {
            wppEl.textContent = msg.whatsapp;
            btnWpp.href = `https://wa.me/${msg.whatsapp.replace(/\D/g, '')}?text=Ol%C3%A1%20${encodeURIComponent(msg.name)}%2C%20somos%20do%20suporte%20da%20VitrineDesk.`;
            btnWpp.classList.remove('d-none');
        } else {
            wppEl.textContent = 'Não informado';
            btnWpp.classList.add('d-none');
        }

        document.getElementById('msg-det-body').textContent = msg.message;
        
        const btnEmail = document.getElementById('btn-reply-email');
        btnEmail.href = `mailto:${msg.email}?subject=Resposta%20ao%20seu%20contato%20-%20VitrineDesk`;

        document.getElementById('modal-ver-mensagem').classList.remove('d-none');

        // Mark as read if unread
        if(msg.status === 'unread') {
            msg.status = 'read';
            try {
                await supabase.from('site_contacts').update({ status: 'read' }).eq('id', id);
                this.renderMessages(); // update UI smoothly
            } catch(e) {}
        }
    }

    destroy() {
        // cleanup if needed
    }
}
