package main

import (
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"testing"
)

// TestRender_PassthroughArgs verifies that passthrough flags are forwarded
// to the d2 binary in the correct position (before positional args).
func TestRender_PassthroughArgs(t *testing.T) {
	if _, err := exec.LookPath("d2"); err != nil {
		t.Skip("d2 not on PATH; skipping render passthrough test")
	}

	// Create a fake d2 script that logs its arguments to a file.
	tmpDir := t.TempDir()
	logFile := filepath.Join(tmpDir, "args.log")

	var fakeD2 string
	if runtime.GOOS == "windows" {
		fakeD2 = filepath.Join(tmpDir, "d2.bat")
		script := "@echo off\r\necho %* > " + logFile + "\r\n"
		if err := os.WriteFile(fakeD2, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
	} else {
		fakeD2 = filepath.Join(tmpDir, "d2")
		script := "#!/bin/sh\necho \"$@\" > " + logFile + "\n"
		if err := os.WriteFile(fakeD2, []byte(script), 0o755); err != nil {
			t.Fatal(err)
		}
	}

	// Create a minimal source dir with an index.d2
	srcDir := filepath.Join(tmpDir, "src")
	outDir := filepath.Join(tmpDir, "out")
	os.MkdirAll(srcDir, 0o755)
	os.MkdirAll(outDir, 0o755)
	os.WriteFile(filepath.Join(srcDir, "index.d2"), []byte("a -> b\n"), 0o644)

	// Build the manifest binary
	binPath := filepath.Join(tmpDir, "manifest")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, out)
	}

	// Run with fake d2 first on PATH
	cmd := exec.Command(binPath, "--in", srcDir, "--out", outDir, "--", "--theme", "200")
	cmd.Env = append(os.Environ(), "PATH="+tmpDir+string(os.PathListSeparator)+os.Getenv("PATH"))
	out, err := cmd.CombinedOutput()
	// The fake d2 exits 0 but produces no real SVG output; the manifest
	// build step will still succeed since Build doesn't need d2 binary.
	// We just want to verify args were passed correctly.
	_ = err
	_ = out

	logged, err := os.ReadFile(logFile)
	if err != nil {
		t.Fatalf("failed to read args log: %v", err)
	}

	args := strings.TrimSpace(string(logged))
	// Expect: --theme 200 <abs srcDir>/index.d2 <abs outDir>
	if !strings.Contains(args, "--theme 200") {
		t.Errorf("passthrough args not found in d2 invocation: %s", args)
	}

	// Verify passthrough comes before positional args
	themeIdx := strings.Index(args, "--theme")
	indexIdx := strings.Index(args, "index.d2")
	if themeIdx > indexIdx {
		t.Errorf("passthrough args should come before positional args: %s", args)
	}
}

// TestRender_D2NotFound verifies a clear error when d2 is not on PATH.
func TestRender_D2NotFound(t *testing.T) {
	f := d2Format{}
	tmpDir := t.TempDir()
	srcDir := filepath.Join(tmpDir, "src")
	os.MkdirAll(srcDir, 0o755)
	os.WriteFile(filepath.Join(srcDir, "index.d2"), []byte("a -> b\n"), 0o644)

	// Override PATH to empty so d2 won't be found
	origPath := os.Getenv("PATH")
	os.Setenv("PATH", t.TempDir()) // empty dir, no d2
	defer os.Setenv("PATH", origPath)

	err := f.Render(srcDir, tmpDir, nil)
	if err == nil {
		t.Fatal("expected error when d2 not found")
	}
	if !strings.Contains(err.Error(), "d2 binary not found") {
		t.Errorf("expected 'd2 binary not found' error, got: %v", err)
	}
	if !strings.Contains(err.Error(), "https://d2lang.com/tour/install") {
		t.Errorf("expected install URL in error, got: %v", err)
	}
}

// TestRender_KubernetesE2E runs the full render pipeline against the kubernetes
// example and verifies the output directory structure matches the committed copy.
func TestRender_KubernetesE2E(t *testing.T) {
	if _, err := exec.LookPath("d2"); err != nil {
		t.Skip("d2 not on PATH; skipping end-to-end render test")
	}

	// Build manifest binary
	tmpDir := t.TempDir()
	binPath := filepath.Join(tmpDir, "manifest")
	build := exec.Command("go", "build", "-o", binPath, ".")
	build.Dir = "."
	if out, err := build.CombinedOutput(); err != nil {
		t.Fatalf("build failed: %v\n%s", err, out)
	}

	examplesDir := filepath.Join("..", "..", "examples")
	srcDir := filepath.Join(examplesDir, "kubernetes.d2")
	outDir := filepath.Join(tmpDir, "kubernetes")
	os.MkdirAll(outDir, 0o755)

	// Run render with the same flags as committed example
	cmd := exec.Command(binPath, "--in", srcDir, "--out", outDir, "--", "--theme", "200", "--layout", "elk", "--sketch")
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	if err := cmd.Run(); err != nil {
		t.Fatalf("manifest render failed: %v", err)
	}

	// Compare directory structure against committed examples/kubernetes/
	committedDir := filepath.Join(examplesDir, "kubernetes")
	var committed []string
	filepath.Walk(committedDir, func(path string, info os.FileInfo, err error) error {
		if err != nil || info.IsDir() {
			return err
		}
		rel, _ := filepath.Rel(committedDir, path)
		// Skip manifest.json and non-SVG files (like .DS_Store, .png)
		if rel == "manifest.json" {
			return nil
		}
		if !strings.HasSuffix(rel, ".svg") {
			return nil
		}
		// Skip overlay SVGs — they're only produced when .overlay.d2 source files exist
		if strings.Contains(rel, ".overlay.svg") {
			return nil
		}
		committed = append(committed, rel)
		return nil
	})

	for _, rel := range committed {
		rendered := filepath.Join(outDir, rel)
		if _, err := os.Stat(rendered); os.IsNotExist(err) {
			t.Errorf("expected rendered file missing: %s", rel)
		}
	}
}
