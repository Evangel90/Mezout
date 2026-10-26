<?php
/**
 * Verifies the Mezout-Signature header on webhook requests. No WordPress dependencies, so it can be tested alone.
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || defined( 'MEZOUT_TESTING' ) || exit;

/**
 * The header is "t=<unix seconds>,v1=<hex>", where v1 is HMAC-SHA256 of "<t>.<raw body>" keyed with the endpoint's
 * signing secret. Old timestamps are rejected so a captured request cannot be replayed later.
 */
final class Mezout_Signature {
	const TOLERANCE_SECONDS = 300;

	/**
	 * @param string      $raw_body The request body exactly as received.
	 * @param string|null $header   The Mezout-Signature header.
	 * @param string      $secret   The endpoint's signing secret (whsec_...).
	 * @param int|null    $now      Unix time; defaults to the current time.
	 */
	public static function verify( string $raw_body, ?string $header, string $secret, ?int $now = null ): bool {
		if ( '' === $secret || null === $header ) {
			return false;
		}
		$parts = array();
		foreach ( explode( ',', $header ) as $pair ) {
			$kv = explode( '=', $pair, 2 );
			if ( 2 === count( $kv ) ) {
				$parts[ trim( $kv[0] ) ] = trim( $kv[1] );
			}
		}
		if ( ! isset( $parts['t'], $parts['v1'] ) || ! ctype_digit( $parts['t'] ) ) {
			return false;
		}
		$now = $now ?? time();
		if ( abs( $now - (int) $parts['t'] ) > self::TOLERANCE_SECONDS ) {
			return false;
		}
		$expected = hash_hmac( 'sha256', $parts['t'] . '.' . $raw_body, $secret );
		return hash_equals( $expected, $parts['v1'] );
	}
}
