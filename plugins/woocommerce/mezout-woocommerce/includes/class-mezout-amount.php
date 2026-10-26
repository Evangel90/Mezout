<?php
/**
 * Decimal amount helpers. Mezout sends amounts as decimal strings ("25", "0.5"); WooCommerce stores "25.00".
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || defined( 'MEZOUT_TESTING' ) || exit;

final class Mezout_Amount {
	/** "025.500" → "25.5", "25.00" → "25", "0.0" → "0". Returns null for anything that is not a plain decimal. */
	public static function normalize( string $amount ): ?string {
		$amount = trim( $amount );
		if ( ! preg_match( '/^(\d+)(?:\.(\d+))?$/', $amount, $m ) ) {
			return null;
		}
		$whole    = ltrim( $m[1], '0' );
		$fraction = rtrim( $m[2] ?? '', '0' );
		$whole    = '' === $whole ? '0' : $whole;
		return '' === $fraction ? $whole : $whole . '.' . $fraction;
	}

	/** True when both are the same decimal amount, whatever their formatting. */
	public static function equals( string $a, string $b ): bool {
		$na = self::normalize( $a );
		return null !== $na && self::normalize( $b ) === $na;
	}
}
