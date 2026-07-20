import { supabase } from '../core/supabaseClient.js';

export class ticketsController {
    constructor() {
        this.allTickets = [];
        this.currentTicket = null;
        this.realtimeChannel = null;
    }
    
    async init() {
        this.currentFilter = 'todos'; // 'todos', 'pendente', 'financeiro', 'nova_loja', 'resolvido'

        document.getElementById('tk-search')?.addEventListener('input', () => this.renderTicketList());
        
        // Configura os botões de catalogação
        document.querySelectorAll('.wapp-cat-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.wapp-cat-btn').forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                this.currentFilter = e.currentTarget.getAttribute('data-cat');
                this.loadTickets();
            });
        });
        
        document.getElementById('tk-chat-input')?.addEventListener('keypress', (e) => {
            if(e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });
        
        document.getElementById('tk-action-status')?.addEventListener('change', (e) => this.updateTicketField('status', e.target.value));
        document.getElementById('tk-action-category')?.addEventListener('change', (e) => this.updateTicketField('category', e.target.value));
        document.getElementById('btn-resolve-ticket')?.addEventListener('click', () => this.updateTicketField('status', 'resolved'));
        document.getElementById('btn-send-ticket-message')?.addEventListener('click', () => this.sendMessage());
        
        document.getElementById('btn-tk-back')?.addEventListener('click', () => {
            const container = document.querySelector('.wapp-container');
            if(container) container.classList.remove('mobile-show-chat');
            this.currentTicket = null;
            this.renderTicketList(); // Remove "active" class
        });

        await this.loadTickets();

        // Supabase Realtime Subscription
        const channelName = `superadmin-tickets-${Date.now()}`;
        this.realtimeChannel = supabase.channel(channelName)
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_tickets' }, () => {
                if (document.getElementById('tk-list')) {
                    this.loadTickets(true);
                }
            })
            .on('postgres_changes', { event: '*', schema: 'public', table: 'support_messages' }, (payload) => {
                if (document.getElementById('tk-list')) {
                    if (this.currentTicket && payload.new && payload.new.ticket_id === this.currentTicket.id) {
                        this.loadMessages(this.currentTicket.id, true);
                    }
                }
            })
            .subscribe();
            
        if (window.lucide) window.lucide.createIcons();
    }

    async loadTickets(isPolling = false) {
        try {
            const statusFilt = document.getElementById('tk-filter-status')?.value || 'todos';
            const catFilt = document.getElementById('tk-filter-category')?.value || 'todas';
            
            let query = supabase.from('support_tickets').select(`
                *,
                tenants ( name )
            `).order('updated_at', { ascending: false });

            if(this.currentFilter === 'pendente') {
                query = query.in('status', ['open', 'in_progress', 'aberto', 'pendente']);
            } else if (this.currentFilter === 'resolvido') {
                query = query.in('status', ['resolved', 'closed', 'resolvido']);
            } else if (this.currentFilter !== 'todos') {
                query = query.eq('category', this.currentFilter);
            }

            const { data, error } = await query;
            if(error) throw error;
            
            this.allTickets = data || [];
            this.renderTicketList();
            
        } catch(err) {
            if(!isPolling) console.error('Erro ao carregar tickets:', err);
        }
    }

    renderTicketList() {
        const listEl = document.getElementById('tk-list');
        const search = document.getElementById('tk-search')?.value.toLowerCase() || '';
        
        if(!listEl) return;
        
        const filtered = this.allTickets.filter(t => {
            const tenantName = (t.tenants?.name || t.contact_email || '').toLowerCase();
            const subject = (t.subject || '').toLowerCase();
            return tenantName.includes(search) || subject.includes(search);
        });

        if(filtered.length === 0) {
            listEl.innerHTML = `<div style="padding: 2rem; text-align: center; color: var(--text-tertiary);">Nenhum chamado encontrado.</div>`;
            return;
        }

        const getStatusBadge = (st) => {
            switch(st) {
                case 'open': case 'aberto': case 'pendente': return `<span class="badge bg-warning-light text-warning px-2 py-0 rounded text-[10px]">Aberto</span>`;
                case 'in_progress': return `<span class="badge bg-primary-light text-primary px-2 py-0 rounded text-[10px]">Em And.</span>`;
                case 'resolved': case 'resolvido': return `<span class="badge bg-success-light text-success px-2 py-0 rounded text-[10px]">Fechado</span>`;
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
            
            const tenantName = t.tenants?.name || (t.contact_email ? t.contact_email : 'Loja Desconhecida');
            
            const item = document.createElement('div');
            item.className = `wapp-chat-item ${isActive ? 'active' : ''}`;
            item.addEventListener('click', () => this.openTicket(t.id));
            item.innerHTML = `
                <div class="wapp-chat-item-content">
                    <div class="wapp-chat-top">
                        <span class="wapp-chat-name">${escapeHtml(tenantName)}</span>
                        <span class="wapp-chat-time">${dateStr} ${time}</span>
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

    async openTicket(ticketId) {
        this.currentTicket = this.allTickets.find(t => t.id === ticketId);
        if(!this.currentTicket) return;

        this.renderTicketList();

        const t = this.currentTicket;
        const tenantName = t.tenants?.name || (t.contact_email ? `Email: ${t.contact_email}` : 'Loja Desconhecida');

        const container = document.querySelector('.wapp-container');
        if(container) container.classList.add('mobile-show-chat');

        document.getElementById('tk-chat-placeholder').style.display = 'none';
        const chatActive = document.getElementById('tk-main-area');
        chatActive.style.display = 'flex';
        
        document.getElementById('tk-chat-subject').textContent = t.subject || 'Sem Assunto';
        document.getElementById('tk-chat-tenant').textContent = tenantName;
        
        const selStatus = document.getElementById('tk-action-status');
        if(selStatus) {
            selStatus.value = (t.status === 'aberto' || t.status === 'pendente') ? 'open' : (t.status === 'resolvido' ? 'resolved' : t.status);
        }

        const selCat = document.getElementById('tk-action-category');
        if(selCat) {
            selCat.value = t.category || 'duvida';
        }

        const getStatusBadge = (st) => {
            switch(st) {
                case 'open': case 'aberto': case 'pendente': return `<span class="badge bg-warning-light text-warning text-xs px-2 py-1 rounded">Aberto</span>`;
                case 'in_progress': return `<span class="badge bg-primary-light text-primary text-xs px-2 py-1 rounded">Em Andamento</span>`;
                case 'resolved': case 'resolvido': return `<span class="badge bg-success-light text-success text-xs px-2 py-1 rounded">Fechado</span>`;
                default: return `<span class="badge bg-placeholder text-secondary text-xs px-2 py-1 rounded">${st}</span>`;
            }
        };

        document.getElementById('tk-chat-status').innerHTML = getStatusBadge(this.currentTicket.status);

        const isClosed = ['resolved', 'closed', 'resolvido'].includes(this.currentTicket.status);
        document.getElementById('tk-chat-input-area').style.display = isClosed ? 'none' : 'flex';

        // Fechar canal anterior se houver
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }

        // Dinamicamente cria o canal com timestamp pra evitar colisao
        this.realtimeChannel = supabase.channel(`admingod-tickets-messages-${Date.now()}`)
            .on('postgres_changes', { 
                event: 'INSERT', 
                schema: 'public', 
                table: 'support_messages',
                filter: `ticket_id=eq.${this.currentTicket.id}`
            }, (payload) => {
                // Update se a mensagem for do tenant
                if (payload.new && payload.new.sender_type === 'tenant') {
                    this.loadMessages(this.currentTicket.id, true);
                }
            })
            .subscribe();

        await this.loadMessages(ticketId);
    }

    async updateTicketField(field, newValue) {
        if(!this.currentTicket) return;
        
        const selElem = field === 'status' ? document.getElementById('tk-action-status') : document.getElementById('tk-action-category');
        const btnResolve = document.getElementById('btn-resolve-ticket');
        
        if (field === 'status' && newValue === 'resolved' && btnResolve) {
            btnResolve.disabled = true;
            btnResolve.innerHTML = '<i data-lucide="loader" class="animate-spin icon-sm m-0"></i>';
            if(window.lucide) window.lucide.createIcons();
        }
        if (selElem) selElem.disabled = true;

        try {
            const { error } = await supabase.from('support_tickets')
                .update({ [field]: newValue, updated_at: new Date().toISOString() })
                .eq('id', this.currentTicket.id);
            if(error) throw error;
            
            this.currentTicket[field] = newValue;
            
            // Re-abrir para atualizar view
            this.openTicket(this.currentTicket.id);
            this.loadTickets();
            if(window.showToast) window.showToast('Atualizado com sucesso!', 'success');
        } catch(err) {
            console.error(err);
            if(window.showToast) window.showToast('Erro ao atualizar chamados', 'error');
        } finally {
            if (btnResolve) {
                btnResolve.disabled = false;
                btnResolve.innerHTML = '<i data-lucide="check" class="icon-sm m-0"></i>';
                if(window.lucide) window.lucide.createIcons();
            }
            if (selElem) selElem.disabled = false;
        }
    }

    async loadMessages(ticketId, isPolling = false) {
        const msgContainer = document.getElementById('tk-chat-messages');
        if(!isPolling) msgContainer.innerHTML = `
            <div class="flex flex-col gap-3 w-100">
                <div class="skeleton" style="height: 60px; width: 60%; align-self: flex-start; border-radius: 8px;"></div>
                <div class="skeleton" style="height: 60px; width: 40%; align-self: flex-end; border-radius: 8px;"></div>
            </div>`;
        
        try {
            const { data, error } = await supabase
                .from('support_messages')
                .select('*')
                .eq('ticket_id', ticketId)
                .order('created_at', { ascending: true });
                
            if(error) throw error;
            this.renderMessages(data || []);
        } catch(err) {
            if(!isPolling) {
                console.error('Erro ao carregar msgs', err);
                msgContainer.innerHTML = '<div style="text-align:center; color:var(--danger)">Erro ao carregar mensagens.</div>';
            }
        }
    }

    renderMessages(messages) {
        const msgContainer = document.getElementById('tk-chat-messages');
        
        if(messages.length === 0) {
            msgContainer.innerHTML = '<div style="text-align:center; padding:2rem; color:var(--text-tertiary)">Sem mensagens neste chamado.</div>';
            return;
        }

        const isScrolledToBottom = msgContainer.scrollHeight - msgContainer.clientHeight <= msgContainer.scrollTop + 50;

        const escapeHtml = (unsafe) => {
            return (unsafe || '').replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
        };

        let html = '';
        messages.forEach(m => {
            const isMe = m.sender_type === 'superadmin' || m.sender_type === 'admin_staff';
            const alignClass = isMe ? 'wapp-msg-right' : 'wapp-msg-left';
            const time = new Date(m.created_at).toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'});
            const text = escapeHtml(m.message || '').replace(/\n/g, '<br>');

            html += `
                <div class="wapp-msg ${alignClass}">
                    ${text}
                    <span class="wapp-msg-time">${time}</span>
                </div>
            `;
        });
        
        msgContainer.innerHTML = html;
        if(isScrolledToBottom || messages.length > 0) {
            msgContainer.scrollTop = msgContainer.scrollHeight;
        }
    }

    async sendMessage() {
        if(!this.currentTicket) return;
        
        const input = document.getElementById('tk-chat-input');
        const btnSend = document.getElementById('btn-send-ticket-message');
        const text = input.value.trim();
        if(!text) return;
        
        input.value = '';
        input.disabled = true;
        if (btnSend) {
            btnSend.disabled = true;
            btnSend.innerHTML = '<i data-lucide="loader" class="animate-spin icon-sm"></i>';
            if(window.lucide) window.lucide.createIcons();
        }

        try {
            const { error } = await supabase.from('support_messages').insert([{
                ticket_id: this.currentTicket.id,
                sender_type: 'superadmin',
                message: text
            }]);
            
            if(error) throw error;
            
            await supabase.from('support_tickets')
                .update({ updated_at: new Date().toISOString() })
                .eq('id', this.currentTicket.id);
            
            // Criar notificação para o tenant
            if (this.currentTicket.tenant_id) {
                await supabase.from('notifications').insert([{
                    tenant_id: this.currentTicket.tenant_id,
                    type: 'update',
                    message: `Nova resposta no chamado: ${this.currentTicket.subject}`,
                    read: false
                }]);
            }
            
            this.loadMessages(this.currentTicket.id);
                
        } catch(err) {
            console.error('Erro envio', err);
            if (window.showToast) window.showToast('Erro ao enviar mensagem.', 'error');
        } finally {
            input.disabled = false;
            input.focus();
            if (btnSend) {
                btnSend.disabled = false;
                btnSend.innerHTML = '<i data-lucide="send" class="icon-sm"></i>';
                if(window.lucide) window.lucide.createIcons();
            }
        }
    }
    
    destroy() {
        if(this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
    }
}
