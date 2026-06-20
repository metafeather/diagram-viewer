package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

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
	out, err := cmd.CombinedOutput()
	// We expect failure (exit 1) since it's not implemented yet,
	// but once implemented we compare against the golden file.
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
