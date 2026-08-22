import pkg from 'pg';
const { Pool } = pkg;

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

try {
  console.log('🔓 Unlocking account: mgdhanyamohan\n');
  
  const result = await pool.query(`
    UPDATE users 
    SET login_attempts = 0, 
        locked_until = NULL,
        updated_at = NOW()
    WHERE username = $1
    RETURNING id, username, login_attempts, locked_until, status
  `, ['mgdhanyamohan']);
  
  if (result.rows.length === 0) {
    console.log('❌ User not found');
  } else {
    const user = result.rows[0];
    console.log('✅ Account unlocked successfully!');
    console.log('   User ID:', user.id);
    console.log('   Username:', user.username);
    console.log('   Status:', user.status);
    console.log('   Login attempts:', user.login_attempts);
    console.log('   Locked until:', user.locked_until || 'Not locked');
    console.log('');
    console.log('🎉 You can now login with:');
    console.log('   Username: mgdhanyamohan');
    console.log('   Use the credential stored in the approved secrets provider.');
  }
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error('Stack:', error.stack);
} finally {
  await pool.end();
}
