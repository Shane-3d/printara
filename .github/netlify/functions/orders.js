// Netlify Function — CRUD for orders.
// GET    /orders             → all orders
// POST   /orders             → create order
// PUT    /orders             → update order (by id, e.g. status change)
// DELETE /orders?id=xxx      → delete order

const { getConn, ok, err, parseBody } = require('./_db');

function rowToOrder(r) {
  return {
    id:            r.id,
    date:          r.date,
    status:        r.status,
    type:          r.type,
    userId:        r.user_id,
    customer:      r.customer ? (typeof r.customer === 'string' ? JSON.parse(r.customer) : r.customer) : {},
    notes:         r.notes,
    paymentMethod: r.payment_method,
    items:         r.items    ? (typeof r.items    === 'string' ? JSON.parse(r.items)    : r.items)    : [],
    total:         parseFloat(r.total),
    meritsTotal:   r.merits_total,
    stripeId:      r.stripe_id,
    description:   r.description,
    photo:         r.photo || null,
  };
}

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }
  try {
    const method = event.httpMethod;

    if (method === 'GET') {
      const [rows] = await conn.execute('SELECT * FROM orders ORDER BY date DESC');
      return ok(rows.map(rowToOrder));
    }

    if (method === 'POST') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, date, status = 'New', type = 'order', userId, customer, notes = '', paymentMethod = 'cash', items, total = 0, meritsTotal = 0, stripeId, description, photo } = body;
      if (!id) return err('id is required');
      await conn.execute(
        `INSERT INTO orders (id, date, status, type, user_id, customer, notes, payment_method, items, total, merits_total, stripe_id, description, photo)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, date || new Date().toISOString(), status, type, userId || null,
         customer ? JSON.stringify(customer) : null, notes || null, paymentMethod,
         items ? JSON.stringify(items) : null, parseFloat(total), meritsTotal || 0, stripeId || null, description || null, photo || null]
      );
      return ok({ success: true }, 201);
    }

    if (method === 'PUT') {
      const body = parseBody(event);
      if (!body) return err('Invalid JSON');
      const { id, ...fields } = body;
      if (!id) return err('id is required');
      const colMap = { status: 'status', notes: 'notes', paymentMethod: 'payment_method', total: 'total', stripeId: 'stripe_id', customer: 'customer', items: 'items', description: 'description', photo: 'photo' };
      const setClauses = [];
      const values = [];
      for (const [k, col] of Object.entries(colMap)) {
        if (k in fields) {
          setClauses.push(`${col} = ?`);
          const v = fields[k];
          values.push((k === 'customer' || k === 'items') ? JSON.stringify(v) : v);
        }
      }
      if (!setClauses.length) return err('No fields to update');
      values.push(id);
      await conn.execute(`UPDATE orders SET ${setClauses.join(', ')} WHERE id = ?`, values);
      return ok({ success: true });
    }

    if (method === 'DELETE') {
      const id = event.queryStringParameters?.id;
      if (!id) return err('id required');
      await conn.execute('DELETE FROM orders WHERE id = ?', [id]);
      return ok({ success: true });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
