package mpcrehearsal

import (
	"errors"
	"io"
	"os"
	"path/filepath"
	"syscall"

	"vendetta-opening-pairing-experiment/ceremony"
)

const MaxNativeBytes = 32 * 1024

func readFile(path string) ([]byte, error) {
	f, err := os.OpenFile(path, os.O_RDONLY|syscall.O_NONBLOCK|syscall.O_NOFOLLOW, 0)
	if err != nil {
		return nil, err
	}
	defer f.Close()
	info, err := f.Stat()
	if err != nil {
		return nil, err
	}
	if !info.Mode().IsRegular() {
		return nil, errors.New("rehearsal input must be a regular file")
	}
	return ceremony.BoundRead(f)
}
func writeFile(path string, data []byte) error {
	if len(data) > ceremony.MaxDocumentBytes {
		return errors.New("rehearsal output exceeds document limit")
	}
	// Publication is exclusive. On write/sync failure, leave a partial file for
	// diagnosis; it will never authenticate under the intended digest.
	f, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL|syscall.O_NOFOLLOW, 0600)
	if err != nil {
		return err
	}
	if n, err := f.Write(data); err != nil || n != len(data) {
		f.Close()
		if err != nil {
			return err
		}
		return io.ErrShortWrite
	}
	if err := f.Sync(); err != nil {
		f.Close()
		return err
	}
	if err := f.Close(); err != nil {
		return err
	}
	parent, err := os.Open(filepath.Dir(path))
	if err != nil {
		return err
	}
	defer parent.Close()
	return parent.Sync()
}
func externalDirectory(path string) error {
	if !filepath.IsAbs(path) {
		return errors.New("rehearsal output must be an absolute path outside Git")
	}
	// Refuse repository ancestors (including worktree .git files), and resolve
	// parent symlinks before checking. New files never replace an existing run.
	resolved, err := filepath.EvalSymlinks(filepath.Dir(path))
	if err != nil {
		return err
	}
	for p := resolved; ; p = filepath.Dir(p) {
		if _, err := os.Lstat(filepath.Join(p, ".git")); err == nil {
			return errors.New("rehearsal identities must stay outside Git repositories")
		} else if !os.IsNotExist(err) {
			return err
		}
		if filepath.Dir(p) == p {
			break
		}
	}
	return nil
}
