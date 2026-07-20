export class StateManager {
    constructor() {
        this.activeTenant = null;
        this.currentUser = null;
        this.listeners = new Map();
        
    }

    /**
     * Define o tenant atual da sessão e notifica os listeners
     */
    setTenant(tenantInfo) {
        this.activeTenant = tenantInfo;
        this.notify('tenantChanged', this.activeTenant);
    }

    /**
     * Define o usuário atual e notifica os listeners
     */
    setUser(userInfo) {
        this.currentUser = userInfo;
        this.notify('userChanged', this.currentUser);
    }

    /**
     * Verifica se o usuário atual tem permissão para uma role específica
     */
    hasPermission(requiredRole) {
        if (!this.currentUser) return false;
        // Superadmin sempre tem acesso
        if (this.currentUser.role === 'superadmin') return true;
        // Roles menores (manager, attendant) tem restrições
        return this.currentUser.role === requiredRole;
    }

    /**
     * Inscreve um callback para ouvir mudanças no estado
     */
    subscribe(event, callback) {
        if (!this.listeners.has(event)) {
            this.listeners.set(event, []);
        }
        this.listeners.get(event).push(callback);
    }

    /**
     * Notifica todos os listeners de um evento
     */
    notify(event, data) {
        if (this.listeners.has(event)) {
            this.listeners.get(event).forEach(callback => callback(data));
        }
    }
}
