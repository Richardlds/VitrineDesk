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
        const bannerContainer = document.getElementById('fidelidade-banner-container');
        if (!bannerContainer) return;

        if (!this.config.is_active) {
            bannerContainer.innerHTML = `
                <div class="config-card mb-0 bg-bg-surface border-dashed">
                    <div class="flex flex-wrap align-center gap-4 p-2">
                        <div class="bg-placeholder text-secondary p-4 rounded-full flex align-center justify-center">
                            <i data-lucide="award" class="icon-lg opacity-50"></i>
                        </div>
                        <div class="flex-1">
                            <h3 class="text-secondary text-lg mb-1">Programa Desativado</h3>
                            <p class="text-sm text-secondary">Habilite o programa de fidelidade nas configurações para que seus clientes comecem a pontuar.</p>
                        </div>
                        <button class="btn btn-primary" onclick="document.getElementById('btn-configurar-fidelidade').click()">Ativar Agora</button>
                    </div>
                </div>
            `;
        } else {
            bannerContainer.innerHTML = `
                <div class="config-card mb-0" style="background: linear-gradient(135deg, rgba(59, 130, 246,0.1) 0%, rgba(59, 130, 246,0.02) 100%); border: 1px solid rgba(59, 130, 246,0.2);">
                    <div class="flex flex-wrap align-center gap-4 p-2">
                        <div class="bg-primary text-white p-4 rounded-full flex align-center justify-center shadow-sm">
                            <i data-lucide="award" class="icon-lg"></i>
                        </div>
                        <div class="flex-1">
                            <div class="flex align-center gap-2 mb-1">
                                <span class="bg-success-light text-success text-xs font-bold px-2 py-1 rounded-md uppercase tracking-wide">Ativo</span>
                                <h3 class="text-primary text-lg mb-0 m-0">Meta: ${this.config.pontos_necessarios} Agendamentos</h3>
                            </div>
                            <p class="text-sm text-secondary m-0">Recompensa: <strong class="text-primary">${this.config.recompensa}</strong></p>
                        </div>
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
                    <td colspan="3" class="text-center py-5">
                        <div class="flex flex-column align-center justify-center text-secondary">
                            <i data-lucide="users" class="icon-lg opacity-50 mb-2"></i>
                            <p>Nenhum cliente encontrado.</p>
                        </div>
                    </td>
                </tr>
            `;
            if (window.lucide) window.lucide.createIcons();
            return;
        }

        let html = '';
        const meta = this.config.pontos_necessarios || 10;
        
        data.forEach(item => {
            const pontos = item.pontos || 0;
            const resgateDisponivel = this.config.is_active && pontos > 0;
            const percentual = Math.min((pontos / meta) * 100, 100);
            const isCompleted = pontos >= meta;
            
            const btnResgatar = resgateDisponivel
                ? `<button class="btn bg-success-light text-success hover:bg-success hover:text-white transition-colors text-xs px-3 rounded-md cursor-pointer btn-resgatar flex align-center justify-center gap-1 font-bold" style="height: 32px;" data-id="${item.id}" data-pontos="${pontos}">
                     <i data-lucide="gift" class="icon-xs"></i><span class="d-none d-sm-inline">Resgatar</span>
                   </button>`
                : '';

            html += `
                <tr class="hover-bg-surface transition-colors">
                    <td class="py-3 px-3 border-bottom-dashed w-100">
                        <div class="flex align-center gap-3">
                            <div class="bg-bg-surface border border-dashed border-border rounded-full flex justify-center align-center shadow-sm flex-shrink-0" style="width: 36px; height: 36px;">
                                <i data-lucide="user" class="text-secondary icon-sm"></i>
                            </div>
                            <div class="flex flex-column flex-1" style="min-width: 0;">
                                <div class="flex justify-between align-center mb-1">
                                    <div class="flex flex-column truncate pr-2">
                                        <span class="font-bold text-primary text-sm truncate">${item.nome}</span>
                                        <span class="text-xs text-secondary truncate">${item.telefone || 'S/ telefone'}</span>
                                    </div>
                                    <span class="text-xs font-bold ${isCompleted ? 'text-success' : 'text-primary'} flex-shrink-0">${pontos}/${meta} <span class="d-none d-sm-inline">PTS</span></span>
                                </div>
                                <div class="w-100 bg-placeholder rounded-full overflow-hidden" style="height: 4px;">
                                    <div class="${isCompleted ? 'bg-success' : 'bg-primary'} rounded-full transition-all duration-500" style="width: ${percentual}%; height: 100%;"></div>
                                </div>
                            </div>
                        </div>
                    </td>
                    <td class="text-right py-3 px-3 border-bottom-dashed" style="width: 1%;">
                        <div class="flex justify-end align-center gap-2">
                            ${btnResgatar}
                            <button class="btn btn-outline border-dashed text-primary hover-border-primary hover-bg-primary-light transition-colors text-xs px-2 rounded-md cursor-pointer btn-add-ponto flex align-center justify-center font-bold" style="min-width: 32px; height: 32px;" data-id="${item.id}" data-pontos="${pontos}" title="Adicionar 1 ponto">
                                <i data-lucide="plus" class="icon-xs"></i>
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
        
        if (window.lucide) window.lucide.createIcons();
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
