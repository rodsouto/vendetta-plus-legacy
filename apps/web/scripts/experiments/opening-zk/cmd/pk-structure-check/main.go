// Streaming PK structure and shared VK parameters only; no setup or proving.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"syscall"

	"github.com/consensys/gnark/logger"
	"vendetta-opening-pairing-experiment/artifactcheck"
)

func regular(path string, max uint64) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() || info.Size() <= 0 || uint64(info.Size()) > max {
		f.Close()
		return nil, errors.New("nonempty regular input within byte budget required")
	}
	return f, nil
}
func small(path string, max uint64) ([]byte, error) {
	f, err := regular(path, max)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	data, err := io.ReadAll(io.LimitReader(f, int64(max)+1))
	if err != nil {
		return nil, err
	}
	if uint64(len(data)) > max {
		return nil, errors.New("small input grew past budget")
	}
	return data, nil
}
func run(args []string, output io.Writer) error {
	flags := flag.NewFlagSet("pk-structure-check", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	metaPath := flags.String("metadata", "", "Existing compile metadata JSON")
	metaPin := flags.String("metadata-sha256", "", "External metadata pin")
	csPin := flags.String("circuit-sha256", "", "Expected CS digest declared in metadata")
	pkPath := flags.String("pk", "", "Existing proving.key")
	pkPin := flags.String("pk-sha256", "", "External PK pin")
	vkPath := flags.String("vk", "", "Existing verifying.key")
	vkPin := flags.String("vk-sha256", "", "External VK pin")
	maxBytes := flags.Uint64("max-bytes", 65536, "PK byte budget, at most 2 GiB")
	validatePoints := flags.Bool("validate-points", false, "Native validation of every PK point; small exports only")
	maxPoints := flags.Uint64("max-points", 0, "Mandatory conservative PK-point budget with --validate-points, at most 65536")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 || *maxBytes == 0 || *maxBytes > artifactcheck.MaxPKBytes || (!*validatePoints && *maxPoints != 0) || (*validatePoints && (*maxPoints == 0 || *maxPoints > artifactcheck.MaxPKValidationPoints)) {
		return errors.New("invalid arguments or PK budget")
	}
	data, err := small(*metaPath, 65536)
	if err != nil {
		return err
	}
	metadata, err := artifactcheck.ParseCompiledMetadata(data, *metaPin, *csPin)
	if err != nil {
		return err
	}
	vk, err := small(*vkPath, artifactcheck.MaxVKBytes)
	if err != nil {
		return err
	}
	pk, err := regular(*pkPath, *maxBytes)
	if err != nil {
		return err
	}
	defer pk.Close()
	var result *artifactcheck.PKResult
	if *validatePoints {
		result, err = artifactcheck.CheckPKPoints(pk, *pkPin, vk, *vkPin, metadata, *maxBytes, *maxPoints)
	} else {
		result, err = artifactcheck.CheckPKStructure(pk, *pkPin, vk, *vkPin, metadata, *maxBytes)
	}
	if err != nil {
		return err
	}
	return json.NewEncoder(output).Encode(struct {
		*artifactcheck.PKResult
		MetadataSHA256 string `json:"metadataSha256"`
	}{result, *metaPin})
}
func main() {
	logger.Disable()
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
