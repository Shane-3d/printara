// Netlify Function — CRUD for admin accounts.
// GET    /admin-accounts           → all admin accounts
// POST   /admin-accounts           → create admin account
// PUT    /admin-accounts           → update admin account (by id)
// DELETE /admin-accounts?id=xxx    → delete admin account

const { getConn, ok, err, parseBody } = require('./_db');

function rowToAdmin(r) {
  return {
    id:          r.id,
    username:    r.username,
    salt:        r.salt,
    hash:        r.hash,
    role:        r.role,
    permissions: r.permissions ? (typeof r.permissions === 'string' ? JSON.parse(r.permissions) : r.permissions) : [],
  };
}

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }
  try {
    const method = event.httpMethod;

    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM admin_accounts ORDER BY id ASC');
      return ok(rows.map(rowToAdmin));
    }

    if (method === 'POST') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, username, salt = '', hash = '', role = 'staff', permissions = [] } = body;
      if (!id || !username) return err('id and username are required');
      await conn.execute(
        'INSERT INTO admin_accounts (id, username, salt, hash, role, permissions) VALUES (?, ?, ?, ?, ?, ?)',
        [id, username, salt, hash, role, JSON.stringify(permissions)]
      );
      return ok({ success: true }, 201);
    }

    if (method === 'PUT') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, ...fields } = body;
      if (!id) return err('id is required');
      const colMap = { username: 'username', salt: 'salt', hash: 'hash', role: 'role', permissions: 'permissions' };
      const setClauses = [];
      const values = [];
      for (const [k, col] of Object.entries(colMap)) {
        if (k in fields) {
          setClauses.push(`${col} = ?`);
          values.push(k === 'permissions' ? JSON.stringify(fields[k]) : fields[k]);
        }
      }
      if (!setClauses.length) return err('No fields to update');
      values.push(id);
      await conn.execute(`UPDATE admin_accounts SET ${setClauses.join(', ')} WHERE id = ?`, values);
      return ok({ success: true });
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return err('id required');
      await conn.execute('DELETE FROM admin_accounts WHERE id = ?', [id]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
