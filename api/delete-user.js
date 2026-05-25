const { withClient } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { userId } = req.body;

  if (!userId) {
    return res.status(400).json({ error: 'userId is required' });
  }

  try {
    // Delete user records from local database (profiles + users tables)
    let userEmail = null;
    await withClient(async (client) => {
      const r = await client.query('SELECT email FROM profiles WHERE id = $1', [userId]);
      if (r.rows && r.rows[0]) userEmail = r.rows[0].email;
      await client.query('DELETE FROM profiles WHERE id = $1', [userId]);
      await client.query('DELETE FROM users WHERE id = $1', [userId]);
    });

    return res.status(200).json({
      success: true,
      message: `User ${userEmail || userId} removed from local database`,
      userId
    });

  } catch (error) {
    console.error('Unexpected error deleting user:', error);
    return res.status(500).json({
      error: 'Unexpected server error',
      details: error.message
    });
  }
};
