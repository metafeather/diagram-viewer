package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

func TestUnsupportedFormat(t *testing.T) {
	// Build the manifest tool
	binPath := filepath.Join(t.TempDir(), "manifest")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("failed to build manifest: %v\n%s", err, out)
	}

	cmd := exec.Command(binPath, "--in", ".", "--format", "mermaid")
	out, err := cmd.CombinedOutput()

	// Expect exit code 2
	exitErr, ok := err.(*exec.ExitError)
	if !ok {
		t.Fatalf("expected ExitError, got %v", err)
	}
	if exitErr.ExitCode() != 2 {
		t.Errorf("expected exit code 2, got %d", exitErr.ExitCode())
	}

	// Expect error message
	if got := string(out); !strings.Contains(got, `unsupported format "mermaid"`) {
		t.Errorf("expected unsupported format error, got: %s", got)
	}
}

func TestManifestKubernetes_Golden(t *testing.T) {
	// Build the manifest tool
	binPath := filepath.Join(t.TempDir(), "manifest")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("failed to build manifest: %v\n%s", err, out)
	}

	// Run against examples/kubernetes.d2/
	examplesDir := filepath.Join("..", "..", "examples", "kubernetes.d2")
	cmd := exec.Command(binPath, "--in", examplesDir, "--format", "d2", "--", "--theme", "200", "--layout", "elk", "--sketch")
	out, err := cmd.Output() // stdout only; stderr warning is expected
	_ = err

	goldenPath := filepath.Join("testdata", "kubernetes.d2.golden")
	golden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("golden file not found at %s: create it once manifest is implemented", goldenPath)
	}

	if got := strings.TrimSpace(string(out)); got != strings.TrimSpace(string(golden)) {
		t.Errorf("output does not match golden file.\n--- got ---\n%s\n--- want ---\n%s", got, string(golden))
	}
}
