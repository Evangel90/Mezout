<?php
/**
 * Receives Mezout's webhooks at /wp-json/mezout/v1/webhook and updates orders.
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

/**
 * Every request is checked against the signing secret before anything else. Events can arrive more than once, so
 * each one is handled at most once (by event id) and every handler is safe to repeat. Any answer other than 2xx
 * makes Mezout retry, for up to 24 hours.
 */
final class Mezout_Webhook {
	public static function register(): void {
		add_action(
			'rest_api_init',
			function () {
				register_rest_route(
					'mezout/v1',
					'/webhook',
					array(
						'methods'             => 'POST',
						'callback'            => array( self::class, 'handle' ),
						// Mezout authenticates with the signature, checked in handle().
						'permission_callback' => '__return_true',
					)
				);
			}
		);
	}

	public static function handle( WP_REST_Request $request ): WP_REST_Response {
		$secret = WC_Gateway_Mezout::webhook_secret();
		if ( '' === $secret ) {
			// Not connected yet. Answer 503 so Mezout retries once the merchant saves the settings.
			return new WP_REST_Response( array( 'error' => 'Mezout is not connected on this store' ), 503 );
		}
		$raw = $request->get_body();
		if ( ! Mezout_Signature::verify( $raw, $request->get_header( 'mezout_signature' ), $secret ) ) {
			return new WP_REST_Response( array( 'error' => 'Invalid signature' ), 400 );
		}

		$event = json_decode( $raw, true );
		if ( ! is_array( $event ) || ! isset( $event['id'], $event['type'] ) ) {
			return new WP_REST_Response( array( 'error' => 'Invalid event' ), 400 );
		}
		$seen_key = 'mezout_evt_' . md5( (string) $event['id'] );
		if ( get_transient( $seen_key ) ) {
			return new WP_REST_Response( array( 'received' => true, 'duplicate' => true ), 200 );
		}

		$object = $event['data']['object'] ?? array();
		try {
			switch ( $event['type'] ) {
				case 'invoice.paid':
					$result = self::invoice_paid( $object );
					break;
				case 'invoice.expired':
					$result = self::invoice_expired( $object );
					break;
				case 'refund.completed':
					$result = self::refund_completed( $object );
					break;
				case 'refund.canceled':
					$result = self::refund_canceled( $object );
					break;
				case 'ping':
					$result = 'pong';
					break;
				default:
					// Mezout may add event types; ignore the ones this version does not know.
					$result = 'ignored';
			}
		} catch ( Throwable $e ) {
			wc_get_logger()->error( 'Mezout webhook ' . $event['id'] . ' failed: ' . $e->getMessage(), array( 'source' => 'mezout' ) );
			return new WP_REST_Response( array( 'error' => 'Could not process the event' ), 500 );
		}

		set_transient( $seen_key, 1, 3 * DAY_IN_SECONDS );
		return new WP_REST_Response( array( 'received' => true, 'result' => $result ), 200 );
	}

	/** Marks the order paid, after checking the amount paid matches the order total. */
	private static function invoice_paid( array $invoice ): string {
		$order = Mezout_Orders::find_by_invoice( (string) ( $invoice['id'] ?? '' ) );
		if ( ! $order ) {
			return 'not this store';
		}
		if ( $order->is_paid() ) {
			return 'already paid';
		}
		$payment = $invoice['payment'] ?? null;
		if ( ! is_array( $payment ) || ! in_array( $invoice['status'] ?? '', array( 'paid', 'refunded' ), true ) ) {
			return 'not paid';
		}

		$total = wc_format_decimal( $order->get_total(), wc_get_price_decimals() );
		if ( ! Mezout_Amount::equals( (string) $invoice['amount'], $total ) ) {
			$order->update_status(
				'on-hold',
				sprintf(
					/* translators: 1: amount paid, 2: order total */
					__( 'Mezout payment of %1$s MUSD does not match the order total of %2$s. Check the order before fulfilling it.', 'mezout-woocommerce' ),
					$invoice['amount'],
					$total
				)
			);
			return 'amount mismatch';
		}

		$order->update_meta_data( '_mezout_paid_invoice_id', $invoice['id'] );
		$order->update_meta_data( '_mezout_payer', $payment['payer'] ?? '' );
		$order->update_meta_data( '_mezout_method', $payment['method'] ?? '' );
		$order->add_order_note(
			sprintf(
				/* translators: 1: amount, 2: payment method, 3: amount received, 4: transaction link */
				__( 'Paid on Mezo: %1$s MUSD with %2$s. %3$s MUSD received at the payout address. Transaction: %4$s', 'mezout-woocommerce' ),
				$invoice['amount'],
				self::method_label( (string) ( $payment['method'] ?? '' ) ),
				$payment['net'] ?? $payment['amount'] ?? $invoice['amount'],
				'<a href="' . esc_url( 'https://explorer.test.mezo.org/tx/' . ( $payment['tx_hash'] ?? '' ) ) . '" target="_blank" rel="noopener">' . esc_html( substr( (string) ( $payment['tx_hash'] ?? '' ), 0, 12 ) ) . '…</a>'
			)
		);
		$order->payment_complete( (string) ( $payment['tx_hash'] ?? '' ) );
		return 'paid';
	}

