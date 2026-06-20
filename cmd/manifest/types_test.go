package main

import (
	"encoding/json"
	"os"
	"testing"

	"github.com/google/go-cmp/cmp"
)

func TestManifestRoundTrip(t *testing.T) {
	raw, err := os.ReadFile("../../examples/kubernetes/manifest.json")
	if err != nil {
		t.Fatal(err)
	}

	var m Manifest
	if err := json.Unmarshal(raw, &m); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}

	// Verify key structural properties
	if len(m.Layers) == 0 {
		t.Fatal("expected at least one layer")
	}
	if m.Layers[0].ID != "overview" {
		t.Errorf("first layer id = %q, want %q", m.Layers[0].ID, "overview")
	}

	// Re-marshal and compare against original JSON (parsed to interface{} for order-independent comparison)
	out, err := json.Marshal(m)
	if err != nil {
		t.Fatalf("marshal: %v", err)
	}

	var original, roundtripped interface{}
	if err := json.Unmarshal(raw, &original); err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(out, &roundtripped); err != nil {
		t.Fatal(err)
	}

	if diff := cmp.Diff(original, roundtripped); diff != "" {
		t.Errorf("round-trip mismatch (-original +roundtripped):\n%s", diff)
	}
}
