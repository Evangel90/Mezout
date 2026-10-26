<?php
/**
 * A small client for the Mezout API (https://usemezout.vercel.app/docs).
 *
 * @package Mezout
 */

defined( 'ABSPATH' ) || exit;

/** An error answer from Mezout, or a network failure (status 0). */
final class Mezout_API_Error extends Exception {
	public function __construct( string $message, public readonly int $status ) {
		parent::__construct( $message );
	}
}

final class Mezout_API {
	public function __construct( private string $api_key, private string $base_url ) {}

	/** The API's base URL: production Mezout, unless MEZOUT_API_BASE is defined (for local development). */
	public static function base_url(): string {
		return rtrim( defined( 'MEZOUT_API_BASE' ) ? (string) MEZOUT_API_BASE : 'https://usemezout.vercel.app', '/' );
	}

	/**
	 * Sends a request and returns the decoded JSON. A network error, a 5xx or a 409 (the same idempotent request still
	 * running) is retried once after a second, with the same Idempotency-Key, so the request still runs only once.
	 *
	 * @throws Mezout_API_Error When Mezout answers with an error or cannot be reached.
	 */
	public function request( string $method, string $path, ?array $body = null, ?string $idempotency_key = null ): array {
		$args = array(
			'method'  => $method,
			'timeout' => 20,
			'headers' => array(
				'Authorization' => 'Bearer ' . $this->api_key,
				'Accept'        => 'application/json',
				'User-Agent'    => 'Mezout-WooCommerce/' . MEZOUT_WC_VERSION . '; ' . home_url(),
			),
		);
		if ( null !== $body ) {
			$args['headers']['Content-Type'] = 'application/json';
			$args['body']                    = wp_json_encode( $body );
		}
		if ( null !== $idempotency_key ) {
			$args['headers']['Idempotency-Key'] = $idempotency_key;
		}

		$attempts = null === $idempotency_key && 'GET' !== $method ? 1 : 2;
		for ( $i = 1; ; $i++ ) {
			try {
				return $this->send( $path, $args );
			} catch ( Mezout_API_Error $e ) {
				$retryable = 0 === $e->status || 409 === $e->status || $e->status >= 500;
				if ( ! $retryable || $i >= $attempts ) {
					throw $e;
				}
				sleep( 1 );
			}
		}
	}

	private function send( string $path, array $args ): array {
		$res = wp_remote_request( $this->base_url . $path, $args );
		if ( is_wp_error( $res ) ) {
			/* translators: %s: the network error */
			throw new Mezout_API_Error( sprintf( __( 'Could not reach Mezout: %s', 'mezout-woocommerce' ), $res->get_error_message() ), 0 );
		}
		$status = (int) wp_remote_retrieve_response_code( $res );
		$json   = json_decode( wp_remote_retrieve_body( $res ), true );
		if ( $status < 200 || $status >= 300 ) {
			$message = is_array( $json ) && isset( $json['error'] ) && is_string( $json['error'] )
				? $json['error']
				/* translators: %d: HTTP status code */
				: sprintf( __( 'Mezout answered HTTP %d', 'mezout-woocommerce' ), $status );
			throw new Mezout_API_Error( $message, $status );
		}
		return is_array( $json ) ? $json : array();
	}
}
