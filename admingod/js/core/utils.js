/**
 * superadmin/js/core/utils.js
 * 
 * Módulo de utilitários centralizado do Superadmin.
 * Evita duplicação de lógicas comuns como formatação de CPF, download de CSV,
 * renderização de ícones e badges de status.
 */

/**
 * Atualiza os ícones da biblioteca Lucide.
 * @param {HTMLElement} root Elemento raiz opcional para escopar a renderização.
 */
export function refreshIcons(root = document) {
    if (window.lucide) {
        window.lucide.createIcons({ root });
    }
}

/**
 * Encapsula a chamada global ao showToast para não quebrar módulos caso o global falhe.
 */
export function showToast(message, type = 'info', action = null) {
    if (window.showToast) {
        window.showToast(message, type, action);
    } else {
        console.warn(`[Toast ${type}]`, message);
    }
}

/**
 * Exporta dados para um arquivo CSV e inicia o download.
 * @param {string} filename Nome do arquivo (sem .csv)
 * @param {Array} data Array de objetos com os dados
 * @param {Array} headers Opcional: headers das colunas. Se não fornecido, usa as chaves do primeiro objeto.
 */
export function exportCSV(filename, data, headers = null) {
    if (!data || data.length === 0) {
        showToast('Não há dados para exportar', 'warning');
        return;
    }

    const csvHeaders = headers || Object.keys(data[0]);
    
    // Header row
    let csvContent = csvHeaders.join(',') + '\\n';
    
    // Data rows
    data.forEach(row => {
        const rowValues = csvHeaders.map(header => {
            let val = row[header] !== undefined && row[header] !== null ? String(row[header]) : '';
            // Remove aspas duplas e quebras de linha para não quebrar o CSV, e envelopa em aspas
            val = val.replace(/"/g, '""').replace(/\\n/g, ' ');
            return `"${val}"`;
        });
        csvContent += rowValues.join(',') + '\\n';
    });

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `${filename}_${new Date().getTime()}.csv`);
    link.style.visibility = 'hidden';
    
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    
    showToast('CSV exportado com sucesso!', 'success');
}

/**
 * Formata um CPF no formato 000.000.000-00
 */
export function formatCPF(cpf) {
    if (!cpf) return '-';
    const nums = cpf.replace(/\\D/g, '');
    if (nums.length !== 11) return cpf;
    return nums.replace(/(\\d{3})(\\d{3})(\\d{3})(\\d{2})/, '$1.$2.$3-$4');
}

/**
 * Formata um telefone no padrão brasileiro.
 */
export function formatPhone(phone) {
    if (!phone) return '-';
    let p = phone.replace(/\\D/g, '');
    if (p.startsWith('55') && p.length > 11) p = p.substring(2);
    if (p.length === 11) return p.replace(/(\\d{2})(\\d{5})(\\d{4})/, '($1) $2-$3');
    if (p.length === 10) return p.replace(/(\\d{2})(\\d{4})(\\d{4})/, '($1) $2-$3');
    return phone;
}

/**
 * Retorna as informações de status padronizadas.
 * @param {string} status 
 * @returns {Object} { class, label, icon }
 */
export function getStatusInfo(status) {
    const s = (status || 'pending').trim().toLowerCase();
    switch (s) {
        case 'confirmed':
        case 'aprovado':
            return { class: 'sa-status-confirmed', label: 'Confirmado', icon: 'check-circle-2' };
        case 'completed':
        case 'concluido':
            return { class: 'sa-status-completed', label: 'Concluído', icon: 'check-check' };
        case 'cancelled':
        case 'cancelado':
        case 'recusado':
            return { class: 'sa-status-cancelled', label: 'Cancelado', icon: 'x-circle' };
        case 'pending':
        case 'pendente':
        default:
            return { class: 'sa-status-pending', label: 'Pendente', icon: 'clock' };
    }
}
