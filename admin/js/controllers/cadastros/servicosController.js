import { supabase, getCurrentTenantId, uploadImageToSupabase } from '../../core/supabaseClient.js';

export class servicosController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.currentId = null;
        this.realtimeChannel = null;
    }
    
    async init() {
        this.tableBody = document.getElementById('servicos-table-body');
        
        this.renderSkeletons();
        await this.loadServicos();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < 4; i++) {
            skeletonsHtml += `
                <tr>
                    <td><div class="skeleton" style="width: 40px; height: 40px; border-radius: var(--radius-md);"></div></td>
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
    
    async loadServicos() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;
            const activeBranchId = localStorage.getItem('active_branch_id');

            let query = supabase
                .from('services')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('name', { ascending: true });

            if (activeBranchId) {
                query = query.contains('branch_ids', JSON.stringify([activeBranchId]));
            }

            const { data, error } = await query;

            if (error) throw error;
            this.renderTable(data);
            
            if (window.lucide) {
                window.lucide.createIcons();
            }

        } catch (error) {
            console.error('Erro ao carregar serviços:', error);
            if (window.showToast) window.showToast('Erro ao carregar serviços.', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="6" class="text-center text-secondary py-3">Nenhum serviço cadastrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const isAtivo = item.is_active;
            const badgeClass = isAtivo ? 'bg-success-light text-success' : 'bg-placeholder text-secondary';
            const badgeLabel = isAtivo ? 'Ativo' : 'Inativo';
            
            // Format duration safely
            const duration = item.duration || 0;
            const price = item.price ? Number(item.price).toFixed(2) : '0.00';
            
            html += `
                <tr>
                    <td>
                        <div class="bg-placeholder rounded-md flex justify-center align-center overflow-hidden mx-auto" style="width: 40px; height: 40px;">
                            ${item.image_url ? `<img src="${item.image_url}" class="w-100 h-100" style="object-fit: cover;">` : `<i data-lucide="image" class="text-secondary icon-sm"></i>`}
                        </div>
                    </td>
                    <td class="font-medium text-primary">${item.name || 'Sem nome'}</td>
                    <td class="text-sm text-secondary">${duration} min</td>
                    <td class="text-sm font-medium">R$ ${price}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-editar" data-id="${item.id}" title="Editar Serviço">
                            <i data-lucide="edit" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        // Bind click events
        const btnEdit = this.tableBody.querySelectorAll('.btn-editar');
        btnEdit.forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(btn.getAttribute('data-id'));
            });
        });
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        this.realtimeChannel = supabase.channel('servicos-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'services',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                // Ao ocorrer qualquer mudanca (insert, update, delete), recarrega
                this.loadServicos();
            })
            .subscribe();
    }

    bindEvents() {
        const modal = document.getElementById('modal-servico');
        const btnNovo = document.getElementById('btn-novo-servico');
        const btnClose = document.getElementById('btn-close-modal');
        const form = document.getElementById('form-servico');
        
        const btnExcluir = document.getElementById('btn-excluir');
        const btnDesativar = document.getElementById('btn-desativar');

        if (btnNovo) {
            btnNovo.addEventListener('click', () => this.openModal());
        }

        if (btnClose) {
            btnClose.addEventListener('click', () => {
                modal.classList.add('d-none');
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveServico();
            });
        }

        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                if (!this.currentId) return;
                const confirmar = await window.showConfirm("Tem certeza que deseja excluir permanentemente este serviço?", "Excluir", "Cancelar");
                if (confirmar) {
                    await this.deleteServico(this.currentId);
                }
            });
        }
        
        if (btnDesativar) {
            btnDesativar.addEventListener('click', async () => {
                if (!this.currentId) return;
                document.getElementById('input-status').value = 'inativo';
                await this.saveServico();
            });
        }

        const inputImagem = document.getElementById('input-imagem');
        const btnRemoverFoto = document.getElementById('btn-remover-foto');
        if (inputImagem) {
            inputImagem.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 2 * 1024 * 1024) {
                    if (window.showToast) window.showToast('A imagem deve ter no máximo 2MB', 'error');
                    inputImagem.value = '';
                    return;
                }
                this.selectedImageFile = file; // Armazena o File nativo
                const reader = new FileReader();
                reader.onload = (event) => {
                    this.setPreviewImage(event.target.result);
                };
                reader.readAsDataURL(file);
            });
        }
        
        if (btnRemoverFoto) {
            btnRemoverFoto.addEventListener('click', () => {
                if (inputImagem) inputImagem.value = '';
                this.selectedImageFile = null;
                this.setPreviewImage(null);
            });
        }

        const btnImportar = document.getElementById('btn-importar-servico');
        const modalImport = document.getElementById('modal-importar-servico');
        const btnCloseImport = document.getElementById('btn-close-modal-importar-servico');

        if (btnImportar) btnImportar.addEventListener('click', () => this.openImportModal());
        if (btnCloseImport) btnCloseImport.addEventListener('click', () => modalImport.classList.add('d-none'));
    }

    async openImportModal() {
        const modal = document.getElementById('modal-importar-servico');
        modal.classList.remove('d-none');
        await this.loadNetworkServicos();
    }

    async loadNetworkServicos() {
        const listContainer = document.getElementById('importar-servico-lista');
        listContainer.innerHTML = `<div class="flex justify-center p-4"><i data-lucide="loader-2" class="icon-sm animate-spin text-secondary"></i></div>`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const currentTenantId = await getCurrentTenantId();
            const activeBranchId = localStorage.getItem('active_branch_id');
            if (!currentTenantId || !activeBranchId) return;

            // Busca os servicos desse tenant
            const { data: servicos, error } = await supabase
                .from('services')
                .select('*')
                .eq('tenant_id', currentTenantId);
                
            if (error) throw error;

            const servicosParaImportar = servicos.filter(s => !s.branch_ids || !s.branch_ids.includes(activeBranchId));

            if (!servicosParaImportar || servicosParaImportar.length === 0) {
                listContainer.innerHTML = `<p class="text-secondary text-sm text-center py-4">Nenhum serviço disponível para importar.</p>`;
                return;
            }

            let html = '';
            servicosParaImportar.forEach(s => {
                html += `
                    <div class="flex align-center justify-between p-3 border border-dashed border-placeholder rounded-md hover:bg-hover transition-all">
                        <div class="flex align-center gap-3">
                            <div class="bg-placeholder rounded-md w-40px h-40px flex justify-center align-center overflow-hidden">
                                ${s.image_url ? `<img src="${s.image_url}" class="w-100 h-100 object-cover">` : `<i data-lucide="scissors" class="text-secondary icon-sm"></i>`}
                            </div>
                            <div>
                                <div class="font-medium text-primary text-sm">${s.name || 'Sem Nome'}</div>
                                <div class="text-xs text-secondary"><i data-lucide="store" class="icon-xs inline-block"></i> De outra filial</div>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline border-primary text-primary cursor-pointer" onclick="window.importarServico('${s.id}')">Adicionar à Filial Atual</button>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
            
            if (window.lucide) window.lucide.createIcons();

            window.importarServico = async (sourceId) => {
                const s = servicos.find(x => x.id === sourceId);
                if (!s) return;
                
                try {
                    const newBranchIds = s.branch_ids ? [...s.branch_ids, activeBranchId] : [activeBranchId];
                    
                    const { error: updErr } = await supabase.from('services').update({ branch_ids: newBranchIds }).eq('id', sourceId);
                    if (updErr) throw updErr;
                    
                    if (window.showToast) window.showToast('Serviço adicionado com sucesso!', 'success');
                    document.getElementById('modal-importar-servico').classList.add('d-none');
                    this.loadServicos();
                    
                } catch (e) {
                    console.error(e);
                    if (window.showToast) window.showToast('Erro ao importar.', 'error');
                }
            };

        } catch (e) {
            console.error(e);
            listContainer.innerHTML = `<p class="text-error text-sm text-center py-4">Erro ao carregar serviços.</p>`;
        }
    }

    setPreviewImage(url) {
        const preview = document.getElementById('service-img-preview');
        const icon = document.getElementById('service-img-icon');
        const btnRemove = document.getElementById('btn-remover-foto');
        
        if (url) {
            preview.style.backgroundImage = `url('${url}')`;
            if (icon) icon.classList.add('d-none');
            if (btnRemove) btnRemove.classList.remove('d-none');
        } else {
            preview.style.backgroundImage = 'none';
            if (icon) icon.classList.remove('d-none');
            if (btnRemove) btnRemove.classList.add('d-none');
        }
        this.currentImageUrl = url; // Guarda a URL atual ou null
    }

    async openModal(id = null) {
        this.currentId = id;
        const modal = document.getElementById('modal-servico');
        const title = document.getElementById('modal-title');
        const form = document.getElementById('form-servico');
        
        const inputNome = document.getElementById('input-nome');
        const inputDuracao = document.getElementById('input-duracao');
        const inputPreco = document.getElementById('input-preco');
        const inputStatus = document.getElementById('input-status');
        const inputCategoria = document.getElementById('input-categoria');
        
        const btnExcluir = document.getElementById('btn-excluir');
        const btnDesativar = document.getElementById('btn-desativar');

        if (id) {
            title.textContent = "Editar Serviço";
            btnExcluir.classList.remove('d-none');
            btnDesativar.classList.remove('d-none');
            
            try {
                // Fetch details
                const { data, error } = await supabase
                    .from('services')
                    .select('*')
                    .eq('id', id)
                    .single();
                    
                    if (error) throw error;
                    
                    inputNome.value = data.name || '';
                    inputDuracao.value = data.duration || '';
                    inputPreco.value = data.price || '';
                    inputStatus.value = data.is_active === false ? 'inativo' : 'ativo';
                    if (inputCategoria) inputCategoria.value = data.category || data.categoria || '';
                    
                    this.setPreviewImage(data.image_url || data.imagem_url || null);
                    
                    if (data.is_active === false) {
                        btnDesativar.classList.add('d-none');
                    }
                    
                } catch(e) {
                    console.error(e);
                    if (window.showToast) window.showToast('Erro ao abrir serviço', 'error');
                    return;
                }
            } else {
                title.textContent = "Cadastrar Serviço";
                form.reset();
                inputStatus.value = 'ativo';
                btnExcluir.classList.add('d-none');
                btnDesativar.classList.add('d-none');
                this.setPreviewImage(null);
                this.selectedImageFile = null;
                const inputImagem = document.getElementById('input-imagem');
                if (inputImagem) inputImagem.value = '';
            }

            modal.classList.remove('d-none');
        }

        async saveServico() {
            const btnSalvar = document.getElementById('btn-salvar');
            const originalText = btnSalvar.innerHTML;
            btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Salvando...`;
            btnSalvar.disabled = true;
            
            if (window.lucide) window.lucide.createIcons();

            try {
                const tenantId = await getCurrentTenantId();
                
                let imageUrl = this.currentImageUrl || null;
                
                // Faz o upload real do arquivo se houver um novo selecionado
                if (this.selectedImageFile) {
                    const uploadedUrl = await uploadImageToSupabase(this.selectedImageFile, 'tenant-images', tenantId);
                    if (uploadedUrl) imageUrl = uploadedUrl;
                }
                
                const payload = {
                    name: document.getElementById('input-nome').value,
                    duration: parseInt(document.getElementById('input-duracao').value) || 0,
                    price: parseFloat(document.getElementById('input-preco').value) || 0,
                    is_active: document.getElementById('input-status').value === 'ativo',
                    category: document.getElementById('input-categoria') ? document.getElementById('input-categoria').value : '',
                    tenant_id: tenantId,
                    image_url: imageUrl
                };

                if (this.currentId) {
                    const { error } = await supabase.from('services').update(payload).eq('id', this.currentId);
                    if (error) throw error;
                    if (window.showToast) window.showToast('Serviço atualizado com sucesso!', 'success');
                } else {
                    const activeBranchId = localStorage.getItem('active_branch_id');
                    if (activeBranchId) {
                        payload.branch_ids = [activeBranchId];
                    }
                    const { error } = await supabase.from('services').insert(payload);
                    if (error) throw error;
                    if (window.showToast) window.showToast('Serviço cadastrado com sucesso!', 'success');
                }

                document.getElementById('modal-servico').classList.add('d-none');
                await this.loadServicos();
                
            } catch (error) {
                console.error('Erro ao salvar serviço:', error);
                if (window.showToast) window.showToast('Erro ao salvar serviço. Tente novamente.', 'error');
            } finally {
                btnSalvar.innerHTML = originalText;
                btnSalvar.disabled = false;
            }
        }
        
        async deleteServico(id) {
            try {
                const { error } = await supabase.from('services').delete().eq('id', id);
                if (error) throw error;
                if (window.showToast) window.showToast('Serviço excluído com sucesso!', 'success');
                document.getElementById('modal-servico').classList.add('d-none');
                this.selectedImageFile = null;
                await this.loadServicos();
            } catch(error) {
                console.error('Erro ao excluir:', error);
                if (window.showToast) window.showToast('Não foi possível excluir. Ele pode estar associado a agendamentos.', 'error');
            }
        }

        destroy() {
            if (this.realtimeChannel) {
                supabase.removeChannel(this.realtimeChannel);
            }
        }
    }
