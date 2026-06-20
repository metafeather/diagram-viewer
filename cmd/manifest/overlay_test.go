package main

import (
	"path/filepath"
	"testing"
)

func TestAttachOverlays(t *testing.T) {
	fixtureDir, err := filepath.Abs("testdata/overlay")
	if err != nil {
		t.Fatal(err)
	}

	f := d2Format{}
	root, err := f.Build(fixtureDir)
	if err != nil {
		t.Fatalf("Build failed: %v", err)
	}

	// The fixture has one layer "board" with a sibling board.overlay.d2.
	if len(root.Children) == 0 {
		t.Fatal("expected at least one child node")
	}

	var board *Node
	for i := range root.Children {
		if root.Children[i].ID == "board" {
			board = &root.Children[i]
			break
		}
	}
	if board == nil {
		t.Fatal("expected child node 'board'")
	}

	want := "board.overlay.svg"
	if board.Overlay != want {
		t.Errorf("Overlay = %q, want %q", board.Overlay, want)
	}

	// Root should NOT have an overlay (no index.overlay.d2).
	if root.Overlay != "" {
		t.Errorf("root Overlay = %q, want empty", root.Overlay)
	}
}
