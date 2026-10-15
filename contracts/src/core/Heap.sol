// SPDX-License-Identifier: MIT
pragma solidity 0.8.28;

import {CoreState} from "./GameStorage.sol";

/// The global mission queue (B-07): a binary min-heap of mission ids ordered by (arrival, seq),
/// with a position index so a recalled mission can be moved.
library Heap {
    function _less(CoreState storage s, uint64 a, uint64 b) private view returns (bool) {
        (uint40 ta, uint40 tb) = (s.missions[a].arrival, s.missions[b].arrival);
        return ta < tb || (ta == tb && s.missions[a].seq < s.missions[b].seq);
    }

    function _swap(CoreState storage s, uint256 i, uint256 j) private {
        (uint64 a, uint64 b) = (s.heap[i], s.heap[j]);
        (s.heap[i], s.heap[j]) = (b, a);
        (s.heapPos[b], s.heapPos[a]) = (i + 1, j + 1);
    }

    function _up(CoreState storage s, uint256 i) private {
        while (i > 0) {
            uint256 parent = (i - 1) / 2;
            if (!_less(s, s.heap[i], s.heap[parent])) return;
            _swap(s, i, parent);
            i = parent;
        }
    }

    function _down(CoreState storage s, uint256 i) private {
        uint256 n = s.heap.length;
        while (true) {
            uint256 l = 2 * i + 1;
            if (l >= n) return;
            uint256 m = l;
            if (l + 1 < n && _less(s, s.heap[l + 1], s.heap[l])) m = l + 1;
            if (!_less(s, s.heap[m], s.heap[i])) return;
            _swap(s, i, m);
            i = m;
        }
    }

    function push(CoreState storage s, uint64 id) internal {
        s.heap.push(id);
        s.heapPos[id] = s.heap.length;
        _up(s, s.heap.length - 1);
    }

    /// Smallest mission id, or 0 if the queue is empty.
    function head(CoreState storage s) internal view returns (uint64) {
        return s.heap.length == 0 ? 0 : s.heap[0];
    }

    function remove(CoreState storage s, uint64 id) internal {
        uint256 i = s.heapPos[id] - 1;
        uint256 last = s.heap.length - 1;
        if (i != last) _swap(s, i, last);
        s.heap.pop();
        delete s.heapPos[id];
        if (i < s.heap.length) {
            _down(s, i);
            _up(s, i);
        }
    }
}
