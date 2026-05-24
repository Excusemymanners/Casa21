const { createClient } = require('@supabase/supabase-js');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // Use service role key to access admin API
    const supabaseUrl = process.env.REACT_APP_SUPABASE_URL;
    const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseServiceKey) {
      console.error('Missing Supabase environment variables');
      return res.status(500).json({ error: 'Server configuration error' });
    }

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Get the user's email first (for logging)
    const { data: userData, error: fetchErr } = await supabaseAdmin
      .from('profiles')
      .select('email')
      .eq('id', userId)
      .single();

    if (fetchErr) {
      console.error('Error fetching user:', fetchErr);
      return res.status(400).json({ error: 'User not found in profiles' });
    }

    // Delete from auth.users using admin API
    const { data, error } = await supabaseAdmin.auth.admin.deleteUser(userId);

    if (error) {
      console.error('Error deleting from auth.users:', error);
      return res.status(400).json({ 
        error: 'Failed to delete from auth.users',
        details: error.message 
      });
    }

    return res.status(200).json({ 
      success: true,
      message: `User ${userData?.email} deleted from auth.users`,
      userId
    });

  } catch (error) {
    console.error('Unexpected error:', error);
    return res.status(500).json({ 
      error: 'Unexpected server error',
      details: error.message 
    });
  }
};
