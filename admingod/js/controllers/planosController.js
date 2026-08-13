import { supabase } from '../core/supabaseClient.js';

export class planosController {
    constructor() {
        this.planos = [];
        this.MENU_MODULES = [
            {
                category: 'Principal',
                items: [
                    { 
                        id: 'principal/dashboard', 
                        name: 'Dashboard',
                        subItems: [
                            { id: 'dashboard/financeiro', name: 'Métricas Financeiras' },
                            { id: 'dashboard/agendamentos', name: 'Métricas de Agendamentos' }
                        ]
                    },
                    { id: 'principal/agenda_diaria', name: 'Agenda Diária' },
                    { id: 'principal/agendamentos', name: 'Histórico de Agendamentos' }
                ]
            },
            {
                category: 'Cadastros',
                items: [
                    { 
                        id: 'cadastros/servicos', 
                        name: 'Serviços',
                        subItems: [
                            { id: 'servicos/novo', name: 'Criar Novo Serviço' },
                            { id: 'servicos/categorias', name: 'Gerenciar Categorias' }
                        ]
                    },
                    { 
                        id: 'cadastros/equipe', 
                        name: 'Equipe',
                        subItems: [
                            { id: 'equipe/novo', name: 'Adicionar Profissional' },
                            { id: 'equipe/permissoes', name: 'Permissões de Acesso' }
                        ]
                    },
                    { 
                        id: 'cadastros/clientes', 
                        name: 'Clientes',
                        subItems: [
                            { id: 'clientes/novo', name: 'Adicionar Cliente' },
                            { id: 'clientes/exportar', name: 'Exportar Lista' }
                        ]
                    }
                ]
            },
            {
                category: 'CRM & Vendas',
                items: [
                    { id: 'crm_vendas/planos_clientes', name: 'Planos de Clientes' },
                    { id: 'crm_vendas/cupons', name: 'Cupons de Desconto' },
                    { id: 'crm_vendas/marketing', name: 'Campanhas de Marketing' },
                    { id: 'crm_vendas/blacklist', name: 'Blacklist' }
                ]
            },
            {
                category: 'Gestão',
                items: [
                    { 
                        id: 'estoque/lista', 
                        name: 'Estoque & Catálogo',
                        subItems: [
                            { id: 'estoque/novo', name: 'Cadastrar Produto' },
                            { id: 'estoque/movimentacao', name: 'Movimentação (Entrada/Saída)' }
                        ]
                    },
                    { 
                        id: 'gestao/relatorios', 
                        name: 'Relatórios',
                        subItems: [
                            { id: 'relatorios/vendas', name: 'Relatórios de Vendas/Caixa' },
                            { id: 'relatorios/agendamentos', name: 'Relatórios de Agendamentos' },
                            { id: 'relatorios/comissoes', name: 'Relatórios de Comissões' }
                        ]
                    },
                    { id: 'gestao/lista_os', name: 'Histórico de OS (Vendas)' },
                    { id: 'gestao/os', name: 'Nova OS (Frente de Caixa)' },
                    { id: 'gestao/comissoes', name: 'Gestão de Comissões' },
                    { id: 'gestao/metas', name: 'Metas e Objetivos' },
                    { id: 'gestao/fidelidade', name: 'Programa de Fidelidade' }
                ]
            },
            {
                category: 'Sistema',
                items: [
                    { id: 'cadastros/filiais', name: 'Minhas Filiais' },
                    { id: 'sistema/assinatura', name: 'Minha Assinatura' },
                    { 
                        id: 'sistema/configuracoes', 
                        name: 'Configurações',
                        subItems: [
                            { id: 'configuracoes/identidade', name: 'Aba: Identidade Visual' },
                            { id: 'configuracoes/contatos', name: 'Aba: Contatos e Endereço' },
                            { id: 'configuracoes/visibilidade', name: 'Aba: Visibilidade (SEO)' },
                            { id: 'configuracoes/horarios', name: 'Aba: Horários de Funcionamento' },
                            { id: 'configuracoes/pagamentos', name: 'Aba: Métodos de Pagamento' }
                        ]
                    },
                    { id: 'sistema/personalizacao', name: 'Personalização Avançada (Cores)' },
                    { id: 'sistema/usuarios', name: 'Usuários (Administradores)' },
                    { id: 'sistema/suporte', name: 'Suporte Técnico' }
                ]
            }
        ];
    }

