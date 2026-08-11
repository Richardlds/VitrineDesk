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
                <div class="config-card flex flex-column align-center justify-center text-center p-5" style="margin-top: 2rem;">
                    <i data-lucide="lock" class="text-warning mb-3" style="width: 48px; height: 48px;"></i>
                    <h2 class="text-warning mb-2">Acesso Restrito</h2>
                    <p class="text-secondary">O módulo <strong>${title || tabPath}</strong> não está incluso no seu plano atual.</p>
                    <button class="btn btn-warning mt-4 py-2 px-4 rounded-md cursor-pointer text-white font-bold" onclick="window.open('https://api.whatsapp.com/send?phone=5511999999999', '_blank')">Fazer Upgrade</button>
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
