// Netlify serverless function — creates a Stripe PaymentIntent server-side.
// The secret key NEVER touches the browser.
//
// Set these in Netlify → Site → Environment Variables:
//   STRIPE_SECRET_KEY = sk_live_... (or sk_test_... for testing)

const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

exports.handler = async (event) => {
  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: JSON.stringify({ error: 'Method not allowed' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body' }) };
  }

  const { amount, currency = 'usd', orderId, customerName, customerEmail } = body;

  if (!amount || amount < 50) {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid amount' }) };
  }

  if (!process.env.STRIPE_SECRET_KEY) {
    return { statusCode: 500, body: JSON.stringify({ error: 'Stripe is not configured. Add STRIPE_SECRET_KEY to Netlify environment variables.' }) };
  }

  try {
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(amount),
      currency,
      description: `Pro-Fab 3D — Order ${orderId}`,
      receipt_email: customerEmail || undefined,
      metadata: {
        orderId: orderId || '',
        customerName: customerName || '',
      },
    });

    return {
      statusCode: 200,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientSecret: paymentIntent.client_secret }),
    };
  } catch (err) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: err.message }),
    };
  }
};
