import { supabase } from '../core/supabaseClient.js';

export class clientesController {
    constructor() {
        this.clientes = [];
        this.currentPage = 1;
        this.itemsPerPage = 15;
        this.totalItems = 0;
        this.lastSearchTerm = '';
    }

    async init() {
        try {
            this.bindEvents();
            if (window.lucide) window.lucide.createIcons();
            // Inicia buscando os primeiros clientes (sem termo)
            this.searchClientes('');
        } catch (error) {
            console.error('Erro ao inicializar clientes:', error);
            if (window.showToast) window.showToast('Erro ao carregar módulo.', 'error');
        }
    }

    bindEvents() {
        const btnSearch = document.getElementById('btn-search-cliente');
        const inputSearch = document.getElementById('input-search-cliente');

        if (btnSearch && inputSearch) {
            btnSearch.addEventListener('click', () => this.searchClientes(inputSearch.value));
            inputSearch.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.searchClientes(inputSearch.value);
            });
        }

        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.searchClientes(this.lastSearchTerm, this.currentPage - 1);
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const maxPage = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < maxPage) {
                    this.searchClientes(this.lastSearchTerm, this.currentPage + 1);
                }
            });
        }
    }

    async searchClientes(term = '', page = 1) {
        this.lastSearchTerm = term.trim();
        this.currentPage = page;

        const tbody = document.getElementById('table-body-clientes');
        tbody.innerHTML = `
            <tr>
                <td colspan="4" class="py-8 text-center text-secondary">
                    <i data-lucide="loader" class="animate-spin mb-2 w-6 h-6"></i>
                    <p>Buscando na rede...</p>
                </td>
            </tr>
        `;
        
        document.getElementById('pagination-clientes')?.classList.add('d-none');
        if (window.lucide) window.lucide.createIcons();

        try {
            let query = supabase
                .from('clientes')
                .select('id, nome, telefone, cpf, email, is_blacklisted', { count: 'exact' });

            if (this.lastSearchTerm) {
                query = query.or(`nome.ilike.%${this.lastSearchTerm}%,telefone.ilike.%${this.lastSearchTerm}%,cpf.ilike.%${this.lastSearchTerm}%,email.ilike.%${this.lastSearchTerm}%`);
            }

            const start = (this.currentPage - 1) * this.itemsPerPage;
            const end = start + this.itemsPerPage - 1;
            
            const { data, count, error } = await query
                .range(start, end)
                .order('nome', { ascending: true });

            if (error) throw error;
            
            this.clientes = data || [];
            this.totalItems = count || 0;
            this.renderClientes();
            this.renderPagination();
        } catch (error) {
            console.error('Erro na busca de clientes:', error);
            tbody.innerHTML = `<tr><td colspan="4" class="py-4 text-center text-danger">Erro ao realizar a busca no banco.</td></tr>`;
        }
    }

    renderClientes() {
        const tbody = document.getElementById('table-body-clientes');
        let html = '';

        if (this.clientes.length === 0) {
            tbody.innerHTML = '<tr><td colspan="4" class="py-8 text-center text-secondary">Nenhum cliente encontrado para este termo.</td></tr>';
            return;
        }

        this.clientes.forEach(c => {
            const isBanned = c.is_blacklisted;
            const statusBadge = isBanned 
                ? '<span class="badge bg-danger-light text-danger px-2 py-1 rounded text-xs font-bold">BANNED</span>'
                : '<span class="badge bg-success-light text-success px-2 py-1 rounded text-xs">Regular</span>';

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-bold text-primary flex align-center gap-2">
                            <div class="w-8 h-8 rounded-full bg-primary-light flex align-center justify-center text-xs">
                                ${c.nome ? c.nome.charAt(0).toUpperCase() : '?'}
                            </div>
                            ${c.nome || 'Sem Nome'}
                        </div>
                    </td>
                    <td class="py-3 px-4">
                        <div class="text-sm text-secondary">${c.telefone || c.email || 'S/ Contato'}</div>
                        <div class="text-xs text-secondary opacity-70">CPF: ${c.cpf || 'Não informado'}</div>
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${statusBadge}
                    </td>
                    <td class="py-3 px-4 text-right">
                        <div class="flex gap-2 justify-end">
                            <button class="btn ${isBanned ? 'bg-success-light text-success hover:bg-success hover:text-white' : 'bg-warning-light text-warning hover:bg-warning hover:text-white'} border-none rounded p-2 cursor-pointer transition-colors btn-toggle-blacklist" data-id="${c.id}" data-banned="${isBanned}" title="${isBanned ? 'Remover da Blacklist' : 'Global Blacklist'}">
                                <i data-lucide="${isBanned ? 'shield-check' : 'shield-alert'}" class="icon-sm"></i>
                            </button>
                            <button class="btn bg-danger-light text-danger border-none rounded p-2 cursor-pointer hover:bg-danger hover:text-white transition-colors btn-delete-lgpd" data-id="${c.id}" title="LGPD Delete (Apagar Dados)">
                                <i data-lucide="trash-2" class="icon-sm"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
        this.bindTableActions();
    }

    renderPagination() {
        const pagContainer = document.getElementById('pagination-clientes');
        if (!pagContainer) return;

        if (this.totalItems === 0) {
            pagContainer.classList.add('d-none');
            return;
        }

        pagContainer.classList.remove('d-none');
        
        const startIdx = (this.currentPage - 1) * this.itemsPerPage + 1;
        const endIdx = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);
        
        document.getElementById('pag-start').textContent = startIdx;
        document.getElementById('pag-end').textContent = endIdx;
        document.getElementById('pag-total').textContent = this.totalItems;

        const maxPage = Math.ceil(this.totalItems / this.itemsPerPage);
        
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');
        
        btnPrev.disabled = this.currentPage <= 1;
        btnNext.disabled = this.currentPage >= maxPage;

        const pagNumbers = document.getElementById('pag-numbers');
        let numbersHtml = '';
        
        // Simples gerador de botões numéricos (mostra max 5 botões ao redor da página atual)
        let startPage = Math.max(1, this.currentPage - 2);
        let endPage = Math.min(maxPage, startPage + 4);
        
        if (endPage - startPage < 4) {
            startPage = Math.max(1, endPage - 4);
        }

        for (let i = startPage; i <= endPage; i++) {
            const activeClass = i === this.currentPage ? 'bg-primary text-white' : 'bg-transparent text-secondary hover:bg-hover hover:text-primary';
            numbersHtml += `<button class="btn border-none rounded w-8 h-8 flex align-center justify-center cursor-pointer transition-colors font-medium text-sm ${activeClass}" onclick="window.location.hash.includes('clientes') && document.querySelector('#btn-search-cliente').closest('.admin-section').__vue__ /* hacky, use proper event delegation */ ? null : null; document.dispatchEvent(new CustomEvent('changePageClientes', {detail: ${i}}))">${i}</button>`;
        }
        pagNumbers.innerHTML = numbersHtml;
    }

    bindTableActions() {
        // Toggle Blacklist
        document.querySelectorAll('.btn-toggle-blacklist').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                const isBanned = e.currentTarget.getAttribute('data-banned') === 'true';
                const actionText = isBanned ? 'REMOVER da Blacklist' : 'INCLUIR na Blacklist Global';
                
                if (window.showConfirm) {
                    window.showConfirm(`Deseja ${actionText} este cliente? ${!isBanned ? 'Ele não poderá agendar em nenhuma loja da rede.' : ''}`, async () => {
                        await this.toggleBlacklist(id, !isBanned);
                    });
                }
            });
        });

        // LGPD Delete
        document.querySelectorAll('.btn-delete-lgpd').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const id = e.currentTarget.getAttribute('data-id');
                if (window.showConfirm) {
                    window.showConfirm(`Atenção (LGPD): Isso excluirá os dados deste cliente definitivamente da base. Continuar?`, async () => {
                        await this.deleteCliente(id);
                    });
                }
            });
        });

        // Delegação de evento custom para paginação via botão numérico
        if (!this._pageChangeBound) {
            this._pageChangeBound = true;
            document.addEventListener('changePageClientes', (e) => {
                if (window.location.hash.includes('clientes')) {
                    this.searchClientes(this.lastSearchTerm, e.detail);
                }
            });
        }
    }

    async toggleBlacklist(id, newStatus) {
        try {
            const { error } = await supabase.from('clientes').update({ 
                is_blacklisted: newStatus,
                blacklist_data: newStatus ? new Date().toISOString() : null
            }).eq('id', id);
            
            if (error) throw error;
            
            if (window.showToast) window.showToast(`Status de Blacklist atualizado!`, 'success');
            
            // Atualiza na memória e renderiza sem precisar buscar de novo
            const cliente = this.clientes.find(c => c.id == id);
            if (cliente) cliente.is_blacklisted = newStatus;
            this.renderClientes();
            
        } catch (error) {
            console.error('Erro blacklist:', error);
            if (window.showToast) window.showToast('Erro ao atualizar blacklist.', 'error');
        }
    }

    async deleteCliente(id) {
        try {
            const { error } = await supabase.from('clientes').delete().eq('id', id);
            if (error) throw error;
            
            if (window.showToast) window.showToast('Cliente excluído permanentemente (LGPD).', 'success');
            
            // Remove da lista
            this.clientes = this.clientes.filter(c => c.id != id);
            this.renderClientes();
            
        } catch (error) {
            console.error('Erro exclusão LGPD:', error);
            if (window.showToast) window.showToast('Erro ao excluir cliente.', 'error');
        }
    }

    destroy() {
        // Limpar event listeners
    }
}
