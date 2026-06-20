package main

import (
	"encoding/json"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
)

// buildBinary builds the manifest binary for testing and returns its path.
func buildBinary(t *testing.T) string {
	t.Helper()
	binPath := filepath.Join(t.TempDir(), "manifest")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("failed to build manifest: %v\n%s", err, out)
	}
	return binPath
}

func TestStdoutMode_ProducesValidJSON(t *testing.T) {
	bin := buildBinary(t)
	examplesDir := filepath.Join("..", "..", "examples", "kubernetes.d2")

	cmd := exec.Command(bin, "--in", examplesDir)
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	var manifest Manifest
	if err := json.Unmarshal(out, &manifest); err != nil {
		t.Fatalf("output is not valid JSON: %v\noutput: %s", err, out)
	}
	if len(manifest.Layers) == 0 {
		t.Fatal("expected at least one layer in manifest")
	}
}

func TestStdoutMode_WarnsOnPassthrough(t *testing.T) {
	bin := buildBinary(t)
	examplesDir := filepath.Join("..", "..", "examples", "kubernetes.d2")

	cmd := exec.Command(bin, "--in", examplesDir, "--", "--theme", "200")
	var stderr strings.Builder
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Should still produce valid JSON on stdout
	var manifest Manifest
	if err := json.Unmarshal(out, &manifest); err != nil {
		t.Fatalf("output is not valid JSON: %v", err)
	}

	// Should warn on stderr
	if !strings.Contains(stderr.String(), "warning") {
		t.Errorf("expected warning on stderr, got: %q", stderr.String())
	}
	if !strings.Contains(stderr.String(), "passthrough") {
		t.Errorf("expected 'passthrough' in stderr warning, got: %q", stderr.String())
	}
}

func TestFileMode_WritesManifestJSON(t *testing.T) {
	bin := buildBinary(t)
	examplesDir := filepath.Join("..", "..", "examples", "kubernetes.d2")
	outDir := filepath.Join(t.TempDir(), "output")

	cmd := exec.Command(bin, "--in", examplesDir, "--out", outDir)
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("unexpected error: %v\n%s", err, out)
	}

	// manifest.json should exist and be valid
	data, err := os.ReadFile(filepath.Join(outDir, "manifest.json"))
	if err != nil {
		t.Fatalf("manifest.json not found: %v", err)
	}
	var manifest Manifest
	if err := json.Unmarshal(data, &manifest); err != nil {
		t.Fatalf("manifest.json is not valid JSON: %v", err)
	}
	if len(manifest.Layers) == 0 {
		t.Fatal("expected at least one layer in manifest")
	}
}

func TestFileMode_RendersSVG(t *testing.T) {
	// Integration test: skip if d2 is not available
	if _, err := exec.LookPath("d2"); err != nil {
		t.Skip("d2 not on PATH, skipping integration test")
	}

	bin := buildBinary(t)
	examplesDir := filepath.Join("..", "..", "examples", "kubernetes.d2")
	outDir := filepath.Join(t.TempDir(), "output")

	cmd := exec.Command(bin, "--in", examplesDir, "--out", outDir, "--", "--theme", "200")
	if out, err := cmd.CombinedOutput(); err != nil {
		t.Fatalf("unexpected error: %v\n%s", err, out)
	}

	// At least one SVG should exist
	matches, err := filepath.Glob(filepath.Join(outDir, "**", "*.svg"))
	if err != nil {
		t.Fatal(err)
	}
	// Also check top-level
	topMatches, _ := filepath.Glob(filepath.Join(outDir, "*.svg"))
	matches = append(matches, topMatches...)

	if len(matches) == 0 {
		// Walk to find any SVG
		found := false
		filepath.Walk(outDir, func(path string, info os.FileInfo, err error) error {
			if err != nil {
				return nil
			}
			if strings.HasSuffix(path, ".svg") {
				found = true
			}
			return nil
		})
		if !found {
			t.Fatal("expected at least one SVG file in output directory")
		}
	}
}
