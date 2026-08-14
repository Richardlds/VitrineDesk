import { TUTORIALS } from './tutorials.js';

export class Router {
    constructor(stateManager) {
        this.state = stateManager;
        this.contentArea = document.getElementById('app-content');
        this.pageTitle = document.getElementById('page-title');
        this.activeController = null;
        
        this.initEventListeners();
        
        // Carrega a rota baseada no hash atual ou o Dashboard como padrão
        this.handleHashChange(true);
    }

    handleHashChange(isInitialLoad = false) {
        let hash = window.location.hash.replace('#/', '').replace('#', '');
        
        // Separa a rota dos parâmetros (ex: estoque/cadastro?id=123)
        let path = hash.split('?')[0];
        
        if (!path) {
            path = 'principal/dashboard';
        }
        
        // O navigate() cuida do cleanup e do carregamento, 
        // e os controllers podem ler os parâmetros olhando para window.location.hash
        this.navigate(path);
    }

    initEventListeners() {
        window.addEventListener('hashchange', () => this.handleHashChange());

        const navItems = document.querySelectorAll('.nav-item');
        
        navItems.forEach(item => {
            item.addEventListener('click', (e) => {
                // Atualiza UI da sidebar
                navItems.forEach(nav => nav.classList.remove('active'));
                const btn = e.currentTarget;
                btn.classList.add('active');
                
                const tabPath = btn.getAttribute('data-tab');
                const titleText = btn.textContent.trim();
                
                // Em vez de chamar this.navigate direto, mudamos o hash e deixamos o evento hashchange cuidar disso
                // Mas para manter compatibilidade com o title, chamamos navigate com o title, E mudamos o hash silenciosamente?
                // Na verdade, só mudar o hash já aciona o hashchange que chama o navigate sem title.
                // Mas queremos o title. Então vamos chamar o navigate.
                window.location.hash = `#/${tabPath}`;
                
                // Fecha a sidebar no mobile
                if (window.innerWidth < 992) {
                    document.getElementById('sidebar').classList.remove('open');
                }
            });
        });
    }

