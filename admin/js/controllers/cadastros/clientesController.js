import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class clientesController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.searchTimeout = null;
        this.currentId = null;
        this.realtimeChannel = null;
        
        // Paginação e Filtros
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
        this.currentSearch = '';
        this.currentFilter = 'todos'; // 'todos', 'ativos', 'blacklist'
    }
    
    async init() {
        this.tableBody = document.getElementById('clientes-table-body');
        
        this.renderSkeletons();
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
                    <td><div class="skeleton sk-row"></div></td>
                </tr>
            `;
        }
        this.tableBody.innerHTML = skeletonsHtml;
    }
    
    async loadClientes() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();

            // Construir a query base com contador
            let query = supabase
                .from('clientes')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .order('nome', { ascending: true });

            // Aplicar Filtro de Busca
            if (this.currentSearch) {
                const q = `%${this.currentSearch}%`;
                query = query.or(`nome.ilike.${q},telefone.ilike.${q},email.ilike.${q}`);
            }

            // Aplicar Filtro de Status
            if (this.currentFilter === 'ativos') {
                query = query.eq('is_blacklisted', false);
            } else if (this.currentFilter === 'blacklist') {
                query = query.eq('is_blacklisted', true);
            }

            // Aplicar Paginação
            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            this.totalItems = count || 0;
            this.renderTable(data);
            this.updatePaginationUI();

            if (window.lucide) {
                window.lucide.createIcons();
            }
        } catch (error) {
            console.error('Erro ao carregar clientes:', error);
            if (window.showToast) window.showToast('Erro ao carregar clientes', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-3">Nenhum cliente encontrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const isBlacklisted = item.is_blacklisted;
            
            html += `
                <tr class="${isBlacklisted ? 'opacity-70' : ''}">
                    <td class="font-medium text-primary flex align-center gap-2">
                        ${item.nome || 'Sem nome'}
                        ${isBlacklisted ? '<i data-lucide="alert-triangle" class="text-error icon-sm" title="Na Blacklist"></i>' : ''}
                    </td>
                    <td class="text-sm text-secondary">${item.telefone || '-'}</td>
                    <td class="text-sm text-secondary">${item.email || '-'}</td>
                    <td class="text-center">
                        <span class="bg-placeholder text-primary px-2 py-1 rounded-md text-sm font-medium">-</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-editar-cliente" data-id="${item.id}" title="Editar Cliente">
                            <i data-lucide="edit" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnEdit = this.tableBody.querySelectorAll('.btn-editar-cliente');
        btnEdit.forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(btn.getAttribute('data-id'));
            });
        });
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio');
        const elFim = document.getElementById('pag-fim');
        const elTotal = document.getElementById('pag-total');
        const elAtual = document.getElementById('pag-atual');
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        // Se a página atual exceder o total (devido a uma exclusão/busca), volta pra anterior
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadClientes(); // Reload with correct page
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

        this.realtimeChannel = supabase.channel('clientes-channel-' + Date.now())
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
        // Busca
        const searchInput = document.getElementById('input-busca-cliente');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.currentSearch = e.target.value.trim();
                    this.currentPage = 1; // Volta pra pag 1 ao buscar
                    this.loadClientes();
                }, 400); 
            });
        }

        // Filtro de Status
        const filterSelect = document.getElementById('filtro-status-cliente');
        if (filterSelect) {
            filterSelect.addEventListener('change', (e) => {
                this.currentFilter = e.target.value;
                this.currentPage = 1;
                this.loadClientes();
            });
        }

        // Paginação Botões
        const btnPrev = document.getElementById('btn-prev-page');
        const btnNext = document.getElementById('btn-next-page');

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

        const modal = document.getElementById('modal-cliente');
        const btnNovo = document.getElementById('btn-novo-cliente');
        const btnClose = document.getElementById('btn-close-modal-cliente');
        const form = document.getElementById('form-cliente');
        
        const btnExcluir = document.getElementById('btn-excluir-cliente');
        const btnDesativar = document.getElementById('btn-desativar-cliente');

        if (btnNovo) btnNovo.addEventListener('click', () => this.openModal());
        if (btnClose) btnClose.addEventListener('click', () => modal.classList.add('d-none'));

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveCliente(false);
            });
        }
        
        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                if (!this.currentId) return;
                const confirmar = await window.showConfirm("Excluir permanentemente este cliente?", "Excluir", "Cancelar");
                if (confirmar) {
                    await this.deleteCliente(this.currentId);
                }
            });
        }
        
        if (btnDesativar) {
            btnDesativar.addEventListener('click', async () => {
                if (!this.currentId) return;
                await this.saveCliente(true);
            });
        }
    }
    
    async openModal(id = null) {
        this.currentId = id;
        const modal = document.getElementById('modal-cliente');
        const title = document.getElementById('modal-cliente-title');
        const form = document.getElementById('form-cliente');
        
        const inputNome = document.getElementById('input-cliente-nome');
        const inputTel = document.getElementById('input-cliente-telefone');
        const inputEmail = document.getElementById('input-cliente-email');
        const inputObs = document.getElementById('input-cliente-obs');
        
        const btnExcluir = document.getElementById('btn-excluir-cliente');
        const btnDesativar = document.getElementById('btn-desativar-cliente');
        
        const historySection = document.getElementById('cliente-history-section');
        const historyList = document.getElementById('cliente-history-list');
        const historyCount = document.getElementById('cliente-history-count');
        const modalGrid = document.getElementById('modal-cliente-grid');

        if (id) {
            title.textContent = "Editar Cliente";
            btnExcluir.classList.remove('d-none');
            btnDesativar.classList.remove('d-none');
            
            try {
                const { data, error } = await supabase
                    .from('clientes')
                    .select('*')
                    .eq('id', id)
                    .single();
                    
                if (error) throw error;
                
                inputNome.value = data.nome || '';
                inputTel.value = data.telefone || '';
                inputEmail.value = data.email || '';
                inputObs.value = data.blacklist_motivo || '';
                
                if (data.is_blacklisted) {
                    btnDesativar.classList.add('d-none');
                }
                
                // Exibe sessão de histórico e carrega
                historySection.classList.remove('d-none');
                modalGrid.classList.add('grid-md-2');
                this.loadClientAppointments(id, data.tenant_id, historyList, historyCount);
                
                
            } catch(e) {
                console.error(e);
                if (window.showToast) window.showToast('Erro ao abrir.', 'error');
                return;
            }
        } else {
            title.textContent = "Cadastrar Cliente";
            form.reset();
            btnExcluir.classList.add('d-none');
            btnDesativar.classList.add('d-none');
            
            // Oculta sessão de histórico no cadastro novo
            historySection.classList.add('d-none');
            modalGrid.classList.remove('grid-md-2'); // Expande o form
            historyList.innerHTML = '';
            historyCount.textContent = '0';
        }

        modal.classList.remove('d-none');
    }

    async loadClientAppointments(clienteId, tenantId, listEl, countEl) {
        listEl.innerHTML = `<div class="flex-center p-3"><i data-lucide="loader-2" class="icon-md animate-spin text-primary"></i></div>`;
        if (window.lucide) window.lucide.createIcons();

        try {
            // Busca os agendamentos tentando bater pelo email, telefone, ou algum vinculo forte,
            // mas como na nossa base appointments não tem cliente_id, filtramos por client_email ou client_phone
            
            // Primeiro pegamos os dados do cliente para pegar email e telefone
            const { data: cliente } = await supabase.from('clientes').select('email, telefone').eq('id', clienteId).single();
            if(!cliente) {
                listEl.innerHTML = `<p class="text-sm text-secondary text-center">Cliente não encontrado.</p>`;
                return;
            }

            let query = supabase.from('appointments').select('*, services(name)').eq('tenant_id', tenantId);
            
            // Or para buscar por email ou telefone
            const orFilters = [];
            if(cliente.email) orFilters.push(`client_email.eq."${cliente.email}"`);
            if(cliente.telefone) orFilters.push(`client_phone.eq."${cliente.telefone}"`);
            
            if(orFilters.length > 0) {
                query = query.or(orFilters.join(','));
            } else {
                listEl.innerHTML = `<p class="text-sm text-secondary text-center">Cliente sem contato para buscar histórico.</p>`;
                return;
            }

            const { data: appts, error } = await query.order('appointment_date', {ascending: false}).order('appointment_time', {ascending: false});
            
            if(error) throw error;

            countEl.textContent = appts.length;

            if(appts.length === 0) {
                listEl.innerHTML = `
                    <div class="text-center py-4 bg-placeholder rounded-lg border-dashed">
                        <i data-lucide="calendar-x" class="text-secondary icon-md mb-2"></i>
                        <p class="text-sm text-secondary">Nenhum agendamento encontrado.</p>
                    </div>`;
                if(window.lucide) window.lucide.createIcons();
                return;
            }

            // Calculate "Próximo Agendamento"
            const now = new Date();
            let nextAppt = null;
            let closestDiff = Infinity;
            
            appts.forEach(apt => {
                if (apt.status === 'pending' || apt.status === 'confirmed') {
                    const aptDateTime = new Date(`${apt.appointment_date}T${apt.appointment_time}`);
                    if (aptDateTime >= now) {
                        const diff = aptDateTime - now;
                        if (diff < closestDiff) {
                            closestDiff = diff;
                            nextAppt = apt;
                        }
                    }
                }
            });

            const nextContainer = document.getElementById('cliente-next-appointment');
            if (nextAppt) {
                const dataFormatadaNext = new Date(`${nextAppt.appointment_date}T00:00:00`).toLocaleDateString('pt-BR');
                const horaFormatadaNext = nextAppt.appointment_time.substring(0, 5);
                const servicoNext = nextAppt.services ? nextAppt.services.name : 'Serviço excluído';
                
                nextContainer.innerHTML = `
                    <div class="bg-primary-light border border-primary rounded-md p-3">
                        <div class="text-primary text-xs font-bold mb-1 text-uppercase">Próximo Atendimento</div>
                        <div class="flex justify-between align-center mb-1">
                            <span class="text-sm font-medium text-primary">${servicoNext}</span>
                            <span class="badge bg-primary text-white text-xs">Confirmado</span>
                        </div>
                        <div class="flex align-center gap-3 text-xs text-primary opacity-80">
                            <span class="flex align-center gap-1"><i data-lucide="calendar" class="icon-sm"></i> ${dataFormatadaNext}</span>
                            <span class="flex align-center gap-1"><i data-lucide="clock" class="icon-sm"></i> ${horaFormatadaNext}</span>
                        </div>
                    </div>
                `;
                nextContainer.classList.remove('d-none');
            } else {
                nextContainer.classList.add('d-none');
                nextContainer.innerHTML = '';
            }

            let html = '';
            appts.forEach(apt => {
                const dataFormatada = new Date(`${apt.appointment_date}T00:00:00`).toLocaleDateString('pt-BR');
                const horaFormatada = apt.appointment_time.substring(0, 5);
                const servico = apt.services ? apt.services.name : 'Serviço excluído';
                
                let badgeClass = 'bg-warning-light text-warning';
                let statusLabel = 'Pendente';
                if(apt.status === 'confirmed') { badgeClass = 'bg-primary-light text-primary'; statusLabel = 'Confirmado'; }
                else if(apt.status === 'completed') { badgeClass = 'bg-success-light text-success'; statusLabel = 'Concluído'; }
                else if(apt.status === 'cancelled') { badgeClass = 'bg-error-light text-error'; statusLabel = 'Cancelado'; }

                html += `
                    <div class="bg-placeholder border-dashed rounded-md p-3 mb-2">
                        <div class="flex justify-between align-start mb-2">
                            <span class="text-sm font-medium text-primary">${servico}</span>
                            <span class="badge ${badgeClass} text-xs">${statusLabel}</span>
                        </div>
                        <div class="flex align-center gap-3 text-xs text-secondary">
                            <span class="flex align-center gap-1"><i data-lucide="calendar" class="icon-sm"></i> ${dataFormatada}</span>
                            <span class="flex align-center gap-1"><i data-lucide="clock" class="icon-sm"></i> ${horaFormatada}</span>
                        </div>
                    </div>
                `;
            });

            listEl.innerHTML = html;
            if (window.lucide) window.lucide.createIcons();
            
        } catch(e) {
            console.error('Erro ao buscar historico:', e);
            listEl.innerHTML = `<p class="text-sm text-error text-center">Erro ao carregar histórico.</p>`;
        }
    }

    async saveCliente(forceBlacklist = false) {
        const btnSalvar = document.getElementById('btn-salvar-cliente');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Salvando...`;
        btnSalvar.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            const tenantId = await getCurrentTenantId();
            const payload = {
                nome: document.getElementById('input-cliente-nome').value,
                telefone: document.getElementById('input-cliente-telefone').value,
                email: document.getElementById('input-cliente-email').value,
                tenant_id: tenantId
            };
            
            const obs = document.getElementById('input-cliente-obs').value;
            if (forceBlacklist) {
                payload.is_blacklisted = true;
                payload.blacklist_motivo = obs || 'Desativado manualmente.';
            } else if (obs) {
                payload.blacklist_motivo = obs;
            }

            if (this.currentId) {
                const { error } = await supabase.from('clientes').update(payload).eq('id', this.currentId);
                if (error) throw error;
                if (window.showToast) window.showToast('Cliente atualizado!', 'success');
            } else {
                payload.senha = '123456'; // Senha padrão exigida pelo banco de dados
                const { error } = await supabase.from('clientes').insert(payload);
                if (error) throw error;
                if (window.showToast) window.showToast('Cliente cadastrado!', 'success');
            }

            document.getElementById('modal-cliente').classList.add('d-none');
            await this.loadClientes();
            
        } catch (error) {
            console.error('Erro ao salvar:', error);
            if (window.showToast) window.showToast('Erro ao salvar. Tente novamente.', 'error');
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    }
    
    async deleteCliente(id) {
        try {
            const { error } = await supabase.from('clientes').delete().eq('id', id);
            if (error) throw error;
            
            if (window.showToast) window.showToast('Cliente excluído.', 'success');
            document.getElementById('modal-cliente').classList.add('d-none');
            await this.loadClientes();
        } catch(e) {
            console.error('Erro ao excluir:', e);
            if (window.showToast) window.showToast('Não excluiu. Pode estar associado a agendamentos.', 'error');
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