    async init() {
        try {
            this.bindEvents();
            this.renderFeaturesForm();
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao iniciar planos:', error);
        }
    }

    renderFeaturesForm() {
        const container = document.getElementById('plano-features-container');
        if (!container) return;

        let tabsHtml = '<div class="flex gap-2 border-bottom-dashed mb-4" style="border-bottom: 1px solid var(--border-color); overflow-x: auto; padding-bottom: 0.5rem;">';
        let contentHtml = '<div>';

        this.MENU_MODULES.forEach((group, index) => {
            const tabId = `module-tab-${index}`;
            const contentId = `module-content-${index}`;
            const isActive = index === 0;
            
            tabsHtml += `
                <button type="button" class="tab-btn sub-module-tab-btn ${isActive ? 'active' : ''}" data-target="${contentId}" style="white-space: nowrap; font-size: 0.85rem; padding: 0.4rem 0.8rem;">
                    ${group.category}
                </button>
            `;

            contentHtml += `
                <div id="${contentId}" class="sub-module-content" style="display: ${isActive ? 'block' : 'none'};">
                    <div class="grid gap-2" style="grid-template-columns: repeat(auto-fill, minmax(250px, 1fr));">
            `;

            group.items.forEach(module => {
                contentHtml += `
                    <div class="flex justify-between align-center p-3 rounded-md border-dashed border-placeholder bg-placeholder bg-opacity-20">
                        <span class="text-sm text-primary font-medium">${module.name}</span>
                        <label class="toggle-switch">
                            <input type="checkbox" class="feature-toggle" data-module="${module.id}">
                            <span class="slider"></span>
                        </label>
                    </div>
                `;
                if (module.subItems && module.subItems.length > 0) {
                    module.subItems.forEach(sub => {
                        contentHtml += `
                            <div class="flex justify-between align-center p-3 rounded-md border-dashed border-placeholder bg-placeholder bg-opacity-10" style="margin-left: 20px; border-left: 3px solid var(--primary-color);">
                                <span class="text-sm text-secondary font-medium"><i data-lucide="corner-down-right" class="icon-sm inline-block" style="width: 14px; height: 14px;"></i> ${sub.name}</span>
                                <label class="toggle-switch">
                                    <input type="checkbox" class="feature-toggle" data-module="${sub.id}">
                                    <span class="slider"></span>
                                </label>
                            </div>
                        `;
                    });
                }
            });

            contentHtml += `
                    </div>
                </div>
            `;
        });

        tabsHtml += '</div>';
        contentHtml += '</div>';

        container.innerHTML = tabsHtml + contentHtml;
        
        if (window.lucide) window.lucide.createIcons();

        // Bind events for the sub-tabs
        const subTabs = container.querySelectorAll('.sub-module-tab-btn');
        subTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const targetId = e.currentTarget.getAttribute('data-target');
                if(!targetId) return;
                
                // Hide all contents
                container.querySelectorAll('.sub-module-content').forEach(el => el.style.display = 'none');
                // Remove active from all tabs
                container.querySelectorAll('.sub-module-tab-btn').forEach(el => el.classList.remove('active'));
                
                // Show target and activate tab
                document.getElementById(targetId).style.display = 'block';
                e.currentTarget.classList.add('active');
            });
        });
    }

    bindEvents() {
        const btnTutorial = document.getElementById('btn-tutorial-stripe-god');
        if (btnTutorial) {
            btnTutorial.addEventListener('click', () => {
                document.getElementById('modal-tutorial-stripe-god').classList.remove('d-none');
            });
        }

        // Setup Tabs for Modal Plano
        const modalTabs = document.querySelectorAll('#modal-plano .tab-btn');
        modalTabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                const targetId = e.currentTarget.getAttribute('data-tab-target');
                if(!targetId) return;
                
                // Hide all contents
                document.querySelectorAll('#modal-plano .tab-plano-content').forEach(el => el.style.display = 'none');
                // Remove active from all tabs
                document.querySelectorAll('#modal-plano .tab-btn').forEach(el => el.classList.remove('active'));
                
                // Show target and activate tab
                document.getElementById(targetId).style.display = 'block';
                e.currentTarget.classList.add('active');
            });
        });

        const btnCloseTutorial = document.getElementById('btn-close-tutorial-stripe-god');
        if (btnCloseTutorial) {
            btnCloseTutorial.addEventListener('click', () => {
                document.getElementById('modal-tutorial-stripe-god').classList.add('d-none');
            });
        }

        const btnNovo = document.getElementById('btn-novo-plano');
        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                document.getElementById('plano-id').value = '';
                document.getElementById('plano-nome').value = '';
                document.getElementById('plano-preco').value = '';
                document.getElementById('plano-descricao').value = '';
                document.getElementById('plano-beneficios').value = '';
                document.getElementById('plano-default').checked = false;
                document.getElementById('plano-preco-anual').value = '';
                const limites = {
                    max_employees: parseInt(document.getElementById('plano-limite-funcionarios').value) || null,
                    max_services: parseInt(document.getElementById('plano-limite-servicos').value) || null,
                    max_branches: parseInt(document.getElementById('plano-limite-filiais').value) || null,
                    max_clients: parseInt(document.getElementById('plano-limite-clientes').value) || null,
                    max_inventory_items: parseInt(document.getElementById('plano-limite-estoque').value) || null
                };
                document.getElementById('modal-plano-title').textContent = 'Novo Plano';
                document.querySelectorAll('.feature-toggle').forEach(chk => chk.checked = false);
                document.getElementById('modal-plano').classList.remove('d-none');
            });
        }

        const btnClose = document.getElementById('btn-close-modal-plano');
        if (btnClose) {
            btnClose.addEventListener('click', () => {
                document.getElementById('modal-plano').classList.add('d-none');
            });
        }

        const btnSalvar = document.getElementById('btn-salvar-plano');
        if (btnSalvar) {
            btnSalvar.addEventListener('click', () => this.salvarPlano());
        }

        const tbody = document.getElementById('table-body-planos');
        if (tbody) {
            tbody.addEventListener('click', async (e) => {
                const btnEdit = e.target.closest('.btn-edit');
                if (btnEdit) {
                    const id = btnEdit.getAttribute('data-id');
                    this.abrirModalEdicao(id);
                }

                const btnDelete = e.target.closest('.btn-delete');
                if (btnDelete) {
                    const id = btnDelete.getAttribute('data-id');
                    if (window.showConfirm) {
                        window.showConfirm('Deseja realmente excluir este plano? Tenants vinculados podem perder referências.', async () => {
                            await this.deletarPlano(id);
                        });
                    }
                }

                const btnToggle = e.target.closest('.btn-toggle-status');
                if (btnToggle) {
                    const id = btnToggle.getAttribute('data-id');
                    const isActive = btnToggle.getAttribute('data-status') === 'true';
                    await this.toggleStatusPlano(id, !isActive);
                }
            });
        }
    }

    async loadPlanos() {
        const tbody = document.getElementById('table-body-planos');
        if (!tbody) return;

        try {
            const { data, error } = await supabase.from('plans').select('*').order('price', { ascending: true });
            if (error) throw error;
            this.planos = data || [];
            this.renderTable();
        } catch (error) {
            console.error('Erro ao buscar planos:', error);
            tbody.innerHTML = `<tr><td colspan="5" class="text-center py-5 text-danger">Erro ao carregar dados. ${error.message}</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('table-body-planos');
        if (!tbody) return;

        if (this.planos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="6" class="text-center py-5 text-secondary">Nenhum plano cadastrado.</td></tr>`;
            return;
        }

        let html = '';
        this.planos.forEach(p => {
            // Exclui price_annual do contador pois é um campo de preço, não um módulo funcional
            const featuresAtivas = Object.keys(p.features || {}).filter(k => p.features[k] === true && k !== 'price_annual').length;
            const totalFeatures = this.MENU_MODULES.reduce((acc, group) => {
                let count = 0;
                group.items.forEach(item => {
                    count++;
                    if (item.subItems) count += item.subItems.length;
                });
                return acc + count;
            }, 0);
            
            const badgePadrao = p.is_default ? '<span class="badge bg-success-light text-success ml-2 px-2 py-1 rounded text-xs" style="margin-left: 8px;">Padrão</span>' : '';
            const isActive = p.active !== false;
            const statusLabel = isActive ? '<span class="badge bg-success-light text-success px-2 py-1 rounded text-xs">Ativo</span>' : '<span class="badge bg-danger-light text-danger px-2 py-1 rounded text-xs">Inativo</span>';

            let priceAnnual = p.features && p.features.price_annual !== undefined ? p.features.price_annual : null;
            if (priceAnnual === null) {
                priceAnnual = (p.price || 0) * 0.8;
            }

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4 font-bold text-primary">${p.name} ${badgePadrao}</td>
                    <td class="py-3 px-4 text-success font-medium">R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}</td>
                    <td class="py-3 px-4 text-success font-medium">R$ ${parseFloat(priceAnnual).toFixed(2).replace('.', ',')}</td>
                    <td class="py-3 px-4 text-center text-sm text-secondary">
                        <span class="badge bg-primary-light text-primary px-2 py-1 rounded">${featuresAtivas}/${totalFeatures} Liberados</span>
                    </td>
                    <td class="py-3 px-4 text-center">
                        ${statusLabel}
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div class="flex justify-center gap-2 align-center">
                            <button class="btn ${isActive ? 'bg-secondary-light text-secondary hover:bg-secondary' : 'bg-success-light text-success hover:bg-success'} border-none rounded px-2 py-1 cursor-pointer transition-colors hover:text-white btn-toggle-status" data-id="${p.id}" data-status="${isActive}" title="${isActive ? 'Desativar' : 'Ativar'}">
                                <i data-lucide="${isActive ? 'eye-off' : 'eye'}" class="icon-sm m-0"></i>
                            </button>
                            <button class="btn bg-primary-light text-primary border-none rounded px-2 py-1 cursor-pointer hover:bg-primary transition-colors hover:text-white btn-edit" data-id="${p.id}" title="Editar">
                                <i data-lucide="edit-3" class="icon-sm m-0"></i>
                            </button>
                            <button class="btn bg-danger-light text-danger border-none rounded px-2 py-1 cursor-pointer hover:bg-danger transition-colors hover:text-white btn-delete" data-id="${p.id}" title="Excluir">
                                <i data-lucide="trash-2" class="icon-sm m-0"></i>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    abrirModalEdicao(id) {
        const plano = this.planos.find(p => p.id === id);
        if (!plano) return;

        document.getElementById('plano-id').value = plano.id;
        document.getElementById('plano-nome').value = plano.name;
        document.getElementById('plano-preco').value = plano.price || '';
        document.getElementById('plano-descricao').value = plano.description || '';
        document.getElementById('plano-beneficios').value = plano.benefits || '';
        document.getElementById('plano-default').checked = plano.is_default === true;
        document.getElementById('modal-plano-title').textContent = 'Editar Plano';
        
        const features = plano.features || {};
        document.getElementById('plano-preco-anual').value = features.price_annual !== undefined ? features.price_annual : '';
        
        const limits = features.limits || {};
        document.getElementById('plano-limite-funcionarios').value = limits.max_employees !== undefined && limits.max_employees !== -1 ? limits.max_employees : '';
        document.getElementById('plano-limite-servicos').value = limits.max_services !== undefined && limits.max_services !== -1 ? limits.max_services : '';
        document.getElementById('plano-limite-filiais').value = limits.max_branches !== undefined && limits.max_branches !== -1 ? limits.max_branches : '';
        document.getElementById('plano-limite-clientes').value = limits.max_clients !== undefined && limits.max_clients !== -1 ? limits.max_clients : '';
        document.getElementById('plano-limite-estoque').value = limits.max_inventory_items !== undefined && limits.max_inventory_items !== -1 ? limits.max_inventory_items : '';

        document.querySelectorAll('.feature-toggle').forEach(chk => {
            const module = chk.getAttribute('data-module');
            chk.checked = features[module] === true;
        });

        document.getElementById('modal-plano').classList.remove('d-none');
    }

    async salvarPlano() {
        const id = document.getElementById('plano-id').value;
        const name = document.getElementById('plano-nome').value.trim();
        const price = document.getElementById('plano-preco').value;
        const priceAnnual = document.getElementById('plano-preco-anual').value;
        const description = document.getElementById('plano-descricao').value.trim();
        const benefits = document.getElementById('plano-beneficios').value.trim();
        const isDefault = document.getElementById('plano-default').checked;
        
        const limitFunc = document.getElementById('plano-limite-funcionarios').value;
        const limitServ = document.getElementById('plano-limite-servicos').value;
        const limitFil = document.getElementById('plano-limite-filiais').value;
        const limitCli = document.getElementById('plano-limite-clientes').value;
        const limitEstoque = document.getElementById('plano-limite-estoque').value;

        if (!name) {
            if (window.showToast) window.showToast('Preencha o nome do plano', 'error');
            return;
        }

        // Convenção de limites: -1 = ilimitado. Campos vazios no form são tratados como sem restrição.
        const features = {
            limits: {
                max_employees: limitFunc ? parseInt(limitFunc) : -1,
                max_services: limitServ ? parseInt(limitServ) : -1,
                max_branches: limitFil ? parseInt(limitFil) : -1,
                max_clients: limitCli ? parseInt(limitCli) : -1,
                max_inventory_items: limitEstoque ? parseInt(limitEstoque) : -1
            }
        };
        if (priceAnnual) {
            features.price_annual = parseFloat(priceAnnual);
        }
        document.querySelectorAll('.feature-toggle').forEach(chk => {
            const module = chk.getAttribute('data-module');
            features[module] = chk.checked;
        });

        const btnSalvar = document.getElementById('btn-salvar-plano');
        const originalHtml = btnSalvar.innerHTML;
        btnSalvar.innerHTML = '<i data-lucide="loader" class="animate-spin"></i> Salvando...';
        
        try {
            // Se foi marcado como default, retira o default de todos os outros
            if (isDefault) {
                await supabase.from('plans').update({ is_default: false }).neq('id', id || 'new');
            }

            const payload = {
                name: name,
                description: description,
                benefits: benefits,
                price: price ? parseFloat(price) : 0,
                features: features,
                is_default: isDefault
            };

            let error;
            if (id) {
                const res = await supabase.from('plans').update(payload).eq('id', id);
                error = res.error;
            } else {
                // CREATE - Create in Stripe Platform first
                const response = await fetch('/api/stripe/platform/create-plan', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name: payload.name, price: payload.price })
                });
                
                if (!response.ok) {
                    const errData = await response.json();
                    throw new Error(errData.error || 'Erro ao criar no Stripe (Plataforma)');
                }
                const stripeData = await response.json();
                
                payload.stripe_product_id = stripeData.productId;
                payload.stripe_price_id = stripeData.priceId;

                const res = await supabase.from('plans').insert([payload]);
                error = res.error;
            }

            if (error) {
                console.error('Erro detalhado do Supabase:', error);
                throw new Error(error.message || JSON.stringify(error));
            }

            if (window.showToast) window.showToast('Plano salvo com sucesso!', 'success');
            document.getElementById('modal-plano').classList.add('d-none');
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            if (window.showToast) window.showToast(error.message || 'Erro ao salvar plano', 'error');
        } finally {
            btnSalvar.innerHTML = originalHtml;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    async deletarPlano(id) {
        try {
            const { error } = await supabase.from('plans').delete().eq('id', id);
            if (error) throw error;
            
            if (window.showToast) window.showToast('Plano excluído!', 'success');
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao excluir plano:', error);
            if (window.showToast) window.showToast('Erro ao excluir plano.', 'error');
        }
    }

    async toggleStatusPlano(id, isActive) {
        try {
            const { error } = await supabase.from('plans').update({ active: isActive }).eq('id', id);
            
            if (error) {
                // Se a coluna active não existir ainda, vai cair aqui
                if (error.code === 'PGRST204' || error.message?.includes('active')) {
                    if (window.showToast) window.showToast('Você precisa criar a coluna "active" (tipo boolean, default true) na tabela plans no Supabase primeiro.', 'warning');
                    return;
                }
                throw error;
            }
            
            if (window.showToast) window.showToast(`Plano ${isActive ? 'ativado' : 'desativado'} com sucesso!`, 'success');
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao alterar status do plano:', error);
            if (window.showToast) window.showToast('Erro ao alterar status do plano.', 'error');
        }
    }

    destroy() {
        // cleanup
    }
}
