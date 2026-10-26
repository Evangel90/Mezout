<?php
/**
 * Plugin Name:          Mezout for WooCommerce
 * Plugin URI:           https://usemezout.vercel.app
 * Description:          Accept Bitcoin, MUSD and MEZO on Mezo. Customers pay however they like; you receive the exact order total in MUSD, straight to your own address.
 * Version:              0.1.0
 * Requires at least:    6.5
 * Requires PHP:         8.1
 * Requires Plugins:     woocommerce
 * WC requires at least: 8.5
 * WC tested up to:      11.2
 * Author:               Mezout
 * License:              GPL-2.0-or-later
 * License URI:          https://www.gnu.org/licenses/gpl-2.0.html
 * Text Domain:          mezout-woocommerce
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

const MEZOUT_WC_VERSION = '0.1.0';
const MEZOUT_WC_FILE    = __FILE__;

// Works with WooCommerce's order tables (HPOS) and the block checkout.
add_action(
	'before_woocommerce_init',
	function () {
		if ( class_exists( \Automattic\WooCommerce\Utilities\FeaturesUtil::class ) ) {
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'custom_order_tables', __FILE__, true );
			\Automattic\WooCommerce\Utilities\FeaturesUtil::declare_compatibility( 'cart_checkout_blocks', __FILE__, true );
		}
	}
);

add_action(
	'plugins_loaded',
	function () {
		if ( ! class_exists( 'WC_Payment_Gateway' ) ) {
			return;
		}
		require_once __DIR__ . '/includes/class-mezout-signature.php';
		require_once __DIR__ . '/includes/class-mezout-amount.php';
		require_once __DIR__ . '/includes/class-mezout-api.php';
		require_once __DIR__ . '/includes/class-mezout-orders.php';
		require_once __DIR__ . '/includes/class-wc-gateway-mezout.php';
		require_once __DIR__ . '/includes/class-mezout-webhook.php';

		add_filter(
			'woocommerce_payment_gateways',
			function ( $gateways ) {
				$gateways[] = WC_Gateway_Mezout::class;
				return $gateways;
			}
		);
		Mezout_Webhook::register();
		Mezout_Orders::register();

		// MUSD as a store currency, for stores that price in it. USD stores work too (1 MUSD is pegged to 1 USD).
		add_filter(
			'woocommerce_currencies',
			function ( $currencies ) {
				$currencies['MUSD'] = __( 'Mezo USD', 'mezout-woocommerce' );
				return $currencies;
			}
		);
		add_filter(
			'woocommerce_currency_symbol',
			fn( $symbol, $currency ) => 'MUSD' === $currency ? 'MUSD ' : $symbol,
			10,
			2
		);
	}
);

add_action(
	'woocommerce_blocks_loaded',
	function () {
		if ( ! class_exists( \Automattic\WooCommerce\Blocks\Payments\Integrations\AbstractPaymentMethodType::class ) ) {
			return;
		}
		require_once __DIR__ . '/includes/class-mezout-blocks.php';
		add_action(
			'woocommerce_blocks_payment_method_type_registration',
			function ( \Automattic\WooCommerce\Blocks\Payments\PaymentMethodRegistry $registry ) {
				$registry->register( new Mezout_Blocks() );
			}
		);
	}
);

add_filter(
	'plugin_action_links_' . plugin_basename( __FILE__ ),
	function ( $links ) {
		$url = admin_url( 'admin.php?page=wc-settings&tab=checkout&section=mezout' );
		array_unshift( $links, '<a href="' . esc_url( $url ) . '">' . esc_html__( 'Settings', 'mezout-woocommerce' ) . '</a>' );
		return $links;
	}
);
