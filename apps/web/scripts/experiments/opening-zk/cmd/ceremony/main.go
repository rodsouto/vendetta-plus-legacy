// Offline design tooling only. No production setup loading or MPC execution.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"syscall"
	"time"

	"vendetta-opening-pairing-experiment/ceremony"
)

func read(path string) ([]byte, error) {
	if path == "" {
		return nil, errors.New("missing input file")
	}
	// A FIFO must not block before Stat can reject it. Final symlinks are also
	// rejected; digests still authenticate the bytes regardless of parent paths.
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		return nil, errors.New("input must be a regular file")
	}
	return ceremony.BoundRead(f)
}

func run(args []string, output io.Writer, now time.Time) error {
	if len(args) == 0 || (args[0] != "inspect-plan" && args[0] != "verify-review" && args[0] != "inspect-execution") {
		return errors.New("usage: ceremony inspect-plan|verify-review|inspect-execution --plan file --plan-sha256 digest [--trust file --trust-sha256 digest --review file]")
	}
	flags := flag.NewFlagSet(args[0], flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	planPath := flags.String("plan", "", "Plan JSON file")
	planPin := flags.String("plan-sha256", "", "Externally pinned digest of exact plan bytes")
	var trustPath, trustPin, reviewPath *string
	var executionPath, executionPin *string
	if args[0] == "inspect-execution" {
		executionPath = flags.String("execution", "", "Execution proposal JSON")
		executionPin = flags.String("execution-sha256", "", "Externally pinned execution digest")
	}
	if args[0] == "verify-review" {
		trustPath = flags.String("trust", "", "Reviewer trust policy JSON")
		trustPin = flags.String("trust-sha256", "", "Externally pinned digest of exact trust policy bytes")
		reviewPath = flags.String("review", "", "Signed design review envelope JSON")
	}
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	planData, err := read(*planPath)
	if err != nil {
		return err
	}
	plan, err := ceremony.ValidatePlan(planData, *planPin)
	if err != nil {
		return err
	}
	result := map[string]any{
		"status": "design-plan-validated", "ceremonyId": plan.CeremonyID,
		"planSha256": *planPin, "sourceBundleSha256": plan.SourceBundleSHA256,
		"productionApproved": false, "mpcTranscriptVerified": false,
		"artifactBytesVerified": false,
	}
	if args[0] == "inspect-execution" {
		data, err := read(*executionPath)
		if err != nil {
			return err
		}
		if _, err := ceremony.ValidateExecution(planData, *planPin, data, *executionPin); err != nil {
			return err
		}
		result["status"] = "execution-proposal-validated"
		result["executionSha256"] = *executionPin
		result["participantIdentitiesAuthenticated"] = false
		result["beaconEvidenceAuthenticated"] = false
		result["resourceLimitsEnforced"] = false
	}
	if args[0] == "verify-review" {
		trustData, err := read(*trustPath)
		if err != nil {
			return err
		}
		reviewData, err := read(*reviewPath)
		if err != nil {
			return err
		}
		review, err := ceremony.VerifyReview(planData, *planPin, trustData, *trustPin, reviewData, now)
		if err != nil {
			return err
		}
		result["status"], result["expiresAt"] = "design-review-signatures-verified", review.ExpiresAt
		result["trustSha256"], result["reviewEnvelopeSha256"] = *trustPin, ceremony.Digest(reviewData)
	}
	return json.NewEncoder(output).Encode(result)
}

func main() {
	if err := run(os.Args[1:], os.Stdout, time.Now().UTC()); err != nil {
		fmt.Fprintln(os.Stderr, "ceremony:", err)
		os.Exit(1)
	}
}
