import { supabase, getCurrentTenantId } from '../../core/supabaseClient.js';

export class cadastroController {
    constructor(stateManager) {
        this.state = stateManager;
        this.container = document.querySelector('#app-content');
        this.customAttributes = []; // Array de {key: string, value: string}
    }

    async init() {
        this.bindEvents();

        // Extrair ID da URL se estiver editando
        const hash = window.location.hash;
        if (hash.includes('?id=')) {
            const urlParams = new URLSearchParams(hash.split('?')[1]);
            this.editId = urlParams.get('id');
        }

        if (this.editId) {
            await this.loadItemForEdit();
        }

        if (window.lucide) {
            window.lucide.createIcons();
        }
    }

    async loadItemForEdit() {
        try {
            const tenantId = await getCurrentTenantId();
            const { data, error } = await supabase
                .from('inventory_items')
                .select('*')
                .eq('id', this.editId)
                .eq('tenant_id', tenantId)
                .single();

            if (error) throw error;
            if (!data) return;

            // Preencher Formulário
            document.getElementById('input-name').value = data.name || '';
            document.getElementById('input-sku').value = data.sku || '';
            document.getElementById('input-type').value = data.type || 'product';
            document.getElementById('input-price').value = data.base_price || 0;

            // Salva o estoque original para podermos calcular a diferença no Salvar
            const inputStock = document.getElementById('input-stock');
            if (inputStock) {
                this.originalStock = data.stock_quantity || 0;
                inputStock.value = this.originalStock;
                // Não desabilitamos mais, pois o lojista pediu para poder atualizar o estoque livremente.
                // inputStock.disabled = true;
                inputStock.title = "A diferença será registrada como um Ajuste Manual automaticamente.";
            }

            // Mudar Textos da UI
            const titleEl = document.getElementById('form-page-title');
            if (titleEl) titleEl.textContent = 'Editar Item';
            
            const btnSave = document.getElementById('btn-save-item');
            if (btnSave) btnSave.innerHTML = '<i data-lucide="save" class="icon-sm"></i> Salvar Alterações';

            // Carregar Atributos
            if (data.custom_attributes) {
                this.customAttributes = Object.entries(data.custom_attributes).map(([k, v]) => ({ key: k, value: v }));
                this.renderAttributes();
            }

        } catch (err) {
            console.error('Erro ao carregar item para edição:', err);
            if (window.showToast) window.showToast('Erro ao carregar dados do item.', 'error');
        }
    }

    bindEvents() {
        const btnAddAttr = document.getElementById('btn-add-attribute');
        if (btnAddAttr) {
            btnAddAttr.addEventListener('click', () => {
                this.customAttributes.push({ key: '', value: '' });
                this.renderAttributes();
            });
        }

        const form = document.getElementById('form-estoque-cadastro');
        if (form) {
            form.addEventListener('submit', (e) => this.handleSave(e));
        }

        // Delegação de eventos para os atributos dinâmicos
        const attrContainer = document.getElementById('dynamic-attributes-container');
        if (attrContainer) {
            attrContainer.addEventListener('click', (e) => {
                const btnRemove = e.target.closest('.btn-remove-attr');
                if (btnRemove) {
                    const index = parseInt(btnRemove.dataset.index);
                    this.customAttributes.splice(index, 1);
                    this.renderAttributes();
                }
            });

            attrContainer.addEventListener('input', (e) => {
                const input = e.target;
                if (input.classList.contains('attr-key') || input.classList.contains('attr-value')) {
                    const row = input.closest('.attr-row');
                    const index = parseInt(row.dataset.index);
                    if (input.classList.contains('attr-key')) {
                        this.customAttributes[index].key = input.value;
                    } else {
                        this.customAttributes[index].value = input.value;
                    }
                }
            });
        }
    }

    renderAttributes() {
        const container = document.getElementById('dynamic-attributes-container');
        if (!container) return;

        if (this.customAttributes.length === 0) {
            container.innerHTML = `<div class="text-center p-4 border-dashed rounded bg-placeholder text-secondary text-sm" id="empty-attributes-state">Nenhum atributo personalizado.</div>`;
            return;
        }

        container.innerHTML = this.customAttributes.map((attr, index) => `
            <div class="flex gap-2 align-center attr-row" data-index="${index}">
                <div class="flex-1">
                    <input type="text" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm attr-key" placeholder="Nome (Ex: Cor)" value="${attr.key}" required>
                </div>
                <div class="flex-1">
                    <input type="text" class="w-100 bg-placeholder border-dashed rounded-md px-3 py-2 text-primary outline-none text-sm attr-value" placeholder="Valor (Ex: Azul)" value="${attr.value}" required>
                </div>
                <button type="button" class="btn bg-transparent text-danger border-none cursor-pointer p-2 hover:bg-danger-light rounded btn-remove-attr" data-index="${index}" title="Remover">
                    <i data-lucide="trash-2" class="w-4 h-4"></i>
                </button>
            </div>
        `).join('');

        if (window.lucide) window.lucide.createIcons();
    }

    async handleSave(e) {
        e.preventDefault();
        
        try {
            const tenantId = await getCurrentTenantId();
            if (!tenantId) {
                if(window.showToast) window.showToast('Erro: Lojista não identificado.', 'error');
                return;
            }

            const name = document.getElementById('input-name').value;
            const sku = document.getElementById('input-sku').value;
            const type = document.getElementById('input-type').value;
            const price = parseFloat(document.getElementById('input-price').value || 0);
            const initialStock = parseFloat(document.getElementById('input-stock').value || 0);

            // Montar JSONB dos atributos
            const attributesObj = {};
            for (const attr of this.customAttributes) {
                const k = attr.key.trim();
                const v = attr.value.trim();
                if (k && v) {
                    attributesObj[k] = v;
                }
            }

            const btnSave = document.getElementById('btn-save-item');
            if (btnSave) btnSave.disabled = true;

            const itemPayload = {
                tenant_id: tenantId,
                sku: sku,
                name: name,
                type: type,
                base_price: price,
                stock_quantity: initialStock,
                custom_attributes: attributesObj
            };

            let itemData, itemError;

            if (this.editId) {
                // Atualizar Item Existente
                const result = await supabase
                    .from('inventory_items')
                    .update(itemPayload)
                    .eq('id', this.editId)
                    .eq('tenant_id', tenantId)
                    .select()
                    .single();
                itemData = result.data;
                itemError = result.error;
            } else {
                // Inserir Novo Item
                const result = await supabase
                    .from('inventory_items')
                    .insert([itemPayload])
                    .select()
                    .single();
                itemData = result.data;
                itemError = result.error;
            }

            if (itemError) {
                console.error(itemError);
                if (itemError.code === '23505') {
                    throw new Error('Já existe um item cadastrado com este SKU.');
                }
                throw new Error(itemError.message || 'Erro ao salvar item.');
            }

            // Removida a inserção em inventory_transactions. 
            // Agora o estoque é salvo diretamente em inventory_items através do payload principal.

            if(window.showToast) window.showToast(this.editId ? 'Item atualizado com sucesso!' : 'Item cadastrado com sucesso!', 'success');
            
            // Voltar para listagem após pequeno delay
            setTimeout(() => {
                window.location.hash = '#/estoque/lista';
            }, 1000);

        } catch (error) {
            if(window.showToast) window.showToast(error.message, 'error');
        } finally {
            const btnSave = document.getElementById('btn-save-item');
            if (btnSave) btnSave.disabled = false;
        }
    }

    destroy() {
        // Limpar recursos ao desmontar
    }
}
