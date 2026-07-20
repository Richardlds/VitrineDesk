import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class suporteController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.allTickets = [];
        this.currentTicket = null;
        this.channel = null;
        this.chatMessagesEl = null;
    }
    
    async init() {
        this.chatMessagesEl = document.getElementById('tk-chat-messages');
        
        await this.loadChamados();
        this.bindEvents();
        this.subscribeToRealtime();
    }

    async loadChamados() {
        try {
            const tenantId = await getCurrentTenantId();
            const { data, error } = await supabase
                .from('support_tickets')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.allTickets = data || [];
            this.renderTicketList();
        } catch (error) {
            console.error('Erro ao carregar suporte:', error);
            if (window.showToast) window.showToast('Erro ao carregar chamados', 'error');
        }
    }

    renderTicketList() {
        const listEl = document.getElementById('tk-list');
        const search = document.getElementById('tk-search')?.value.toLowerCase() || '';
        
        if(!listEl) return;
        
        const filtered = this.allTickets.filter(t => {
            const subject = (t.subject || '').toLowerCase();
            return subject.includes(search);
        });

        if(filtered.length === 0) {
            listEl.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--color-text-tertiary);">Nenhum chamado encontrado.</div>`;
            return;
        }

        const getStatusBadge = (st) => {
            switch(st) {
                case 'open': case 'aberto': case 'pendente': return `<span class="badge bg-warning-light text-warning px-2 py-0 rounded text-[10px]">Aguardando</span>`;
                case 'in_progress': return `<span class="badge bg-primary-light text-primary px-2 py-0 rounded text-[10px]">Em And.</span>`;
                case 'resolved': case 'closed': case 'resolvido': return `<span class="badge bg-success-light text-success px-2 py-0 rounded text-[10px]">Resolvido</span>`;
                default: return `<span class="badge bg-placeholder text-secondary px-2 py-0 rounded text-[10px]">${st}</span>`;
            }
        };

        const escapeHtml = (unsafe) => {
            return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        };

        listEl.innerHTML = '';
        filtered.forEach(t => {
            const isActive = this.currentTicket && this.currentTicket.id === t.id;
            const dateObj = new Date(t.created_at);
            const time = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            const dateStr = dateObj.toLocaleDateString('pt-BR', {day: '2-digit', month: '2-digit'});
            
            const displayId = `TK-${String(t.id).padStart(4, '0')}`;
            
            const item = document.createElement('div');
            item.className = `wapp-chat-item ${isActive ? 'active' : ''}`;
            item.addEventListener('click', () => this.openChat(t.id));
            item.innerHTML = `
                <div class="wapp-chat-item-content">
                    <div class="wapp-chat-top">
                        <span class="wapp-chat-name">${escapeHtml(displayId)}</span>
                        <span class="wapp-chat-time">${dateStr}</span>
                    </div>
                    <div class="wapp-chat-bottom">
                        <span class="wapp-chat-preview">${escapeHtml(t.subject || 'Sem Assunto')}</span>
                        ${getStatusBadge(t.status)}
                    </div>
                </div>
            `;
            listEl.appendChild(item);
        });
    }

    async openChat(ticketId) {
        this.currentTicket = this.allTickets.find(t => t.id === ticketId);
        if(!this.currentTicket) return;

        this.renderTicketList();

        const t = this.currentTicket;
        document.getElementById('tk-chat-subject').textContent = t.subject || 'Sem Assunto';
        
        let statusBadge = '';
        if(t.status === 'open' || t.status === 'pendente') statusBadge = 'Aguardando Resposta';
        else if (t.status === 'in_progress') statusBadge = 'Em Andamento';
        else if (t.status === 'resolved' || t.status === 'closed') statusBadge = 'Resolvido';
        
        document.getElementById('tk-chat-status').textContent = statusBadge;

        // Show main area
        document.getElementById('tk-chat-placeholder').style.display = 'none';
        document.getElementById('tk-main-area').style.display = 'flex';
        
        // Hide input area if closed
        const inputArea = document.getElementById('form-chat-suporte');
        if (t.status === 'resolved' || t.status === 'closed') {
            inputArea.style.display = 'none';
        } else {
            inputArea.style.display = 'flex';
        }

        // Mobile responsiveness
        const container = document.querySelector('.wapp-container');
        if(container && window.innerWidth <= 768) {
            container.classList.add('mobile-show-chat');
        }

        await this.loadMessages();
    }

    bindEvents() {
        const modal = document.getElementById('modal-suporte');
        const btnNovo = document.getElementById('btn-novo-chamado');
        const btnClose = document.getElementById('btn-close-modal-suporte');
        const form = document.getElementById('form-suporte');
        const searchInput = document.getElementById('tk-search');
        const btnBack = document.getElementById('btn-tk-back');

        if (searchInput) {
            searchInput.addEventListener('input', () => this.renderTicketList());
        }

        if (btnBack) {
            btnBack.addEventListener('click', () => {
                const container = document.querySelector('.wapp-container');
                if(container) container.classList.remove('mobile-show-chat');
            });
        }

        if (btnNovo && modal) {
            btnNovo.addEventListener('click', () => {
                if(form) form.reset();
                modal.classList.remove('d-none');
            });
        }

        if (btnClose && modal) {
            btnClose.addEventListener('click', () => modal.classList.add('d-none'));
        }

        if (modal) {
            modal.addEventListener('click', (e) => {
                if (e.target === modal) modal.classList.add('d-none');
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btnSubmit = form.querySelector('button[type="submit"]');
                const originalText = btnSubmit.innerHTML;
                
                btnSubmit.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Enviando...`;
                btnSubmit.disabled = true;
                if(window.lucide) window.lucide.createIcons();

                try {
                    const tenantId = await getCurrentTenantId();
                    const payload = {
                        tenant_id: tenantId,
                        subject: document.getElementById('input-suporte-assunto').value,
                        category: document.getElementById('input-suporte-categoria').value,
                        status: 'open',
                        priority: 'normal'
                    };

                    // Insert ticket
                    const { data: ticket, error: ticketError } = await supabase
                        .from('support_tickets')
                        .insert([payload])
                        .select()
                        .single();

                    if (ticketError) throw ticketError;

                    // Insert initial message
                    const mensagemText = document.getElementById('input-suporte-mensagem').value;
                    const msgPayload = {
                        ticket_id: ticket.id,
                        sender_type: 'tenant',
                        message: mensagemText
                    };
                    await supabase.from('support_messages').insert([msgPayload]);

                    // Notificação para o God Mode agora é feita por Trigger (trigger_notify_god_on_new_ticket)

                    if (window.showToast) window.showToast('Chamado aberto com sucesso!', 'success');
                    modal.classList.add('d-none');
                    await this.loadChamados();
                    this.openChat(ticket.id); // Abre o novo chat automaticamente
                } catch (err) {
                    console.error(err);
                    if (window.showToast) window.showToast('Erro ao abrir chamado.', 'error');
                } finally {
                    btnSubmit.innerHTML = originalText;
                    btnSubmit.disabled = false;
                }
            });
        }
        
        const formChat = document.getElementById('form-chat-suporte');

        if (formChat) {
            formChat.addEventListener('submit', async (e) => {
                e.preventDefault();
                if (!this.currentTicket) return;
                
                const inputMsg = document.getElementById('tk-chat-input');
                const msgText = inputMsg.value.trim();
                if(!msgText) return;

                const btnSubmit = document.getElementById('btn-send-ticket-message');
                const originalHtml = btnSubmit.innerHTML;
                btnSubmit.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i>`;
                btnSubmit.disabled = true;
                inputMsg.disabled = true;

                try {
                    const msgPayload = {
                        ticket_id: this.currentTicket.id,
                        sender_type: 'tenant',
                        message: msgText
                    };
                    await supabase.from('support_messages').insert([msgPayload]);

                    await supabase.from('support_tickets')
                        .update({ updated_at: new Date().toISOString() })
                        .eq('id', this.currentTicket.id);

                    // Notificação para o God Mode agora é feita por Trigger (trigger_notify_god_on_ticket_reply)

                    inputMsg.value = '';
                    this.loadMessages(); // reload chat
                } catch (err) {
                    console.error('Erro ao enviar mensagem:', err);
                    if (window.showToast) window.showToast('Erro ao enviar mensagem', 'error');
                } finally {
                    btnSubmit.innerHTML = originalHtml;
                    btnSubmit.disabled = false;
                    inputMsg.disabled = false;
                    inputMsg.focus();
                    if(window.lucide) window.lucide.createIcons();
                }
            });
        }
    }

    async loadMessages() {
        if (!this.currentTicket || !this.chatMessagesEl) return;
        
        this.chatMessagesEl.innerHTML = `
            <div class="flex flex-col gap-2 p-3">
                <div class="skeleton" style="height: 40px; width: 70%; align-self: flex-start; border-radius: 8px;"></div>
                <div class="skeleton" style="height: 40px; width: 60%; align-self: flex-end; border-radius: 8px;"></div>
            </div>`;

        try {
            const { data, error } = await supabase
                .from('support_messages')
                .select('*')
                .eq('ticket_id', this.currentTicket.id)
                .order('created_at', { ascending: true });

            if (error) throw error;
            this.renderMessages(data || []);
        } catch (error) {
            console.error('Erro ao carregar mensagens:', error);
            this.chatMessagesEl.innerHTML = `<div class="text-center text-danger text-sm p-4">Erro ao carregar mensagens.</div>`;
        }
    }

    renderMessages(messages) {
        if (!this.chatMessagesEl) return;
        if (messages.length === 0) {
            this.chatMessagesEl.innerHTML = `<div class="text-center text-secondary text-sm p-4">Nenhuma mensagem neste chamado.</div>`;
            return;
        }

        let html = '';
        messages.forEach(msg => {
            const isMe = msg.sender_type === 'tenant';
            const dateObj = new Date(msg.created_at);
            const time = dateObj.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            
            const alignClass = isMe ? 'wapp-msg-right' : 'wapp-msg-left';
            
            // Format line breaks
            const formattedMsg = (msg.message || '').replace(/\n/g, '<br>');

            html += `
                <div class="wapp-msg ${alignClass}">
                    <div class="wapp-bubble">
                        <div class="wapp-text">${formattedMsg}</div>
                        <div class="wapp-meta">${time}</div>
                    </div>
                </div>
            `;
        });

        this.chatMessagesEl.innerHTML = html;
        this.chatMessagesEl.scrollTop = this.chatMessagesEl.scrollHeight;
    }

    subscribeToRealtime() {
        if (this.channel) return;
        this.channelName = 'tenant-tickets-messages-' + Date.now();
        this.channel = supabase.channel(this.channelName)
            .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'support_messages' }, (payload) => {
                if (this.currentTicket && payload.new.ticket_id === this.currentTicket.id) {
                    this.loadMessages();
                }
            })
            .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'support_tickets' }, (payload) => {
                if (this.currentTicket && payload.new.id === this.currentTicket.id) {
                    this.openChat(payload.new.id);
                }
                this.loadChamados();
            })
            .subscribe();
    }
    
    destroy() {
        if (this.channel) {
            supabase.removeChannel(this.channel);
            this.channel = null;
        }
    }
}
