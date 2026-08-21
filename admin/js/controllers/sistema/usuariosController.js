import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class usuariosController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.searchTimeout = null;
    }
    escapeHTML(str) {
        if (!str) return '';
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#039;');
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
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data: tenant, error } = await supabase
                .from('tenants')
                .select('settings')
                .eq('id', tenantId)
                .single();

            if (error) throw error;

            let usuarios = tenant.settings?.usuarios || [];
            
            // Garante que todo usuário tenha um ID interno para edição
            usuarios = usuarios.map((u, i) => {
                if (!u.id) u.id = 'usr_' + Date.now() + '_' + i;
                return u;
            });
            
            this.tenantSettings = tenant.settings || {};
            this.usuarios = usuarios;

            let filtered = usuarios;
            if (searchQuery) {
                const term = searchQuery.toLowerCase();
                filtered = usuarios.filter(u => 
                    (u.name && u.name.toLowerCase().includes(term)) ||
                    (u.email && u.email.toLowerCase().includes(term))
                );
            }

            this.renderTable(filtered);
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
                        <div class="font-medium text-primary">${this.escapeHTML(item.name || 'Sem nome')}</div>
                        <div class="text-sm text-secondary">${this.escapeHTML(item.email)}</div>
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
                    
                    const user = this.usuarios.find(u => u.id === id);
                    if (user) {
                        document.getElementById('input-usuario-nome').value = user.name || '';
                        document.getElementById('input-usuario-email').value = user.email || '';
                        document.getElementById('input-usuario-perfil').value = user.role || 'gerente';
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
                    
                    const tenantId = await getCurrentTenantId();
                    let usuariosCopy = [...(this.usuarios || [])];
                    
                    if (currentEditingId) {
                        const idx = usuariosCopy.findIndex(u => u.id === currentEditingId);
                        if (idx !== -1) {
                            usuariosCopy[idx].name = nome;
                            usuariosCopy[idx].email = email;
                            usuariosCopy[idx].role = perfil;
                            if (senha) {
                                usuariosCopy[idx].password = await hashPasswordSHA256(senha);
                            }
                        }
                        
                        // Atualizar role na tenant_users se houver
                        await supabase
                            .from('tenant_users')
                            .update({ role: perfil })
                            .eq('user_id', currentEditingId)
                            .eq('tenant_id', tenantId);

                        const newSettings = { ...this.tenantSettings, usuarios: usuariosCopy };
                        
                        const { error } = await supabase
                            .from('tenants')
                            .update({ settings: newSettings })
                            .eq('id', tenantId);

                        if (error) throw error;
                        
                        if (window.showToast) window.showToast('Usuário atualizado com sucesso!', 'success');
                    } else {
                        // Novo usuário via Edge Function (Auth)
                        const session = await supabase.auth.getSession();
                        const token = session.data?.session?.access_token;
                        
                        if (!token) throw new Error("Sessão expirada.");

                        const res = await fetch('/api/admin/create-staff', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Authorization': `Bearer ${token}`
                            },
                            body: JSON.stringify({
                                name: nome,
                                email: email,
                                role: perfil,
                                password: senha,
                                tenant_id: tenantId
                            })
                        });

                        const responseData = await res.json();
                        
                        if (!res.ok) {
                            throw new Error(responseData.error || 'Erro ao criar funcionário na nuvem.');
                        }
                        
                        if (window.showToast) window.showToast('Usuário cadastrado com sucesso!', 'success');
                    }

                    modal.classList.add('d-none');
                    await this.loadUsuarios();
                } catch (err) {
                    console.error(err);
                    if (window.showToast) window.showToast(err.message || 'Erro ao salvar usuário.', 'error');
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

async function hashPasswordSHA256(password) {
    const msgUint8 = new TextEncoder().encode(password);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    return hashHex;
}
