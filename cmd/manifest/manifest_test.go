package main

import (
	"fmt"
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

	goldenPath := filepath.Join("testdata", "kubernetes.golden.json")
	golden, err := os.ReadFile(goldenPath)
	if err != nil {
		t.Fatalf("golden file not found at %s: regenerate with `task manifest:regen-golden`", goldenPath)
	}

	got := strings.TrimSpace(string(out))
	want := strings.TrimSpace(string(golden))
	if got != want {
		t.Errorf("output does not match golden file %s\n%s", goldenPath, unifiedDiff(want, got))
	}
}

// unifiedDiff produces a simple unified-style diff between two strings.
func unifiedDiff(want, got string) string {
	wantLines := strings.Split(want, "\n")
	gotLines := strings.Split(got, "\n")

	var b strings.Builder
	b.WriteString("--- want (golden)\n+++ got (actual)\n")

	max := len(wantLines)
	if len(gotLines) > max {
		max = len(gotLines)
	}
	for i := 0; i < max; i++ {
		var w, g string
		if i < len(wantLines) {
			w = wantLines[i]
		}
		if i < len(gotLines) {
			g = gotLines[i]
		}
		if w != g {
			if i < len(wantLines) {
				fmt.Fprintf(&b, "-%s\n", w)
			}
			if i < len(gotLines) {
				fmt.Fprintf(&b, "+%s\n", g)
			}
		}
	}
	return b.String()
}
