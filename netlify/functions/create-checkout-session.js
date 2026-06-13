// Creates a Stripe Checkout Session for the $3.99/month Print Queue subscription.
// Set STRIPE_SECRET_KEY in Netlify → Site → Environment Variables.

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ error: 'Stripe not configured. Add STRIPE_SECRET_KEY to Netlify environment variables.' }) };
  }

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

  let body = {};
  try { body = JSON.parse(event.body || '{}'); } catch {}

  // Prefer the origin the browser sent in the body — Herd's PHP proxy doesn't
  // forward the Origin header, so without this the redirect would point at the
  // internal API host (127.0.0.1:8888) instead of the real site.
  const origin = body.origin || event.headers.origin
    || (event.headers.host ? `https://${event.headers.host}` : 'https://printara.com');

  // Where to send the customer after checkout (defaults to the pricing page).
  const successPath = body.successPath || '/pricing.html';
  const cancelPath  = body.cancelPath  || '/pricing.html';

  // Stripe product IDs are mode-specific: a live prod_… won't exist under a test
  // key. In test mode, build the price from an inline product so checkout works
  // without a matching test product; use the real product ID in live mode.
  const isTest = (process.env.STRIPE_SECRET_KEY || '').startsWith('sk_test_');
  const priceData = {
    currency: 'usd',
    unit_amount: 399, // $3.99 in cents
    recurring: { interval: 'month' },
    ...(isTest
      ? { product_data: { name: 'Printara — Print Queue (Test)' } }
      : { product: 'prod_UddchWK8U1J8Nj' }),
  };

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{ price_data: priceData, quantity: 1 }],
      customer_email: body.email || undefined,
      success_url: `${origin}${successPath}?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}${cancelPath}?sub=cancel`,
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
      body: JSON.stringify({ url: session.url }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
