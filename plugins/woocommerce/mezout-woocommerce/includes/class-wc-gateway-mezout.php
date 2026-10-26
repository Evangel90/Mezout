<?php
/**
 * The Mezout payment gateway.
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

/**
 * At checkout the order gets a Mezout invoice for its total, and the customer is sent to Mezout's checkout to pay.
 * The order is marked paid only when a signed invoice.paid webhook arrives (see Mezout_Webhook), never because the
 * customer came back to the store.
 */
class WC_Gateway_Mezout extends WC_Payment_Gateway {
	const SUPPORTED_CURRENCIES = array( 'USD', 'MUSD' );
	const WEBHOOK_OPTION       = 'mezout_webhook';

	public function __construct() {
		$this->id                 = 'mezout';
		$this->method_title       = __( 'Mezout', 'mezout-woocommerce' );
		$this->method_description = __( 'Customers pay with Bitcoin, MUSD or MEZO on Mezo, or borrow MUSD against their BTC. You receive the exact order total in MUSD at your Mezout payout address. Mezout never holds your funds.', 'mezout-woocommerce' );
		$this->has_fields         = false;
		$this->supports           = array( 'products', 'refunds' );

		$this->init_form_fields();
		$this->init_settings();
		$this->title       = $this->get_option( 'title' );
		$this->description = $this->get_option( 'description' );

		add_action( 'woocommerce_update_options_payment_gateways_' . $this->id, array( $this, 'process_admin_options' ) );
	}

	public function init_form_fields() {
		$this->form_fields = array(
			'enabled'       => array(
				'title'   => __( 'Enable', 'mezout-woocommerce' ),
				'type'    => 'checkbox',
				'label'   => __( 'Accept payments with Mezout', 'mezout-woocommerce' ),
				'default' => 'no',
			),
			'title'         => array(
				'title'       => __( 'Title', 'mezout-woocommerce' ),
				'type'        => 'text',
				'description' => __( 'The payment method name customers see at checkout.', 'mezout-woocommerce' ),
				'default'     => __( 'Bitcoin, MUSD or MEZO', 'mezout-woocommerce' ),
				'desc_tip'    => true,
			),
			'description'   => array(
				'title'       => __( 'Description', 'mezout-woocommerce' ),
				'type'        => 'textarea',
				'description' => __( 'Shown under the title at checkout.', 'mezout-woocommerce' ),
				'default'     => __( 'Pay on Mezo with Bitcoin, MUSD or MEZO, or borrow MUSD against your BTC. You will be taken to Mezout to pay.', 'mezout-woocommerce' ),
				'desc_tip'    => true,
			),
			'api_key'       => array(
				'title'       => __( 'API key', 'mezout-woocommerce' ),
				'type'        => 'password',
				'description' => sprintf(
					/* translators: %s: link to the Mezout dashboard */
					__( 'Create one in the %s, on the Developers tab. It starts with mzk_test_. Saving these settings checks the key and sets up webhooks.', 'mezout-woocommerce' ),
					'<a href="' . esc_url( Mezout_API::base_url() . '/dashboard/developers' ) . '" target="_blank" rel="noopener">' . esc_html__( 'Mezout dashboard', 'mezout-woocommerce' ) . '</a>'
				),
				'default'     => '',
			),
			'link_lifetime' => array(
				'title'             => __( 'Payment link lifetime (minutes)', 'mezout-woocommerce' ),
				'type'              => 'number',
				'description'       => __( 'How long the customer has to pay. After that the link expires and the unpaid order is cancelled. 5 to 1440.', 'mezout-woocommerce' ),
				'default'           => '60',
				'desc_tip'          => true,
				'custom_attributes' => array(
					'min' => 5,
					'max' => 1440,
				),
			),
		);
	}

	private function api(): Mezout_API {
		return new Mezout_API( trim( (string) $this->get_option( 'api_key' ) ), Mezout_API::base_url() );
	}

	public function is_available() {
		return parent::is_available()
			&& '' !== trim( (string) $this->get_option( 'api_key' ) )
			&& in_array( get_woocommerce_currency(), self::SUPPORTED_CURRENCIES, true );
	}

	/** Mezout's webhook signing secret for this store, set when the settings are saved. */
	public static function webhook_secret(): string {
		$hook = get_option( self::WEBHOOK_OPTION, array() );
		return is_array( $hook ) && isset( $hook['secret'] ) ? (string) $hook['secret'] : '';
	}

	public static function webhook_url(): string {
		return rest_url( 'mezout/v1/webhook' );
	}

	/** A short, stable id for this store, so two stores using one Mezout account never share an Idempotency-Key. */
	private static function site_id(): string {
		return substr( md5( home_url() ), 0, 10 );
	}

