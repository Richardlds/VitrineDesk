import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class marketingController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.tableBody = null;
        this.realtimeChannel = null;

        // Paginação
        this.currentPage = 1;
        this.itemsPerPage = 10;
        this.totalItems = 0;
    }
    
    async init() {
        this.tableBody = document.getElementById('marketing-table-body');
        
        this.renderSkeletons();
        await this.loadPromoBar();
        await this.loadCampanhas();
        this.bindEvents();
        await this.subscribeToRealtimeEvents();
    }

    renderSkeletons() {
        if (!this.tableBody) return;
        
        let skeletonsHtml = '';
        for (let i = 0; i < this.itemsPerPage; i++) {
            skeletonsHtml += `
                <tr>
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
    
    async loadCampanhas() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            // this.renderSkeletons();

            // Buscar do activity_log onde registramos os disparos agregados
            let query = supabase
                .from('activity_log')
                .select('*', { count: 'exact' })
                .eq('tenant_id', tenantId)
                .eq('action', 'marketing_campaign')
                .order('created_at', { ascending: false });

            const from = (this.currentPage - 1) * this.itemsPerPage;
            const to = from + this.itemsPerPage - 1;
            query = query.range(from, to);

            const { data, error, count } = await query;
            if (error) throw error;

            this.totalItems = count || 0;
            this.renderTable(data);
            this.updatePaginationUI();

            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao carregar campanhas:', error);
            if (window.showToast) window.showToast('Erro ao carregar campanhas', 'error');
        }
    }

    async loadPromoBar() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            if (error) throw error;

            const promoBar = data?.settings?.promo_bar || { text: '', active: false, bg_color: '#ff0000', text_color: '#ffffff' };
            
            const inputTxt = document.getElementById('input-promo-text');
            const inputBg = document.getElementById('input-promo-bg');
            const inputTextCol = document.getElementById('input-promo-text-color');
            const chkActive = document.getElementById('input-promo-active');
            const lblStatus = document.getElementById('promo-status-label');

            if (inputTxt) inputTxt.value = promoBar.text || '';
            if (inputBg) inputBg.value = promoBar.bg_color || '#ff0000';
            if (inputTextCol) inputTextCol.value = promoBar.text_color || '#ffffff';
            if (chkActive) {
                chkActive.checked = promoBar.active === true;
                if (lblStatus) {
                    lblStatus.textContent = chkActive.checked ? 'Ativo' : 'Inativo';
                    lblStatus.className = chkActive.checked ? 'text-sm font-bold text-success' : 'text-sm font-bold text-secondary';
                }
            }

            // Update label on change
            if (chkActive && lblStatus) {
                chkActive.addEventListener('change', () => {
                    lblStatus.textContent = chkActive.checked ? 'Ativo' : 'Inativo';
                    lblStatus.className = chkActive.checked ? 'text-sm font-bold text-success' : 'text-sm font-bold text-secondary';
                });
            }
        } catch (e) {
            console.error("Erro ao carregar promo bar", e);
        }
    }

    async savePromoBar(e) {
        e.preventDefault();
        const btn = document.getElementById('btn-save-promo');
        const origText = btn.innerHTML;
        btn.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
        btn.disabled = true;

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error("Tenant inválido");

            const text = document.getElementById('input-promo-text').value.trim();
            const bg_color = document.getElementById('input-promo-bg')?.value || '#ff0000';
            const text_color = document.getElementById('input-promo-text-color')?.value || '#ffffff';
            const active = document.getElementById('input-promo-active').checked;

            // Get current settings first
            const { data: tenant, error: fetchErr } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            if (fetchErr) throw fetchErr;

            const currentSettings = tenant.settings || {};
            currentSettings.promo_bar = { text, bg_color, text_color, active };

            const { error: updateErr } = await supabase.from('tenants').update({ settings: currentSettings }).eq('id', tenantId);
            if (updateErr) throw updateErr;

            if (window.showToast) window.showToast("Barra de Promoção salva com sucesso!", "success");
            
            // Re-render cache if it exists (for fast local updates)
            const cacheKey = `vitrine_profile_${tenantId}`;
            const cachedDataStr = localStorage.getItem(cacheKey);
            if (cachedDataStr) {
                try {
                    const parsed = JSON.parse(cachedDataStr);
                    if (parsed.tenant) {
                        parsed.tenant.settings = currentSettings;
                        localStorage.setItem(cacheKey, JSON.stringify(parsed));
                    }
                } catch(err) {}
            }
        } catch (error) {
            console.error("Erro ao salvar promo bar:", error);
            if (window.showToast) window.showToast("Erro ao salvar configuração.", "error");
        } finally {
            btn.innerHTML = origText;
            btn.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    renderTable(data) {
        if (!this.tableBody) return;

        if (!data || data.length === 0) {
            this.tableBody.innerHTML = `
                <tr>
                    <td colspan="5" class="text-center text-secondary py-3">Nenhuma campanha enviada.</td>
                </tr>
            `;
            return;
        }

        let html = '';
        data.forEach(item => {
            const badgeClass = 'bg-success-light text-success';
            const badgeLabel = 'Enviado';
            const dataEnvio = new Date(item.created_at).toLocaleString('pt-BR');
            
            let details = {};
            try {
                details = typeof item.details === 'string' ? JSON.parse(item.details) : (item.details || {});
            } catch(e) {}

            const titulo = details.title || 'Campanha sem título';
            const publico = details.publico || 'Todos';
            const message = details.message || '';
            const total = details.total_enviados || 0;
            
            let publicoLabel = 'Todos os Clientes';
            if (publico === 'inativos') publicoLabel = 'Inativos';
            if (publico === 'ativos') publicoLabel = 'Frequentes';
            
            html += `
                <tr>
                    <td class="font-medium text-primary">${titulo}</td>
                    <td class="text-sm text-secondary">${publicoLabel} <span class="bg-placeholder text-xs px-1 rounded ml-1">${total} envios</span></td>
                    <td class="text-sm text-secondary">${dataEnvio}</td>
                    <td class="text-center">
                        <span class="status-badge ${badgeClass}">${badgeLabel}</span>
                    </td>
                    <td class="text-right">
                        <button class="btn bg-transparent border-none text-primary cursor-pointer btn-ver-notificacao" data-msg="${encodeURIComponent(message)}" data-title="${encodeURIComponent(titulo)}" data-total="${total}" title="Detalhes da Campanha">
                            <i data-lucide="eye" class="icon-sm"></i>
                        </button>
                    </td>
                </tr>
            `;
        });

        this.tableBody.innerHTML = html;
        
        const btnsVer = this.tableBody.querySelectorAll('.btn-ver-notificacao');
        btnsVer.forEach(btn => {
            btn.addEventListener('click', () => {
                const msg = decodeURIComponent(btn.getAttribute('data-msg'));
                const titulo = decodeURIComponent(btn.getAttribute('data-title'));
                const total = btn.getAttribute('data-total');
                
                const alerta = `Campanha: ${titulo}\nEnviada para: ${total} clientes\n\nMensagem Template:\n${msg}`;
                if (window.showConfirm) window.showConfirm(alerta, "Fechar", "");
            });
        });
    }

    updatePaginationUI() {
        const elInicio = document.getElementById('pag-inicio-marketing');
        const elFim = document.getElementById('pag-fim-marketing');
        const elTotal = document.getElementById('pag-total-marketing');
        const elAtual = document.getElementById('pag-atual-marketing');
        const btnPrev = document.getElementById('btn-prev-page-marketing');
        const btnNext = document.getElementById('btn-next-page-marketing');

        if (!elInicio) return;

        const totalPages = Math.ceil(this.totalItems / this.itemsPerPage) || 1;
        
        if (this.currentPage > totalPages) {
            this.currentPage = totalPages;
            this.loadCampanhas();
            return;
        }

        const startItem = this.totalItems === 0 ? 0 : ((this.currentPage - 1) * this.itemsPerPage) + 1;
        const endItem = Math.min(this.currentPage * this.itemsPerPage, this.totalItems);

        elInicio.textContent = startItem;
        elFim.textContent = endItem;
        elTotal.textContent = this.totalItems;
        elAtual.textContent = `Pág. ${this.currentPage} de ${totalPages}`;

        btnPrev.disabled = this.currentPage === 1 || this.totalItems === 0;
        btnNext.disabled = this.currentPage === totalPages || this.totalItems === 0;
    }

    async subscribeToRealtimeEvents() {
        const tenantId = await getCurrentTenantId();
        if (!tenantId) return;

        this.realtimeChannel = supabase.channel('marketing-channel-' + Date.now())
            .on('postgres_changes', { 
                event: '*', 
                schema: 'public', 
                table: 'activity_log',
                filter: `tenant_id=eq.${tenantId}` 
            }, () => {
                this.loadCampanhas();
            })
            .subscribe();
    }

    bindEvents() {
        const formPromo = document.getElementById('form-promo-bar');
        if (formPromo) {
            formPromo.addEventListener('submit', (e) => this.savePromoBar(e));
        }

        const modal = document.getElementById('modal-marketing');
        const btnNovo = document.getElementById('btn-nova-campanha');
        const btnClose = document.getElementById('btn-close-modal-marketing');
        const form = document.getElementById('form-marketing');

        if (btnNovo && modal) {
            btnNovo.addEventListener('click', () => {
                form.reset();
                modal.classList.remove('d-none');
            });
        }

        if (btnClose && modal) {
            btnClose.addEventListener('click', () => modal.classList.add('d-none'));
        }

        if (form) {
            form.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.enviarCampanha();
            });
        }
        
        // Paginação Botões
        const btnPrev = document.getElementById('btn-prev-page-marketing');
        const btnNext = document.getElementById('btn-next-page-marketing');

        if (btnPrev) {
            btnPrev.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.loadCampanhas();
                }
            });
        }

        if (btnNext) {
            btnNext.addEventListener('click', () => {
                const totalPages = Math.ceil(this.totalItems / this.itemsPerPage);
                if (this.currentPage < totalPages) {
                    this.currentPage++;
                    this.loadCampanhas();
                }
            });
        }
    }

    async enviarCampanha() {
        const btnSalvar = document.querySelector('#form-marketing button[type="submit"]');
        const originalText = btnSalvar.innerHTML;
        btnSalvar.innerHTML = `<i data-lucide="loader-2" class="icon-sm animate-spin"></i> Disparando...`;
        btnSalvar.disabled = true;
        if (window.lucide) window.lucide.createIcons();

        try {
            const tenantId = await getCurrentTenantId();
            const titulo = document.getElementById('input-campanha-titulo').value;
            const publico = document.getElementById('input-campanha-publico').value;
            const mensagemTemplate = document.getElementById('input-campanha-msg').value;

            // 1. Buscar clientes alvo
            let query = supabase.from('clientes').select('id, nome').eq('tenant_id', tenantId).eq('is_blacklisted', false);
            
            if (publico === 'inativos') {
                query = query.is('ultimo_login', null);
            }
            
            const { data: clientes, error: errClientes } = await query;
            if (errClientes) throw errClientes;

            if (!clientes || clientes.length === 0) {
                if (window.showToast) window.showToast('Nenhum cliente encontrado para este público.', 'warning');
                return;
            }

            // 2. Preparar notificações em massa
            const notificacoes = clientes.map(cliente => {
                const msgPersonalizada = mensagemTemplate.replace(/\{\{nome_cliente\}\}/g, cliente.nome || 'Cliente');
                return {
                    tenant_id: tenantId,
                    type: 'marketing',
                    title: titulo,
                    message: msgPersonalizada,
                    is_read: false
                };
            });

            // 3. Inserir no Supabase (Batch insert)
            const { error: errInsert } = await supabase.from('notifications').insert(notificacoes);
            if (errInsert) throw errInsert;

            // 4. Registrar a campanha agregada no activity_log para listar na tabela 1x
            const logDetails = {
                title: titulo,
                publico: publico,
                message: mensagemTemplate,
                total_enviados: clientes.length
            };
            
            const { error: errLog } = await supabase.from('activity_log').insert({
                tenant_id: tenantId,
                action: 'marketing_campaign',
                details: JSON.stringify(logDetails)
            });
            if (errLog) console.error('Aviso: falha ao salvar log da campanha', errLog);

            if (window.showToast) window.showToast(`Campanha enviada para ${clientes.length} clientes!`, 'success');
            document.getElementById('modal-marketing').classList.add('d-none');
            this.currentPage = 1;
            await this.loadCampanhas();

        } catch (error) {
            console.error('Erro ao enviar campanha:', error);
            if (window.showToast) window.showToast('Erro ao disparar campanha. Tente novamente.', 'error');
        } finally {
            btnSalvar.innerHTML = originalText;
            btnSalvar.disabled = false;
        }
    }

    destroy() {
        if (this.realtimeChannel) {
            supabase.removeChannel(this.realtimeChannel);
        }
    }
}
