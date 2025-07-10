import dotenv from 'dotenv';
dotenv.config();

import express from 'express';
import Stripe from 'stripe';
import { Usermodel } from '../models/User.js';
import jwt from 'jsonwebtoken';

console.log('Stripe key:', process.env.STRIPE_SECRET_KEY); // DEBUG: Print Stripe secret key

const router = express.Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2022-11-15' });

// Require auth middleware (reuse from convert.js)
async function requireAuth(req, res, next) {
  const authHeader = req.headers['authorization'];
  if (!authHeader) return res.status(401).json({ error: 'No token provided' });
  const token = authHeader.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await Usermodel.findById(decoded.userId);
    if (!user) return res.status(401).json({ error: 'User not found' });
    req.user = user;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}

// Stripe price IDs (use lowercase keys to match frontend)
const PRICE_IDS = {
  basic: 'price_1RjGSnPrec2YpLNj8oph41sa',    // Starter
  pro: 'price_1RjGTMPrec2YpLNjO7wj82r1',      // Pro
  premium: 'price_1RjGTjPrec2YpLNjUVF74uJR'   // Business
};

// === FRONTEND TEAM PROMPT ===
// When calling /api/payments/create-checkout or /api/payments/upgrade, use one of these plan names in the request body:
// { plan: 'basic' }   // for Starter ($10)
// { plan: 'pro' }     // for Pro ($29)
// { plan: 'premium' } // for Business ($99)
// ===========================

// Helper to get plan rank (use lowercase)
function planRank(plan) {
  if (!plan) return 0;
  const p = plan.toLowerCase();
  if (p === 'basic') return 1;
  if (p === 'pro') return 2;
  if (p === 'premium') return 3;
  if (p === 'enterprise') return 4;
  return 0;
}

// Conversion limits per plan
const PLAN_LIMITS = {
  basic: 20,
  pro: 50,
  premium: 200
};

// POST /api/payments/create-checkout
router.post('/create-checkout', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const user = req.user;

  if (!['basic', 'pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  if (user.subscriptionStatus === 'active') {
    return res.status(403).json({ error: 'You already have an active subscription. Please use the upgrade page.' });
  }

  const priceId = PRICE_IDS[plan];
  console.log('Stripe Checkout Debug:', { plan, priceId }); // Debug print
  if (!priceId) return res.status(400).json({ error: 'Plan not available' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: user.email,
      success_url: `https://civchange-fe.vercel.app/account?success=1&plan=${plan}`,
      cancel_url: `https://civchange-fe.vercel.app/`,
      metadata: {
        userId: user._id.toString(),
        plan
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create checkout session', details: err.message });
  }
});

// POST /api/payments/webhook
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle checkout.session.completed for subscriptions
  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId = session.metadata.userId;
    let plan = session.metadata.plan;
    plan = plan ? plan.toLowerCase() : plan;
    try {
      const user = await Usermodel.findById(userId);
      if (!user) return res.status(404).send('User not found');
      if (!['basic', 'pro', 'premium'].includes(plan)) return res.status(400).send('Invalid plan');
      const newConversions = PLAN_LIMITS[plan];
      // If user is not active (new purchase or after cancel), add conversions
      if (user.subscriptionStatus !== 'active') {
        user.conversionsLeft = (user.conversionsLeft || 0) + newConversions;
        console.log(`[WEBHOOK] User ${user.email} repurchased or bought new plan ${plan}. Added conversions: ${newConversions}, total now: ${user.conversionsLeft}`);
      } else if (planRank(plan) > planRank(user.plan)) {
        // If upgrading, set conversionsLeft to new plan's limit
        user.conversionsLeft = newConversions;
        console.log(`[WEBHOOK] User ${user.email} upgraded to ${plan}. Set conversionsLeft to: ${newConversions}`);
      }
      user.plan = plan;
      user.stripeCustomerId = session.customer;
      user.stripeSubscriptionId = session.subscription;
      user.subscriptionStatus = 'active';
      user.pendingPlan = undefined;
      await user.save();
      console.log(`[WEBHOOK] User ${user.email} subscribed to ${plan}`);
    } catch (err) {
      console.error('Failed to update user after payment:', err);
      return res.status(500).send('Failed to update user');
    }
  }

  // Handle subscription updates (downgrade, cancel, etc.)
  if (event.type === 'customer.subscription.updated' || event.type === 'customer.subscription.deleted') {
    const subscription = event.data.object;
    const stripeSubscriptionId = subscription.id;
    try {
      const user = await Usermodel.findOne({ stripeSubscriptionId });
      if (!user) return res.status(404).send('User not found');
      user.subscriptionStatus = subscription.status;
      user.subscriptionEndDate = new Date(subscription.current_period_end * 1000);
      // If canceled, set plan to free immediately, conversions remain
      if (subscription.status === 'canceled') {
        user.plan = 'free';
        user.pendingPlan = undefined;
        // conversionsLeft remains unchanged
        console.log(`[WEBHOOK] User ${user.email} subscription canceled. Plan set to free, conversions remain: ${user.conversionsLeft}`);
      } else if (user.pendingPlan && subscription.cancel_at_period_end) {
        user.plan = user.pendingPlan;
        user.pendingPlan = undefined;
        // conversionsLeft remains unchanged
        console.log(`[WEBHOOK] User ${user.email} downgraded to ${user.plan} at period end. Conversions remain: ${user.conversionsLeft}`);
      }
      await user.save();
      console.log(`[WEBHOOK] User ${user.email} subscription updated: ${subscription.status}`);
    } catch (err) {
      console.error('Failed to update user after subscription event:', err);
      return res.status(500).send('Failed to update user');
    }
  }

  res.status(200).send('Received');
});

