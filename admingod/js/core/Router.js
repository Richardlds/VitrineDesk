import { supabase } from './supabaseClient.js';

export class Router {
    constructor() {
        this.routes = {
            'dashboard': { file: '/admingod/views/dashboard.html', controller: 'dashboardController' },
            'tenants': { file: '/admingod/views/tenants.html', controller: 'tenantsController' },
            'planos': { file: '/admingod/views/planos.html', controller: 'planosController' },
            'clientes': { file: '/admingod/views/clientes.html', controller: 'clientesController' },
            'mensagens': { file: '/admingod/views/mensagens.html', controller: 'mensagensController' },
            'tickets': { file: '/admingod/views/tickets.html', controller: 'ticketsController' },
            'relatorios': { file: '/admingod/views/relatorios.html', controller: 'relatoriosController' },
            'configuracoes': { file: '/admingod/views/configuracoes.html', controller: 'configuracoesController' },
            'notificacoes': { file: '/admingod/views/notificacoes.html', controller: 'notificacoesController' }
        };
        this.currentController = null;
        this.isNavigating = false; // Prevents race conditions during rapid clicks
        
        // Listen to hash changes
        window.addEventListener('hashchange', () => this.handleRoute());
        
        // Handle Sidebar Navigation
        document.querySelectorAll('.sidebar .nav-item').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const target = e.currentTarget.getAttribute('data-tab');
                if (target) {
                    window.location.hash = `/${target}`;
                    
                    // Fechar sidebar no mobile se estiver aberta
                    const sidebar = document.getElementById('sidebar');
                    if (sidebar && sidebar.classList.contains('open') && window.innerWidth <= 768) {
                        sidebar.classList.remove('open');
                    }
                }
            });
        });
    }

    async handleRoute() {
        let hash = window.location.hash.slice(1) || '/dashboard';
        if (hash.startsWith('/')) hash = hash.slice(1);
        
        const route = this.routes[hash];
        if (!route) {
            console.error('Rota não encontrada:', hash);
            return;
        }

        if (this.isNavigating) {
            console.warn('Navegação em andamento, aguarde...');
            return;
        }
        this.isNavigating = true;

        // Update active class in sidebar
        document.querySelectorAll('.sidebar .nav-item').forEach(btn => {
            btn.classList.remove('active');
            if (btn.getAttribute('data-tab') === hash) {
                btn.classList.add('active');
            }
        });

        // Load View HTML
        try {
            const contentArea = document.getElementById('app-content');
            contentArea.innerHTML = '<div class="flex justify-center align-center h-100"><i data-lucide="loader" class="animate-spin text-primary w-8 h-8"></i></div>';
            if (window.lucide) window.lucide.createIcons();

            const ts = new Date().getTime();
            const response = await fetch(`${route.file}?v=${ts}`);
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            const html = await response.text();
            contentArea.innerHTML = html;

            // Load and init Controller
            if (this.currentController && typeof this.currentController.destroy === 'function') {
                this.currentController.destroy();
            }

            // Cache Busting: garante que o navegador baixe a versão mais recente dos controllers
            const module = await import(`../controllers/${route.controller}.js?v=${ts}`);
            const ControllerClass = module[route.controller];
            this.currentController = new ControllerClass();
            
            // Fogo e esquece (fire and forget). Se o init() travar no Supabase, não trava o roteador inteiro.
            if (typeof this.currentController.init === 'function') {
                this.currentController.init().catch(err => console.error('Controller Init Error:', err));
            }

            if (window.lucide) window.lucide.createIcons();

        } catch (error) {
            console.error('Erro ao carregar rota:', error);
            const contentArea = document.getElementById('app-content');
            contentArea.innerHTML = `
                <div class="flex flex-column align-center justify-center h-100 text-center">
                    <i data-lucide="alert-circle" class="text-danger w-12 h-12 mb-3"></i>
                    <h3 class="text-danger mb-2">Erro ao carregar módulo</h3>
                    <p class="text-secondary">O módulo ${route.controller} ainda está em construção ou apresentou falha.</p>
                </div>
            `;
            if (window.lucide) window.lucide.createIcons();
        } finally {
            this.isNavigating = false;
        }
    }
}
