// TODO (Semana 7): Webhook do Stripe para eventos de pagamento
// POST /api/webhooks/stripe
// Eventos: checkout.session.completed, invoice.payment_succeeded
export async function POST() {
  return Response.json({ received: true });
}