	/**
	 * Creates an invoice for the order total and sends the customer to Mezout's checkout. A link that is still valid
	 * for the same amount is reused, so going back and forth does not create new invoices.
	 */
	public function process_payment( $order_id ) {
		$order  = wc_get_order( $order_id );
		$amount = wc_format_decimal( $order->get_total(), wc_get_price_decimals() );

		$current = $order->get_meta( '_mezout_invoice_id' );
		if ( $current && $order->get_meta( '_mezout_amount' ) === $amount && (int) $order->get_meta( '_mezout_expires_at' ) > time() + 120 ) {
			return array(
				'result'   => 'success',
				'redirect' => $order->get_meta( '_mezout_checkout_url' ),
			);
		}

		$attempt = (int) $order->get_meta( '_mezout_attempt' ) + 1;
		$body    = array(
			'amount'     => $amount,
			/* translators: %s: order number */
			'reference'  => sprintf( __( 'Order #%s', 'mezout-woocommerce' ), $order->get_order_number() ),
			'expires_in' => 60 * max( 5, min( 1440, (int) $this->get_option( 'link_lifetime', 60 ) ) ),
		);
		$return = $this->get_return_url( $order );
		if ( self::is_return_url_allowed( $return ) ) {
			$body['success_url'] = $return;
		}

		try {
			$invoice = $this->api()->request( 'POST', '/v1/invoices', $body, 'woo-' . self::site_id() . '-' . $order->get_id() . '-' . $attempt );
		} catch ( Mezout_API_Error $e ) {
			wc_get_logger()->error( 'Creating a Mezout invoice for order ' . $order->get_id() . ' failed: ' . $e->getMessage(), array( 'source' => 'mezout' ) );
			wc_add_notice( __( 'Mezout payments are not available right now. Please try again in a moment or choose another payment method.', 'mezout-woocommerce' ), 'error' );
			return array( 'result' => 'failure' );
		}

		$order->update_meta_data( '_mezout_attempt', $attempt );
		$order->update_meta_data( '_mezout_invoice_id', $invoice['id'] );
		$order->update_meta_data( '_mezout_amount', $amount );
		$order->update_meta_data( '_mezout_checkout_url', $invoice['checkout_url'] );
		$order->update_meta_data( '_mezout_expires_at', strtotime( $invoice['expires_at'] ) );
		// Every invoice the order ever had, so a payment of an earlier one is still matched to it.
		$order->add_meta_data( Mezout_Orders::INVOICE_META, $invoice['id'] );
		$order->set_transaction_id( '' );
		$order->add_order_note(
			/* translators: 1: invoice id, 2: amount */
			sprintf( __( 'Mezout invoice %1$s created for %2$s MUSD. Waiting for the customer to pay.', 'mezout-woocommerce' ), $invoice['id'], $invoice['amount'] )
		);
		$order->save();

		return array(
			'result'   => 'success',
			'redirect' => $invoice['checkout_url'],
		);
	}

	/** Mezout only sends customers back to https pages, or http on localhost. */
	private static function is_return_url_allowed( string $url ): bool {
		$scheme = wp_parse_url( $url, PHP_URL_SCHEME );
		$host   = wp_parse_url( $url, PHP_URL_HOST );
		return 'https' === $scheme || ( 'http' === $scheme && in_array( $host, array( 'localhost', '127.0.0.1' ), true ) );
	}

	/**
	 * Requests a refund in Mezout. Mezout never holds funds, so it cannot send the money itself: the merchant sends it
	 * from the Mezout dashboard, and refund.completed (or refund.canceled if they decline) updates this order.
	 */
	public function process_refund( $order_id, $amount = null, $reason = '' ) {
		$order   = wc_get_order( $order_id );
		$invoice = $order ? $order->get_meta( '_mezout_paid_invoice_id' ) : '';
		if ( ! $invoice ) {
			return new WP_Error( 'mezout_refund', __( 'This order was not paid through Mezout.', 'mezout-woocommerce' ) );
		}
		if ( null === $amount || (float) $amount <= 0 ) {
			return new WP_Error( 'mezout_refund', __( 'Enter an amount to refund.', 'mezout-woocommerce' ) );
		}

		// WooCommerce creates its refund record before asking the gateway, so the newest refund is this one.
		$refunds   = $order->get_refunds();
		$wc_refund = $refunds[0] ?? null;
		$body      = array(
			'invoice' => $invoice,
			'amount'  => wc_format_decimal( $amount, wc_get_price_decimals() ),
		);
		if ( '' !== trim( (string) $reason ) ) {
			$body['reason'] = mb_substr( trim( (string) $reason ), 0, 200 );
		}
		$key = 'woo-refund-' . self::site_id() . '-' . $order->get_id() . '-' . ( $wc_refund ? $wc_refund->get_id() : md5( wp_json_encode( $body ) ) );

		try {
			$refund = $this->api()->request( 'POST', '/v1/refunds', $body, $key );
		} catch ( Mezout_API_Error $e ) {
			return new WP_Error( 'mezout_refund', $e->getMessage() );
		}

		if ( $wc_refund ) {
			$wc_refund->update_meta_data( Mezout_Orders::REFUND_META, $refund['id'] );
			$wc_refund->save();
		}
		$order->add_order_note(
			sprintf(
				/* translators: 1: amount, 2: Mezout refund id, 3: link to the Mezout dashboard */
				__( 'Refund of %1$s MUSD requested in Mezout (%2$s). The customer has not received it yet: send it from the Payments tab of the %3$s. This order is updated when it is sent, or if you decline it there.', 'mezout-woocommerce' ),
				$refund['amount'],
				$refund['id'],
				'<a href="' . esc_url( Mezout_API::base_url() . '/dashboard/payments' ) . '" target="_blank" rel="noopener">' . esc_html__( 'Mezout dashboard', 'mezout-woocommerce' ) . '</a>'
			)
		);
		return true;
	}

