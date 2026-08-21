const { createClient } = require('@supabase/supabase-js');

export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Missing or invalid authorization header' });
    }
    const token = authHeader.split(' ')[1];

    const { name, email, role, password, tenant_id } = req.body;

    if (!email || !password || !role || !tenant_id || !name) {
        return res.status(400).json({ error: 'Missing required fields' });
    }

    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
        return res.status(500).json({ error: 'Server configuration error: Missing Supabase credentials' });
    }

    try {
        // 1. Authenticate the caller using their JWT
        const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
            global: { headers: { Authorization: `Bearer ${token}` } }
        });

        const { data: { user: caller }, error: callerError } = await supabaseClient.auth.getUser();
        if (callerError || !caller) {
            return res.status(401).json({ error: 'Unauthorized: Invalid token' });
        }

        // 2. Verify that the caller is the owner of the tenant
        const supabaseService = createClient(supabaseUrl, supabaseServiceKey);
        
        const { data: tenant, error: tenantError } = await supabaseService
            .from('tenants')
            .select('owner_id, settings')
            .eq('id', tenant_id)
            .single();

        if (tenantError || !tenant) {
            return res.status(404).json({ error: 'Tenant not found' });
        }

        if (tenant.owner_id !== caller.id) {
            return res.status(403).json({ error: 'Forbidden: Only the tenant owner can create staff' });
        }

        // 3. Create the user in Supabase Auth via Admin API
        const { data: authData, error: authError } = await supabaseService.auth.admin.createUser({
            email: email.trim(),
            password: password,
            email_confirm: true,
            user_metadata: { name: name.trim() }
        });

        if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                return res.status(400).json({ error: 'Este e-mail já está em uso.' });
            }
            throw authError;
        }

        const newUserId = authData.user.id;

        // 4. Insert into tenant_users
        const { error: insertError } = await supabaseService
            .from('tenant_users')
            .insert({
                tenant_id: tenant_id,
                user_id: newUserId,
                role: role
            });

        if (insertError) {
            // Rollback the user creation if insert fails
            await supabaseService.auth.admin.deleteUser(newUserId);
            throw insertError;
        }

        // 5. Update settings.usuarios to maintain frontend compatibility
        const settings = tenant.settings || {};
        const usuarios = settings.usuarios || [];
        
        usuarios.push({
            id: newUserId,
            name: name.trim(),
            email: email.trim(),
            role: role,
            is_active: true
        });

        const { error: updateError } = await supabaseService
            .from('tenants')
            .update({ settings: { ...settings, usuarios } })
            .eq('id', tenant_id);

        if (updateError) {
            console.warn('Failed to update settings.usuarios:', updateError);
            // Non-fatal error, but might cause display issues
        }

        return res.status(200).json({ 
            success: true, 
            message: 'Staff created successfully',
            user: { id: newUserId, email: authData.user.email, name, role }
        });

    } catch (error) {
        console.error('Error creating staff:', error);
        return res.status(500).json({ error: 'Internal server error', details: error.message });
    }
}
