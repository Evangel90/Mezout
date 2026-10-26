<?php
/**
 * Finding orders and refunds from Mezout ids, and the customer's view of an unpaid order.
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

final class Mezout_Orders {
	/** On orders: one row per Mezout invoice the order had. */
	const INVOICE_META = '_mezout_invoice';
	/** On WooCommerce refunds: the Mezout refund (re_...) it was requested as, or recorded from. */
	const REFUND_META = '_mezout_refund_id';

	public static function register(): void {
		// The legacy (posts) order store needs custom query vars mapped to meta queries; the HPOS store reads meta_query.
		add_filter(
			'woocommerce_order_data_store_cpt_get_orders_query',
			function ( $query, $vars ) {
				if ( ! empty( $vars['mezout_invoice'] ) ) {
					$query['meta_query'][] = array(
						'key'   => self::INVOICE_META,
						'value' => $vars['mezout_invoice'],
					);
				}
				return $query;
			},
			10,
			2
		);
		add_action( 'woocommerce_thankyou_mezout', array( self::class, 'thankyou' ) );
	}

	/** The order an invoice was created for, or null if it was not created by this store. */
	public static function find_by_invoice( string $invoice_id ): ?WC_Order {
		if ( '' === $invoice_id ) {
			return null;
		}
		$orders = wc_get_orders(
			array(
				'limit'          => 1,
				'type'           => 'shop_order',
				'mezout_invoice' => $invoice_id,
				'meta_query'     => array( // phpcs:ignore WordPress.DB.SlowDBQuery.slow_db_query_meta_query
					array(
						'key'   => self::INVOICE_META,
						'value' => $invoice_id,
					),
				),
			)
		);
		return $orders[0] ?? null;
	}

	public static function find_refund( WC_Order $order, string $mezout_refund_id ): ?WC_Order_Refund {
		foreach ( $order->get_refunds() as $refund ) {
			if ( $refund->get_meta( self::REFUND_META ) === $mezout_refund_id ) {
				return $refund;
			}
		}
		return null;
	}

	/**
	 * The customer returns here from Mezout's checkout, usually a few seconds before the webhook arrives. The order is
	 * only marked paid by the webhook, so until then the page says the payment is being confirmed and reloads itself.
	 */
	public static function thankyou( $order_id ): void {
		$order = wc_get_order( $order_id );
		if ( ! $order || $order->is_paid() || ! $order->has_status( 'pending' ) ) {
			return;
		}
		echo '<div class="woocommerce-info mezout-confirming" role="status">'
			. esc_html__( 'If you have paid, your payment is being confirmed on Mezo. This usually takes a few seconds, and this page updates by itself.', 'mezout-woocommerce' )
			. '</div>';
		// Reload every 5 seconds for up to 2 minutes.
		?>
		<script>
			(function () {
				var key = "mezout-reloads-<?php echo (int) $order->get_id(); ?>";
				var n = 0;
				try { n = Number(sessionStorage.getItem(key) || 0); sessionStorage.setItem(key, String(n + 1)); } catch (e) {}
				if (n < 24) setTimeout(function () { location.reload(); }, 5000);
			})();
		</script>
		<?php
	}
}