	/** Saves the settings, then checks the API key and makes sure Mezout sends webhooks to this store. */
	public function process_admin_options() {
		$saved = parent::process_admin_options();
		$this->init_settings();
		if ( '' === trim( (string) $this->get_option( 'api_key' ) ) ) {
			return $saved;
		}
		try {
			$this->connect();
			WC_Admin_Settings::add_message( __( 'Connected to Mezout. Webhooks are set up for this store.', 'mezout-woocommerce' ) );
		} catch ( Mezout_API_Error $e ) {
			WC_Admin_Settings::add_error( __( 'Mezout:', 'mezout-woocommerce' ) . ' ' . $e->getMessage() );
		}
		return $saved;
	}

	/**
	 * Checks the key, then registers this store's webhook URL with Mezout and keeps the signing secret it returns.
	 * Re-registers when the key or the store's URL changes.
	 *
	 * @throws Mezout_API_Error When the key is refused or the endpoint cannot be added.
	 */
	private function connect(): void {
		$api = $this->api();
		try {
			$api->request( 'GET', '/v1/invoices?limit=1' );
		} catch ( Mezout_API_Error $e ) {
			if ( 401 === $e->status ) {
				throw new Mezout_API_Error( __( 'the API key was not accepted. Check that you copied all of it and that it has not been revoked.', 'mezout-woocommerce' ), 401 );
			}
			throw $e;
		}

		$url  = self::webhook_url();
		$key  = trim( (string) $this->get_option( 'api_key' ) );
		$hook = get_option( self::WEBHOOK_OPTION, array() );
		if ( is_array( $hook ) && ( $hook['url'] ?? '' ) === $url && ( $hook['key_hash'] ?? '' ) === hash( 'sha256', $key ) && ! empty( $hook['secret'] ) ) {
			return;
		}

		// Replace any endpoint already pointing here: its secret is not stored, so it cannot be verified.
		$existing = $api->request( 'GET', '/v1/webhook_endpoints' );
		foreach ( $existing['data'] ?? array() as $endpoint ) {
			if ( ( $endpoint['url'] ?? '' ) === $url ) {
				$api->request( 'DELETE', '/v1/webhook_endpoints/' . rawurlencode( $endpoint['id'] ) );
			}
		}
		try {
			$endpoint = $api->request( 'POST', '/v1/webhook_endpoints', array( 'url' => $url ) );
		} catch ( Mezout_API_Error $e ) {
			throw new Mezout_API_Error(
				sprintf(
					/* translators: 1: webhook URL, 2: Mezout's error */
					__( 'could not set up webhooks for %1$s: %2$s. Mezout delivers only to stores reachable at a public https address.', 'mezout-woocommerce' ),
					$url,
					$e->getMessage()
				),
				$e->status
			);
		}
		update_option(
			self::WEBHOOK_OPTION,
			array(
				'id'       => $endpoint['id'],
				'url'      => $url,
				'secret'   => $endpoint['secret'],
				'key_hash' => hash( 'sha256', $key ),
			),
			false
		);
	}

	public function admin_options() {
		$hook = get_option( self::WEBHOOK_OPTION, array() );
		echo '<h2>' . esc_html( $this->get_method_title() ) . '</h2>';
		echo wp_kses_post( wpautop( $this->get_method_description() ) );

		if ( ! in_array( get_woocommerce_currency(), self::SUPPORTED_CURRENCIES, true ) ) {
			echo '<div class="notice notice-warning inline"><p>' . esc_html(
				sprintf(
					/* translators: %s: the store currency */
					__( 'Your store currency is %s. Mezout is offered at checkout only when the store currency is US Dollar (USD) or Mezo USD (MUSD), since customers pay in MUSD.', 'mezout-woocommerce' ),
					get_woocommerce_currency()
				)
			) . '</p></div>';
		}
		if ( is_array( $hook ) && ! empty( $hook['secret'] ) && ( $hook['url'] ?? '' ) === self::webhook_url() ) {
			echo '<div class="notice notice-success inline"><p>' . esc_html(
				sprintf(
					/* translators: 1: Mezout webhook endpoint id, 2: URL */
					__( 'Connected. Mezout sends payment events (endpoint %1$s) to %2$s, and orders are marked paid when they arrive.', 'mezout-woocommerce' ),
					$hook['id'],
					$hook['url']
				)
			) . '</p></div>';
		} elseif ( '' !== trim( (string) $this->get_option( 'api_key' ) ) ) {
			echo '<div class="notice notice-error inline"><p>' . esc_html__( 'Not connected: webhooks are not set up, so orders cannot be marked paid. Save the settings to try again.', 'mezout-woocommerce' ) . '</p></div>';
		}

		echo '<table class="form-table">';
		$this->generate_settings_html();
		echo '</table>';
	}
}
