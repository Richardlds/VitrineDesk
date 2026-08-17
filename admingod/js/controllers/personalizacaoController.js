export class personalizacaoController {
    constructor() {
        this.STORAGE_KEY = 'vitrinedesk_god_theme_config';
        this.defaultTheme = {
            primary: '#ef4444',
            secondary: '#fca5a5',
            bgBase: '#050505',
            bgSurface: '#111111',
            textPrimary: '#f8fafc',
            textSecondary: '#94a3b8'
        };
        this.godTemplates = {
            'god-red': this.defaultTheme,
            'dark-premium': { primary: '#3B82F6', secondary: '#EC4899', bgBase: '#05050A', bgSurface: '#0F0F13', textPrimary: '#F8F9FA', textSecondary: '#A1A1AA' },
            'neon-cyber': { primary: '#ff00ff', secondary: '#00ffff', bgBase: '#080010', bgSurface: '#120024', textPrimary: '#ffffff', textSecondary: '#f0b3ff' },
            'hacker-green': { primary: '#10b981', secondary: '#34d399', bgBase: '#020617', bgSurface: '#0f172a', textPrimary: '#f1f5f9', textSecondary: '#94a3b8' },
            'corp-indigo': { primary: '#635BFF', secondary: '#32325d', bgBase: '#0A2540', bgSurface: '#0f2942', textPrimary: '#ffffff', textSecondary: '#adbdcc' },
            'barber-gold': { primary: '#d4af37', secondary: '#aa8c2c', bgBase: '#111111', bgSurface: '#1a1a1a', textPrimary: '#ffffff', textSecondary: '#b3b3b3' },
            'light-minimal': { primary: '#000000', secondary: '#444444', bgBase: '#FFFFFF', bgSurface: '#F5F5F5', textPrimary: '#000000', textSecondary: '#666666' },
            'corp-blue': { primary: '#0070d2', secondary: '#005fb2', bgBase: '#F4F6F9', bgSurface: '#FFFFFF', textPrimary: '#16325c', textSecondary: '#514f4d' }
        };
    }

    async init() {
        this.loadCurrentSettings();
        this.bindEvents();

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    loadCurrentSettings() {
        let config = this.defaultTheme;
        const saved = localStorage.getItem(this.STORAGE_KEY);
        if (saved) {
            try { config = JSON.parse(saved); } catch (e) {}
        }
        
        this.updateColorInput('admin-color-primary-input', config.primary);
        this.updateColorInput('admin-color-secondary-input', config.secondary);
        this.updateColorInput('admin-color-bg-base-input', config.bgBase);
        this.updateColorInput('admin-color-bg-surface-input', config.bgSurface);
        this.updateColorInput('admin-color-text-primary-input', config.textPrimary);
        this.updateColorInput('admin-color-text-secondary-input', config.textSecondary);
    }

    bindEvents() {
        // Preview dinâmico para os color pickers
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(input => {
            input.addEventListener('input', (e) => {
                const hexLabel = e.target.nextElementSibling;
                if (hexLabel && hexLabel.classList.contains('color-hex-display')) {
                    hexLabel.textContent = e.target.value;
                }

                // Live preview
                const adminMap = {
                    'admin-color-primary-input': '--color-primary',
                    'admin-color-secondary-input': '--color-secondary',
                    'admin-color-bg-base-input': '--color-bg-base',
                    'admin-color-bg-surface-input': '--color-bg-surface',
                    'admin-color-text-primary-input': '--color-text-primary',
                    'admin-color-text-secondary-input': '--color-text-secondary'
                };
                if (adminMap[e.target.id]) {
                    document.documentElement.style.setProperty(adminMap[e.target.id], e.target.value);
                }
            });
        });

        // Templates
        const templateAdminBtns = document.querySelectorAll('.template-admin-btn');
        templateAdminBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tmpl = e.currentTarget.dataset.template;
                const colors = this.godTemplates[tmpl];
                if (colors) {
                    this.updateColorInput('admin-color-primary-input', colors.primary);
                    this.updateColorInput('admin-color-secondary-input', colors.secondary);
                    this.updateColorInput('admin-color-bg-base-input', colors.bgBase);
                    this.updateColorInput('admin-color-bg-surface-input', colors.bgSurface);
                    this.updateColorInput('admin-color-text-primary-input', colors.textPrimary);
                    this.updateColorInput('admin-color-text-secondary-input', colors.textSecondary);

                    // Live preview do template admin
                    document.documentElement.style.setProperty('--color-primary', colors.primary);
                    document.documentElement.style.setProperty('--color-secondary', colors.secondary);
                    document.documentElement.style.setProperty('--color-bg-base', colors.bgBase);
                    document.documentElement.style.setProperty('--color-bg-surface', colors.bgSurface);
                    document.documentElement.style.setProperty('--color-text-primary', colors.textPrimary);
                    document.documentElement.style.setProperty('--color-text-secondary', colors.textSecondary);

                    if (window.showToast) window.showToast('Template aplicado!', 'info');
                }
            });
        });

        // Botão Salvar
        document.getElementById('btn-save-god-theme')?.addEventListener('click', () => {
            const config = {
                primary: document.getElementById('admin-color-primary-input').value,
                secondary: document.getElementById('admin-color-secondary-input').value,
                bgBase: document.getElementById('admin-color-bg-base-input').value,
                bgSurface: document.getElementById('admin-color-bg-surface-input').value,
                textPrimary: document.getElementById('admin-color-text-primary-input').value,
                textSecondary: document.getElementById('admin-color-text-secondary-input').value
            };

            localStorage.setItem(this.STORAGE_KEY, JSON.stringify(config));
            if (window.showToast) window.showToast('Tema salvo e aplicado!', 'success');
        });

        // Botão Reset
        document.getElementById('btn-reset-god-theme')?.addEventListener('click', () => {
            localStorage.removeItem(this.STORAGE_KEY);
            
            // Remove as variaveis inline para voltar ao root original (god-theme.css)
            document.documentElement.style.removeProperty('--color-primary');
            document.documentElement.style.removeProperty('--color-secondary');
            document.documentElement.style.removeProperty('--color-bg-base');
            document.documentElement.style.removeProperty('--color-bg-surface');
            document.documentElement.style.removeProperty('--color-text-primary');
            document.documentElement.style.removeProperty('--color-text-secondary');

            this.loadCurrentSettings();
            if (window.showToast) window.showToast('Tema padrão restaurado!', 'success');
        });
    }

    updateColorInput(id, value) {
        const input = document.getElementById(id);
        if (input) {
            input.value = value;
            const hexLabel = input.nextElementSibling;
            if (hexLabel && hexLabel.classList.contains('color-hex-display')) {
                hexLabel.textContent = value;
            }
        }
    }

    destroy() {}
}
