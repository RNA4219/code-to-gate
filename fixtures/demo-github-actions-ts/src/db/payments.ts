/**
 * Payment Module
 *
 * Contains patterns for testing CLIENT_TRUSTED_PRICE and MISSING_SERVER_VALIDATION.
 */

export type PaymentRequest = {
  orderId: string;
  amount: number; // CLIENT_TRUSTED_PRICE risk
  paymentMethod: "credit_card" | "paypal" | "bank_transfer";
  cardDetails?: {
    number: string;
    expiry: string;
    cvv: string;
  };
};

export type PaymentResult = {
  success: boolean;
  transactionId?: string;
  error?: string;
};

/**
 * Process payment
 *
 * CLIENT_TRUSTED_PRICE: Amount is accepted without verification
 * MISSING_SERVER_VALIDATION: No validation of payment details
 */
export async function processPayment(request: PaymentRequest): Promise<PaymentResult> {
  // CLIENT_TRUSTED_PRICE: Amount should be retrieved from order, not trusted
  // from client

  // MISSING_SERVER_VALIDATION: No validation of:
  // - Order exists
  // - Payment method is valid
  // - Card details format
  // - Amount matches order total

  try {
    // In real implementation, would call payment gateway API
    const transactionId = `txn_${Date.now()}`;

    return {
      success: true,
      transactionId,
    };
  } catch (error) {
    // TRY_CATCH_SWALLOW: Error not properly handled
    console.error("Payment processing error:", error);
    return {
      success: false,
      error: "Payment failed",
    };
  }
}

/**
 * Refund payment
 *
 * UNSAFE_DELETE variant: No verification of refund eligibility
 */
export async function refundPayment(transactionId: string): Promise<PaymentResult> {
  // No check if transaction exists
  // No check if refund is allowed
  // No audit log

  try {
    return {
      success: true,
      transactionId: `refund_${transactionId}`,
    };
  } catch (error) {
    return {
      success: false,
      error: "Refund failed",
    };
  }
}

/**
 * Get payment by transaction ID
 */
export async function getPaymentById(transactionId: string): Promise<PaymentRequest | null> {
  // Stub for fixture
  return null;
}