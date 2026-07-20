import { supabase, getCurrentTenantId, uploadImageToSupabase } from '../../core/supabaseClient.js';

export class personalizacaoController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.logoUrl = null;
        this.faviconUrl = null;
        this.coverUrl = null;
        this.galeria = [];
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

            this.setPreview('preview-logo', 'icon-logo', this.logoUrl);
            this.setPreview('preview-favicon', 'icon-favicon', this.faviconUrl);
            this.setPreview('preview-cover', 'icon-cover', this.coverUrl);
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
            }
        } catch (e) {
            console.error('Erro ao carregar configuracoes de cores:', e);
        }
    }

    bindEvents() {
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
            });
        });

        // Setup Color Templates
        const templates = {
            'dark-elegance': {
                primary: '#6366f1', secondary: '#3b82f6', accent: '#10b981',
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
        this.setupImageUpload('btn-upload-logo', 'input-logo', (base64, file) => {
            this.logoUrl = base64; // Preview
            this.logoFile = file;  // Arquivo para upload
            this.setPreview('preview-logo', 'icon-logo', base64);
        });
        
        this.setupImageUpload('btn-upload-favicon', 'input-favicon', (base64, file) => {
            this.faviconUrl = base64; // Preview
            this.faviconFile = file;  // Arquivo para upload
            this.setPreview('preview-favicon', 'icon-favicon', base64);
        });

        const previewCover = document.getElementById('preview-cover');
        const inputCover = document.getElementById('input-cover');
        const btnUploadCover = document.getElementById('btn-upload-cover');
        const btnRemoverCover = document.getElementById('btn-remover-cover');
        
        if (btnUploadCover && inputCover) {
            btnUploadCover.addEventListener('click', () => inputCover.click());
            inputCover.addEventListener('change', (e) => {
                this.handleFileSelect(e, (base64, file) => {
                    this.coverUrl = base64;
                    this.coverFile = file;
                    if (previewCover) previewCover.style.backgroundImage = `url('${base64}')`;
                });
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

    setupImageUpload(btnId, inputId, callback) {
        const btn = document.getElementById(btnId);
        const input = document.getElementById(inputId);
        if (btn && input) {
            btn.addEventListener('click', () => input.click());
            input.addEventListener('change', (e) => this.handleFileSelect(e, callback));
        }
    }

    handleFileSelect(event, callback) {
        const file = event.target.files[0];
        if (!file) return;
        if (file.size > 2 * 1024 * 1024) {
            if (window.showToast) window.showToast('A imagem deve ter no máximo 2MB', 'error');
            event.target.value = '';
            return;
        }
        const reader = new FileReader();
        reader.onload = (e) => callback(e.target.result, file);
        reader.readAsDataURL(file);
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
                const hoverStyle = `onmouseover="this.style.backgroundColor='rgba(99,102,241,0.1)'" onmouseout="this.style.backgroundColor=''"`;
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
            
            // Upload das fotos da Galeria
            const finalGaleria = [];
            for (let i = 0; i < this.galeria.length; i++) {
                const item = this.galeria[i];
                if (item.isNew && item.file) {
                    const url = await uploadImageToSupabase(item.file, 'tenant-images', tenantId);
                    if (url) finalGaleria.push(url);
                } else {
                    finalGaleria.push(item); // url existente
                }
            }
            this.galeria = finalGaleria;

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
                whatsapp: document.getElementById('input-whatsapp-number')?.value,
                whatsapp_message: document.getElementById('input-whatsapp-message')?.value
            };

            const updatePayload = {
                settings,
                logo_url: this.logoUrl,
                favicon_url: this.faviconUrl,
                cover_url: this.coverUrl,
                galeria: this.galeria,
                whatsapp: document.getElementById('input-whatsapp-number')?.value
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
