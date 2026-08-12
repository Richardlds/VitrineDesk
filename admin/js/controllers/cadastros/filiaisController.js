import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

const escapeHTML = (str) => str ? str.replace(/[&<>'"`]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;', '`': '&#96;' }[tag] || tag)) : '';
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
                 this.filiaisCount = 0;
                 grid.innerHTML = '<div class="col-span-12 text-center text-secondary py-4">Nenhuma filial cadastrada.</div>';
                 return;
            }

            this.filiaisCount = data.length;
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
            const topBorderColor = isActive ? 'var(--color-success)' : 'var(--color-primary)';
            const shadowClass = isActive ? 'box-shadow: 0 8px 30px rgba(0,0,0,0.06); transform: translateY(-4px);' : 'box-shadow: 0 4px 15px rgba(0,0,0,0.03); transform: translateY(0);';
            const iconWrapperColor = isActive ? 'bg-success-light' : 'bg-primary-light';
            const iconColor = isActive ? 'text-success' : 'text-primary';
            const iconName = isActive ? 'store' : 'building-2';
            
            const btnHtml = isActive 
                ? `<div class="text-white text-sm font-bold px-4 py-2 rounded-md text-center shadow-sm w-100 flex align-center justify-center gap-2" style="background-color: var(--color-success);">
                     <i data-lucide="check-circle" class="icon-sm"></i> Filial Ativa
                   </div>`
                : `<button class="btn btn-outline text-primary border-primary w-100 py-2 rounded-md cursor-pointer hover:bg-primary-light transition-colors flex align-center justify-center gap-2" onclick="window.acessarFilial('${filial.id}')">
                     Acessar Filial
                   </button>`;

            html += `
                <div class="config-card flex flex-column h-100 relative transition-all" style="border: none; border-top: 4px solid ${topBorderColor}; ${shadowClass}">
                    <div class="p-4 flex-1">
                        <div class="flex justify-between align-start mb-4 border-bottom-dashed border-placeholder pb-3">
                            <div class="kpi-icon-wrapper ${iconWrapperColor}" style="width: 32px; height: 32px;">
                                <i data-lucide="${iconName}" class="${iconColor} icon-sm"></i>
                            </div>
                            ${filial.is_main ? `<span class="text-white text-xs font-bold px-2 py-1 rounded-sm flex align-center gap-1 shadow-sm" style="background-color: var(--color-primary); letter-spacing: 0.5px;"><i data-lucide="crown" class="icon-xs text-white"></i> MATRIZ</span>` : ''}
                        </div>
                        
                        <h3 class="text-primary font-bold m-0 mb-1" style="font-size: 1.25rem;">${escapeHTML(filial.name || 'Filial Sem Nome')}</h3>
                        
                        <p class="text-secondary text-sm m-0 mt-2 flex align-center gap-2" style="line-height: 1.4;">
                            <i data-lucide="map-pin" class="icon-sm flex-shrink-0 opacity-70"></i> 
                            <span class="truncate" title="${escapeHTML(filial.address || '')}">${filial.address ? escapeHTML(filial.address) : '<span class="opacity-50 italic">Sem endereço cadastrado</span>'}</span>
                        </p>
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
            if (!window.checkPlanLimit('max_branches', this.filiaisCount || 0, 'filiais')) {
                return;
            }
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
