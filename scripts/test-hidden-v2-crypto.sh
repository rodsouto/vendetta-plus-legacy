#!/usr/bin/env bash
# Constraint solving and canonical execution only: never generate setups, keys or proofs.
set -euo pipefail
cd "$(dirname "$0")/../apps/web/scripts/experiments/opening-zk"
go test -count=1 -timeout=20m -v -run '^(TestG2ScalarZeroAndOrderBoundary|TestGT576ClientCircuitProducer|TestMissionStaticMatchesExecution|TestMissionV2Circuit|TestInvalidPointMissionV2Circuit|TestProducerNativeWitness|TestMissionV2ConsumerPublicSchema)$' .
