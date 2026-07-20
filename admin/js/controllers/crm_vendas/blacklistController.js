import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class blacklistController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.searchTimeout = null;
        this.realtimeChannel = null;

        // Paginação
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
        this.currentSearch = '';
    }
    
    async init() {
        this.tableBody = document.getElementById('blacklist-table-body');
        
        this.renderSkeletons();
        await this.loadBlacklist();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < this.itemsPerPage; i++) {
            skeletonsHtml += `
                <tr>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                    <td><div class="skeleton sk-row"></div></td>
                </tr>
            `;
        }
        this.tableBody.innerHTML = skeletonsHtml;
    }
    
    async loadBlacklist() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();

            let query = supabase
                .from('clientes')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .eq('is_blacklisted', true)
                .order('nome', { ascending: true });

            if (this.currentSearch) {
                const q = `%${this.currentSearch}%`;
                query = query.or(`nome.ilike.${q},telefone.ilike.${q}`);
            }

            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            this.totalItems = count || 0;
            this.renderTable(data);
            this.updatePaginationUI();

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar blacklist:', error);
            if (window.showToast) window.showToast('Erro ao carregar blacklist', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-secondary py-3">Nenhum cliente bloqueado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const dataBloqueio = item.blacklist_data ? new Date(item.blacklist_data).toLocaleDateString('pt-BR') : '-';
            
            html += `
                <tr>
                    <td>
                        <div class="font-medium text-primary">${item.nome || 'Sem Nome'}</div>
                        <div class="text-xs text-secondary">${item.telefone || '-'}</div>
                    </td>
                    <td class="text-sm text-secondary">${item.blacklist_motivo || 'Sem motivo informado'}</td>
                    <td class="text-sm text-secondary">${dataBloqueio}</td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-success cursor-pointer btn-desbloquear" data-id="${item.id}" title="Desbloquear Cliente">
                            <i data-lucide="unlock" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnUnlock = this.tableBody.querySelectorAll('.btn-desbloquear');
        btnUnlock.forEach(btn => {
            btn.addEventListener('click', () => {
                this.desbloquearCliente(btn.getAttribute('data-id'));
            });
        });
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-blacklist');
        const elFim = document.getElementById('pag-fim-blacklist');
        const elTotal = document.getElementById('pag-total-blacklist');
        const elAtual = document.getElementById('pag-atual-blacklist');
        const btnPrev = document.getElementById('btn-prev-page-blacklist');
        const btnNext = document.getElementById('btn-next-page-blacklist');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadBlacklist();
            return;
        }

        const startItem = this.totalItems === 0 ? 0 : ((this.currentPage - 1) * this.itemsPerPage) + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        elInicio.textContent = startItem;
        elFim.textContent = endItem;
        elTotal.textContent = this.totalItems;
        elAtual.textContent = `Pág. ${this.currentPage} de ${totalPages}`;

        btnPrev.disabled = this.currentPage === 1 || this.totalItems === 0;
        btnNext.disabled = this.currentPage === totalPages || this.totalItems === 0;
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        this.realtimeChannel = supabase.channel('blacklist-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'clientes',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadBlacklist();
            })
            .subscribe();
    }

    bindEvents() {
        // Busca
        const searchInput = document.getElementById('input-busca-blacklist');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.currentSearch = e.target.value.trim();
                    this.currentPage = 1;
                    this.loadBlacklist();
                }, 400); 
            });
        }

        // Paginação Botões
        const btnPrev = document.getElementById('btn-prev-page-blacklist');
        const btnNext = document.getElementById('btn-next-page-blacklist');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadBlacklist();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadBlacklist();
                }
            });
        }

        const modal = document.getElementById('modal-blacklist');
        const btnNovo = document.getElementById('btn-adicionar-blacklist');
        const btnClose = document.getElementById('btn-close-modal-blacklist');
        const form = document.getElementById('form-blacklist');

        if (btnNovo && modal) {
            btnNovo.addEventListener('click', () => this.openModal());
        }

        if (btnClose && modal) {
            btnClose.addEventListener('click', () => {
                modal.classList.add('d-none');
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.bloquearCliente();
            });
        }
    }
    
    async openModal() {
        const modal = document.getElementById('modal-blacklist');
        const form = document.getElementById('form-blacklist');
        const selectCliente = document.getElementById('input-blacklist-cliente-id');
        
        form.reset();
        modal.classList.remove('d-none');

        // Carregar lista de clientes ativos
        if (selectCliente) {
            selectCliente.innerHTML = '<option value="">Carregando clientes...</option>';
            try {
                const tenantId = await getCurrentTenantId();
                const { data, error } = await supabase
                    .from('clientes')
                    .select('id, nome, telefone')
                    .eq('tenant_id', tenantId)
                    .eq('is_blacklisted', false)
                    .order('nome', { ascending: true });

                if (error) throw error;

                if (data.length === 0) {
                    selectCliente.innerHTML = '<option value="">Nenhum cliente ativo encontrado</option>';
                    return;
                }

                let options = '<option value="">Selecione o cliente</option>';
                data.forEach(c => {
                    options += `<option value="${c.id}">${c.nome} (${c.telefone || 'S/ Tel'})</option>`;
                });
                selectCliente.innerHTML = options;
            } catch (error) {
                console.error(error);
                selectCliente.innerHTML = '<option value="">Erro ao carregar clientes</option>';
            }
        }
    }

    async bloquearCliente() {
        const btnSalvar = document.querySelector('#form-blacklist button[type="submit"]');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Bloqueando...`;
        btnSalvar.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            const clienteId = document.getElementById('input-blacklist-cliente-id').value;
            const motivo = document.getElementById('input-blacklist-motivo').value;

            if (!clienteId) throw new Error('Selecione um cliente');

            const { error } = await supabase
                .from('clientes')
                .update({ 
                    is_blacklisted: true, 
                    blacklist_motivo: motivo,
                    blacklist_data: new Date().toISOString()
                })
                .eq('id', clienteId);

            if (error) throw error;

            if (window.showToast) window.showToast('Cliente bloqueado com sucesso!', 'success');
            document.getElementById('modal-blacklist').classList.add('d-none');
            await this.loadBlacklist();

        } catch (error) {
            console.error('Erro ao bloquear:', error);
            if (window.showToast) window.showToast('Erro ao bloquear cliente.', 'error');
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    }

    async desbloquearCliente(id) {
        if (!id) return;
        
        const confirmar = await window.showConfirm("Tem certeza que deseja desbloquear este cliente?", "Desbloquear", "Cancelar");
        if (!confirmar) return;

        try {
            const { error } = await supabase
                .from('clientes')
                .update({ 
                    is_blacklisted: false, 
                    blacklist_motivo: null,
                    blacklist_data: null
                })
                .eq('id', id);

            if (error) throw error;
            
            if (window.showToast) window.showToast('Cliente desbloqueado.', 'success');
            await this.loadBlacklist();
        } catch(e) {
            console.error('Erro ao desbloquear:', e);
            if (window.showToast) window.showToast('Erro ao desbloquear o cliente.', 'error');
        }
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
        if (this.searchTimeout) {
            clearTimeout(this.searchTimeout);
        }
    }
}
