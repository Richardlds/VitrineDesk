import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class cuponsController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.searchTimeout = null;
        this.currentId = null;
        this.realtimeChannel = null;

        // Paginação
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
        this.currentSearch = '';
    }
    
    async init() {
        this.tableBody = document.getElementById('cupons-table-body');
        
        this.renderSkeletons();
        await this.loadCupons();
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
                    <td><div class="skeleton sk-row"></div></td>
                </tr>
            `;
        }
        this.tableBody.innerHTML = skeletonsHtml;
    }
    
    async loadCupons() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();

            let query = supabase
                .from('cupons')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .order('created_at', { ascending: false });

            if (this.currentSearch) {
                const q = `%${this.currentSearch}%`;
                query = query.ilike('codigo', q);
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
            console.error('Erro ao carregar cupons:', error);
            if (window.showToast) window.showToast('Erro ao carregar cupons', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-secondary py-3">Nenhum cupom encontrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        const dataAtual = new Date();
        dataAtual.setHours(0,0,0,0);

        data.forEach(item => {
            let isAtivo = true;
            let statusLabel = 'Ativo';
            let badgeClass = 'bg-success-light text-success';

            if (item.usado) {
                isAtivo = false;
                statusLabel = 'Usado';
                badgeClass = 'bg-placeholder text-secondary';
            } else if (item.valido_ate) {
                const dataValidade = new Date(item.valido_ate);
                dataValidade.setHours(0,0,0,0);
                if (dataAtual > dataValidade) {
                    isAtivo = false;
                    statusLabel = 'Expirado';
                    badgeClass = 'bg-danger-light text-danger';
                }
            }

            const descontoLabel = item.desconto_percentual ? `${item.desconto_percentual}%` : `R$ ${parseFloat(item.desconto_fixo || 0).toFixed(2)}`;
            const validadeLabel = item.valido_ate ? new Date(item.valido_ate).toLocaleDateString('pt-BR', {timeZone: 'UTC'}) : 'Sem validade';
            const usoLabel = item.usado ? '1/1' : '0/1'; // Tabela suporta apenas boleano
            
            html += `
                <tr class="${!isAtivo ? 'opacity-70' : ''}">
                    <td class="font-mono font-medium text-primary uppercase">${item.codigo}</td>
                    <td class="text-sm font-medium text-primary">${descontoLabel}</td>
                    <td class="text-sm text-secondary">${validadeLabel}</td>
                    <td class="text-center text-sm text-secondary">${usoLabel}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${statusLabel}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-editar-cupom" data-id="${item.id}" title="Editar Cupom">
                            <i data-lucide="edit" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnEdit = this.tableBody.querySelectorAll('.btn-editar-cupom');
        btnEdit.forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(btn.getAttribute('data-id'));
            });
        });
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-cupom');
        const elFim = document.getElementById('pag-fim-cupom');
        const elTotal = document.getElementById('pag-total-cupom');
        const elAtual = document.getElementById('pag-atual-cupom');
        const btnPrev = document.getElementById('btn-prev-page-cupom');
        const btnNext = document.getElementById('btn-next-page-cupom');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadCupons();
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

        this.realtimeChannel = supabase.channel('cupons-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'cupons',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadCupons();
            })
            .subscribe();
    }

    bindEvents() {
        const searchInput = document.getElementById('input-busca-cupom');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.currentSearch = e.target.value.trim();
                    this.currentPage = 1;
                    this.loadCupons();
                }, 400); 
            });
        }

        const btnPrev = document.getElementById('btn-prev-page-cupom');
        const btnNext = document.getElementById('btn-next-page-cupom');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadCupons();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadCupons();
                }
            });
        }

        const modal = document.getElementById('modal-cupom');
        const btnNovo = document.getElementById('btn-novo-cupom');
        const btnClose = document.getElementById('btn-close-modal-cupom');
        const form = document.getElementById('form-cupom');
        const btnGerar = document.getElementById('btn-gerar-codigo');
        const btnExcluir = document.getElementById('btn-excluir-cupom');

        if (btnNovo && modal) btnNovo.addEventListener('click', () => this.openModal());
        if (btnClose && modal) btnClose.addEventListener('click', () => modal.classList.add('d-none'));

        if (btnGerar) {
            btnGerar.addEventListener('click', () => {
                const codigoStr = Math.random().toString(36).substring(2, 8).toUpperCase();
                document.getElementById('input-cupom-codigo').value = `PROMO-${codigoStr}`;
            });
        }

        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                if (!this.currentId) return;
                const confirmar = await window.showConfirm("Excluir permanentemente este cupom?", "Excluir", "Cancelar");
                if (confirmar) {
                    await this.deleteCupom(this.currentId);
                }
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveCupom();
            });
        }
    }
    
    async openModal(id = null) {
        this.currentId = id;
        const modal = document.getElementById('modal-cupom');
        const title = document.getElementById('modal-cupom-title');
        const form = document.getElementById('form-cupom');
        
        const inputCodigo = document.getElementById('input-cupom-codigo');
        const inputTipo = document.getElementById('input-cupom-tipo');
        const inputValor = document.getElementById('input-cupom-valor');
        const inputValidade = document.getElementById('input-cupom-validade');
        
        const btnExcluir = document.getElementById('btn-excluir-cupom');

        if (id) {
            title.textContent = "Editar Cupom";
            btnExcluir.classList.remove('d-none');
            
            try {
                const { data, error } = await supabase
                    .from('cupons')
                    .select('*')
                    .eq('id', id)
                    .single();
                    
                if (error) throw error;
                
                inputCodigo.value = data.codigo || '';
                
                if (data.desconto_percentual !== null) {
                    inputTipo.value = 'porcentagem';
                    inputValor.value = data.desconto_percentual;
                } else {
                    inputTipo.value = 'fixo';
                    inputValor.value = data.desconto_fixo;
                }
                
                inputValidade.value = data.valido_ate || '';
                
            } catch(e) {
                console.error(e);
                if (window.showToast) window.showToast('Erro ao abrir.', 'error');
                return;
            }
        } else {
            title.textContent = "Criar Cupom";
            form.reset();
            btnExcluir.classList.add('d-none');
        }

        modal.classList.remove('d-none');
    }

    async saveCupom() {
        const btnSalvar = document.getElementById('btn-salvar-cupom');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Salvando...`;
        btnSalvar.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            const tenantId = await getCurrentTenantId();
            
            const codigo = document.getElementById('input-cupom-codigo').value.trim().toUpperCase();
            const tipo = document.getElementById('input-cupom-tipo').value;
            const valor = parseFloat(document.getElementById('input-cupom-valor').value);
            const validade = document.getElementById('input-cupom-validade').value;
            
            const payload = {
                tenant_id: tenantId,
                codigo: codigo,
                valido_ate: validade ? validade : null
            };

            if (tipo === 'porcentagem') {
                payload.desconto_percentual = Math.round(valor); // O banco exige integer para percentual
                payload.desconto_fixo = null;
            } else {
                payload.desconto_fixo = valor;
                payload.desconto_percentual = null;
            }

            if (this.currentId) {
                const { error } = await supabase.from('cupons').update(payload).eq('id', this.currentId);
                if (error) throw error;
                if (window.showToast) window.showToast('Cupom atualizado!', 'success');
            } else {
                const { error } = await supabase.from('cupons').insert(payload);
                if (error) throw error;
                if (window.showToast) window.showToast('Cupom criado!', 'success');
            }

            document.getElementById('modal-cupom').classList.add('d-none');
            await this.loadCupons();
            
        } catch (error) {
            console.error('Erro ao salvar cupom (detalhes):', JSON.stringify(error, null, 2), error);
            if (error.code === '23505') {
                if (window.showToast) window.showToast('Este código de cupom já existe.', 'error');
            } else {
                if (window.showToast) window.showToast('Erro ao salvar: ' + (error.message || JSON.stringify(error)), 'error');
            }
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    }
    
    async deleteCupom(id) {
        try {
            const { error } = await supabase.from('cupons').delete().eq('id', id);
            if (error) throw error;
            
            if (window.showToast) window.showToast('Cupom excluído.', 'success');
            document.getElementById('modal-cupom').classList.add('d-none');
            await this.loadCupons();
        } catch(e) {
            console.error('Erro ao excluir:', e);
            if (window.showToast) window.showToast('Não foi possível excluir o cupom.', 'error');
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
