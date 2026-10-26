<?php
/**
 * Unit tests for the parts of the plugin that do not need WordPress.
 *
 * Run in a terminal, in the Mezout/plugins/woocommerce folder (WordPress must be running: pnpm start):
 *   pnpm test
 */

define( 'MEZOUT_TESTING', true );
require __DIR__ . '/../includes/class-mezout-signature.php';
require __DIR__ . '/../includes/class-mezout-amount.php';

$failures = 0;
$count    = 0;
function check( string $name, bool $ok ): void {
	global $failures, $count;
	++$count;
	if ( ! $ok ) {
		++$failures;
	}
	echo ( $ok ? '  ok   ' : '  FAIL ' ) . $name . PHP_EOL;
}

// Signatures: the same construction Mezout's server uses (HMAC-SHA256 of "t.body").
$secret = 'whsec_test';
$body   = '{"id":"evt_1","object":"event","type":"invoice.paid"}';
$t      = 1761415331;
$header = 't=' . $t . ',v1=' . hash_hmac( 'sha256', $t . '.' . $body, $secret );

check( 'accepts a valid signature', Mezout_Signature::verify( $body, $header, $secret, $t ) );
check( 'accepts within 5 minutes', Mezout_Signature::verify( $body, $header, $secret, $t + 300 ) );
check( 'rejects an old timestamp', ! Mezout_Signature::verify( $body, $header, $secret, $t + 301 ) );
check( 'rejects a future timestamp', ! Mezout_Signature::verify( $body, $header, $secret, $t - 301 ) );
check( 'rejects a changed body', ! Mezout_Signature::verify( $body . ' ', $header, $secret, $t ) );
check( 'rejects the wrong secret', ! Mezout_Signature::verify( $body, $header, 'whsec_other', $t ) );
check( 'rejects a missing header', ! Mezout_Signature::verify( $body, null, $secret, $t ) );
check( 'rejects garbage', ! Mezout_Signature::verify( $body, 'nonsense', $secret, $t ) );
check( 'rejects an empty secret', ! Mezout_Signature::verify( $body, $header, '', $t ) );
check( 'rejects a non-numeric timestamp', ! Mezout_Signature::verify( $body, 't=abc,v1=00', $secret, $t ) );

// Amounts.
check( 'normalizes trailing zeros', '25' === Mezout_Amount::normalize( '25.00' ) );
check( 'normalizes leading zeros', '25.5' === Mezout_Amount::normalize( '025.50' ) );
check( 'keeps zero', '0' === Mezout_Amount::normalize( '0.000' ) );
check( 'rejects negatives', null === Mezout_Amount::normalize( '-1' ) );
check( 'rejects exponents', null === Mezout_Amount::normalize( '1e3' ) );
check( 'compares formatted amounts', Mezout_Amount::equals( '25.00', '25' ) );
check( 'compares long decimals', Mezout_Amount::equals( '0.000000000000000001', '0.000000000000000001000' ) );
check( 'tells amounts apart', ! Mezout_Amount::equals( '25.01', '25' ) );

echo PHP_EOL . ( $count - $failures ) . " of $count passed" . PHP_EOL;
exit( $failures ? 1 : 0 );
