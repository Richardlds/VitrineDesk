import { supabase, impersonateTenant } from '../core/supabaseClient.js';

export class tenantsController {
    constructor() {
        this.tenants = [];
        this.availablePlans = [];
        this.searchTimeout = null;
        this.currentTab = 'all';
        this.MENU_MODULES = [
            { id: 'principal/dashboard', name: 'Dashboard' },
            { id: 'principal/agendamentos', name: 'Agendamentos' },
            { id: 'principal/agenda_diaria', name: 'Agenda Diária' },
            { id: 'cadastros/servicos', name: 'Serviços' },
            { id: 'cadastros/equipe', name: 'Equipe' },
            { id: 'cadastros/clientes', name: 'Clientes' },
            { id: 'crm_vendas/cupons', name: 'Cupons' },
            { id: 'crm_vendas/marketing', name: 'Marketing' },
            { id: 'crm_vendas/blacklist', name: 'Blacklist' },
            { id: 'gestao/relatorios', name: 'Relatórios' },
            { id: 'gestao/comissoes', name: 'Comissões' },
            { id: 'gestao/metas', name: 'Metas' },
            { id: 'gestao/fidelidade', name: 'Fidelidade' },
            { id: 'cadastros/filiais', name: 'Minhas Filiais' },
            { id: 'sistema/configuracoes', name: 'Configurações' },
            { id: 'sistema/personalizacao', name: 'Personalização' },
            { id: 'sistema/usuarios', name: 'Usuários' },
            { id: 'sistema/suporte', name: 'Suporte' }
        ];
    }

    async init() {
        try {
            this.bindEvents();
            this.renderMenuOverridesForm();
            await this.loadAvailablePlans();
            await this.loadWelcomeMsg();
            await this.loadTenants();
        } catch (error) {
            console.error('Erro na inicialização de Tenants:', error);
            if (window.showToast) window.showToast('Erro ao carregar lojas.', 'error');
        }
    }

    async loadWelcomeMsg() {
        try {
            const { data } = await supabase.from('master_settings').select('welcome_msg_title, welcome_msg_body').eq('id', 1).single();
            if (data) {
                document.getElementById('welcome-msg-title').value = data.welcome_msg_title || '';
                document.getElementById('welcome-msg-body').value = data.welcome_msg_body || '';
            }
        } catch(e) {}
    }

    async loadAvailablePlans() {
        try {
            const { data, error } = await supabase.from('plans').select('id, name, price').order('price', { ascending: true });
            if (error) throw error;
            this.availablePlans = data || [];
            
            const select = document.getElementById('plano-select');
            const selectMaster = document.getElementById('master-config-plano');
            
            let htmlOptions = '';
            if (this.availablePlans.length === 0) {
                htmlOptions = '<option value="">Nenhum plano cadastrado (Vá em Planos)</option>';
            } else {
                htmlOptions = '<option value="">Sem plano (Bloqueado)</option>';
                this.availablePlans.forEach(p => {
                    htmlOptions += `<option value="${p.id}">${p.name} - R$ ${p.price}</option>`;
                });
            }

            if (select) select.innerHTML = htmlOptions;
            if (selectMaster) selectMaster.innerHTML = htmlOptions;
        } catch (err) {
            console.error('Erro ao carregar planos:', err);
        }
    }

