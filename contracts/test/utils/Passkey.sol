// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {Base64} from "@openzeppelin/contracts/utils/Base64.sol";

/// Builds WebAuthn assertions the way a browser and authenticator do, for tests.
library Passkey {
    Vm internal constant vm = Vm(address(uint160(uint256(keccak256("hevm cheat code")))));

    uint256 internal constant N = 0xFFFFFFFF00000000FFFFFFFFFFFFFFFFBCE6FAADA7179E84F3B9CAC2FC632551;
    bytes1 internal constant FLAG_UP = 0x01;
    bytes1 internal constant FLAG_UV = 0x04;
    // {"type":"webauthn.get", is 23 characters, so "challenge" starts at 23 and "type" at 1.
    uint256 internal constant CHALLENGE_INDEX = 23;
    uint256 internal constant TYPE_INDEX = 1;

    function publicKey(uint256 pk) internal pure returns (bytes32 qx, bytes32 qy) {
        (uint256 x, uint256 y) = vm.publicKeyP256(pk);
        return (bytes32(x), bytes32(y));
    }

    function sign(uint256 pk, bytes32 challenge) internal pure returns (bytes memory) {
        return sign(pk, challenge, "webauthn.get", FLAG_UP | FLAG_UV, false);
    }

    /// @param highS return the malleable (r, n - s) form instead of the canonical low-s signature.
    function sign(uint256 pk, bytes32 challenge, string memory typ, bytes1 flags, bool highS)
        internal
        pure
        returns (bytes memory)
    {
        string memory clientDataJSON = string.concat(
            '{"type":"',
            typ,
            '","challenge":"',
            Base64.encodeURL(abi.encodePacked(challenge)),
            '","origin":"https://mezout.test","crossOrigin":false}'
        );
        bytes memory authenticatorData = abi.encodePacked(sha256("mezout.test"), flags, uint32(0));
        bytes32 digest = sha256(abi.encodePacked(authenticatorData, sha256(bytes(clientDataJSON))));
        (bytes32 r, bytes32 s) = vm.signP256(pk, digest);
        bool isHigh = uint256(s) > N / 2;
        if (isHigh != highS) s = bytes32(N - uint256(s));
        return abi.encode(r, s, CHALLENGE_INDEX, TYPE_INDEX, authenticatorData, clientDataJSON);
    }
}
