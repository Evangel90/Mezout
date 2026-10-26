<?php
/**
 * Removes the plugin's settings. Orders keep their Mezout notes and meta.
 *
 * @package Mezout
 */

defined( 'WP_UNINSTALL_PLUGIN' ) || exit;

delete_option( 'woocommerce_mezout_settings' );
delete_option( 'mezout_webhook' );