    async loadTenants(searchQuery = '') {
        const tbody = document.getElementById('table-body-tenants');
        if (!tbody) return;

        tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-secondary"><i data-lucide="loader" class="animate-spin mb-2 mx-auto"></i> Carregando...</td></tr>`;
        if (window.lucide) window.lucide.createIcons();

        try {
            let query = supabase
                .from('tenants')
                .select('id, name, slug, owner_id, approval_status, created_at, settings')
                .order('created_at', { ascending: false });

            if (searchQuery) {
                query = query.or(`name.ilike.%${searchQuery}%,slug.ilike.%${searchQuery}%`);
            }

            const { data, error } = await query;
            if (error) throw error;

            this.tenants = data || [];
            this.renderTable();
        } catch (error) {
            console.error('Erro ao buscar tenants:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-danger">Erro ao carregar dados. Verifique a conexão.</td></tr>`;
        }
    }


    renderTable() {
        const tbody = document.getElementById('table-body-tenants');
        if (!tbody) return;

        const pendingCount = this.tenants.filter(t => t.approval_status === 'pending').length;
        const badgePending = document.getElementById('badge-pending');
        if (badgePending) {
            if (pendingCount > 0) {
                badgePending.textContent = pendingCount;
                badgePending.classList.remove('d-none');
            } else {
                badgePending.classList.add('d-none');
            }
        }

        const filteredTenants = this.currentTab === 'pending' 
            ? this.tenants.filter(t => t.approval_status === 'pending')
            : this.tenants;

        if (filteredTenants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-secondary">Nenhum tenant encontrado.</td></tr>`;
            return;
        }

        let html = '';
        filteredTenants.forEach(t => {
            // eslint-disable-next-line no-useless-assignment
            let statusBadge = '';
            if (t.approval_status === 'approved') {
                const venc = t.settings?.vencimento;
                if (venc && new Date(venc) < new Date()) {
                    statusBadge = '<span class="badge bg-danger-light text-danger text-xs px-2 py-1 rounded">Vencido</span>';
                } else {
                    statusBadge = '<span class="badge bg-success-light text-success text-xs px-2 py-1 rounded">Ativo</span>';
                }
            } else if (t.approval_status === 'pending') {
                statusBadge = '<span class="badge bg-warning-light text-warning text-xs px-2 py-1 rounded">Pendente</span>';
            } else {
                statusBadge = '<span class="badge bg-danger-light text-danger text-xs px-2 py-1 rounded">Suspenso/Banido</span>';
            }

            // Real Plano Info based on settings.plano_id
            const planoId = t.settings?.plano_id;
            const planoObj = this.availablePlans.find(p => p.id === planoId);
            const planoName = planoObj ? planoObj.name : 'Sem Plano';
            const vencimento = t.settings?.vencimento ? new Date(t.settings.vencimento).toLocaleDateString('pt-BR') : 'Sem Venc.';
            
            const planoColor = planoObj ? 'bg-primary-light text-primary' : 'bg-placeholder text-secondary';

            const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
            const storeUrl = isLocalhost ? `/cliente/index.html?tenant=${t.slug}` : `/vitrinedesk/${t.slug}`;

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-bold text-primary">${t.name}</div>
                        <div class="text-xs text-secondary mt-1">
                            <a href="${storeUrl}" target="_blank" class="text-primary opacity-80 hover:opacity-100 text-decoration-none">
                                /${t.slug} <i data-lucide="external-link" class="icon-sm inline-block ml-1"></i>
                            </a>
                        </div>
                    </td>
                    <td class="py-3 px-4 text-sm text-secondary">
                        <div class="flex align-center gap-2">
                            <i data-lucide="user" class="icon-sm"></i> ID: ${t.owner_id ? t.owner_id.split('-')[0] + '...' : 'Desconhecido'}
                        </div>
                    </td>
                    <td class="py-3 px-4 text-center">
                        <button class="btn border-none bg-transparent cursor-pointer p-0 m-0 btn-toggle-status" data-id="${t.id}" data-status="${t.approval_status}" title="Clique para alterar">
                            ${statusBadge}
                        </button>
                    </td>
                    <td class="py-3 px-4 text-center">
                        <button class="btn border-none bg-transparent cursor-pointer p-0 m-0 btn-edit-plano flex flex-column align-center w-100" data-id="${t.id}" data-plano="${planoName}" data-vencimento="${t.settings?.vencimento || ''}">
                            <span class="badge ${planoColor} text-xs px-2 py-1 rounded mb-1 capitalize">${planoName}</span>
                            <span class="text-xs text-secondary opacity-70">${vencimento}</span>
                        </button>
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div class="flex justify-center gap-2">
                            ${t.approval_status === 'pending' ? `
                                <button class="btn bg-success-light text-success border-none rounded px-2 py-1 cursor-pointer hover:bg-success hover:text-white transition-colors btn-approve-tenant flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Aprovar Lojista">
                                    <i data-lucide="check" class="icon-sm m-0"></i> Aprovar
                                </button>
                                <button class="btn bg-danger-light text-danger border-none rounded px-2 py-1 cursor-pointer hover:bg-danger hover:text-white transition-colors btn-reject-tenant flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Recusar Lojista">
                                    <i data-lucide="x" class="icon-sm m-0"></i> Recusar
                                </button>
                                <button class="btn bg-primary-light text-primary border-none rounded px-2 py-1 cursor-pointer hover:bg-primary transition-colors hover:text-white btn-master-settings flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Configuração Inicial">
                                    <i data-lucide="settings" class="icon-sm m-0"></i> Config Inicial
                                </button>
                            ` : `
                                <button class="btn bg-danger-light text-danger border-none rounded px-2 py-1 cursor-pointer hover:bg-danger hover:text-white transition-colors btn-impersonate flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Logar como este Lojista (GOD MODE)">
                                    <i data-lucide="zap" class="icon-sm m-0"></i> Logar
                                </button>
                                <button class="btn bg-primary-light text-primary border-none rounded px-2 py-1 cursor-pointer hover:bg-primary transition-colors hover:text-white btn-master-settings flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Configurações Master">
                                    <i data-lucide="settings" class="icon-sm m-0"></i> Master
                                </button>
                                <button class="btn bg-warning-light text-warning border-none rounded px-2 py-1 cursor-pointer hover:bg-warning hover:text-white transition-colors btn-delete-tenant flex align-center gap-1 text-xs font-bold" data-id="${t.id}" title="Excluir Loja Permanentemente">
                                    <i data-lucide="trash-2" class="icon-sm m-0"></i>
                                </button>
                            `}
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    renderMenuOverridesForm() {
        const container = document.getElementById('master-menu-overrides-container');
        if (!container) return;

        let html = '';
        this.MENU_MODULES.forEach(module => {
            html += `
                <div class="flex flex-column p-3 rounded-md border-dashed border-placeholder bg-placeholder bg-opacity-20">
                    <span class="text-sm text-primary font-medium mb-2">${module.name}</span>
                    <select class="menu-override-select w-100 bg-placeholder border-dashed rounded-md px-2 py-1 text-primary outline-none focus:border-primary text-xs" data-module="${module.id}">
                        <option value="inherit">Usar do Plano</option>
                        <option value="allow">Forçar Liberação</option>
                        <option value="deny">Forçar Bloqueio</option>
                    </select>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    bindEvents() {
        const inputSearch = document.getElementById('input-search-tenant');
        if (inputSearch) {
            inputSearch.addEventListener('input', (e) => {
                clearTimeout(this.searchTimeout);
                this.searchTimeout = setTimeout(() => {
                    this.loadTenants(e.target.value.trim());
                }, 400);
            });
        }

        // Tab switching (Table filters)
        document.querySelectorAll('#tenants-tabs .tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('#tenants-tabs .tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderBottom = 'none';
                    b.style.paddingBottom = '8px';
                });
                const target = e.currentTarget;
                target.classList.add('active');
                target.style.borderBottom = '2px solid var(--color-primary)';
                
                this.currentTab = target.getAttribute('data-filter');
                
                const tableContainer = document.getElementById('tenants-table-container');
                const disparosContainer = document.getElementById('tenants-disparos-container');
                
                if (this.currentTab === 'disparos') {
                    tableContainer.classList.add('d-none');
                    disparosContainer.classList.remove('d-none');
                } else {
                    tableContainer.classList.remove('d-none');
                    disparosContainer.classList.add('d-none');
                    this.renderTable();
                }
            });
        });

        // Salvar mensagem de disparo
        const btnSaveWelcome = document.getElementById('btn-save-welcome-msg');
        if (btnSaveWelcome) {
            btnSaveWelcome.addEventListener('click', async () => {
                const title = document.getElementById('welcome-msg-title').value.trim();
                const body = document.getElementById('welcome-msg-body').value.trim();
                
                const btnHtml = btnSaveWelcome.innerHTML;
                btnSaveWelcome.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Salvando...';
                
                try {
                    const { error } = await supabase.from('master_settings').upsert({
                        id: 1,
                        welcome_msg_title: title,
                        welcome_msg_body: body
                    });
                    
                    if (error) throw error;
                    if (window.showToast) window.showToast('Mensagem automática salva com sucesso!', 'success');
                } catch(e) {
                    console.error('Erro ao salvar mensagem:', e);
                    if (window.showToast) window.showToast('Erro ao salvar.', 'error');
                } finally {
                    btnSaveWelcome.innerHTML = btnHtml;
                    if (window.lucide) window.lucide.createIcons();
                }
            });
        }

        // Modal Master Tabs
        document.querySelectorAll('.master-tab-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                document.querySelectorAll('.master-tab-btn').forEach(b => {
                    b.classList.remove('active');
                    b.style.borderBottom = 'none';
                    b.style.paddingBottom = '8px';
                });
                const target = e.currentTarget;
                target.classList.add('active');
                target.style.borderBottom = '2px solid var(--color-primary)';
                
                document.querySelectorAll('.master-tab-content').forEach(c => c.classList.add('d-none'));
                document.getElementById(target.getAttribute('data-tab')).classList.remove('d-none');
            });
        });

        const btnCloseModal = document.getElementById('btn-close-modal-plano');
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                document.getElementById('modal-plano').classList.add('d-none');
            });
        }

        const btnSalvarPlano = document.getElementById('btn-salvar-plano');
        if (btnSalvarPlano) {
            btnSalvarPlano.addEventListener('click', () => this.salvarPlano());
        }

        const btnCloseMaster = document.getElementById('btn-close-modal-master');
        if (btnCloseMaster) {
            btnCloseMaster.addEventListener('click', () => {
                document.getElementById('modal-master-settings').classList.add('d-none');
            });
        }


        const btnClearColor = document.getElementById('btn-clear-color');
        if (btnClearColor) {
            btnClearColor.addEventListener('click', () => {
                document.getElementById('master-primary-color').value = '#000000'; // Default black or just visual empty
                // We'll actually delete the key in settings if value is '#000000' and clear was clicked
            });
        }
        
        const btnSalvarMaster = document.getElementById('btn-salvar-master');
        if (btnSalvarMaster) {
            btnSalvarMaster.addEventListener('click', () => this.salvarMasterSettings());
        }

        // --- DELEGAÇÃO DE EVENTOS PARA A TABELA (Garante que os cliques funcionem) ---
        const tbody = document.getElementById('table-body-tenants');
        if (tbody) {
            tbody.addEventListener('click', async (e) => {
                // Toggle Status
                const btnStatus = e.target.closest('.btn-toggle-status');
                if (btnStatus) {
                    const id = btnStatus.getAttribute('data-id');
                    const currentStatus = btnStatus.getAttribute('data-status');
                    const newStatus = currentStatus === 'approved' ? 'suspended' : 'approved';
                    
                    if (window.showConfirm) {
                        window.showConfirm(`Deseja alterar o status da loja para ${newStatus.toUpperCase()}?`, async () => {
                            await this.updateTenantStatus(id, newStatus);
                        });
                    }
                    return;
                }

                // Aprovar Lojista
                const btnApprove = e.target.closest('.btn-approve-tenant');
                if (btnApprove) {
                    const id = btnApprove.getAttribute('data-id');
                    if (window.showConfirm) {
                        window.showConfirm(`Aprovar este lojista e liberar acesso à plataforma?`, async () => {
                            await this.updateTenantStatus(id, 'approved');
                        });
                    }
                    return;
                }

                // Recusar Lojista
                const btnReject = e.target.closest('.btn-reject-tenant');
                if (btnReject) {
                    const id = btnReject.getAttribute('data-id');
                    if (window.showConfirm) {
                        window.showConfirm(`Tem certeza que deseja RECUSAR este lojista? A conta dele será suspensa.`, async () => {
                            await this.updateTenantStatus(id, 'banned');
                        });
                    }
                    return;
                }

                // Logar (Impersonate)
                const btnImpersonate = e.target.closest('.btn-impersonate');
                if (btnImpersonate) {
                    const id = btnImpersonate.getAttribute('data-id');
                    if (window.showConfirm) {
                        window.showConfirm(`Atenção: Você vai assumir a identidade desta loja no painel admin. Deseja continuar?`, () => {
                            this.impersonateTenant(id);
                        });
                    }
                    return;
                }

                // Modal Plano
                const btnPlano = e.target.closest('.btn-edit-plano');
                if (btnPlano) {
                    const id = btnPlano.getAttribute('data-id');
                    const tenant = this.tenants.find(t => t.id == id);
                    if(!tenant) return;
                    
                    const vencimento = tenant.settings?.vencimento;
                    
                    document.getElementById('plano-tenant-id').value = id;
                    document.getElementById('plano-select').value = tenant.settings?.plano_id || '';
                    document.getElementById('plano-vencimento').value = vencimento ? vencimento.split('T')[0] : '';
                    document.getElementById('modal-plano').classList.remove('d-none');
                    return;
                }

                // Modal Master Settings
                const btnMaster = e.target.closest('.btn-master-settings');
                if (btnMaster) {
                    const id = btnMaster.getAttribute('data-id');
                    const tenant = this.tenants.find(t => t.id == id);
                    if (!tenant) return;

                    document.getElementById('master-tenant-id').value = id;
                    
                    // TAB: Configuração Geral
                    document.getElementById('master-config-name').value = tenant.name || '';
                    document.getElementById('master-config-slug').value = tenant.slug || '';
                    document.getElementById('master-config-plano').value = tenant.settings?.plano_id || '';
                    const venc = tenant.settings?.vencimento;
                    document.getElementById('master-config-vencimento').value = venc ? venc.split('T')[0] : '';

                    // TAB: Limites
                    document.getElementById('master-product-limit').value = tenant.settings?.product_limit || '';
                    document.getElementById('master-staff-limit').value = tenant.settings?.staff_limit || '';
                    document.getElementById('master-storage-limit').value = tenant.settings?.storage_limit_mb || '';
                    document.getElementById('master-client-limit').value = tenant.settings?.client_limit || '';
                    document.getElementById('master-allow-booking').checked = tenant.settings?.allow_booking !== false;
                    document.getElementById('master-allow-catalog').checked = tenant.settings?.allow_catalog !== false;
                    document.getElementById('master-allow-branches').checked = tenant.settings?.allow_branches === true;

                    // TAB: Personalização
                    document.getElementById('master-primary-color').value = tenant.settings?.primary_color || '#6366f1';
                    document.getElementById('master-whatsapp').value = tenant.settings?.whatsapp || '';
                    document.getElementById('master-custom-domain').value = tenant.settings?.custom_domain || '';
                    document.getElementById('master-verified-badge').checked = tenant.settings?.verified === true;
                    document.getElementById('master-white-label').checked = tenant.settings?.white_label === true;

                    // TAB: Integrações & Financeiro
                    document.getElementById('master-payment-gateway').value = tenant.settings?.payment_gateway || '';
                    document.getElementById('master-transaction-fee').value = tenant.settings?.transaction_fee || '';
                    document.getElementById('master-webhook-url').value = tenant.settings?.webhook_url || '';
                    document.getElementById('master-subscription-discount').value = tenant.settings?.subscription_discount || '';
                    document.getElementById('master-allow-payments').checked = tenant.settings?.allow_payments !== false;
                    document.getElementById('master-free-subscription').checked = tenant.settings?.free_subscription === true;

                    // TAB: Zona de Risco
                    document.getElementById('master-block-export').checked = tenant.settings?.block_export === true;
                    document.getElementById('master-force-2fa').checked = tenant.settings?.force_2fa === true;
                    document.getElementById('master-ban-toggle').checked = (tenant.approval_status === 'banned');
                    
                    // TAB: Menus Extra (Overrides)
                    const menuOverrides = tenant.settings?.menu_overrides || {};
                    document.querySelectorAll('.menu-override-select').forEach(select => {
                        const modId = select.getAttribute('data-module');
                        select.value = menuOverrides[modId] || 'inherit';
                    });

                    document.getElementById('modal-master-settings').classList.remove('d-none');
                    return;
                }

                // Deletar Tenant
                const btnDelete = e.target.closest('.btn-delete-tenant');
                if (btnDelete) {
                    const id = btnDelete.getAttribute('data-id');
                    const tenant = this.tenants.find(t => t.id == id);
                    if (!tenant) return;
                    
                    if (window.showPrompt) {
                        window.showPrompt(
                            `DANGER: Você está prestes a excluir a loja "${tenant.name}" permanentemente.\n\nPara continuar, digite exatamente o nome da loja abaixo:`,
                            `Digite "${tenant.name}" para confirmar`,
                            async (confirmName) => {
                                if (confirmName !== null) {
                                    if (confirmName.trim().toLowerCase() === tenant.name.trim().toLowerCase()) {
                                        try {
                                            // Excluir dependências na ordem correta (filhos primeiro) para evitar erro 409
                                            const tablesToClean = [
                                                'avaliacoes', 'comissoes', 'appointments', 
                                                'support_tickets', 'notifications', 'alerts', 
                                                'activity_log', 'auditoria_logs', 'superadmin_logs', 
                                                'cupons', 'termos_aceite', 'feature_flags', 
                                                'tenant_domains', 'metas_desempenho', 'marketplace',
                                                'clientes', 'services', 'profissionais', 'branches'
                                            ];
                                            
                                            await Promise.all(tablesToClean.map(async (table) => {
                                                const { error: errDep } = await supabase.from(table).delete().eq('tenant_id', id);
                                                // Ignorar erros caso a tabela não exista ou algo menor, queremos tentar o máximo
                                                if (errDep) console.warn(`Erro limpando ${table}:`, errDep);
                                            }));
                                            
                                            // Agora exclui a loja
                                            const { error } = await supabase.from('tenants').delete().eq('id', id);
                                            if (error) throw error;
                                            
                                            if (window.showToast) window.showToast('Loja excluída com sucesso!', 'success');
                                            await this.loadTenants(document.getElementById('input-search-tenant')?.value.trim() || '');
                                        } catch (err) {
                                            console.error('Erro ao excluir tenant:', err);
                                            if (window.showToast) window.showToast('Erro ao excluir a loja.', 'error');
                                        }
                                    } else {
                                        if (window.showToast) window.showToast('Nome incorreto. Exclusão cancelada.', 'warning');
                                    }
                                }
                            }
                        );
                    } else if (window.prompt) {
                        // Fallback case just in case window.prompt is not available
                        if (window.showConfirm) {
                            window.showConfirm(`DANGER: Você está prestes a excluir esta loja inteira permanentemente. Deseja continuar?`, async () => {
                                try {
                                    const { error } = await supabase.from('tenants').delete().eq('id', id);
                                    if (error) throw error;
                                    if (window.showToast) window.showToast('Loja excluída com sucesso!', 'success');
                                    await this.loadTenants(document.getElementById('input-search-tenant')?.value.trim() || '');
                                } catch (err) {
                                    console.error('Erro ao excluir tenant:', err);
                                    if (window.showToast) window.showToast('Erro ao excluir a loja.', 'error');
                                }
                            });
                        }
                    }
                    return;
                }
            });
        }
    }

    impersonateTenant(id) {
        // Redireciona para o painel de lojista "encarnando" o ID selecionado
        // O painel admin lê "impersonate_tenant_id"
        localStorage.setItem('impersonate_tenant_id', id);
        if (window.showToast) window.showToast('Transferindo sessão...', 'success');
        setTimeout(() => {
            window.location.href = '../admin/index.html';
        }, 1000);
    }

    async updateTenantStatus(id, newStatus) {
        try {
            const isActive = newStatus === 'approved';
            const { error } = await supabase.from('tenants').update({ approval_status: newStatus, is_active: isActive }).eq('id', id);
            if (error) throw error;
            if (window.showToast) window.showToast('Status atualizado com sucesso!', 'success');
            await this.loadTenants(document.getElementById('input-search-tenant')?.value.trim() || '');
        } catch (error) {
            console.error('Erro ao atualizar status:', error);
            if (window.showToast) window.showToast('Erro ao atualizar status.', 'error');
        }
    }

    async salvarPlano() {
        const id = document.getElementById('plano-tenant-id').value;
        const planoId = document.getElementById('plano-select').value;
        const vencimento = document.getElementById('plano-vencimento').value;

        try {
            const tenant = this.tenants.find(t => t.id == id);
            if (!tenant) throw new Error('Tenant não encontrado na memória.');

            const settings = tenant.settings || {};
            if(planoId) settings.plano_id = planoId; else delete settings.plano_id;
            settings.vencimento = vencimento ? new Date(vencimento).toISOString() : null;

            const { error } = await supabase.from('tenants').update({ settings: settings }).eq('id', id);
            if (error) throw error;

            if (window.showToast) window.showToast('Assinatura salva com sucesso!', 'success');
            document.getElementById('modal-plano').classList.add('d-none');
            await this.loadTenants(document.getElementById('input-search-tenant')?.value.trim() || '');
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            if (window.showToast) window.showToast('Erro ao salvar plano.', 'error');
        }
    }

    async salvarMasterSettings() {
        const id = document.getElementById('master-tenant-id').value;
        const tenant = this.tenants.find(t => t.id == id);
        if (!tenant) return;

        // Configuração Geral
        const tenantName = document.getElementById('master-config-name').value.trim();
        const tenantSlug = document.getElementById('master-config-slug').value.trim();
        const planoId = document.getElementById('master-config-plano').value;
        const vencimento = document.getElementById('master-config-vencimento').value;

        // Limites
        const productLimit = document.getElementById('master-product-limit').value;
        const staffLimit = document.getElementById('master-staff-limit').value;
        const storageLimit = document.getElementById('master-storage-limit').value;
        const clientLimit = document.getElementById('master-client-limit').value;
        
        const allowBooking = document.getElementById('master-allow-booking').checked;
        const allowCatalog = document.getElementById('master-allow-catalog').checked;
        const allowBranches = document.getElementById('master-allow-branches').checked;

        // Personalização
        const primaryColor = document.getElementById('master-primary-color').value;
        const whatsapp = document.getElementById('master-whatsapp').value;
        const customDomain = document.getElementById('master-custom-domain').value;
        const verifiedBadge = document.getElementById('master-verified-badge').checked;
        const whiteLabel = document.getElementById('master-white-label').checked;

        // Integrações
        const paymentGateway = document.getElementById('master-payment-gateway').value;
        const transactionFee = document.getElementById('master-transaction-fee').value;
        const webhookUrl = document.getElementById('master-webhook-url').value;
        const subDiscount = document.getElementById('master-subscription-discount').value;
        const allowPayments = document.getElementById('master-allow-payments').checked;
        const freeSubscription = document.getElementById('master-free-subscription').checked;

        // Risco
        const blockExport = document.getElementById('master-block-export').checked;
        const force2fa = document.getElementById('master-force-2fa').checked;
        const isBanned = document.getElementById('master-ban-toggle').checked;

        // Menus Extra
        const menuOverrides = {};
        document.querySelectorAll('.menu-override-select').forEach(select => {
            const modId = select.getAttribute('data-module');
            if (select.value !== 'inherit') {
                menuOverrides[modId] = select.value;
            }
        });

        if (window.showConfirm) {
            window.showConfirm(`Aplicar configurações master? Se estiver banindo a loja, ela ficará imediatamente offline.`, async () => {
                try {
                    const settings = tenant.settings || {};
                    
                    // Populate Plano & Vencimento (from Configuração Geral tab)
                    if (planoId) settings.plano_id = planoId; else delete settings.plano_id;
                    settings.vencimento = vencimento ? new Date(vencimento).toISOString() : null;

                    // Populate Limites
                    if (productLimit) settings.product_limit = parseInt(productLimit); else delete settings.product_limit;
                    if (staffLimit) settings.staff_limit = parseInt(staffLimit); else delete settings.staff_limit;
                    if (storageLimit) settings.storage_limit_mb = parseInt(storageLimit); else delete settings.storage_limit_mb;
                    if (clientLimit) settings.client_limit = parseInt(clientLimit); else delete settings.client_limit;
                    settings.allow_booking = allowBooking;
                    settings.allow_catalog = allowCatalog;
                    settings.allow_branches = allowBranches;

                    // Populate Personalização
                    if (primaryColor && primaryColor !== '#000000') settings.primary_color = primaryColor; else delete settings.primary_color;
                    settings.whatsapp = whatsapp.trim();
                    settings.custom_domain = customDomain.trim();
                    settings.verified = verifiedBadge;
                    settings.white_label = whiteLabel;

                    // Populate Integrações
                    settings.payment_gateway = paymentGateway;
                    if (transactionFee) settings.transaction_fee = parseFloat(transactionFee); else delete settings.transaction_fee;
                    settings.webhook_url = webhookUrl.trim();
                    if (subDiscount) settings.subscription_discount = parseFloat(subDiscount); else delete settings.subscription_discount;
                    settings.allow_payments = allowPayments;
                    settings.free_subscription = freeSubscription;

                    // Populate Risco
                    settings.block_export = blockExport;
                    settings.force_2fa = force2fa;
                    
                    // Populate Menus Extra
                    settings.menu_overrides = menuOverrides;

                    const newStatus = isBanned ? 'banned' : (tenant.approval_status === 'banned' ? 'approved' : tenant.approval_status);

                    const btnSalvar = document.getElementById('btn-salvar-master');
                    const originalHtml = btnSalvar.innerHTML;
                    btnSalvar.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Salvando...';
                    if (window.lucide) window.lucide.createIcons();
                    
                    const updates = { 
                        settings: settings,
                        approval_status: newStatus,
                        is_active: newStatus === 'approved'
                    };
                    
                    if (tenantName) updates.name = tenantName;
                    if (tenantSlug) updates.slug = tenantSlug;

                    const { error } = await supabase.from('tenants').update(updates).eq('id', id);
                    
                    btnSalvar.innerHTML = originalHtml;
                    if (window.lucide) window.lucide.createIcons();

                    if (error) throw error;

                    if (window.showToast) window.showToast('Configurações Master aplicadas!', 'success');
                    document.getElementById('modal-master-settings').classList.add('d-none');
                    await this.loadTenants(document.getElementById('input-search-tenant')?.value.trim() || '');
                } catch (error) {
                    console.error('Erro ao salvar Master Settings:', error);
                    if (window.showToast) window.showToast('Erro ao salvar configurações.', 'error');
                }
            });
        }
    }

    destroy() {
        clearTimeout(this.searchTimeout);
    }
}
