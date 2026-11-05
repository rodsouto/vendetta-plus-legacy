// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

interface IInvalidPointV2Verifier {
    function verifyProof(bytes calldata proof, uint256[2] calldata inputs) external view;
}

/// Invalid-U certificate consumer. Game supplies its
/// stored immutable v2 statement and apply the same invalid-send policy as other routes.
contract InvalidPointV2Consumer {
    IInvalidPointV2Verifier public immutable verifier;
    uint256 public constant VERIFICATION_GAS = 2_000_000;
    error InvalidProof();
    error NonCanonicalWord();
    error WrongStatement();

    constructor(IInvalidPointV2Verifier verifier_) {
        if (address(verifier_).code.length == 0) revert InvalidProof();
        verifier = verifier_;
    }

    function check(bytes32 expectedStatement, bytes calldata proof, uint256[2] calldata x)
        external
        view
        returns (bool invalid)
    {
        if (x[0] >> 128 != 0 || x[1] >> 128 != 0) revert NonCanonicalWord();
        if (bytes32((x[0] << 128) | x[1]) != expectedStatement) revert WrongStatement();
        try verifier.verifyProof{gas: VERIFICATION_GAS}(proof, x) {}
        catch {
            revert InvalidProof();
        }
        return true;
    }
}
