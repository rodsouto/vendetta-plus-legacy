package main

import (
	"bufio"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"io"
	"os"
	"path/filepath"
	"runtime"
	"strings"

	"vendetta-opening-pairing-experiment/mpcinspect"
)

const capacityBeacon = "VENDETTA_UNSAFE_LOCAL_PHASE1_CAPACITY_BEACON_V1"

type CommonsArtifact struct {
	Schema                   string `json:"schema"`
	Log2                     int    `json:"log2"`
	Bytes                    int64  `json:"bytes"`
	SHA256                   string `json:"sha256"`
	SourceArtifactSHA256     string `json:"sourceArtifactSha256"`
	VerificationSHA256       string `json:"verificationSha256"`
	Beacon                   string `json:"beacon"`
	BeaconAfterClosureProven bool   `json:"beaconAfterClosureProven"`
	ProductionApproved       bool   `json:"productionApproved"`
}

func sealPhase1(log2 int, dir, input, pin, verificationPath, verificationPin string) error {
	if log2 != 3 && log2 != 22 && log2 != 23 {
		return errors.New("unsupported sealing domain")
	}
	if err := limitsFor("seal"); err != nil {
		return err
	}
	if log2 != 3 {
		mem, err := readKB("/proc/meminfo", "MemAvailable")
		if err != nil {
			return err
		}
		if mem < minAvailable {
			return errors.New("host headroom unavailable")
		}
	}
	a, err := sourceArtifact(input, pin, log2)
	if err != nil {
		return err
	}
	v, err := readPinnedVerification(verificationPath, verificationPin, log2)
	if err != nil {
		return err
	}
	if a.Operation != "second-contribution" || a.ParentArtifactSHA256 == "" || v.SourceArtifactSHA256 != pin || v.TranscriptSHA256 != a.SHA256 || v.PreviousVerificationSHA256 == "" {
		return errors.New("sealing requires verified second contribution")
	}
	f, err := regular(filepath.Join(input, "contribution.bin"))
	if err != nil {
		return err
	}
	defer f.Close()
	csPin := strings.Repeat("a", 64)
	if log2 == 22 {
		csPin = "89a9897b75e9cd785bd62feda8fc60ed50239f58e8b60211561fa560d8832898"
	} else if log2 == 23 {
		csPin = "06e4740642174a1f0f03ab0c0f06f2199b996534c30546df6896b9f3ab777b1f"
	}
	shape := mpcinspect.Shape{Schema: "vendetta-hidden-v2-native-shape-1", CircuitSHA256: csPin, Phase: 1, Domain: uint64(1) << log2, PrivateCommitted: []uint64{}}
	decoded, err := mpcinspect.Decode(f, shape, a.SHA256, fileBytes, 4<<30)
	if err != nil {
		return err
	}
	commons := decoded.Phase1.Seal([]byte(capacityBeacon))
	if err := outside(dir); err != nil {
		return err
	}
	if err := os.Mkdir(dir, 0700); err != nil {
		return err
	}
	out, err := os.OpenFile(filepath.Join(dir, "commons.bin"), os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
	if err != nil {
		return err
	}
	buffer := bufio.NewWriterSize(out, 1<<20)
	h := sha256.New()
	n, err := commons.WriteTo(io.MultiWriter(buffer, h))
	if err == nil {
		err = buffer.Flush()
	}
	if err == nil {
		err = out.Sync()
	}
	closeErr := out.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	if n != int64(192*(uint64(1)<<log2)-56) {
		return errors.New("sealed commons size differs")
	}
	if err := syncDirectory(dir); err != nil {
		return err
	}
	runtime.KeepAlive(commons)
	return exclusiveJSON(filepath.Join(dir, "commons.json"), CommonsArtifact{Schema: "vendetta-unsafe-local-commons-1", Log2: log2, Bytes: n, SHA256: hex.EncodeToString(h.Sum(nil)), SourceArtifactSHA256: pin, VerificationSHA256: verificationPin, Beacon: capacityBeacon})
}
