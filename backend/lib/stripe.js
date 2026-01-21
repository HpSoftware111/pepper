import Stripe from 'stripe';

const stripeSecret = process.env.STRIPE_SECRET_KEY;

export const stripe = stripeSecret ? new Stripe(stripeSecret, { apiVersion: '2024-06-20' }) : null;

export function assertStripeConfigured() {
  if (!stripe) {
    throw new Error('Stripe is not configured. Set STRIPE_SECRET_KEY in the backend .env file.');
  }
}

