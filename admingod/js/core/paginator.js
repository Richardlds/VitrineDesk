/**
 * superadmin/js/core/paginator.js
 * 
 * Centraliza a lógica de paginação no client-side para o painel admin.
 */
import { refreshIcons } from './utils.js';

export class Paginator {
    /**
     * @param {Object} config 
     * @param {number} config.itemsPerPage - Quantidade de itens por página
     * @param {string} config.infoElementId - ID do elemento texto "Mostrando X a Y de Z"
     * @param {string} config.prevButtonId - ID do botão "Anterior"
     * @param {string} config.nextButtonId - ID do botão "Próximo"
     * @param {Function} config.onPageChange - Função callback invocada com os itens da página atual
     */
    constructor(config) {
        this.data = [];
        this.itemsPerPage = config.itemsPerPage || 20;
        this.currentPage = 1;
        
        this.infoEl = document.getElementById(config.infoElementId);
        this.prevBtn = document.getElementById(config.prevButtonId);
        this.nextBtn = document.getElementById(config.nextButtonId);
        this.onPageChange = config.onPageChange;

        this._setupListeners();
    }

    _setupListeners() {
        if (this.prevBtn) {
            this.prevBtn.addEventListener('click', () => {
                if (this.currentPage > 1) {
                    this.currentPage--;
                    this.render();
                }
            });
        }

        if (this.nextBtn) {
            this.nextBtn.addEventListener('click', () => {
                const maxPage = Math.ceil(this.data.length / this.itemsPerPage);
                if (this.currentPage < maxPage) {
                    this.currentPage++;
                    this.render();
                }
            });
        }
    }

    /**
     * Atualiza os dados a serem paginados.
     * @param {Array} newData Novo array filtrado
     * @param {boolean} resetPage Se true, volta para a página 1
     */
    updateData(newData, resetPage = true) {
        this.data = newData || [];
        if (resetPage) {
            this.currentPage = 1;
        } else {
            const maxPage = Math.max(1, Math.ceil(this.data.length / this.itemsPerPage));
            if (this.currentPage > maxPage) this.currentPage = maxPage;
        }
        this.render();
    }

    render() {
        const startIdx = (this.currentPage - 1) * this.itemsPerPage;
        const endIdx = startIdx + this.itemsPerPage;
        const pagedData = this.data.slice(startIdx, endIdx);
        
        this._updateInfo();
        if (this.onPageChange) {
            this.onPageChange(pagedData);
        }
    }

    _updateInfo() {
        if (!this.infoEl) return;
        
        if (this.data.length === 0) {
            this.infoEl.innerHTML = `<i data-lucide="file-text" class="w-4 h-4"></i> Nenhum resultado`;
            refreshIcons(this.infoEl);
            return;
        }
        
        const start = ((this.currentPage - 1) * this.itemsPerPage) + 1;
        const end = Math.min(start + this.itemsPerPage - 1, this.data.length);
        
        this.infoEl.innerHTML = `<i data-lucide="list" class="w-4 h-4"></i> Mostrando ${start} a ${end} de ${this.data.length}`;
        refreshIcons(this.infoEl);
    }
}
