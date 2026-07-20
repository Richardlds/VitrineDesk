import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class fidelidadeController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.modal = null;
        this.form = null;
        this.realtimeChannel = null;
        
        this.config = {
            pontos_necessarios: 10,
            recompensa: '1 Serviço Grátis',
            is_active: true
        };

        // Paginação e Filtro
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
        this.searchQuery = '';
    }
    
    async init() {
        this.tableBody = document.getElementById('fidelidade-table-body');
        this.modal = document.getElementById('modal-fidelidade');
        this.form = document.getElementById('form-fidelidade');
        
        // Modal de Resgate
        this.modalResgate = document.getElementById('modal-resgate');
        this.formResgate = document.getElementById('form-resgate');

        this.renderSkeletons();
        await this.loadConfig();
        await this.loadClientes();
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

    async loadConfig() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase
                .from('tenants')
                .select('settings')
                .eq('id', tenantId)
                .single();

            if (error) throw error;

            if (data && data.settings && data.settings.fidelidade) {
                this.config = data.settings.fidelidade;
            }

            this.updateConfigBanner();
        } catch (error) {
            console.error('Erro ao carregar configurações de fidelidade:', error);
        }
    }

    updateConfigBanner() {
        const bannerContainer = document.querySelector('.admin-section .bg-primary-light');
        if (!bannerContainer) return;

        if (!this.config.is_active) {
            bannerContainer.innerHTML = `
                <div class="flex align-center gap-3">
                    <div class="bg-placeholder text-secondary p-3 rounded-lg flex align-center justify-center">
                        <i data-lucide="award" class="icon-md"></i>
                    </div>
                    <div>
                        <h3 class="text-secondary text-md mb-1">Programa Desativado</h3>
                        <p class="text-sm text-secondary">Os clientes não estão acumulando pontos atualmente.</p>
                    </div>
                </div>
            `;
        } else {
            bannerContainer.innerHTML = `
                <div class="flex align-center gap-3">
                    <div class="bg-primary text-white p-3 rounded-lg flex align-center justify-center">
                        <i data-lucide="award" class="icon-md"></i>
                    </div>
                    <div>
                        <h3 class="text-primary text-md mb-1">Regra Vigente: ${this.config.pontos_necessarios} Agendamentos = ${this.config.recompensa}</h3>
                        <p class="text-sm text-secondary">O programa está <strong class="text-success">Ativo</strong>. Clientes já estão acumulando pontos.</p>
                    </div>
                </div>
            `;
        }
        if (window.lucide) window.lucide.createIcons();
    }

    async loadClientes() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();

            let query = supabase
                .from('clientes')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .order('pontos', { ascending: false });

            if (this.searchQuery) {
                query = query.or(`nome.ilike.%${this.searchQuery}%,telefone.ilike.%${this.searchQuery}%`);
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
            console.error('Erro ao carregar clientes na fidelidade:', error);
            if (window.showToast) window.showToast('Erro ao carregar clientes', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-secondary py-3">Nenhum cliente encontrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const pontos = item.pontos || 0;
            const resgateDisponivel = this.config.is_active && pontos > 0;
            const btnResgatar = resgateDisponivel
                ? `<button class="btn btn-success text-xs py-1 px-3 rounded cursor-pointer btn-resgatar flex align-center gap-1" data-id="${item.id}" data-pontos="${pontos}">
                     <i data-lucide="gift" class="icon-sm"></i> Resgatar
                   </button>`
                : '';

            html += `
                <tr>
                    <td>
                        <div class="flex align-center gap-3">
                            <div class="bg-primary-light text-primary rounded-full flex justify-center align-center" style="width: 36px; height: 36px; min-width: 36px;">
                                <i data-lucide="user" class="icon-sm"></i>
                            </div>
                            <span class="font-medium text-primary">${item.nome}</span>
                        </div>
                    </td>
                    <td class="text-sm text-secondary">${item.telefone || '-'}</td>
                    <td class="text-center">
                        <span class="status-badge ${pontos >= this.config.pontos_necessarios ? 'bg-success-light text-success' : 'bg-primary-light text-primary'}">
                            ${pontos} / ${this.config.pontos_necessarios} PTS
                        </span>
                    </td>
                    <td class="text-right">
                        <div class="flex justify-end align-center gap-2">
                            ${btnResgatar}
                            <button class="btn btn-primary text-xs py-1 px-3 rounded cursor-pointer btn-add-ponto flex align-center gap-1" data-id="${item.id}" data-pontos="${pontos}">
                                <i data-lucide="plus-circle" class="icon-sm"></i> Ponto
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;

        // Binds inline
        const btnsAdd = this.tableBody.querySelectorAll('.btn-add-ponto');
        btnsAdd.forEach(btn => {
            btn.addEventListener('click', async () => {
                const id = btn.getAttribute('data-id');
                const p = parseInt(btn.getAttribute('data-pontos') || 0);
                await this.alterarPontos(id, p + 1);
            });
        });

        const btnsResgatar = this.tableBody.querySelectorAll('.btn-resgatar');
        btnsResgatar.forEach(btn => {
            btn.addEventListener('click', () => {
                const id = btn.getAttribute('data-id');
                const pontos = parseInt(btn.getAttribute('data-pontos') || 0);
                this.openModalResgate(id, pontos);
            });
        });
    }
    
    openModalResgate(clienteId, pontosAtuais) {
        if (!this.modalResgate) return;
        document.getElementById('resgate-cliente-id').value = clienteId;
        document.getElementById('resgate-pontos-max').value = pontosAtuais;
        document.getElementById('resgate-pontos-atuais').innerText = pontosAtuais;
        
        const inputQtd = document.getElementById('input-resgate-qtd');
        inputQtd.value = Math.min(parseInt(pontosAtuais), parseInt(this.config.pontos_necessarios || 10)); // default para a regra
        inputQtd.max = pontosAtuais;
        
        this.modalResgate.classList.remove('d-none');
    }
    
    closeModalResgate() {
        if (this.modalResgate) this.modalResgate.classList.add('d-none');
        if (this.formResgate) this.formResgate.reset();
    }
    
    async confirmarResgate(e) {
        e.preventDefault();
        const id = document.getElementById('resgate-cliente-id').value;
        const ptsAtuais = parseInt(document.getElementById('resgate-pontos-max').value);
        const ptsRemover = parseInt(document.getElementById('input-resgate-qtd').value);
        
        if (ptsRemover <= 0 || ptsRemover > ptsAtuais) {
            if (window.showToast) window.showToast('Quantidade inválida.', 'error');
            return;
        }
        
        const novosPontos = ptsAtuais - ptsRemover;
        await this.alterarPontos(id, novosPontos, true);
        this.closeModalResgate();
    }

    async alterarPontos(clienteId, novosPontos, isResgate = false) {
        try {
            const { error } = await supabase.from('clientes').update({ pontos: novosPontos }).eq('id', clienteId);
            if (error) throw error;

            if (isResgate) {
                if (window.showToast) window.showToast('Resgate realizado com sucesso!', 'success');
            } else {
                if (window.showToast) window.showToast('Ponto adicionado com sucesso.', 'success');
            }
            this.loadClientes();
        } catch (e) {
            console.error(e);
            if (window.showToast) window.showToast('Erro ao atualizar pontos.', 'error');
        }
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-fidelidade');
        const elFim = document.getElementById('pag-fim-fidelidade');
        const elTotal = document.getElementById('pag-total-fidelidade');
        const elAtual = document.getElementById('pag-atual-fidelidade');
        const btnPrev = document.getElementById('btn-prev-page-fidelidade');
        const btnNext = document.getElementById('btn-next-page-fidelidade');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadClientes();
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

    openModal() {
        if (!this.modal) return;
        document.getElementById('input-fidelidade-status').value = this.config.is_active ? 'ativo' : 'inativo';
        document.getElementById('input-fidelidade-pontos').value = this.config.pontos_necessarios;
        document.getElementById('input-fidelidade-recompensa').value = this.config.recompensa;
        this.modal.classList.remove('d-none');
    }

    closeModal() {
        if (!this.modal) return;
        this.modal.classList.add('d-none');
    }

    async saveConfig(e) {
        e.preventDefault();
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const isActive = document.getElementById('input-fidelidade-status').value === 'ativo';
            const pontosNec = parseInt(document.getElementById('input-fidelidade-pontos').value);
            const recomp = document.getElementById('input-fidelidade-recompensa').value;

            const novaConfig = {
                is_active: isActive,
                pontos_necessarios: pontosNec,
                recompensa: recomp
            };

            // Pegar settings atual e atualizar apenas fidelidade
            const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            const settings = tenantData?.settings || {};
            settings.fidelidade = novaConfig;

            const { error } = await supabase.from('tenants').update({ settings: settings }).eq('id', tenantId);
            if (error) throw error;

            this.config = novaConfig;
            this.updateConfigBanner();
            this.loadClientes(); // Recarregar para avaliar botao de resgate
            this.closeModal();

            if (window.showToast) window.showToast('Configurações salvas com sucesso!', 'success');
        } catch(err) {
            console.error(err);
            if (window.showToast) window.showToast('Erro ao salvar configuração.', 'error');
        }
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        const channelName = 'fidelidade-channel-' + Date.now();
        this.realtimeChannel = supabase.channel(channelName)
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'clientes',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadClientes();
            })
            .subscribe();
    }

    bindEvents() {
        const btnNova = document.getElementById('btn-configurar-fidelidade');
        if (btnNova) btnNova.addEventListener('click', () => this.openModal());

        const btnClose = document.getElementById('btn-close-modal-fidelidade');
        if (btnClose) btnClose.addEventListener('click', () => this.closeModal());

        if (this.form) this.form.addEventListener('submit', (e) => this.saveConfig(e));
        
        if (this.formResgate) this.formResgate.addEventListener('submit', (e) => this.confirmarResgate(e));
        
        const btnCloseResgate = document.getElementById('btn-close-modal-resgate');
        if (btnCloseResgate) btnCloseResgate.addEventListener('click', () => this.closeModalResgate());
        
        if (this.modal) {
            this.modal.addEventListener('click', (e) => {
                if (e.target === this.modal) this.closeModal();
            });
        }
        if (this.modalResgate) {
            this.modalResgate.addEventListener('click', (e) => {
                if (e.target === this.modalResgate) this.closeModalResgate();
            });
        }
        
        // Busca
        const inputBusca = document.getElementById('input-busca-fidelidade');
        let searchTimeout;
        if (inputBusca) {
            inputBusca.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                searchTimeout = setTimeout(() => {
                    this.searchQuery = e.target.value.trim();
                    this.currentPage = 1;
                    this.loadClientes();
                }, 400);
            });
        }

        const btnPrev = document.getElementById('btn-prev-page-fidelidade');
        const btnNext = document.getElementById('btn-next-page-fidelidade');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadClientes();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadClientes();
                }
            });
        }
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
    }
}