// POST /api/payments/upgrade
router.post('/upgrade', requireAuth, async (req, res) => {
  const { plan } = req.body;
  const user = req.user;

  if (!['basic', 'pro', 'premium'].includes(plan)) {
    return res.status(400).json({ error: 'Invalid plan selected' });
  }

  if (planRank(plan) <= planRank(user.plan)) {
    return res.status(403).json({ error: 'To downgrade or buy the same/lower plan, please cancel your current subscription first. Your conversions will remain and new plan conversions will be added.' });
  }

  const priceId = PRICE_IDS[plan];
  if (!priceId) return res.status(400).json({ error: 'Plan not available' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      line_items: [
        {
          price: priceId,
          quantity: 1
        }
      ],
      customer_email: user.email,
      success_url: `https://civchange-fe.vercel.app/account?success=1&plan=${plan}`,
      cancel_url: `https://civchange-fe.vercel.app/`,
      metadata: {
        userId: user._id.toString(),
        plan,
        upgrade: true
      }
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error('Stripe error:', err);
    res.status(500).json({ error: 'Failed to create upgrade session' });
  }
});

// POST /api/payments/cancel-subscription
router.post('/cancel-subscription', requireAuth, async (req, res) => {
  const user = req.user;
  if (!user.stripeSubscriptionId || user.subscriptionStatus !== 'active') {
    return res.status(400).json({ error: 'No active subscription to cancel.' });
  }
  try {
    // Cancel at period end
    const canceled = await stripe.subscriptions.update(user.stripeSubscriptionId, { cancel_at_period_end: true });
    user.subscriptionStatus = 'canceled';
    user.subscriptionEndDate = new Date(canceled.current_period_end * 1000);
    user.pendingPlan = 'free';
    await user.save();
    res.json({ message: 'Subscription will be canceled at period end.', endDate: user.subscriptionEndDate });
  } catch (err) {
    console.error('Stripe cancel error:', err);
    res.status(500).json({ error: 'Failed to cancel subscription', details: err.message });
  }
});

// GET /api/user/account
router.get('/user/account', requireAuth, async (req, res) => {
  const user = req.user;
  res.json({
    plan: user.plan,
    conversionsLeft: user.conversionsLeft,
    subscriptionStatus: user.subscriptionStatus,
    subscriptionEndDate: user.subscriptionEndDate,
    pendingPlan: user.pendingPlan
  });
});

export default router; 