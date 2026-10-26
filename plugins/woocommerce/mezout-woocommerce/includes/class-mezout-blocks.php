<?php
/**
 * Offers Mezout in WooCommerce's block checkout. Payment itself goes through WC_Gateway_Mezout::process_payment.
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

use Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType;

final class Mezout_Blocks extends AbstractPaymentMethodType {
	protected $name = 'mezout';

	public function initialize() {
		$this->settings = get_option( 'woocommerce_mezout_settings', array() );
	}

	public function is_active() {
		$gateways = WC()->payment_gateways() ? WC()->payment_gateways()->payment_gateways() : array();
		return isset( $gateways['mezout'] ) && $gateways['mezout']->is_available();
	}

	public function get_payment_method_script_handles() {
		wp_register_script(
			'mezout-blocks',
			plugins_url( 'assets/blocks.js', MEZOUT_WC_FILE ),
			array( 'wc-blocks-registry', 'wc-settings', 'wp-element', 'wp-html-entities' ),
			MEZOUT_WC_VERSION,
			true
		);
		return array( 'mezout-blocks' );
	}

	public function get_payment_method_data() {
		return array(
			'title'       => $this->get_setting( 'title' ),
			'description' => $this->get_setting( 'description' ),
			'supports'    => array( 'products' ),
		);
	}
}
