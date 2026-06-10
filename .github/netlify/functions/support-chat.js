// Netlify Function — Support chat with OpenRouter AI + DB persistence.
// POST /support-chat  → send a user message, get AI reply, store both
// GET  /support-chat  → list all tickets (admin use; pass ?session=xxx for one session)

const { getConn, ok, err, parseBody } = require('./_db');

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const SITE_NAME = 'Printara';
const SYSTEM_PROMPT = `You are a helpful customer support assistant for ${SITE_NAME}, a 3D printing service. Help users with their problems, questions, and concerns clearly and professionally. Keep responses concise and friendly.`;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

async function callOpenRouter(userMessage) {
  if (!OPENROUTER_API_KEY) return null;
  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://printara.netlify.app',
        'X-Title': SITE_NAME,
      },
      body: JSON.stringify({
        model: 'openai/gpt-4o-mini',
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userMessage },
        ],
        max_tokens: 400,
      }),
    });
    const data = await res.json();
    return data?.choices?.[0]?.message?.content || null;
  } catch {
    return null;
  }
}

exports.handler = async (event) => {
  let conn;
  try { conn = await getConn(); } catch (e) { return err('DB connection failed: ' + e.message, 500); }

  try {
    if (event.httpMethod === 'GET') {
      const sessionId = event.queryStringParameters?.session;
      if (sessionId) {
        const [rows] = await conn.execute(
          'SELECT * FROM support_tickets WHERE session_id = ? ORDER BY created_at ASC',
          [sessionId]
        );
        return ok(rows);
      }
      // Return all sessions (grouped summary for admin)
      const [rows] = await conn.execute(
        `SELECT session_id, name, email, status,
                MIN(created_at) AS started_at,
                MAX(created_at) AS last_message,
                COUNT(*) AS message_count,
                (SELECT message FROM support_tickets s2
                 WHERE s2.session_id = s1.session_id AND s2.sender = 'user'
                 ORDER BY s2.created_at ASC LIMIT 1) AS first_message
         FROM support_tickets s1
         GROUP BY session_id, name, email, status
         ORDER BY last_message DESC`
      );
      return ok(rows);
    }

    if (event.httpMethod === 'PUT') {
      // Update ticket status
      const body = parseBody(event);
      if (!body?.session_id) return err('session_id required');
      await conn.execute(
        'UPDATE support_tickets SET status = ? WHERE session_id = ?',
        [body.status || 'resolved', body.session_id]
      );
      return ok({ success: true });
    }

    if (event.httpMethod === 'POST') {
      const body = parseBody(event);
      if (!body?.message?.trim()) return err('message is required');

      const { message, name = 'Anonymous', email = '', session_id } = body;
      const sessionId = session_id || uid();

      // Store user message
      await conn.execute(
        'INSERT INTO support_tickets (id, session_id, sender, name, email, message, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [uid(), sessionId, 'user', name.slice(0, 255), email.slice(0, 255), message, 'open']
      );

      // Get AI response
      const botReply = await callOpenRouter(message);
      if (botReply) {
        await conn.execute(
          'INSERT INTO support_tickets (id, session_id, sender, name, email, message, status) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [uid(), sessionId, 'bot', 'Support Bot', '', botReply, 'open']
        );
      }

      return ok({
        session_id: sessionId,
        reply: botReply || "Thank you for reaching out! We've received your message and will get back to you shortly.",
      });
    }

    return err('Method not allowed', 405);
  } catch (e) {
    return err('Query error: ' + e.message, 500);
  } finally {
    await conn.end();
  }
};
