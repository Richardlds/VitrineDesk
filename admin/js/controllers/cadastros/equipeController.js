import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class equipeController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.currentId = null;
        this.realtimeChannel = null;
        this.selectedFile = null;
    }
    async init() {
        this.tableBody = document.getElementById('equipe-table-body');
        
        this.renderSkeletons();
        await this.loadProfissionais();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
        
        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < 3; i++) {
            skeletonsHtml += `
                <tr>
                    <td><div class="flex gap-2 align-center"><div class="skeleton sk-avatar w-40px h-40px"></div><div class="skeleton sk-row w-100"></div></div></td>
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
    
    async loadProfissionais() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;
            const activeBranchId = localStorage.getItem('active_branch_id');

            let query = supabase
                .from('profissionais')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('nome', { ascending: true });

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
            console.error('Erro ao carregar equipe:', error);
            if (window.showToast) window.showToast('Erro ao carregar equipe', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-3">Nenhum profissional cadastrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            let badgeClass = 'bg-placeholder text-secondary';
            let badgeLabel = 'Inativo';
            
            if(item.ativo !== false) {
                badgeClass = 'bg-success-light text-success';
                badgeLabel = 'Ativo';
            } 
            // Tratamento de férias, se desejar (ex: lendo de outro campo se houvesse)

            // Lendo dados "injetados"
            const role = item.horarios?.role || 'profissional';
            const especialidade = item.bio || '-';
            const telefone = item.horarios?.telefone || '-';
            const comissao = item.horarios?.comissao ? `${item.horarios.comissao}%` : '-';
            
            html += `
                <tr>
                    <td>
                        <div class="flex align-center gap-3">
                            <div class="bg-placeholder rounded-full w-40px h-40px flex justify-center align-center overflow-hidden">
                                ${item.foto_url ? `<img src="${item.foto_url}" class="w-100 h-100 object-cover">` : `<i data-lucide="user" class="text-secondary icon-sm"></i>`}
                            </div>
                            <div>
                                <div class="font-medium text-primary">${item.nome || 'Sem Nome'} ${role === 'admin' ? '<i data-lucide="shield" class="text-warning w-12px h-12px"></i>' : ''}</div>
                            </div>
                        </div>
                    </td>
                    <td class="text-sm text-secondary">${especialidade}</td>
                    <td class="text-sm text-secondary">${comissao}</td>
                    <td class="text-sm text-secondary">${telefone}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-editar-equipe" data-id="${item.id}" title="Editar Profissional">
                            <i data-lucide="edit" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnEdit = this.tableBody.querySelectorAll('.btn-editar-equipe');
        btnEdit.forEach(btn => {
            btn.addEventListener('click', () => {
                this.openModal(btn.getAttribute('data-id'));
            });
        });
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        this.realtimeChannel = supabase.channel('equipe-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'profissionais',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadProfissionais();
            })
            .subscribe();
    }

    bindEvents() {
        const modal = document.getElementById('modal-equipe');
        const btnNovo = document.getElementById('btn-novo-profissional');
        const btnClose = document.getElementById('btn-close-modal-equipe');
        const form = document.getElementById('form-equipe');
        const btnExcluir = document.getElementById('btn-excluir-equipe');
        const btnDesativar = document.getElementById('btn-desativar-equipe');
        
        const inputFoto = document.getElementById('input-foto-equipe');
        const previewContainer = document.getElementById('preview-foto-equipe');

        if (btnNovo) btnNovo.addEventListener('click', () => this.openModal());
        if (btnClose) btnClose.addEventListener('click', () => modal.classList.add('d-none'));

        if (inputFoto) {
            inputFoto.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (file) {
                    this.selectedFile = file;
                    const reader = new FileReader();
                    reader.onload = (ev) => {
                        previewContainer.innerHTML = `<img src="${ev.target.result}" class="w-100 h-100 object-cover rounded-full">`;
                    };
                    reader.readAsDataURL(file);
                }
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.saveProfissional();
            });
        }
        
        if (btnExcluir) {
            btnExcluir.addEventListener('click', async () => {
                if (!this.currentId) return;
                const confirmar = await window.showConfirm("Excluir permanentemente este profissional?", "Excluir", "Cancelar");
                if (confirmar) {
                    await this.deleteProfissional(this.currentId);
                }
            });
        }
        
        if (btnDesativar) {
            btnDesativar.addEventListener('click', async () => {
                if (!this.currentId) return;
                document.getElementById('input-status-equipe').value = 'inativo';
                await this.saveProfissional();
            });
        }

        const btnImportar = document.getElementById('btn-importar-equipe');
        const modalImport = document.getElementById('modal-importar-equipe');
        const btnCloseImport = document.getElementById('btn-close-modal-importar-equipe');

        if (btnImportar) btnImportar.addEventListener('click', () => this.openImportModal());
        if (btnCloseImport) btnCloseImport.addEventListener('click', () => modalImport.classList.add('d-none'));
    }

    async openImportModal() {
        const modal = document.getElementById('modal-importar-equipe');
        modal.classList.remove('d-none');
        await this.loadNetworkProfissionais();
    }

    async loadNetworkProfissionais() {
        const listContainer = document.getElementById('importar-equipe-lista');
        listContainer.innerHTML = `<div class="flex justify-center p-4"><i data-lucide="loader-2" class="icon-sm animate-spin text-secondary"></i></div>`;
        if (window.lucide) window.lucide.createIcons();

        try {
            const currentTenantId = await getCurrentTenantId();
            const activeBranchId = localStorage.getItem('active_branch_id');
            if (!currentTenantId || !activeBranchId) return;

            // Busca os profissionais desse tenant que NÃO estão na branch atual
            const { data: profissionais, error } = await supabase
                .from('profissionais')
                .select('*')
                .eq('tenant_id', currentTenantId);
                
            if (error) throw error;

            const profissionaisParaImportar = profissionais.filter(p => !p.branch_ids || !p.branch_ids.includes(activeBranchId));

            if (!profissionaisParaImportar || profissionaisParaImportar.length === 0) {
                listContainer.innerHTML = `<p class="text-secondary text-sm text-center py-4">Nenhum profissional disponível para importar.</p>`;
                return;
            }

            let html = '';
            profissionaisParaImportar.forEach(p => {
                html += `
                    <div class="flex align-center justify-between p-3 border border-dashed border-placeholder rounded-md hover:bg-hover transition-all">
                        <div class="flex align-center gap-3">
                            <div class="bg-placeholder rounded-full w-40px h-40px flex justify-center align-center overflow-hidden">
                                ${p.foto_url ? `<img src="${p.foto_url}" class="w-100 h-100 object-cover">` : `<i data-lucide="user" class="text-secondary icon-sm"></i>`}
                            </div>
                            <div>
                                <div class="font-medium text-primary text-sm">${p.nome || 'Sem Nome'}</div>
                                <div class="text-xs text-secondary"><i data-lucide="store" class="icon-xs inline-block"></i> De outra filial</div>
                            </div>
                        </div>
                        <button class="btn btn-sm btn-outline border-primary text-primary cursor-pointer" onclick="window.importarProfissional('${p.id}')">Adicionar à Filial Atual</button>
                    </div>
                `;
            });
            listContainer.innerHTML = html;
            
            if (window.lucide) window.lucide.createIcons();

            window.importarProfissional = async (sourceId) => {
                const p = profissionais.find(x => x.id === sourceId);
                if (!p) return;
                
                try {
                    const newBranchIds = p.branch_ids ? [...p.branch_ids, activeBranchId] : [activeBranchId];
                    
                    const { error: updErr } = await supabase.from('profissionais').update({ branch_ids: newBranchIds }).eq('id', sourceId);
                    if (updErr) throw updErr;
                    
                    if (window.showToast) window.showToast('Profissional adicionado com sucesso!', 'success');
                    document.getElementById('modal-importar-equipe').classList.add('d-none');
                    this.loadProfissionais();
                    
                } catch (e) {
                    console.error(e);
                    if (window.showToast) window.showToast('Erro ao importar.', 'error');
                }
            };

        } catch (e) {
            console.error(e);
            listContainer.innerHTML = `<p class="text-error text-sm text-center py-4">Erro ao carregar profissionais.</p>`;
        }
    }
    
    async openModal(id = null) {
        this.currentId = id;
        this.selectedFile = null;
        
        const modal = document.getElementById('modal-equipe');
        const title = document.getElementById('modal-equipe-title');
        const form = document.getElementById('form-equipe');
        
        const inputNome = document.getElementById('input-nome-equipe');
        const inputEsp = document.getElementById('input-especialidade-equipe');
        const inputTel = document.getElementById('input-telefone-equipe');
        const inputComissao = document.getElementById('input-comissao-equipe');
        const inputPerm = document.getElementById('input-permissao-equipe');
        const inputStatus = document.getElementById('input-status-equipe');
        
        const previewContainer = document.getElementById('preview-foto-equipe');
        const inputFoto = document.getElementById('input-foto-equipe');
        
        const btnExcluir = document.getElementById('btn-excluir-equipe');
        const btnDesativar = document.getElementById('btn-desativar-equipe');

        if (inputFoto) inputFoto.value = '';
        this.selectedFile = null;

        if (id) {
            title.textContent = "Editar Profissional";
            btnExcluir.classList.remove('d-none');
            btnDesativar.classList.remove('d-none');
            
            try {
                const { data, error } = await supabase
                    .from('profissionais')
                    .select('*')
                    .eq('id', id)
                    .single();
                    
                if (error) throw error;
                
                inputNome.value = data.nome || '';
                inputEsp.value = data.bio || '';
                inputTel.value = data.horarios?.telefone || '';
                inputComissao.value = data.horarios?.comissao || '';
                inputPerm.value = data.horarios?.role || 'profissional';
                inputStatus.value = data.ativo === false ? 'inativo' : 'ativo';
                
                if (data.foto_url) {
                    previewContainer.innerHTML = `<img src="${data.foto_url}" class="w-100 h-100 object-cover rounded-full">`;
                } else {
                    previewContainer.innerHTML = `<i data-lucide="camera" class="text-secondary"></i>`;
                }
                
                if (data.ativo === false) {
                    btnDesativar.classList.add('d-none');
                }
                
            } catch(e) {
                console.error(e);
                if (window.showToast) window.showToast('Erro ao abrir.', 'error');
                return;
            }
        } else {
            title.textContent = "Cadastrar Profissional";
            form.reset();
            inputStatus.value = 'ativo';
            inputPerm.value = 'profissional';
            btnExcluir.classList.add('d-none');
            btnDesativar.classList.add('d-none');
            previewContainer.innerHTML = `<i data-lucide="camera" class="text-secondary"></i>`;
        }

        modal.classList.remove('d-none');
        if (window.lucide) window.lucide.createIcons();
    }

    async saveProfissional() {
        const btnSalvar = document.getElementById('btn-salvar-equipe');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Salvando...`;
        btnSalvar.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            const tenantId = await getCurrentTenantId();
            
            let uploadedUrl = null;
            if (this.selectedFile) {
                const fileExt = this.selectedFile.name.split('.').pop();
                const fileName = `${tenantId}/${Date.now()}.${fileExt}`;
                
                const { error: uploadError } = await supabase.storage
                    .from('avatars')
                    .upload(fileName, this.selectedFile, {
                        cacheControl: '3600',
                        upsert: false
                    });
                    
                if (uploadError) throw uploadError;
                
                const { data: urlData } = supabase.storage
                    .from('avatars')
                    .getPublicUrl(fileName);
                    
                uploadedUrl = urlData.publicUrl;
            }

            const payload = {
                nome: document.getElementById('input-nome-equipe').value,
                bio: document.getElementById('input-especialidade-equipe').value,
                ativo: document.getElementById('input-status-equipe').value === 'ativo',
                horarios: {
                    telefone: document.getElementById('input-telefone-equipe').value,
                    comissao: document.getElementById('input-comissao-equipe').value,
                    role: document.getElementById('input-permissao-equipe').value
                },
                tenant_id: tenantId
            };
            
            if (uploadedUrl) {
                payload.foto_url = uploadedUrl;
            }

            if (this.currentId) {
                const { error } = await supabase.from('profissionais').update(payload).eq('id', this.currentId);
                if (error) throw error;
                if (window.showToast) window.showToast('Profissional atualizado!', 'success');
            } else {
                const activeBranchId = localStorage.getItem('active_branch_id');
                if (activeBranchId) {
                    payload.branch_ids = [activeBranchId];
                }
                const { error } = await supabase.from('profissionais').insert(payload);
                if (error) throw error;
                if (window.showToast) window.showToast('Profissional cadastrado!', 'success');
            }

            document.getElementById('modal-equipe').classList.add('d-none');
            await this.loadProfissionais();
            
        } catch (error) {
            console.error('Erro ao salvar:', error);
            if (window.showToast) window.showToast('Erro ao salvar. Verifique se a imagem é muito pesada.', 'error');
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    }
    
    async deleteProfissional(id) {
        try {
            const { error } = await supabase.from('profissionais').delete().eq('id', id);
            if (error) throw error;
            
            if (window.showToast) window.showToast('Profissional excluído.', 'success');
            document.getElementById('modal-equipe').classList.add('d-none');
            await this.loadProfissionais();
        } catch(e) {
            console.error('Erro ao excluir:', e);
            if (window.showToast) window.showToast('Não excluiu. Pode estar associado a um agendamento.', 'error');
        }
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
    }
}
