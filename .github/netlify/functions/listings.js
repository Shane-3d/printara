// Netlify Function — CRUD for the `listings` MySQL table.
// Env vars (set in .env locally, Netlify dashboard in production):
//   DB_HOST, DB_PORT, DB_DATABASE, DB_USERNAME, DB_PASSWORD

const mysql = require('mysql2/promise');

function dbConfig() {
  return {
    host:     process.env.DB_HOST     || '127.0.0.1',
    port:     parseInt(process.env.DB_PORT || '3306', 10),
    database: process.env.DB_DATABASE,
    user:     process.env.DB_USERNAME,
    password: process.env.DB_PASSWORD || '',
  };
}

function ok(body, status = 200) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}
function err(message, status = 400) {
  return { statusCode: status, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: message }) };
}

// Convert DB row (snake_case, DECIMAL strings) → app object
function rowToProduct(r) {
  return {
    id:          r.id,
    name:        r.name,
    category:    r.category,
    description: r.description,
    price:       parseFloat(r.price),
    salePrice:   r.sale_price != null ? parseFloat(r.sale_price) : undefined,
    material:    r.material,
    printTime:   r.print_time,
    dimensions:  r.dimensions,
    image:       r.image,
    emoji:       r.emoji,
    inStock:     r.in_stock === 1,
  };
}

exports.handler = async (event) => {
  const method = event.httpMethod;
  let conn;
  try {
    conn = await mysql.createConnection(dbConfig());
  } catch (e) {
    return err('Database connection failed: ' + e.message, 500);
  }

  try {
    // GET /listings — return all listings ordered by created_at
    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM listings ORDER BY created_at ASC');
      return ok(rows.map(rowToProduct));
    }

    // POST /listings — create a listing
    if (method === 'POST') {
      let body;
      try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }
      const { id, name, category = '', description = '', price, salePrice, material = '', printTime = '', dimensions = '', image = '', emoji = '📦', inStock = true } = body;
      if (!id || !name || price == null) return err('id, name, and price are required');
      await conn.execute(
        `INSERT INTO listings (id, name, category, description, price, sale_price, material, print_time, dimensions, image, emoji, in_stock)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, name, category, description, parseFloat(price), salePrice != null ? parseFloat(salePrice) : null, material, printTime, dimensions, image, emoji, inStock ? 1 : 0]
      );
      return ok({ success: true }, 201);
    }

    // PUT /listings — update an existing listing (full or partial)
    if (method === 'PUT') {
      let body;
      try { body = JSON.parse(event.body); } catch { return err('Invalid JSON'); }
      const { id, ...fields } = body;
      if (!id) return err('id is required');

      const colMap = { name: 'name', category: 'category', description: 'description', price: 'price', salePrice: 'sale_price', material: 'material', printTime: 'print_time', dimensions: 'dimensions', image: 'image', emoji: 'emoji', inStock: 'in_stock' };
      const setClauses = [];
      const values = [];
      for (const [appKey, col] of Object.entries(colMap)) {
        if (appKey in fields) {
          setClauses.push(`${col} = ?`);
          let val = fields[appKey];
          if (appKey === 'inStock') val = val ? 1 : 0;
          if (appKey === 'price' || appKey === 'salePrice') val = val != null ? parseFloat(val) : null;
          values.push(val);
        }
      }
      if (setClauses.length === 0) return err('No fields to update');
      values.push(id);
      await conn.execute(`UPDATE listings SET ${setClauses.join(', ')} WHERE id = ?`, values);
      return ok({ success: true });
    }

    // DELETE /listings?id=xxx
    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return err('id query parameter is required');
      await conn.execute('DELETE FROM listings WHERE id = ?', [id]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
