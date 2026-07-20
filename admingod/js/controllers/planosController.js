import { supabase } from '../core/supabaseClient.js';

export class planosController {
    constructor() {
        this.planos = [];
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
            this.renderFeaturesForm();
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao iniciar planos:', error);
        }
    }

    renderFeaturesForm() {
        const container = document.getElementById('plano-features-container');
        if (!container) return;

        let html = '';
        this.MENU_MODULES.forEach(module => {
            html += `
                <div class="flex justify-between align-center p-3 rounded-md border-dashed border-placeholder bg-placeholder bg-opacity-20">
                    <span class="text-sm text-primary font-medium">${module.name}</span>
                    <label class="toggle-switch">
                        <input type="checkbox" class="feature-toggle" data-module="${module.id}">
                        <span class="slider"></span>
                    </label>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    bindEvents() {
        const btnNovo = document.getElementById('btn-novo-plano');
        if (btnNovo) {
            btnNovo.addEventListener('click', () => {
                document.getElementById('plano-id').value = '';
                document.getElementById('plano-nome').value = '';
                document.getElementById('plano-preco').value = '';
                document.getElementById('plano-default').checked = false;
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
            tbody.addEventListener('click', (e) => {
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
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Erro ao carregar dados. ${error.message}</td></tr>`;
        }
    }

    renderTable() {
        const tbody = document.getElementById('table-body-planos');
        if (!tbody) return;

        if (this.planos.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-secondary">Nenhum plano cadastrado.</td></tr>`;
            return;
        }

        let html = '';
        this.planos.forEach(p => {
            const featuresAtivas = Object.keys(p.features || {}).filter(k => p.features[k] === true).length;
            const totalFeatures = this.MENU_MODULES.length;
            
            const badgePadrao = p.is_default ? '<span class="badge bg-success-light text-success ml-2 px-2 py-1 rounded text-xs" style="margin-left: 8px;">Padrão</span>' : '';

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4 font-bold text-primary">${p.name} ${badgePadrao}</td>
                    <td class="py-3 px-4 text-success font-medium">R$ ${parseFloat(p.price || 0).toFixed(2).replace('.', ',')}</td>
                    <td class="py-3 px-4 text-center text-sm text-secondary">
                        <span class="badge bg-primary-light text-primary px-2 py-1 rounded">${featuresAtivas}/${totalFeatures} Liberados</span>
                    </td>
                    <td class="py-3 px-4 text-center">
                        <div class="flex justify-center gap-2">
                            <button class="btn bg-primary-light text-primary border-none rounded px-2 py-1 cursor-pointer hover:bg-primary transition-colors hover:text-white btn-edit" data-id="${p.id}">
                                <i data-lucide="edit-3" class="icon-sm m-0"></i>
                            </button>
                            <button class="btn bg-danger-light text-danger border-none rounded px-2 py-1 cursor-pointer hover:bg-danger transition-colors hover:text-white btn-delete" data-id="${p.id}">
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
        document.getElementById('plano-preco').value = plano.price;
        document.getElementById('plano-default').checked = plano.is_default === true;
        document.getElementById('modal-plano-title').textContent = 'Editar Plano';

        const features = plano.features || {};
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
        const isDefault = document.getElementById('plano-default').checked;

        if (!name) {
            if (window.showToast) window.showToast('Preencha o nome do plano', 'error');
            return;
        }

        const features = {};
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
                price: price ? parseFloat(price) : 0,
                features: features,
                is_default: isDefault
            };

            let error;
            if (id) {
                const res = await supabase.from('plans').update(payload).eq('id', id);
                error = res.error;
            } else {
                const res = await supabase.from('plans').insert([payload]);
                error = res.error;
            }

            if (error) throw error;

            if (window.showToast) window.showToast('Plano salvo com sucesso!', 'success');
            document.getElementById('modal-plano').classList.add('d-none');
            await this.loadPlanos();
        } catch (error) {
            console.error('Erro ao salvar plano:', error);
            if (window.showToast) window.showToast('Erro ao salvar plano.', 'error');
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

    destroy() {
        // cleanup
    }
}
