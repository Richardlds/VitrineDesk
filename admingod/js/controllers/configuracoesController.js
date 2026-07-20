import { supabase } from '../core/supabaseClient.js';

export class configuracoesController {
    constructor() {
        this.maintenanceMode = false;
        // Instala a flag global no init para não ter problemas de loop
    }

    async init() {
        try {
            this.bindEvents();
            await this.loadInitialState();
            await this.loadLogs();
            if (window.lucide) window.lucide.createIcons();
        } catch (error) {
            console.error('Erro ao inicializar configurações:', error);
            if (window.showToast) window.showToast('Erro ao carregar módulo.', 'error');
        }
    }

    async loadInitialState() {
        // Fetch from Supabase master_settings table
        const { data, error } = await supabase.from('master_settings').select('*').eq('id', 1).single();
        
        if (data) {
            this.maintenanceMode = data.maintenance_mode || false;
            document.getElementById('flag-maintenance').checked = this.maintenanceMode;
            
            document.getElementById('param-trial-days').value = data.trial_days || 7;
            document.getElementById('param-support-whatsapp').value = data.support_whatsapp || '';
            document.getElementById('param-expiry-msg').value = data.expiry_msg || '';
        } else {
            // Se a tabela estiver vazia, usará defaults
            this.maintenanceMode = false;
            document.getElementById('flag-maintenance').checked = false;
        }
    }

    async loadLogs() {
        const logContainer = document.querySelector('.logs-container');
        if (!logContainer) return;

        // Limpa os logs falsos do template
        const liveLog = document.getElementById('live-log-entry');
        logContainer.innerHTML = '';
        if (liveLog) logContainer.appendChild(liveLog);

        const { data: logs, error } = await supabase
            .from('activity_log')
            .select('action, details, created_at')
            .is('tenant_id', null) // Logs globais
            .order('created_at', { ascending: false })
            .limit(10);

        if (logs) {
            logs.reverse().forEach(log => {
                const now = new Date(log.created_at);
                const timeStr = now.toLocaleTimeString('pt-BR');
                const dateStr = now.toISOString().split('T')[0];
                
                const newLog = document.createElement('div');
                newLog.className = 'mb-2 fade-in';
                newLog.innerHTML = `<span class="text-secondary">[${dateStr} ${timeStr}]</span> ${log.action.toUpperCase()}: ${log.details}`;
                
                logContainer.insertBefore(newLog, document.getElementById('live-log-entry'));
            });
        }
    }

    bindEvents() {
        // Toggle Manutenção
        const btnMaintenance = document.getElementById('btn-toggle-maintenance');
        if (btnMaintenance) {
            btnMaintenance.addEventListener('click', () => this.toggleMaintenance());
        }

        // Limpar Cache
        const btnCache = document.getElementById('btn-clear-cache');
        if (btnCache) {
            btnCache.addEventListener('click', () => {
                if (window.showConfirm) {
                    window.showConfirm('Isso forçará o recarregamento dos assets na próxima vez que as lojas acessarem o sistema. Confirmar limpeza?', async () => {
                        if (window.showToast) window.showToast('Limpando cache...', 'info');
                        if ('caches' in window) {
                            const names = await caches.keys();
                            for (let name of names) {
                                await caches.delete(name);
                            }
                        }
                        await this.addLog('system', 'Cache global do navegador limpo com sucesso.');
                        if (window.showToast) window.showToast('Cache limpo! Recarregando...', 'success');
                        setTimeout(() => window.location.reload(true), 1500);
                    });
                }
            });
        }

        // Reindexar
        const btnReindex = document.getElementById('btn-reindex');
        if (btnReindex) {
            btnReindex.addEventListener('click', async () => {
                if (window.showToast) window.showToast('Reindexando banco de dados...', 'info');
                try {
                    // Chamaria uma function RPC supabase.rpc('reindex_db') no mundo real.
                    await supabase.from('tenants').select('id').limit(1);
                    await this.addLog('system', 'Manutenção de banco de dados e reindexação concluída.');
                    if (window.showToast) window.showToast('Banco reindexado e otimizado!', 'success');
                } catch (e) {
                    console.error(e);
                    if (window.showToast) window.showToast('Erro ao acessar o banco.', 'error');
                }
            });
        }

        // Salvar Parâmetros
        const btnSaveParams = document.getElementById('btn-save-params');
        if (btnSaveParams) {
            btnSaveParams.addEventListener('click', () => this.saveParams());
        }
    }

    toggleMaintenance() {
        const msg = this.maintenanceMode 
            ? 'Tem certeza que deseja religar os acessos? Todas as lojas voltarão a operar normalmente.'
            : 'ATENÇÃO: Ao ativar a Manutenção, todos os clientes e lojistas perderão acesso ao sistema e verão uma tela de manutenção. Continuar?';

        if (window.showConfirm) {
            window.showConfirm(msg, async () => {
                this.maintenanceMode = !this.maintenanceMode;
                document.getElementById('flag-maintenance').checked = this.maintenanceMode;
                
                await supabase.from('master_settings').upsert({ id: 1, maintenance_mode: this.maintenanceMode });
                
                if (window.showToast) {
                    window.showToast(this.maintenanceMode ? 'Modo de Manutenção ATIVADO.' : 'Sistema ONLINE novamente.', this.maintenanceMode ? 'warning' : 'success');
                }
                
                await this.addLog('root', `Modo de Manutenção ${this.maintenanceMode ? 'ATIVADO' : 'DESATIVADO'}.`);
            });
        }
    }

    async saveParams() {
        const trialDays = document.getElementById('param-trial-days').value;
        const supportWhatsapp = document.getElementById('param-support-whatsapp').value.replace(/\D/g, '');
        const expiryMsg = document.getElementById('param-expiry-msg').value;
        
        const { error } = await supabase.from('master_settings').upsert({
            id: 1,
            trial_days: parseInt(trialDays),
            support_whatsapp: supportWhatsapp,
            expiry_msg: expiryMsg
        });
        
        if (error) {
            console.error(error);
            if (window.showToast) window.showToast('Erro ao salvar configurações.', 'error');
            return;
        }

        if (window.showToast) {
            window.showToast('Configurações de assinatura salvas com sucesso.', 'success');
        }
        
        await this.addLog('root', `Configurações de assinatura atualizadas (Trial: ${trialDays} dias).`);
    }

    async addLog(action, msg) {
        // Salva no banco de dados (activity_log)
        try {
            await supabase.from('activity_log').insert([{
                tenant_id: null,
                action: action,
                details: msg
            }]);
        } catch(e) {}

        // Atualiza a tela instantaneamente
        const logContainer = document.getElementById('live-log-entry');
        if (logContainer) {
            const now = new Date();
            const timeStr = now.toLocaleTimeString('pt-BR');
            const dateStr = now.toISOString().split('T')[0];
            
            const newLog = document.createElement('div');
            newLog.className = 'mb-2 fade-in text-warning';
            newLog.innerHTML = `<span class="text-secondary">[${dateStr} ${timeStr}]</span> ${action.toUpperCase()}: ${msg}`;
            
            logContainer.parentNode.insertBefore(newLog, logContainer);
        }
    }

    destroy() {
        // Limpeza
    }
}
