// This command is a Linux-only unsafe rehearsal on one fixed tiny circuit.
// It cannot generate game setup keys or confer production approval.
package main

import (
	"errors"
	"flag"
	"fmt"
	"io"
	"os"

	"github.com/consensys/gnark/logger"
	"vendetta-opening-pairing-experiment/mpcrehearsal"
)

func run(args []string, output io.Writer) error {
	if len(args) == 0 {
		return errors.New("usage: mpc-rehearsal run|init|contribute|close|verify --directory /outside/git/new-run --unsafe-test-only")
	}
	command := args[0]
	flags := flag.NewFlagSet(command, flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	dir := flags.String("directory", "", "External rehearsal directory")
	unsafe := flags.Bool("unsafe-test-only", false, "Required acknowledgement: no independent participants, no future beacon, no production approval")
	pin := flags.String("config-sha256", "", "Externally pinned configuration digest")
	parent := flags.String("phase1-closure-sha256", "", "Externally pinned phase one closure digest")
	closure2 := flags.String("phase2-closure-sha256", "", "Externally pinned phase two closure digest")
	phase := flags.Int("phase", 0, "Phase 1 or 2")
	index := flags.Int("index", -1, "Participant index 0 or 1")
	key := flags.String("key", "", "Ephemeral test identity file")
	if err := flags.Parse(args[1:]); err != nil {
		return err
	}
	if flags.NArg() != 0 || !*unsafe || *dir == "" {
		return errors.New("explicit directory and --unsafe-test-only are required; no positional arguments")
	}
	if command != "run" && command != "init" && command != "contribute" && command != "close" && command != "verify" {
		return errors.New("unsupported rehearsal command")
	}
	if command == "run" {
		exe, err := os.Executable()
		if err != nil {
			return err
		}
		_, err = mpcrehearsal.Run(exe, *dir, output)
		return err
	}
	if err := mpcrehearsal.LimitWorker(); err != nil {
		return err
	}
	logger.Disable()
	switch command {
	case "init":
		pin, err := mpcrehearsal.Initialize(*dir)
		if err != nil {
			return err
		}
		fmt.Fprintln(output, pin)
	case "contribute":
		return mpcrehearsal.Contribute(*dir, *pin, *parent, *key, *phase, *index)
	case "close":
		pin, err := mpcrehearsal.Close(*dir, *pin, *parent, *phase)
		if err != nil {
			return err
		}
		fmt.Fprintln(output, pin)
	case "verify":
		_, err := mpcrehearsal.Verify(*dir, *pin, *parent, *closure2)
		return err
	}
	return nil
}
func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, "mpc-rehearsal:", err)
		os.Exit(1)
	}
}
