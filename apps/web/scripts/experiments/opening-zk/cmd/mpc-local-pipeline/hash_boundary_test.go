package main

import (
	"context"
	"os"
	"os/exec"
	"path/filepath"
	"syscall"
	"testing"
	"time"

	"vendetta-opening-pairing-experiment/ceremony"
)

func TestFileHashInputBoundaries(t *testing.T) {
	if path := os.Getenv("VENDETTA_HASH_FIFO_TEST_PATH"); path != "" {
		if digest, err := fileHash(path); err == nil || digest != "" {
			t.Fatalf("FIFO accepted: %q %v", digest, err)
		}
		return
	}
	dir := t.TempDir()
	path := filepath.Join(dir, "body")
	body := []byte("fixed public hash fixture")
	if err := os.WriteFile(path, body, 0600); err != nil {
		t.Fatal(err)
	}
	t.Run("regular", func(t *testing.T) {
		digest, err := fileHash(path)
		if err != nil || digest != ceremony.Digest(body) {
			t.Fatalf("hash differs: %s %v", digest, err)
		}
	})
	link := filepath.Join(dir, "link")
	if err := os.Symlink(path, link); err != nil {
		t.Fatal(err)
	}
	fifo := filepath.Join(dir, "fifo")
	if err := syscall.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	empty := filepath.Join(dir, "empty")
	if err := os.WriteFile(empty, nil, 0600); err != nil {
		t.Fatal(err)
	}
	large := filepath.Join(dir, "oversized")
	f, err := os.Create(large)
	if err != nil {
		t.Fatal(err)
	}
	// Sparse fixture: no large body is allocated or read.
	err = f.Truncate(int64(fileBytes) + 1)
	closeErr := f.Close()
	if err != nil || closeErr != nil {
		t.Fatalf("sparse fixture: %v %v", err, closeErr)
	}
	for name, path := range map[string]string{"symlink": link, "fifo": fifo, "directory": dir, "empty": empty, "oversized": large} {
		t.Run(name, func(t *testing.T) {
			if name == "fifo" {
				// Bound the regression itself if a future opener blocks on FIFO.
				ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
				defer cancel()
				exe, err := os.Executable()
				if err != nil {
					t.Fatal(err)
				}
				cmd := exec.CommandContext(ctx, exe, "-test.run=^TestFileHashInputBoundaries$")
				cmd.Env = append(os.Environ(), "VENDETTA_HASH_FIFO_TEST_PATH="+path)
				if output, err := cmd.CombinedOutput(); err != nil {
					t.Fatalf("FIFO rejection failed or blocked: %v %s", err, output)
				}
				return
			}
			digest, err := fileHash(path)
			if err == nil || digest != "" {
				t.Fatalf("invalid hash input accepted: %q %v", digest, err)
			}
		})
	}
}