    async navigate(tabPath, title = null) {

        
        // Router Guard (Proteção de Plano)
        if (window.allowedMenus && window.allowedMenus[tabPath] === false) {
            this.contentArea.innerHTML = `
                <div class="flex flex-column align-center justify-center p-5" style="min-height: 65vh;">
                    <div class="config-card p-5 text-center flex flex-column align-center relative overflow-hidden" style="max-width: 420px; width: 100%; border: 1px solid rgba(245, 158, 11, 0.3); background: linear-gradient(145deg, rgba(245, 158, 11, 0.05) 0%, rgba(5, 5, 8, 0.6) 100%); box-shadow: 0 10px 40px rgba(245, 158, 11, 0.1); border-radius: 20px;">
                        <!-- Subtle Glow -->
                        <div style="position: absolute; top: -50%; left: -50%; width: 200%; height: 200%; background: radial-gradient(circle, rgba(245, 158, 11, 0.1) 0%, transparent 50%); pointer-events: none;"></div>
                        
                        <div class="mb-4 flex align-center justify-center relative" style="width: 72px; height: 72px; background: rgba(245, 158, 11, 0.15); border-radius: 50%; border: 1px solid rgba(245, 158, 11, 0.4);">
                            <i data-lucide="lock" style="color: #f59e0b; width: 32px; height: 32px;"></i>
                        </div>
                        
                        <h2 class="mb-2 font-bold text-2xl relative" style="color: #f59e0b; letter-spacing: -0.5px;">Acesso Restrito</h2>
                        <p class="text-secondary mb-4 relative" style="line-height: 1.6; font-size: 15px;">
                            O módulo <strong style="color: var(--text-main); font-weight: 600;">${title || tabPath}</strong> é exclusivo para planos superiores. Evolua seu negócio e desbloqueie esta funcionalidade.
                        </p>
                        
                        <button class="w-100 font-bold flex align-center justify-center gap-2 relative" style="background: #f59e0b; color: #fff; padding: 14px; border-radius: 12px; font-size: 16px; border: none; box-shadow: 0 4px 15px rgba(245, 158, 11, 0.4); cursor:pointer; transition: transform 0.2s ease;" onmouseover="this.style.transform='scale(1.02)'" onmouseout="this.style.transform='scale(1)'" onclick="document.querySelector('.nav-item[data-tab=\\'sistema/assinatura\\']') ? document.querySelector('.nav-item[data-tab=\\'sistema/assinatura\\']').click() : window.open('https://api.whatsapp.com/send?phone=5511999999999', '_blank')">
                            <i data-lucide="zap" class="icon-sm"></i> Fazer Upgrade
                        </button>
                    </div>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
            
            // Remove active style from sidebar since access was denied
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            return;
        }

        // 1. Destruir controller anterior (Router Guard/Cleanup)
        if (this.activeController && typeof this.activeController.destroy === 'function') {
            this.activeController.destroy();
        }

        // Mostrar skeleton de loading global
        this.contentArea.innerHTML = `
            <div class="admin-section">
                <div class="flex flex-wrap justify-between align-center gap-3 mb-4">
                    <div>
                        <div class="skeleton" style="width: 200px; height: 28px; border-radius: 4px; margin-bottom: 8px;"></div>
                        <div class="skeleton" style="width: 300px; height: 16px; border-radius: 4px;"></div>
                    </div>
                    <div class="skeleton" style="width: 120px; height: 40px; border-radius: 8px;"></div>
                </div>
                <div class="config-card">
                    <div class="skeleton" style="width: 100%; height: 300px; border-radius: 8px;"></div>
                </div>
            </div>
        `;

        try {
            // 2. Fetch do HTML da View correspondente
            const response = await fetch(`/admin/views/${tabPath}.html`);
            
            if (!response.ok) {
                throw new Error(`Erro ao carregar a view: ${response.statusText}`);
            }
            
            const html = await response.text();
            
            // 3. Atualizar DOM
            this.contentArea.innerHTML = html;
            if (title) {
                this.pageTitle.textContent = title;
                document.title = `${title} - VitrineDesk`;
            }

            // 4. Carregar Controller Dinamicamente
            const [category, tabName] = tabPath.split('/');
            const controllerUrl = `../controllers/${category}/${tabName}Controller.js`;
            
            const module = await import(controllerUrl);
            
            // O nome da classe exportada deve ser 'dashboardController', 'agendamentosController', etc
            // Como padronizamos no scaffold:
            const ClassName = tabName + 'Controller';
            
            if (module[ClassName]) {
                this.activeController = new module[ClassName](this.state);
                if (typeof this.activeController.init === 'function') {
                    await this.activeController.init();
                }
            } else {
                console.warn(`Controller class ${ClassName} não encontrada em ${controllerUrl}`);
            }
            
            // Recriar ícones Lucide recém injetados no DOM
            if (window.lucide) {
                window.lucide.createIcons();
            }

            // Exibir Tutorial Onboarding (se existir e não tiver sido visto)
            if (TUTORIALS[tabPath] && typeof window.showTutorial === 'function') {
                const tenantId = localStorage.getItem('cachedTenantId') || 'local';
                const seen = localStorage.getItem(`onboarding_${tenantId}_${tabPath}`);
                if (!seen) {
                    // Opcional: Não usamos await aqui para não travar a UI se o usuário interagir
                    window.showTutorial(TUTORIALS[tabPath], tabPath, tenantId);
                }
            }

        } catch (error) {
            console.error('Falha no roteamento:', error);
            this.contentArea.innerHTML = `
                <div class="config-card flex flex-column align-center justify-center text-center p-5" style="margin-top: 2rem;">
                    <i data-lucide="alert-triangle" class="text-danger mb-3" style="width: 48px; height: 48px;"></i>
                    <h2 class="text-danger mb-2">Erro ao carregar módulo</h2>
                    <p class="text-secondary">${error.message}</p>
                    <button onclick="window.location.reload()" class="btn btn-primary mt-4 py-2 px-4 rounded-md cursor-pointer">Recarregar Página</button>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        } finally {
            this.isNavigating = false;
        }
    }
}
