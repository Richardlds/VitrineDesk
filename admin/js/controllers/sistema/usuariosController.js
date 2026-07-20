import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class usuariosController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.searchTimeout = null;
    }
    
    async init() {
        this.tableBody = document.getElementById('usuarios-table-body');
        
        this.renderSkeletons();
        await this.loadUsuarios();
        this.bindEvents();
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < 3; i++) {
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
    
    async loadUsuarios(searchQuery = '') {
        try {
            // ATENCAO: A tabela admin_users no Supabase nao possui tenant_id.
            // Para ser multi-tenant, voce precisara adicionar a coluna tenant_id na tabela admin_users!
            // Por enquanto, buscaremos todos os usuarios que nao sao superadmin.
            
            let query = supabase
                .from('admin_users')
                .select('*')
                .neq('role', 'superadmin')
                .order('created_at', { ascending: false });
            
            if (searchQuery) {
                query = query.or(`name.ilike.%${searchQuery}%,email.ilike.%${searchQuery}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.renderTable(data);
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar usuários:', error);
            if (window.showToast) window.showToast('Erro ao carregar usuários', 'error');
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="4" class="text-center text-secondary py-3">Nenhum usuário encontrado.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const isAtivo = item.is_active;
            const badgeClass = isAtivo ? 'bg-success-light text-success' : 'bg-placeholder text-secondary';
            const badgeLabel = isAtivo ? 'Ativo' : 'Inativo';
            
            let perfilLabel = 'Administrador';
            if(item.role === 'gerente') perfilLabel = 'Gerente';
            if(item.role === 'recepcao') perfilLabel = 'Recepção';

            html += `
                <tr class="${!isAtivo ? 'opacity-70' : ''}">
                    <td>
                        <div class="font-medium text-primary">${item.name || 'Sem nome'}</div>
                        <div class="text-sm text-secondary">${item.email}</div>
                    </td>
                    <td class="text-sm text-secondary">${perfilLabel}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-editar-usuario" data-id="${item.id}" title="Editar Usuário">
                            <i data-lucide="edit" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
    }

    bindEvents() {
        const modal = document.getElementById('modal-usuario');
        const btnNovo = document.getElementById('btn-novo-usuario');
        const btnClose = document.getElementById('btn-close-modal-usuario');
        const form = document.getElementById('form-usuario');
        const inputBusca = document.getElementById('input-busca-usuario');
        let currentEditingId = null;

        if (btnNovo && modal) {
            btnNovo.addEventListener('click', () => {
                currentEditingId = null;
                document.getElementById('modal-usuario-title').innerText = 'Cadastrar Usuário';
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

        // Delegar click no botão editar
        if (this.tableBody) {
            this.tableBody.addEventListener('click', async (e) => {
                const btnEdit = e.target.closest('.btn-editar-usuario');
                if (btnEdit) {
                    const id = btnEdit.getAttribute('data-id');
                    currentEditingId = id;
                    document.getElementById('modal-usuario-title').innerText = 'Editar Usuário';
                    
                    const { data, error } = await supabase.from('admin_users').select('*').eq('id', id).single();
                    if (!error && data) {
                        document.getElementById('input-usuario-nome').value = data.name || '';
                        document.getElementById('input-usuario-email').value = data.email || '';
                        document.getElementById('input-usuario-perfil').value = data.role || 'gerente';
                        document.getElementById('input-usuario-senha').value = ''; // não preenche senha
                        document.getElementById('input-usuario-senha').required = false; // opcional na edição
                        modal.classList.remove('d-none');
                    }
                }
            });
        }

        if (inputBusca) {
            inputBusca.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.loadUsuarios(e.target.value.trim());
                }, 500);
            });
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                const btnSubmit = form.querySelector('button[type="submit"]');
                const originalText = btnSubmit.innerHTML;
                
                btnSubmit.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
                btnSubmit.disabled = true;
                if (window.lucide) window.lucide.createIcons();

                try {
                    const nome = document.getElementById('input-usuario-nome').value;
                    const email = document.getElementById('input-usuario-email').value;
                    const perfil = document.getElementById('input-usuario-perfil').value;
                    const senha = document.getElementById('input-usuario-senha').value;
                    
                    const payload = {
                        name: nome,
                        email: email,
                        role: perfil,
                        is_active: true
                    };
                    
                    if (senha) {
                        // TODO: Auth.signUp ou criptografia real de senha se integrado ao Auth
                        payload.password_hash = btoa(senha); 
                    }

                    if (currentEditingId) {
                        payload.updated_at = new Date().toISOString();
                        const { error } = await supabase.from('admin_users').update(payload).eq('id', currentEditingId);
                        if (error) throw error;
                        if (window.showToast) window.showToast('Usuário atualizado com sucesso!', 'success');
                    } else {
                        const { error } = await supabase.from('admin_users').insert([payload]);
                        if (error) throw error;
                        if (window.showToast) window.showToast('Usuário cadastrado com sucesso!', 'success');
                    }
                    
                    modal.classList.add('d-none');
                    this.loadUsuarios();
                } catch (err) {
                    console.error(err);
                    if (window.showToast) window.showToast('Erro ao salvar usuário.', 'error');
                } finally {
                    btnSubmit.innerHTML = originalText;
                    btnSubmit.disabled = false;
                }
            });
        }
    }
    
    destroy() {
        if (this.searchTimeout) clearTimeout(this.searchTimeout);
    }
}
