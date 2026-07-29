import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class configuracoesController {
    constructor() {
        this.tenantId = null;
        this.tenantData = null;
        this.diasDaSemana = ['segunda', 'terca', 'quarta', 'quinta', 'sexta', 'sabado', 'domingo'];
        this.nomesDias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];
    }

    async init() {
        try {
            this.tenantId = await getCurrentTenantId();
            if (!this.tenantId) {
                console.error('Tenant ID não encontrado.');
                return;
            }

            this.renderHorariosUI();
            await this.carregarDados();
            this.bindEvents();
        } catch (error) {
            console.error('Erro na inicialização de Configurações:', error);
            if (window.showToast) window.showToast('Erro ao carregar configurações.', 'error');
        }
    }

    renderHorariosUI() {
        const container = document.getElementById('horarios-container');
        if (!container) return;

        let html = `
            <div class="table-responsive">
                <table class="data-table w-100">
                    <thead>
                        <tr>
                            <th class="text-left text-secondary text-sm font-medium py-3 px-3">Dia da Semana</th>
                            <th class="text-center text-secondary text-sm font-medium py-3 px-3">Abertura</th>
                            <th class="text-center text-secondary text-sm font-medium py-3 px-3">Fechamento</th>
                            <th class="text-right text-secondary text-sm font-medium py-3 px-3">Expediente</th>
                        </tr>
                    </thead>
                    <tbody>
        `;

        this.diasDaSemana.forEach((dia, index) => {
            html += `
                        <tr class="border-bottom-dashed hover:bg-hover transition-colors">
                            <td class="py-3 px-3">
                                <label class="font-medium text-sm text-primary capitalize">${this.nomesDias[index]}</label>
                            </td>
                            <td class="py-3 px-3 text-center">
                                <input type="time" id="horario-inicio-${dia}" class="bg-placeholder border-dashed rounded px-2 py-1 text-sm outline-none font-medium text-primary text-center focus:border-primary">
                            </td>
                            <td class="py-3 px-3 text-center">
                                <input type="time" id="horario-fim-${dia}" class="bg-placeholder border-dashed rounded px-2 py-1 text-sm outline-none font-medium text-primary text-center focus:border-primary">
                            </td>
                            <td class="py-3 px-3 text-right">
                                <label class="flex align-center justify-end gap-2 cursor-pointer">
                                    <input type="checkbox" id="horario-fechado-${dia}" class="custom-checkbox accent-danger">
                                    <span class="text-xs font-bold text-danger">Fechado</span>
                                </label>
                            </td>
                        </tr>
            `;
        });

        html += `
                    </tbody>
                </table>
            </div>
        `;
        container.innerHTML = html;

        this.diasDaSemana.forEach(dia => {
            const chk = document.getElementById(`horario-fechado-${dia}`);
            const inputInicio = document.getElementById(`horario-inicio-${dia}`);
            const inputFim = document.getElementById(`horario-fim-${dia}`);
            if (chk && inputInicio && inputFim) {
                chk.addEventListener('change', (e) => {
                    inputInicio.disabled = e.target.checked;
                    inputFim.disabled = e.target.checked;
                    if (e.target.checked) {
                        inputInicio.classList.add('opacity-50');
                        inputFim.classList.add('opacity-50');
                    } else {
                        inputInicio.classList.remove('opacity-50');
                        inputFim.classList.remove('opacity-50');
                    }
                });
            }
        });
    }

    async carregarDados() {
        try {
            const { data: tenant, error } = await supabase
                .from('tenants')
                .select('*')
                .eq('id', this.tenantId)
                .single();

            if (error) throw error;
            
            // Buscar integrações (Stripe)
            const { data: integrations } = await supabase
                .from('tenant_integrations')
                .select('*')
                .eq('tenant_id', this.tenantId)
                .maybeSingle();

            this.tenantData = tenant;
            const settings = tenant.settings || {};
            const vis = settings.visibilidade || {};
            const social = tenant.social || {};

            const setVal = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
            const setChk = (id, val) => { const el = document.getElementById(id); if (el) el.checked = !!val; };

            // Aba Institucional
            setVal('input-config-nome', tenant.name);
            setVal('input-config-slug', tenant.slug);
            setVal('input-config-razao', settings.razao_social);
            setVal('input-config-title', settings.title);
            setVal('input-config-cnpj', settings.cnpj);

            // Aba Links
            setVal('input-config-email', settings.email);
            setVal('input-social-instagram', social.instagram);
            setVal('input-social-tiktok', social.tiktok);
            setVal('input-social-facebook', social.facebook);
            setVal('input-social-website', social.website);

            // Aba Visibilidade
            setVal('input-config-endereco', settings.endereco);
            setVal('input-config-mapa', settings.mapa_url);

            setChk('toggle-hide-prices', vis.hide_prices);
            setChk('toggle-hide-equipe', vis.hide_equipe);
            setChk('toggle-hide-depoimentos', vis.hide_depoimentos);
            setChk('toggle-hide-galeria', vis.hide_galeria);
            setChk('toggle-hide-mapa', vis.hide_mapa);
            setChk('toggle-hide-horarios', vis.hide_horarios);
            setChk('toggle-hide-planos', vis.hide_planos);

            // Aba Horários
            const horarios = settings.horarios || {};
            this.diasDaSemana.forEach(dia => {
                const cfg = horarios[dia] || { inicio: '09:00', fim: '18:00', fechado: false };
                setVal(`horario-inicio-${dia}`, cfg.inicio);
                setVal(`horario-fim-${dia}`, cfg.fim);
                setChk(`horario-fechado-${dia}`, cfg.fechado);

                const chk = document.getElementById(`horario-fechado-${dia}`);
                if (chk) chk.dispatchEvent(new Event('change'));
            });

            // Aba Stripe
            if (integrations) {
                setVal('input-stripe-public', integrations.stripe_public_key);
                setVal('input-stripe-secret', integrations.stripe_secret_key);
                setVal('input-stripe-webhook', integrations.stripe_webhook_secret);
            }
            
            const hint = document.getElementById('webhook-url-hint');
            if (hint) {
                hint.textContent = `${window.location.origin}/api/stripe/webhook?tenantId=${this.tenantId}`;
            }

        } catch (error) {
            console.error('Erro ao buscar dados do tenant:', error);
            throw error;
        }
    }

    bindEvents() {
        const btnTutorial = document.getElementById('btn-tutorial-stripe-lojista');
        if (btnTutorial) {
            btnTutorial.addEventListener('click', () => {
                document.getElementById('modal-tutorial-stripe-lojista').classList.remove('d-none');
            });
        }

        const btnCloseTutorial = document.getElementById('btn-close-tutorial-stripe-lojista');
        if (btnCloseTutorial) {
            btnCloseTutorial.addEventListener('click', () => {
                document.getElementById('modal-tutorial-stripe-lojista').classList.add('d-none');
            });
        }

        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget));
        });

        const formConfig = document.getElementById('form-configuracoes-loja');
        if (formConfig) {
            formConfig.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.salvarConfiguracoes();
            });
        }
    }

    switchTab(activeBtn) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active', 'text-primary', 'bg-placeholder');
            btn.classList.add('text-secondary', 'bg-transparent');
            btn.style.borderBottom = 'none';
        });

        activeBtn.classList.add('active', 'text-primary', 'bg-placeholder');
        activeBtn.classList.remove('text-secondary', 'bg-transparent');
        activeBtn.style.borderBottom = '2px solid var(--color-primary)';

        document.querySelectorAll('.tab-content').forEach(content => {
            content.classList.add('d-none');
        });

        const targetId = activeBtn.getAttribute('data-tab');
        document.getElementById(targetId)?.classList.remove('d-none');
    }

    async salvarConfiguracoes() {
        const btnSalvar = document.getElementById('btn-salvar-configuracoes');
        const originalHtml = btnSalvar.innerHTML;

        try {
            btnSalvar.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
            btnSalvar.disabled = true;
            if (window.lucide) window.lucide.createIcons();

            const getVal = (id) => document.getElementById(id)?.value?.trim() || null;
            const getChk = (id) => document.getElementById(id)?.checked || false;

            const horarios = {};
            this.diasDaSemana.forEach(dia => {
                horarios[dia] = {
                    inicio: getVal(`horario-inicio-${dia}`),
                    fim: getVal(`horario-fim-${dia}`),
                    fechado: getChk(`horario-fechado-${dia}`)
                };
            });

            const currentSettings = this.tenantData.settings || {};
            const currentSocial = this.tenantData.social || {};

            const updatedSettings = {
                ...currentSettings,
                razao_social: getVal('input-config-razao'),
                title: getVal('input-config-title'),
                cnpj: getVal('input-config-cnpj'),
                email: getVal('input-config-email'),
                endereco: getVal('input-config-endereco'),
                mapa_url: getVal('input-config-mapa'),
                horarios: horarios,
                visibilidade: {
                    hide_prices: getChk('toggle-hide-prices'),
                    hide_equipe: getChk('toggle-hide-equipe'),
                    hide_depoimentos: getChk('toggle-hide-depoimentos'),
                    hide_galeria: getChk('toggle-hide-galeria'),
                    hide_mapa: getChk('toggle-hide-mapa'),
                    hide_horarios: getChk('toggle-hide-horarios'),
                    hide_planos: getChk('toggle-hide-planos')
                }
            };

            const updatedSocial = {
                ...currentSocial,
                instagram: getVal('input-social-instagram'),
                tiktok: getVal('input-social-tiktok'),
                facebook: getVal('input-social-facebook'),
                website: getVal('input-social-website')
            };

            // Atualiza SOMENTE as colunas reais da tabela e joga as personalizações em settings JSONB
            const updates = {
                name: getVal('input-config-nome'),
                slug: getVal('input-config-slug'),
                settings: updatedSettings,
                social: updatedSocial
            };

            const { error } = await supabase
                .from('tenants')
                .update(updates)
                .eq('id', this.tenantId);

            if (error) {
                // Tratamento especial para slug duplicado
                if (error.code === '23505' && error.message.includes('slug')) {
                    throw new Error('Este link (slug) já está em uso por outra loja.');
                }
                throw error;
            }

            // Salvar integrações
            const stripePublic = getVal('input-stripe-public');
            const stripeSecret = getVal('input-stripe-secret');
            const stripeWebhook = getVal('input-stripe-webhook');

            // Se houver algum valor, fazemos o upsert
            if (stripePublic || stripeSecret || stripeWebhook) {
                const { error: errorIntegrations } = await supabase
                    .from('tenant_integrations')
                    .upsert({
                        tenant_id: this.tenantId,
                        stripe_public_key: stripePublic,
                        stripe_secret_key: stripeSecret,
                        stripe_webhook_secret: stripeWebhook,
                        updated_at: new Date().toISOString()
                    });
                    
                if (errorIntegrations) {
                    console.error('Erro ao salvar integrações:', errorIntegrations);
                    throw new Error('As configurações foram salvas, mas houve um erro ao salvar as credenciais do Stripe.');
                }
            }

            if (window.showToast) window.showToast('Configurações salvas com sucesso!', 'success');

            this.tenantData = { ...this.tenantData, ...updates };

            const globalStoreName = document.querySelector('.user-profile .text-primary');
            if (globalStoreName) {
                globalStoreName.textContent = updates.name;
            }
            window.currentTenantSlug = updates.slug;

        } catch (error) {
            console.error('Erro ao salvar configurações:', error);
            if (window.showToast) {
                window.showToast(error.message || 'Erro ao salvar. Verifique sua conexão.', 'error');
            }
        } finally {
            btnSalvar.innerHTML = originalHtml;
            btnSalvar.disabled = false;
            if (window.lucide) window.lucide.createIcons();
        }
    }

    destroy() { }
}