	/** Cancels the order when its current payment link expires unpaid. Stock held for it is released. */
	private static function invoice_expired( array $invoice ): string {
		$order = Mezout_Orders::find_by_invoice( (string) ( $invoice['id'] ?? '' ) );
		if ( ! $order ) {
			return 'not this store';
		}
		// An older link expiring does not matter if the customer has a newer one.
		if ( $order->get_meta( '_mezout_invoice_id' ) !== ( $invoice['id'] ?? '' ) || ! $order->has_status( 'pending' ) ) {
			return 'ignored';
		}
		$order->update_status( 'cancelled', __( 'The Mezout payment link expired without being paid.', 'mezout-woocommerce' ) );
		return 'cancelled';
	}

	/**
	 * Records a refund sent from the Mezout dashboard. A refund requested from WooCommerce already has its record; a
	 * refund sent straight from the dashboard gets one now, so WooCommerce's totals match what the customer received.
	 */
	private static function refund_completed( array $refund ): string {
		$order = Mezout_Orders::find_by_invoice( (string) ( $refund['invoice']['id'] ?? '' ) );
		if ( ! $order ) {
			return 'not this store';
		}
		$tx   = (string) ( $refund['tx_hash'] ?? '' );
		$link = '<a href="' . esc_url( 'https://explorer.test.mezo.org/tx/' . $tx ) . '" target="_blank" rel="noopener">' . esc_html( substr( $tx, 0, 12 ) ) . '…</a>';

		if ( Mezout_Orders::find_refund( $order, (string) $refund['id'] ) ) {
			$order->add_order_note(
				/* translators: 1: amount, 2: transaction link */
				sprintf( __( 'Refund of %1$s MUSD sent to the customer. Transaction: %2$s', 'mezout-woocommerce' ), $refund['amount'], $link )
			);
			return 'noted';
		}

		$wc_refund = wc_create_refund(
			array(
				'order_id'       => $order->get_id(),
				'amount'         => $refund['amount'],
				'reason'         => __( 'Refunded from the Mezout dashboard', 'mezout-woocommerce' ),
				'refund_payment' => false,
				'restock_items'  => false,
			)
		);
		if ( is_wp_error( $wc_refund ) ) {
			$order->add_order_note(
				/* translators: 1: amount, 2: transaction link, 3: error */
				sprintf( __( 'Refund of %1$s MUSD sent from the Mezout dashboard (%2$s), but WooCommerce could not record it: %3$s', 'mezout-woocommerce' ), $refund['amount'], $link, $wc_refund->get_error_message() )
			);
			return 'not recorded';
		}
		$wc_refund->update_meta_data( Mezout_Orders::REFUND_META, $refund['id'] );
		$wc_refund->save();
		$order->add_order_note(
			/* translators: 1: amount, 2: transaction link */
			sprintf( __( 'Refund of %1$s MUSD sent from the Mezout dashboard. Transaction: %2$s', 'mezout-woocommerce' ), $refund['amount'], $link )
		);
		return 'recorded';
	}

	/** The merchant declined a refund requested from WooCommerce: remove WooCommerce's record, as nothing was sent. */
	private static function refund_canceled( array $refund ): string {
		$order = Mezout_Orders::find_by_invoice( (string) ( $refund['invoice']['id'] ?? '' ) );
		if ( ! $order ) {
			return 'not this store';
		}
		$wc_refund = Mezout_Orders::find_refund( $order, (string) $refund['id'] );
		if ( ! $wc_refund ) {
			return 'ignored';
		}
		$wc_refund->delete( true );
		// A full refund had set the order to Refunded; it is not any more.
		$order = wc_get_order( $order->get_id() );
		if ( $order->has_status( 'refunded' ) && $order->get_remaining_refund_amount() > 0 ) {
			$order->update_status( 'processing' );
		}
		$order->add_order_note(
			/* translators: %s: amount */
			sprintf( __( 'The refund of %s MUSD was declined in Mezout, so nothing was sent to the customer. Its WooCommerce refund record was removed.', 'mezout-woocommerce' ), $refund['amount'] )
		);
		return 'removed';
	}

	private static function method_label( string $method ): string {
		return array(
			'MUSD'   => 'MUSD',
			'BTC'    => 'BTC',
			'MEZO'   => 'MEZO',
			'BORROW' => __( 'MUSD borrowed against BTC', 'mezout-woocommerce' ),
		)[ $method ] ?? $method;
	}
}
