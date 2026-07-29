import RazorpayCheckout from 'react-native-razorpay';
import { initiateOrderPayment, verifyOrderPayment } from '../api/marketplace';

export async function completeOrderPayment(orderId: string): Promise<void> {
  const payment = await initiateOrderPayment(orderId);
  if (!payment.keyId || !payment.razorpayOrderId || !payment.amount || !payment.paymentId) {
    throw new Error('Payment gateway did not return a complete checkout session.');
  }
  const gateway = await RazorpayCheckout.open({
    key: payment.keyId,
    amount: payment.amount,
    currency: payment.currency ?? 'INR',
    name: 'EsyGlob',
    description: `Payment for ${payment.orderNumber ?? 'order'}`,
    order_id: payment.razorpayOrderId,
    theme: { color: '#2563EB' },
  });
  await verifyOrderPayment({
    paymentId: payment.paymentId,
    razorpayPaymentId: gateway.razorpay_payment_id,
    razorpayOrderId: gateway.razorpay_order_id,
    razorpaySignature: gateway.razorpay_signature,
  });
}
