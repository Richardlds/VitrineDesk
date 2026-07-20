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

        } catch (error) {
            console.error('Erro ao buscar dados do tenant:', error);
            throw error;
        }
    }

    bindEvents() {
        const tabBtns = document.querySelectorAll('.config-tab-btn');
        const tabContents = document.querySelectorAll('.config-tab-content');

        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                tabBtns.forEach(b => {
                    b.classList.remove('active', 'text-primary');
                    b.classList.add('text-secondary');
                    b.querySelector('.tab-indicator').classList.add('d-none');
                });
                tabContents.forEach(c => c.classList.add('d-none'));

                btn.classList.add('active', 'text-primary');
                btn.classList.remove('text-secondary');
                btn.querySelector('.tab-indicator').classList.remove('d-none');

                document.getElementById(btn.getAttribute('data-target')).classList.remove('d-none');
            });
        });

        const formConfig = document.getElementById('form-configuracoes-loja');
        if (formConfig) {
            formConfig.addEventListener('submit', async (e) => {
                e.preventDefault();
                await this.salvarConfiguracoes();
            });
        }
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
                    hide_horarios: getChk('toggle-hide-horarios')
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
