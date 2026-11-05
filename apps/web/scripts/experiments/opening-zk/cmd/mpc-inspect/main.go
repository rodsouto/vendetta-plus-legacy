// Offline framing inspection only; no native deserialization, MPC or key output.
package main

import (
	"encoding/json"
	"errors"
	"flag"
	"fmt"
	"io"
	"os"
	"syscall"

	"vendetta-opening-pairing-experiment/ceremony"
	"vendetta-opening-pairing-experiment/mpcinspect"
)

func regular(path string) (*os.File, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	info, err := f.Stat()
	if err != nil || !info.Mode().IsRegular() {
		f.Close()
		return nil, errors.New("inspection input must be a regular file")
	}
	return f, nil
}

func run(args []string, output io.Writer) error {
	flags := flag.NewFlagSet("mpc-inspect", flag.ContinueOnError)
	flags.SetOutput(io.Discard)
	shapePath := flags.String("shape", "", "Pinned dimensional policy JSON")
	shapePin := flags.String("shape-sha256", "", "External SHA-256 of shape bytes")
	input := flags.String("transcript", "", "Native contribution file")
	inputPin := flags.String("transcript-sha256", "", "External SHA-256 of transcript bytes")
	maxBytes := flags.Uint64("max-bytes", 64*1024, "Explicit maximum transcript bytes, at most 2 GiB")
	if err := flags.Parse(args); err != nil {
		return err
	}
	if flags.NArg() != 0 {
		return errors.New("unexpected positional arguments")
	}
	f, err := regular(*shapePath)
	if err != nil {
		return err
	}
	data, err := ceremony.BoundRead(f)
	closeErr := f.Close()
	if err != nil {
		return err
	}
	if closeErr != nil {
		return closeErr
	}
	shape, err := mpcinspect.ParseShape(data, *shapePin)
	if err != nil {
		return err
	}
	size, err := shape.Size()
	if err != nil || *maxBytes == 0 || *maxBytes > mpcinspect.MaxTranscriptBytes || size > *maxBytes {
		return errors.New("shape exceeds explicit inspection byte budget")
	}
	f, err = regular(*input)
	if err != nil {
		return err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil || info.Size() != int64(size) {
		return errors.New("transcript file size differs from pinned shape")
	}
	result, err := mpcinspect.Scan(f, shape, *inputPin, *maxBytes)
	if err != nil {
		return err
	}
	return json.NewEncoder(output).Encode(struct {
		mpcinspect.Result
		ShapeSHA256   string `json:"shapeSha256"`
		CircuitSHA256 string `json:"circuitSha256"`
	}{result, *shapePin, shape.CircuitSHA256})
}

func main() {
	if err := run(os.Args[1:], os.Stdout); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}
