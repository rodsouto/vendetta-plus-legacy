// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

/// Research-only H3 pagination. The admitter is a STUB for a future verified opening receipt.
/// This contract neither authenticates pre nor declares any mission valid/invalid.
contract H3Prefix {
    uint256 internal constant FR = 0x73eda753299d7d483339d80809a1d80553bda402fffe5bfeffffffff00000001;
    uint32 internal constant END = 65535; // tlock-js checks 1..65534 inclusive.
    uint16 public constant MAX_BATCH = 128;
    uint8 public constant COMPUTING = 1;
    uint8 public constant ACCEPTED = 2;
    uint8 public constant EXHAUSTED = 3;
    address public immutable admitter;

    struct State {
        bytes32 pre;
        uint256 scalar;
        uint32 next;
        uint32 acceptedAt;
        uint8 status;
    }
    mapping(bytes32 => State) public states;
    mapping(bytes32 => bytes32) public receiptForContext;
    mapping(bytes32 => bool) public contextInitialized;
    error Unauthorized();
    error BadReceipt();
    error AlreadyInitialized();
    error BadBatch();
    error Terminal();

    constructor(address admitter_) {
        admitter = admitter_;
    }

    function begin(bytes32 contextDigest, bytes32 verifierId, bytes32 pre) external returns (bytes32 receipt) {
        if (msg.sender != admitter) revert Unauthorized();
        if (verifierId == 0) revert BadReceipt();
        if (contextInitialized[contextDigest]) revert AlreadyInitialized();
        receipt = keccak256(abi.encode("VENDETTA_H3_PREFIX_V1", contextDigest, verifierId, pre));
        receiptForContext[contextDigest] = receipt;
        contextInitialized[contextDigest] = true;
        states[receipt] = State(pre, 0, 1, 0, COMPUTING);
    }

    function advance(bytes32 receipt, uint16 budget) external {
        if (budget == 0 || budget > MAX_BATCH) revert BadBatch();
        State storage s = states[receipt];
        if (s.status == 0) revert BadReceipt();
        if (s.status != COMPUTING) revert Terminal();
        uint32 i = s.next;
        uint32 stop = i + budget;
        if (stop > END) stop = END;
        for (; i < stop; ++i) {
            uint256 value = candidate(s.pre, i);
            if (value < FR) {
                s.scalar = value;
                s.acceptedAt = i;
                s.next = i + 1;
                s.status = ACCEPTED;
                return;
            }
        }
        s.next = i;
        if (i == END) s.status = EXHAUSTED;
    }

    function candidate(bytes32 pre, uint32 index) internal view virtual returns (uint256 value) {
        bytes2 le = bytes2(uint16((index << 8) | (index >> 8)));
        value = uint256(sha256(abi.encodePacked(le, pre)));
        // Shift only the first byte right, as tlock-js does; do NOT shift the entire digest.
        value = (value & ((uint256(1) << 248) - 1)) | ((value >> 249) << 248);
    }
}
