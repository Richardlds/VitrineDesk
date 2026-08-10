import { supabase, getCurrentTenantId, uploadImageToSupabase } from '../../core/supabaseClient.js';

export class personalizacaoController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.logoUrl = null;
        this.faviconUrl = null;
        this.coverUrl = null;
        this.galeria = [];
        this.banners = [];
        this.cropper = null;
        this.currentCropCallback = null;
    }

    async init() {

        // Simular um fetch das configs atuais
        await this.loadCurrentSettings();

        // Bind dos eventos
        this.bindEvents();

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    async loadCurrentSettings() {
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) return;

            const { data, error } = await supabase
                .from('tenants')
                .select('settings, logo_url, favicon_url, cover_url, galeria, whatsapp')
                .eq('id', tenantId)
                .single();

            if (error) throw error;

            this.logoUrl = data.logo_url || null;
            this.faviconUrl = data.favicon_url || null;
            this.coverUrl = data.cover_url || null;
            this.galeria = data.galeria || [];

            let loadedBanners = [];
            if (data?.settings?.personalizacao?.banners) {
                loadedBanners = data.settings.personalizacao.banners;
            }
            this.banners = loadedBanners;

            this.setPreview('preview-logo', 'icon-logo', this.logoUrl);
            this.setPreview('preview-favicon', 'icon-favicon', this.faviconUrl);
            this.setPreview('preview-cover', 'icon-cover', this.coverUrl);
            this.renderBanners();
            this.renderGallery();

            if (data && data.settings && data.settings.personalizacao) {
                const pers = data.settings.personalizacao;
                if (pers.primary_color) this.updateColorInput('color-primary-input', pers.primary_color);
                if (pers.secondary_color) this.updateColorInput('color-secondary-input', pers.secondary_color);
                if (pers.accent_color) this.updateColorInput('color-accent-input', pers.accent_color);
                if (pers.bg_color) this.updateColorInput('color-bg-site-input', pers.bg_color);
                if (pers.card_bg_color) this.updateColorInput('color-bg-cards-input', pers.card_bg_color);
                if (pers.border_color) this.updateColorInput('color-border-input', pers.border_color);
                if (pers.text_color) this.updateColorInput('color-text-primary-input', pers.text_color);
                if (pers.text_muted_color) this.updateColorInput('color-text-secondary-input', pers.text_muted_color);

                // Novos campos
                const setVal = (id, val) => {
                    const el = document.getElementById(id);
                    if (el && val !== undefined) el.value = val;
                };

                setVal('input-font-family', pers.font_family);
                setVal('input-button-style', pers.button_style);
                setVal('input-card-style', pers.card_style);
                setVal('input-logo-size', pers.logo_size);
                setVal('input-logo-format', pers.logo_format);

                if (pers.topbar_bg_color) this.updateColorInput('input-topbar-bg-color', pers.topbar_bg_color);
                if (pers.topbar_text_color) this.updateColorInput('input-topbar-text-color', pers.topbar_text_color);
                setVal('input-topbar-sticky', pers.topbar_sticky !== undefined ? (pers.topbar_sticky ? 'sticky' : 'static') : undefined);

                if (pers.footer_color) this.updateColorInput('input-footer-color', pers.footer_color);
                if (pers.footer_text_color) this.updateColorInput('input-footer-text-color', pers.footer_text_color);
                setVal('input-footer-text', pers.footer_text);

                const whatsappEnabled = document.getElementById('input-whatsapp-enabled');
                if (whatsappEnabled) whatsappEnabled.checked = pers.whatsapp_enabled !== false; // default true
                if (data.whatsapp || pers.whatsapp) document.getElementById('input-whatsapp-number').value = data.whatsapp || pers.whatsapp;
                if (pers.whatsapp_message) document.getElementById('input-whatsapp-message').value = pers.whatsapp_message;
                if (pers.whatsapp_animation) document.getElementById('input-whatsapp-animation').value = pers.whatsapp_animation;
                if (pers.whatsapp_size) document.getElementById('input-whatsapp-size').value = pers.whatsapp_size;
            }

            if (data && data.settings && data.settings.admin_personalizacao) {
                const adminPers = data.settings.admin_personalizacao;
                if (adminPers.primary_color) this.updateColorInput('admin-color-primary-input', adminPers.primary_color);
                if (adminPers.secondary_color) this.updateColorInput('admin-color-secondary-input', adminPers.secondary_color);
                if (adminPers.bg_base) this.updateColorInput('admin-color-bg-base-input', adminPers.bg_base);
                if (adminPers.bg_surface) this.updateColorInput('admin-color-bg-surface-input', adminPers.bg_surface);
                if (adminPers.text_primary) this.updateColorInput('admin-color-text-primary-input', adminPers.text_primary);
                if (adminPers.text_secondary) this.updateColorInput('admin-color-text-secondary-input', adminPers.text_secondary);
            }
        } catch (e) {
            console.error('Erro ao carregar configuracoes de cores:', e);
        }
    }

    bindEvents() {
        const tabBtns = document.querySelectorAll('.tab-btn');
        tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget));
        });

        const btnSave = document.getElementById('btn-save-vitrine');
        if (btnSave) {
            btnSave.addEventListener('click', (e) => this.handleSave(e));
        }

        // Preview dinâmico para todos os color pickers
        const colorPickers = document.querySelectorAll('.color-picker');
        colorPickers.forEach(input => {
            input.addEventListener('input', (e) => {
                const hexLabel = e.target.nextElementSibling;
                if (hexLabel && hexLabel.classList.contains('color-hex-display')) {
                    hexLabel.textContent = e.target.value;
                }
                
                // Live preview para admin
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

        // Setup Color Templates
        const templates = {
            'dark-elegance': {
                primary: '#3B82F6', secondary: '#3b82f6', accent: '#10b981',
                bgSite: '#050505', bgCards: '#121212', border: '#222222',
                textPrimary: '#ffffff', textSecondary: '#9ca3af'
            },
            'barber-classic': {
                primary: '#d4af37', secondary: '#aa0000', accent: '#ffffff',
                bgSite: '#0a0a0a', bgCards: '#141414', border: '#2a2a2a',
                textPrimary: '#ffffff', textSecondary: '#a3a3a3'
            },
            'neon-vibe': {
                primary: '#ff00ff', secondary: '#00ffff', accent: '#ffff00',
                bgSite: '#080010', bgCards: '#150024', border: '#330055',
                textPrimary: '#ffffff', textSecondary: '#ffb3ff'
            },
            'ocean-blue': {
                primary: '#0ea5e9', secondary: '#0284c7', accent: '#38bdf8',
                bgSite: '#081729', bgCards: '#0f2942', border: '#1e3a8a',
                textPrimary: '#f8fafc', textSecondary: '#94a3b8'
            },
            'light-clean': {
                primary: '#0f172a', secondary: '#334155', accent: '#3b82f6',
                bgSite: '#f8fafc', bgCards: '#ffffff', border: '#e2e8f0',
                textPrimary: '#0f172a', textSecondary: '#64748b'
            },
            'forest-green': {
                primary: '#16a34a', secondary: '#22c55e', accent: '#facc15',
                bgSite: '#052e16', bgCards: '#14532d', border: '#166534',
                textPrimary: '#f0fdf4', textSecondary: '#86efac'
            }
        };

        const templateBtns = document.querySelectorAll('.template-btn');
        templateBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tmpl = e.target.dataset.template;
                const colors = templates[tmpl];
                if (colors) {
                    this.updateColorInput('color-primary-input', colors.primary);
                    this.updateColorInput('color-secondary-input', colors.secondary);
                    this.updateColorInput('color-accent-input', colors.accent);
                    this.updateColorInput('color-bg-site-input', colors.bgSite);
                    this.updateColorInput('color-bg-cards-input', colors.bgCards);
                    this.updateColorInput('color-border-input', colors.border);
                    this.updateColorInput('color-text-primary-input', colors.textPrimary);
                    this.updateColorInput('color-text-secondary-input', colors.textSecondary);
                    if (window.showToast) window.showToast('Template aplicado com sucesso!', 'success');
                }
            });
        });

        const adminTemplates = {
            'dark-premium': { primary: '#3B82F6', secondary: '#EC4899', bgBase: '#05050A', bgSurface: '#0F0F13', textPrimary: '#F8F9FA', textSecondary: '#A1A1AA' },
            'corp-blue': { primary: '#0070d2', secondary: '#005fb2', bgBase: '#F4F6F9', bgSurface: '#FFFFFF', textPrimary: '#16325c', textSecondary: '#514f4d' },
            'corp-dark': { primary: '#2f81f7', secondary: '#1f6feb', bgBase: '#0d1117', bgSurface: '#161b22', textPrimary: '#e6edf3', textSecondary: '#848d97' },
            'corp-indigo': { primary: '#635BFF', secondary: '#32325d', bgBase: '#0A2540', bgSurface: '#0f2942', textPrimary: '#ffffff', textSecondary: '#adbdcc' },
            'light-minimal': { primary: '#000000', secondary: '#444444', bgBase: '#FFFFFF', bgSurface: '#F5F5F5', textPrimary: '#000000', textSecondary: '#666666' },
            'neon-cyber': { primary: '#ff00ff', secondary: '#00ffff', bgBase: '#080010', bgSurface: '#120024', textPrimary: '#ffffff', textSecondary: '#f0b3ff' },
            'barber-gold': { primary: '#d4af37', secondary: '#aa8c2c', bgBase: '#111111', bgSurface: '#1a1a1a', textPrimary: '#ffffff', textSecondary: '#b3b3b3' },
            'nature-green': { primary: '#16a34a', secondary: '#15803d', bgBase: '#f0fdf4', bgSurface: '#ffffff', textPrimary: '#14532d', textSecondary: '#166534' }
        };
        const templateAdminBtns = document.querySelectorAll('.template-admin-btn');
        templateAdminBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                const tmpl = e.currentTarget.dataset.template;
                const colors = adminTemplates[tmpl];
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
                    
                    if (window.showToast) window.showToast('Template Admin aplicado!', 'success');
                }
            });
        });

        const btnPreview = document.getElementById('btn-abrir-preview');
        if (btnPreview) {
            btnPreview.addEventListener('click', async () => {
                // Obter slug do DB
                try {
                    const tenantId = await getCurrentTenantId();
                    const { data } = await supabase.from('tenants').select('slug').eq('id', tenantId).single();
                    const slug = data?.slug || 'loja';
                    const baseUrl = window.location.href.split('/admin')[0];
                    window.open(`${baseUrl}/vitrinedesk/${slug}`, '_blank');
                } catch (err) {
                    console.error('Erro ao abrir preview:', err);
                }
            });
        }

        // Uploads
        this.setupImageUpload('btn-upload-logo', 'input-logo', { aspectRatio: NaN }, (base64, file) => {
            this.logoUrl = base64; // Preview
            this.logoFile = file;  // Arquivo para upload
            this.setPreview('preview-logo', 'icon-logo', base64);
        });

        this.setupImageUpload('btn-upload-favicon', 'input-favicon', { aspectRatio: 1 }, (base64, file) => {
            this.faviconUrl = base64; // Preview
            this.faviconFile = file;  // Arquivo para upload
            this.setPreview('preview-favicon', 'icon-favicon', base64);
        });

        const previewCover = document.getElementById('preview-cover');
        const inputCover = document.getElementById('input-cover');
        const btnUploadCover = document.getElementById('preview-cover'); // The div itself acts as button

        if (btnUploadCover && inputCover) {
            btnUploadCover.addEventListener('click', () => inputCover.click());
            inputCover.addEventListener('change', (e) => {
                this.handleFileSelect(e, { aspectRatio: 1920 / 400 }, (base64, file) => {
                    this.coverUrl = base64;
                    this.coverFile = file;
                    if (previewCover) {
                        previewCover.style.backgroundImage = `url('${base64}')`;
                        const iconCover = document.getElementById('icon-cover');
                        if(iconCover) iconCover.classList.add('d-none');
                    }
                });
            });
        }
        
        this.bindCropperEvents();

        // Banners
        const bannersContainer = document.getElementById('banners-container');
        if (bannersContainer) {
            bannersContainer.addEventListener('click', (e) => {
                const slot = e.target.closest('.banner-slot');
                if (slot) {
                    const idx = parseInt(slot.dataset.index);
                    if (idx < this.banners.length) {
                        if (confirm('Deseja remover este banner?')) {
                            this.banners.splice(idx, 1);
                            this.renderBanners();
                        }
                    }
                }
            });
        }

        // Galeria (delega os eventos da galeria gerada)
        const galleryContainer = document.getElementById('gallery-container');
        if (galleryContainer) {
            galleryContainer.addEventListener('click', (e) => {
                const slot = e.target.closest('.gallery-slot');
                if (slot) {
                    const idx = parseInt(slot.dataset.index);
                    if (idx < this.galeria.length) {
                        if (confirm('Deseja remover esta foto da galeria?')) {
                            this.galeria.splice(idx, 1);
                            this.renderGallery();
                        }
                    }
                }
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

    setupImageUpload(btnId, inputId, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => this.handleFileSelect(e, options, callback));
        }
    }

    handleFileSelect(event, options, callback) {
        if (typeof options === 'function') {
            callback = options;
            options = null;
        }
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            if (window.showToast) window.showToast('A imagem deve ter no máximo 2MB', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => {
            if (options && options.aspectRatio !== undefined) {
                this.openCropperModal(e.target.result, options.aspectRatio, (croppedBase64, blob) => {
                    const croppedFile = new File([blob], file.name, { type: 'image/png' });
                    callback(croppedBase64, croppedFile);
                });
            } else {
                callback(e.target.result, file);
            }
        };
        reader.readAsDataURL(file);
        event.target.value = '';
    }

    bindCropperEvents() {
        const modal = document.getElementById('modal-cropper');
        if (!modal) return;
        
        document.getElementById('btn-close-cropper')?.addEventListener('click', () => this.closeCropperModal());
        document.getElementById('btn-cancel-cropper')?.addEventListener('click', () => this.closeCropperModal());
        
        document.getElementById('btn-crop-zoom-in')?.addEventListener('click', () => this.cropper?.zoom(0.1));
        document.getElementById('btn-crop-zoom-out')?.addEventListener('click', () => this.cropper?.zoom(-0.1));
        document.getElementById('btn-crop-rotate-left')?.addEventListener('click', () => this.cropper?.rotate(-45));
        document.getElementById('btn-crop-rotate-right')?.addEventListener('click', () => this.cropper?.rotate(45));
        
        document.getElementById('btn-confirm-cropper')?.addEventListener('click', () => {
            if (!this.cropper) return;
            const canvas = this.cropper.getCroppedCanvas({
                maxWidth: 1920,
                maxHeight: 1920,
                fillColor: '#fff',
                imageSmoothingEnabled: true,
                imageSmoothingQuality: 'high'
            });
            
            if (canvas) {
                const base64 = canvas.toDataURL('image/png');
                canvas.toBlob((blob) => {
                    if (this.currentCropCallback) {
                        this.currentCropCallback(base64, blob);
                    }
                    this.closeCropperModal();
                }, 'image/png');
            }
        });
    }

    openCropperModal(imageUrl, aspectRatio, callback) {
        this.currentCropCallback = callback;
        const modal = document.getElementById('modal-cropper');
        const img = document.getElementById('cropper-image');
        if (!modal || !img) return;
        
        img.src = imageUrl;
        modal.classList.remove('d-none');
        
        if (this.cropper) {
            this.cropper.destroy();
        }
        
        setTimeout(() => {
            this.cropper = new Cropper(img, {
                aspectRatio: aspectRatio,
                viewMode: 1,
                dragMode: 'move',
                autoCropArea: 1,
                restore: false,
                guides: true,
                center: true,
                highlight: false,
                cropBoxMovable: true,
                cropBoxResizable: true,
                toggleDragModeOnDblclick: false,
            });
        }, 100);
    }
    
    closeCropperModal() {
        document.getElementById('modal-cropper')?.classList.add('d-none');
        if (this.cropper) {
            this.cropper.destroy();
            this.cropper = null;
        }
        this.currentCropCallback = null;
    }

    setPreview(previewId, iconId, url) {
        const preview = document.getElementById(previewId);
        const icon = document.getElementById(iconId);
        if (preview) {
            if (url) {
                preview.style.backgroundImage = `url('${url}')`;
                if (icon) icon.classList.add('d-none');
            } else {
                preview.style.backgroundImage = 'none';
                if (icon) icon.classList.remove('d-none');
            }
        }
    }

    renderBanners() {
        const container = document.getElementById('banners-container');
        if (!container) return;

        let html = '<input type="file" id="input-banners" accept="image/*" class="d-none">';
        for (let i = 0; i < 5; i++) {
            if (i < this.banners.length) {
                const item = this.banners[i];
                const bgUrl = item.isNew ? item.preview : item;
                const bgStr = `background-image: url('${bgUrl}'); background-size: cover; background-position: center;`;

                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed cursor-pointer relative banner-slot" data-index="${i}" style="${bgStr}; height: 100px;">
                        <div class="absolute top-0 right-0 bg-danger text-white rounded-bl-md flex justify-center align-center w-24px h-24px hover:bg-danger-hover transition-colors" title="Remover"><i data-lucide="trash-2" class="w-3 h-3"></i></div>
                    </div>
                `;
            } else if (i === this.banners.length) {
                const hoverStyle = `onmouseover="this.style.backgroundColor='rgba(59, 130, 246,0.1)'" onmouseout="this.style.backgroundColor=''"`;
                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed cursor-pointer relative banner-slot" data-index="${i}" ${hoverStyle} style="height: 100px;" onclick="document.getElementById('input-banners').click()">
                        <i data-lucide="plus" class="text-secondary"></i>
                    </div>
                `;
            } else {
                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed relative banner-slot" style="opacity: 0.5; cursor: not-allowed; height: 100px;">
                    </div>
                `;
            }
        }
        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // Re-bind input after innerHTML reset
        const inputBanners = document.getElementById('input-banners');
        if (inputBanners) {
            const newFileInput = inputBanners.cloneNode(true);
            inputBanners.parentNode.replaceChild(newFileInput, inputBanners);
            newFileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e, (base64, file) => {
                    if (this.banners.length < 5) {
                        this.banners.push({ preview: base64, file: file, isNew: true });
                        this.renderBanners();
                    }
                });
            });
        }
    }

    renderGallery() {
        const container = document.getElementById('gallery-container');
        if (!container) return;

        let html = '<input type="file" id="input-gallery" accept="image/*" class="d-none">';
        for (let i = 0; i < 6; i++) {
            if (i < this.galeria.length) {
                const item = this.galeria[i];
                const bgUrl = item.isNew ? item.preview : item;
                const bgStr = `background-image: url('${bgUrl}'); background-size: cover; background-position: center;`;

                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed cursor-pointer aspect-square relative gallery-slot" data-index="${i}" style="${bgStr}">
                        <div class="absolute top-0 right-0 bg-danger text-white rounded-bl-md flex justify-center align-center w-24px h-24px hover:bg-danger-hover transition-colors" title="Remover"><i data-lucide="trash-2" class="w-3 h-3"></i></div>
                    </div>
                `;
            } else if (i === this.galeria.length) {
                const hoverStyle = `onmouseover="this.style.backgroundColor='rgba(59, 130, 246,0.1)'" onmouseout="this.style.backgroundColor=''"`;
                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed cursor-pointer aspect-square relative gallery-slot" data-index="${i}" ${hoverStyle} onclick="document.getElementById('input-gallery').click()">
                        <i data-lucide="plus" class="text-secondary"></i>
                    </div>
                `;
            } else {
                html += `
                    <div class="bg-placeholder rounded-md flex justify-center align-center border-dashed aspect-square relative gallery-slot" style="opacity: 0.5; cursor: not-allowed;">
                    </div>
                `;
            }
        }
        container.innerHTML = html;
        if (window.lucide) window.lucide.createIcons();

        // Re-bind input after innerHTML reset
        const inputGallery = document.getElementById('input-gallery');
        if (inputGallery) {
            // Remove listener antigo recriando o input para evitar múltiplos bindings
            const newFileInput = inputGallery.cloneNode(true);
            inputGallery.parentNode.replaceChild(newFileInput, inputGallery);
            newFileInput.addEventListener('change', (e) => {
                this.handleFileSelect(e, (base64, file) => {
                    if (this.galeria.length < 6) {
                        this.galeria.push({ preview: base64, file: file, isNew: true });
                        this.renderGallery();
                    }
                });
            });
        }
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

    async handleSave(e) {
        const btn = e.currentTarget;
        const originalText = btn.innerHTML;

        btn.innerHTML = `<i data-lucide="loader" class="animate-spin icon-sm"></i> Salvando...`;
        btn.disabled = true;
        btn.style.opacity = '0.7';

        if (window.lucide) window.lucide.createIcons();

        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) throw new Error('Tenant não encontrado');

            // --- Faz os Uploads Pendentes ---
            if (this.logoFile) {
                const url = await uploadImageToSupabase(this.logoFile, 'tenant-images', tenantId);
                if (url) this.logoUrl = url;
            }
            if (this.faviconFile) {
                const url = await uploadImageToSupabase(this.faviconFile, 'tenant-images', tenantId);
                if (url) this.faviconUrl = url;
            }
            if (this.coverFile) {
                const url = await uploadImageToSupabase(this.coverFile, 'tenant-images', tenantId);
                if (url) this.coverUrl = url;
            }

            // Upload dos Banners
            const uploadPromisesBanners = this.banners.map(async (item) => {
                if (item.isNew && item.file) {
                    const url = await uploadImageToSupabase(item.file, 'tenant-images', tenantId);
                    return url ? url : null;
                }
                return item;
            });
            const resultsBanners = await Promise.all(uploadPromisesBanners);
            this.banners = resultsBanners.filter(item => item !== null);

            // Upload das fotos da Galeria
            const uploadPromises = this.galeria.map(async (item) => {
                if (item.isNew && item.file) {
                    const url = await uploadImageToSupabase(item.file, 'tenant-images', tenantId);
                    return url ? url : null;
                }
                return item; // url existente
            });
            const results = await Promise.all(uploadPromises);
            this.galeria = results.filter(item => item !== null);

            // Busca tenant atual para juntar
            const { data: tenantData } = await supabase.from('tenants').select('settings').eq('id', tenantId).single();
            let settings = tenantData?.settings || {};

            if (!settings.personalizacao) settings.personalizacao = {};

            settings.personalizacao = {
                ...settings.personalizacao,
                primary_color: document.getElementById('color-primary-input')?.value,
                secondary_color: document.getElementById('color-secondary-input')?.value,
                accent_color: document.getElementById('color-accent-input')?.value,
                bg_color: document.getElementById('color-bg-site-input')?.value,
                card_bg_color: document.getElementById('color-bg-cards-input')?.value,
                border_color: document.getElementById('color-border-input')?.value,
                text_color: document.getElementById('color-text-primary-input')?.value,
                text_muted_color: document.getElementById('color-text-secondary-input')?.value,

                // Novos campos
                font_family: document.getElementById('input-font-family')?.value,
                button_style: document.getElementById('input-button-style')?.value,
                card_style: document.getElementById('input-card-style')?.value,
                logo_size: document.getElementById('input-logo-size')?.value,
                logo_format: document.getElementById('input-logo-format')?.value,
                topbar_bg_color: document.getElementById('input-topbar-bg-color')?.value,
                topbar_text_color: document.getElementById('input-topbar-text-color')?.value,
                topbar_sticky: document.getElementById('input-topbar-sticky')?.value === 'sticky',
                footer_color: document.getElementById('input-footer-color')?.value,
                footer_text_color: document.getElementById('input-footer-text-color')?.value,
                footer_text: document.getElementById('input-footer-text')?.value,
                whatsapp_enabled: document.getElementById('input-whatsapp-enabled')?.checked,
                whatsapp_message: document.getElementById('input-whatsapp-message')?.value,
                whatsapp_animation: document.getElementById('input-whatsapp-animation')?.value,
                whatsapp_size: document.getElementById('input-whatsapp-size')?.value,
                banners: this.banners.map(b => b.isNew ? b.preview : b)
            };
            
            if (!settings.admin_personalizacao) settings.admin_personalizacao = {};
            settings.admin_personalizacao = {
                ...settings.admin_personalizacao,
                primary_color: document.getElementById('admin-color-primary-input')?.value,
                secondary_color: document.getElementById('admin-color-secondary-input')?.value,
                bg_base: document.getElementById('admin-color-bg-base-input')?.value,
                bg_surface: document.getElementById('admin-color-bg-surface-input')?.value,
                text_primary: document.getElementById('admin-color-text-primary-input')?.value,
                text_secondary: document.getElementById('admin-color-text-secondary-input')?.value
            };

            const whatsappInput = document.getElementById('input-whatsapp-number')?.value || null;
            const updatePayload = {
                settings,
                logo_url: this.logoUrl,
                favicon_url: this.faviconUrl,
                cover_url: this.coverUrl,
                galeria: this.galeria,
                whatsapp: whatsappInput
            };

            const { error } = await supabase.from('tenants').update(updatePayload).eq('id', tenantId);
            if (error) throw error;

            if (window.showToast) {
                window.showToast('Configurações aplicadas para todas as filiais!', 'success');
            }
        } catch (error) {
            console.error(error);
            if (window.showToast) {
                window.showToast('Erro ao salvar as configurações.', 'error');
            }
        } finally {
            btn.innerHTML = originalText;
            btn.disabled = false;
            btn.style.opacity = '1';
        }
    }

    destroy() {
        // Remover listeners seria automático se os elementos HTML forem destruídos pelo Router,
        // mas listeners soltos no `window` ou `document` devem ser limpos aqui.
    }
}
