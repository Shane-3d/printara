// Netlify Function — CRUD for customer accounts.
// GET    /accounts          → all accounts
// POST   /accounts          → create account
// PUT    /accounts          → update account (by id)
// DELETE /accounts?id=xxx   → delete account

const { getConn, ok, err, parseBody } = require('./_db');

function rowToAccount(r) {
  return {
    id:             r.id,
    name:           r.name,
    email:          r.email,
    pwHash:         r.pw_hash,
    profile:        r.profile ? (typeof r.profile === 'string' ? JSON.parse(r.profile) : r.profile) : {},
    meritsBalance:  r.merits_balance || 0,
    registeredAt:   r.registered_at,
  };
}

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }
  try {
    const method = event.httpMethod;

    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM accounts ORDER BY registered_at ASC');
      return ok(rows.map(rowToAccount));
    }

    if (method === 'POST') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, name, email, pwHash, profile, registeredAt } = body;
      if (!id || !email) return err('id and email are required');
      await conn.execute(
        'INSERT INTO accounts (id, name, email, pw_hash, profile, registered_at) VALUES (?, ?, ?, ?, ?, ?)',
        [id, name || '', email, pwHash || '', profile ? JSON.stringify(profile) : null, registeredAt || new Date().toISOString()]
      );
      return ok({ success: true }, 201);
    }

    if (method === 'PUT') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, ...fields } = body;
      if (!id) return err('id is required');
      const colMap = { name: 'name', email: 'email', pwHash: 'pw_hash', profile: 'profile', meritsBalance: 'merits_balance' };
      const setClauses = [];
      const values = [];
      for (const [k, col] of Object.entries(colMap)) {
        if (k in fields) {
          setClauses.push(`${col} = ?`);
          values.push(k === 'profile' ? JSON.stringify(fields[k]) : fields[k]);
        }
      }
      if (!setClauses.length) return err('No fields to update');
      values.push(id);
      await conn.execute(`UPDATE accounts SET ${setClauses.join(', ')} WHERE id = ?`, values);
      return ok({ success: true });
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return err('id required');
      await conn.execute('DELETE FROM accounts WHERE id = ?', [id]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
