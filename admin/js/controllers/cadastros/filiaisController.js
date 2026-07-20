import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class filiaisController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
    }

    async init() {
        this.bindEvents();
        await this.loadFiliais();
        if (window.lucide) window.lucide.createIcons();
    }

    async loadFiliais() {
        const grid = document.getElementById('filiais-grid');
        if (!grid) return;

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase
                .from('branches')
                .select('*')
                .eq('tenant_id', tenantId)
                .order('is_main', { ascending: false })
                .order('name', { ascending: true });

            if (error) throw error;
            
            // Se não houver filiais, mostra apenas um estado vazio
            if (!data || data.length === 0) {
                 grid.innerHTML = '<div class="col-span-12 text-center text-secondary py-4">Nenhuma filial cadastrada.</div>';
                 return;
            }

            this.renderFiliais(data);
        } catch (error) {
            console.error('Erro ao carregar filiais:', error);
            grid.innerHTML = '<div class="col-span-12 text-center text-error">Erro ao carregar filiais.</div>';
        }
    }

    renderFiliais(filiais) {
        const grid = document.getElementById('filiais-grid');
        if (!grid) return;

        // Se não houver filial ativa, e houver filiais, defina a principal como ativa
        let activeId = localStorage.getItem('active_branch_id');
        if (!activeId && filiais.length > 0) {
            activeId = (filiais.find(f => f.is_main) || filiais[0]).id;
            localStorage.setItem('active_branch_id', activeId);
        }

        let html = '';

        filiais.forEach(filial => {
            const isActive = filial.id === activeId;
            const cardClass = isActive ? 'border-primary bg-primary-light' : 'border-placeholder bg-surface';
            const btnHtml = isActive 
                ? `<div class="bg-success-light text-success text-sm font-bold px-3 py-3 rounded-md text-center">Filial Atual (Ativa)</div>`
                : `<button class="btn btn-outline border-primary text-primary w-100 py-3 cursor-pointer" onclick="window.acessarFilial('${filial.id}')">Acessar Filial</button>`;

            html += `
                <div class="config-card flex flex-column justify-between border-2 ${cardClass} hover:-translate-y-1 transition-all h-100">
                    <div class="p-4">
                        <div class="flex justify-between align-center mb-2">
                            <div class="flex align-center gap-2">
                                <i data-lucide="${isActive ? 'store' : 'building-2'}" class="${isActive ? 'text-primary' : 'text-secondary'}"></i>
                                <h3 class="text-md font-bold text-primary mb-0">${filial.name || 'Filial Sem Nome'}</h3>
                            </div>
                            ${filial.is_main ? `<span class="badge bg-primary text-white text-xs px-2 py-1 rounded-md">Matriz</span>` : ''}
                        </div>
                        <p class="text-sm text-secondary mb-1"><i data-lucide="map-pin" class="icon-xs inline-block"></i> ${filial.address || 'Sem endereço'}</p>
                    </div>
                    <div class="px-4 pb-4 mt-auto">
                        ${btnHtml}
                    </div>
                </div>
            `;
        });

        grid.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    bindEvents() {
        const modal = document.getElementById('modal-filial');
        const btnNova = document.getElementById('btn-nova-filial');
        const btnClose = document.getElementById('btn-close-modal-filial');
        const form = document.getElementById('form-filial');

        if (btnNova) btnNova.addEventListener('click', () => {
            if (form) form.reset();
            if (modal) modal.classList.remove('d-none');
        });

        if (btnClose) btnClose.addEventListener('click', () => {
            if (modal) modal.classList.add('d-none');
        });

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.createFilial();
            });
        }
        
        window.acessarFilial = (id) => {
            localStorage.setItem('active_branch_id', id);
            if (window.showToast) window.showToast('Trocando de filial...', 'success');
            setTimeout(() => {
                window.location.reload();
            }, 500);
        };
    }

    async createFilial() {
        const btn = document.getElementById('btn-salvar-filial');
        const nome = document.getElementById('input-nome-filial').value;
        const modal = document.getElementById('modal-filial');

        const oldText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Criando...`;
        btn.disabled = true;

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error('Tenant não encontrado');

            // Verifica se já existe alguma filial para saber se esta é a matriz
            const { data: existingBranches } = await supabase
                .from('branches')
                .select('id')
                .eq('tenant_id', tenantId)
                .limit(1);
            
            const isMain = !existingBranches || existingBranches.length === 0;

            const { error } = await supabase.from('branches').insert({
                tenant_id: tenantId,
                name: nome,
                is_main: isMain,
                description: '',
                address: '',
                phone: ''
            });

            if (error) {
                console.error('Supabase Error:', error);
                throw error;
            }

            if (window.showToast) window.showToast('Filial criada com sucesso!', 'success');
            
            if (modal) modal.classList.add('d-none');
            await this.loadFiliais();

        } catch (error) {
            console.error('Erro ao criar filial:', error);
            if (window.showToast) window.showToast('Erro ao criar filial.', 'error');
        } finally {
            btn.innerHTML = oldText;
            btn.disabled = false;
        }
    }

    destroy() {
        delete window.acessarFilial;
    }
}
