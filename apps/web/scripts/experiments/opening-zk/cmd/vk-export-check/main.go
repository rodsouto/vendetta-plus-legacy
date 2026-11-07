// Offline relation check for a bounded VK and its Solidity source; no setup or proving.
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

func readRegular(path string, limit int) ([]byte, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() || info.Size() <= 0 || info.Size() > int64(limit) {
		return nil, errors.New("regular input exceeds byte budget or is empty")
	}
	data, err := io.ReadAll(io.LimitReader(f, int64(limit)+1))
	if err != nil {
		return nil, err
	}
	if len(data) != int(info.Size()) {
		return nil, errors.New("input size changed")
	}
	return data, nil
}
func run(args []string, output io.Writer) error {
	flags := flag.NewFlagSet("vk-export-check", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	vk := flags.String("vk", "", "Existing verifying.key")
	vkPin := flags.String("vk-sha256", "", "External VK pin")
	source := flags.String("solidity", "", "Existing Verifier.sol")
	sourcePin := flags.String("solidity-sha256", "", "External Solidity source pin")
	public := flags.Int("public-inputs", -1, "Expected witness input count excluding commitments")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	data, err := readRegular(*vk, artifactcheck.MaxVKBytes)
	if err != nil {
		return err
	}
	solidity, err := readRegular(*source, artifactcheck.MaxSolidityBytes)
	if err != nil {
		return err
	}
	result, err := artifactcheck.CheckVKSolidity(data, *vkPin, solidity, *sourcePin, *public)
	if err != nil {
		return err
	}
	return json.NewEncoder(output).Encode(result)
}
func main() {
	logger.Disable()
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
