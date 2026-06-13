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

  const origin = event.headers.origin || event.headers.host || 'https://printara.com';

  try {
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'usd',
          product: 'prod_UddchWK8U1J8Nj',
          unit_amount: 399, // $3.99 in cents
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      customer_email: body.email || undefined,
      success_url: `${origin}/pricing.html?sub=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/pricing.html?sub=cancel`,
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
