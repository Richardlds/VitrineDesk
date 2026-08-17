import { supabase } from '../core/supabaseClient.js';

export class acompanhamentoController {
    constructor() {
        this.tenants = [];
        this.planos = [];
        this.filteredTenants = [];
        this.debounceTimer = null;
    }

    async init() {
        try {
            this.bindEvents();
            await this.loadPlanos();
            await this.loadTenants();
        } catch (error) {
            console.error('Erro ao iniciar acompanhamento:', error);
        }
    }

    bindEvents() {
        const searchInput = document.getElementById('search-acompanhamento');
        if (searchInput) {
            searchInput.addEventListener('input', (e) => {
                clearTimeout(this.debounceTimer);
                this.debounceTimer = setTimeout(() => {
                    this.filterTenants(e.target.value);
                }, 300);
            });
        }

        const btnCloseModal = document.getElementById('btn-close-modal-progresso');
        if (btnCloseModal) {
            btnCloseModal.addEventListener('click', () => {
                document.getElementById('modal-progresso').classList.add('d-none');
            });
        }

        const tbody = document.getElementById('table-body-acompanhamento');
        if (tbody) {
            tbody.addEventListener('click', (e) => {
                const btnProgresso = e.target.closest('.btn-ver-progresso');
                if (btnProgresso) {
                    const id = btnProgresso.getAttribute('data-id');
                    const nome = btnProgresso.getAttribute('data-nome');
                    this.abrirProgresso(id, nome);
                }
            });
        }
    }

    async loadPlanos() {
        try {
            const { data, error } = await supabase.from('plans').select('id, name');
            if (!error && data) {
                this.planos = data;
            }
        } catch (e) {
            console.warn('Erro ao carregar planos', e);
        }
    }

    async loadTenants() {
        const tbody = document.getElementById('table-body-acompanhamento');
        if (!tbody) return;

        try {
            const { data, error } = await supabase
                .from('tenants')
                .select('id, name, slug, approval_status, settings, created_at')
                .order('created_at', { ascending: false });

            if (error) throw error;

            this.tenants = data || [];
            this.filteredTenants = [...this.tenants];
            this.renderTable();
        } catch (error) {
            console.error('Erro ao buscar tenants:', error);
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-danger">Erro ao carregar dados. ${error.message}</td></tr>`;
        }
    }

    filterTenants(query) {
        if (!query.trim()) {
            this.filteredTenants = [...this.tenants];
        } else {
            const q = query.toLowerCase();
            this.filteredTenants = this.tenants.filter(t => 
                (t.name && t.name.toLowerCase().includes(q)) || 
                (t.slug && t.slug.toLowerCase().includes(q))
            );
        }
        this.renderTable();
    }

