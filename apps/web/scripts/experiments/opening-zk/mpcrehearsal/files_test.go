package mpcrehearsal

import (
	"os"
	"path/filepath"
	"syscall"
	"testing"

	"vendetta-opening-pairing-experiment/ceremony"
)

func TestRehearsalFileBoundaries(t *testing.T) {
	dir := t.TempDir()
	regular := filepath.Join(dir, "regular")
	if err := writeFile(regular, []byte("original")); err != nil {
		t.Fatal(err)
	}
	if err := writeFile(regular, []byte("replacement")); err == nil {
		t.Fatal("existing output overwritten")
	}
	data, err := readFile(regular)
	if err != nil || string(data) != "original" {
		t.Fatal("original file changed")
	}
	link := filepath.Join(dir, "symlink")
	if err := os.Symlink(regular, link); err != nil {
		t.Fatal(err)
	}
	fifo := filepath.Join(dir, "fifo")
	if err := syscall.Mkfifo(fifo, 0600); err != nil {
		t.Fatal(err)
	}
	oversized := filepath.Join(dir, "oversized")
	if err := os.WriteFile(oversized, make([]byte, ceremony.MaxDocumentBytes+1), 0600); err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{dir, link, fifo, oversized} {
		if _, err := readFile(path); err == nil {
			t.Fatalf("special input accepted: %s", path)
		}
	}
	if err := writeFile(link, []byte("replacement")); err == nil {
		t.Fatal("symlink output accepted")
	}
	// Worktree-style .git file must also prevent generating test identities here.
	if err := os.WriteFile(filepath.Join(dir, ".git"), []byte("gitdir: /unused"), 0600); err != nil {
		t.Fatal(err)
	}
	if _, err := Initialize(filepath.Join(dir, "inside-repo")); err == nil {
		t.Fatal("test identities created under Git")
	}
}
