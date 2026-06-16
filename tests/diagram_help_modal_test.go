package tests

import (
	"testing"
)

func TestHelpModal_QuestionMarkOpens(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")
	waitForSlideLoaded(t, page)

	// Enable keyboard
	hoverViewer(t, page)

	page.Keyboard().Press("?")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const modal = viewer.shadowRoot.querySelector('diagram-help-modal');
		return modal.isOpen;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if result != true {
		t.Fatal("pressing ? did not open help modal")
	}
}

func TestHelpModal_EscapeCloses(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")
	waitForSlideLoaded(t, page)

	// Open modal first
	_, _ = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		viewer.shadowRoot.querySelector('diagram-help-modal').open();
	}`)
	hoverViewer(t, page)

	page.Keyboard().Press("Escape")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		return viewer.shadowRoot.querySelector('diagram-help-modal').isOpen;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if result != false {
		t.Fatal("Escape did not close help modal")
	}
}

func TestHelpModal_CloseButtonCloses(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const modal = viewer.shadowRoot.querySelector('diagram-help-modal');
		modal.open();
		modal.shadowRoot.querySelector('.help-modal-close').click();
		return modal.isOpen;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if result != false {
		t.Fatal("close button did not close help modal")
	}
}

func TestHelpModal_ListsAllShortcuts(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const modal = viewer.shadowRoot.querySelector('diagram-help-modal');
		modal.open();
		const rows = modal.shadowRoot.querySelectorAll('.help-modal-row');
		const shortcuts = [];
		rows.forEach(row => {
			const keys = row.querySelector('.help-modal-keys').textContent.trim();
			const desc = row.querySelector('.help-modal-desc').textContent.trim();
			shortcuts.push({keys, desc});
		});
		return {count: shortcuts.length, shortcuts};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	var count float64
	switch v := m["count"].(type) {
	case float64:
		count = v
	case int:
		count = float64(v)
	default:
		t.Fatalf("unexpected count type: %T", m["count"])
	}
	// The modal should document at least: arrows, space, home/end, +/-, 0, ctrl+scroll, f, ?, esc
	if count < 8 {
		t.Fatalf("expected at least 8 documented shortcuts, got %d", int(count))
	}
}