    renderTable() {
        const tbody = document.getElementById('table-body-acompanhamento');
        if (!tbody) return;

        if (this.filteredTenants.length === 0) {
            tbody.innerHTML = `<tr><td colspan="4" class="text-center py-5 text-secondary">Nenhuma loja encontrada.</td></tr>`;
            return;
        }

        let html = '';
        this.filteredTenants.forEach(t => {
            const planoId = t.settings?.plano_id;
            const planoObj = this.planos.find(p => p.id === planoId);
            const planoName = planoObj ? planoObj.name : 'Sem Plano';
            
            let statusBadge = '';
            if (t.approval_status === 'approved') statusBadge = '<span class="badge bg-success-light text-success text-xs px-2 py-1 rounded">Aprovado</span>';
            else if (t.approval_status === 'pending') statusBadge = '<span class="badge bg-warning-light text-warning text-xs px-2 py-1 rounded">Pendente</span>';
            else if (t.approval_status === 'rejected') statusBadge = '<span class="badge bg-danger-light text-danger text-xs px-2 py-1 rounded">Bloqueado</span>';
            else statusBadge = `<span class="badge bg-placeholder text-secondary text-xs px-2 py-1 rounded">${t.approval_status || 'N/A'}</span>`;

            html += `
                <tr class="border-bottom-dashed border-placeholder hover:bg-hover transition-colors">
                    <td class="py-3 px-4">
                        <div class="font-bold text-primary">${t.name}</div>
                        <div class="text-xs text-secondary">vitrinedesk.com/${t.slug}</div>
                    </td>
                    <td class="py-3 px-4 text-center">${statusBadge}</td>
                    <td class="py-3 px-4 text-center">
                        <span class="badge bg-primary-light text-primary text-xs px-2 py-1 rounded">${planoName}</span>
                    </td>
                    <td class="py-3 px-4 text-right">
                        <button class="btn bg-danger-light text-danger border-none rounded px-3 py-1 text-xs font-bold cursor-pointer hover:bg-danger transition-colors hover:text-white btn-ver-progresso" data-id="${t.id}" data-nome="${t.name}">
                            <i data-lucide="bar-chart" class="icon-sm inline-block mr-1" style="vertical-align: middle;"></i> Analisar
                        </button>
                    </td>
                </tr>
            `;
        });

        tbody.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    async abrirProgresso(tenantId, tenantNome) {
        document.getElementById('progresso-nome-loja').textContent = `Análise: ${tenantNome}`;
        document.getElementById('modal-progresso').classList.remove('d-none');
        document.getElementById('progresso-loading').classList.remove('d-none');
        document.getElementById('progresso-content').classList.add('d-none');

        const tenant = this.tenants.find(t => t.id === tenantId);
        
        try {
            // Verifica na Settings do Tenant
            const hasWhatsapp = !!(tenant?.settings?.whatsapp || tenant?.settings?.support_whatsapp);
            
            // Requisitos baseados no DB
            // Para performance, usamos count: exact, head: true para não baixar os dados
            const pServices = supabase.from('services').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
            const pProfs = supabase.from('profissionais').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
            const pClientes = supabase.from('clientes').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);
            const pAppts = supabase.from('appointments').select('*', { count: 'exact', head: true }).eq('tenant_id', tenantId);

            const [resSrv, resProf, resCli, resAppt] = await Promise.all([pServices, pProfs, pClientes, pAppts]);

            const checks = [
                { id: 'req-whatsapp', title: 'WhatsApp de Suporte/Contato configurado', success: hasWhatsapp },
                { id: 'req-services', title: 'Pelo menos 1 Serviço cadastrado', success: (resSrv.count > 0) },
                { id: 'req-equipe', title: 'Pelo menos 1 Profissional na Equipe', success: (resProf.count > 0) },
                { id: 'req-clientes', title: 'Pelo menos 1 Cliente registrado', success: (resCli.count > 0) },
                { id: 'req-appts', title: 'Primeiro Agendamento ou Venda (OS) concluída', success: (resAppt.count > 0) }
            ];

            const total = checks.length;
            const concluidos = checks.filter(c => c.success).length;
            const porcentagem = Math.round((concluidos / total) * 100);

            // Renderizar
            this.renderProgresso(checks, porcentagem);

        } catch (error) {
            console.error('Erro ao calcular progresso:', error);
            if(window.showToast) window.showToast('Erro ao carregar análise', 'error');
            document.getElementById('modal-progresso').classList.add('d-none');
        }
    }

    renderProgresso(checks, porcentagem) {
        document.getElementById('progresso-loading').classList.add('d-none');
        document.getElementById('progresso-content').classList.remove('d-none');

        document.getElementById('progresso-porcentagem').textContent = `${porcentagem}%`;
        const barra = document.getElementById('progresso-barra');
        barra.style.width = '0%';
        
        // Define cor da barra baseado no progresso
        barra.className = 'h-100 transition-all duration-1000';
        if (porcentagem === 100) barra.classList.add('bg-success');
        else if (porcentagem >= 50) barra.classList.add('bg-warning');
        else barra.classList.add('bg-danger');

        setTimeout(() => {
            barra.style.width = `${porcentagem}%`;
        }, 100);

        const container = document.getElementById('progresso-checklist');
        let html = '';

        checks.forEach(chk => {
            const icon = chk.success 
                ? '<div class="w-32px h-32px rounded-full bg-success-light flex align-center justify-center text-success shrink-0"><i data-lucide="check" class="icon-sm m-0"></i></div>'
                : '<div class="w-32px h-32px rounded-full bg-placeholder flex align-center justify-center text-secondary shrink-0 opacity-50"><i data-lucide="circle" class="icon-sm m-0"></i></div>';
            
            const textClass = chk.success ? 'text-white font-medium' : 'text-secondary';
            
            html += `
                <div class="flex align-center gap-3 p-3 rounded-lg border border-dashed ${chk.success ? 'border-success bg-success-light bg-opacity-10' : 'border-placeholder bg-placeholder bg-opacity-10'}">
                    ${icon}
                    <span class="text-sm ${textClass} flex-1">${chk.title}</span>
                </div>
            `;
        });

        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();
    }

    destroy() {
        // cleanup
        clearTimeout(this.debounceTimer);
    }
}
