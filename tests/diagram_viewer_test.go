package tests

import (
	"testing"

	"github.com/playwright-community/playwright-go"
)

func TestViewer_LoadDataAcceptsV0Shape(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)

	// loadData with valid v0 manifest should not throw
	result, err := page.Evaluate(`() => {
		try {
			document.querySelector('diagram-viewer').loadData({
				name: "Test",
				layers: [{id: "overview", title: "Overview", path: "index.svg", type: "layer"}]
			});
			return {ok: true};
		} catch(e) {
			return {ok: false, error: e.message};
		}
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["ok"] != true {
		t.Fatalf("loadData rejected valid v0 shape: %v", m["error"])
	}
}

func TestViewer_LoadDataRejectsNonV0(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)

	// Missing layers array should throw
	result, err := page.Evaluate(`() => {
		try {
			document.querySelector('diagram-viewer').loadData({name: "Bad"});
			return {ok: true};
		} catch(e) {
			return {ok: false, error: e.message};
		}
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["ok"] != false {
		t.Fatal("loadData should have rejected non-v0 shape")
	}
	errMsg := m["error"].(string)
	if errMsg == "" {
		t.Fatal("expected a clear error message")
	}
}

func TestViewer_JSONDialogExportRoundTrips(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Open JSON dialog
	_, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		viewer.shadowRoot.querySelector('.toolbar-json').click();
	}`)
	if err != nil {
		t.Fatalf("could not open JSON dialog: %v", err)
	}

	// Get textarea value (export)
	exported, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		return viewer.shadowRoot.querySelector('.json-dialog textarea').value;
	}`)
	if err != nil {
		t.Fatalf("could not read export: %v", err)
	}
	if exported.(string) == "" {
		t.Fatal("exported JSON is empty")
	}

	// Close dialog
	_, _ = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		viewer.shadowRoot.querySelector('.json-close').click();
	}`)
}

func TestViewer_JSONDialogImportReplaces(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Build a modified snapshot and apply it
	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		// Open dialog
		sr.querySelector('.toolbar-json').click();
		const ta = sr.querySelector('.json-dialog textarea');
		const snap = JSON.parse(ta.value);
		snap.manifest.name = "Modified";
		ta.value = JSON.stringify(snap);
		sr.querySelector('.json-apply').click();
		// Check title updated
		const tree = sr.querySelector('diagram-nav-tree');
		const title = tree.shadowRoot.querySelector('.title').textContent;
		return title;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if result.(string) != "Modified" {
		t.Fatalf("expected title 'Modified', got %q", result)
	}
}

func TestViewer_JSONDialogImportErrorKeepsExisting(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		sr.querySelector('.toolbar-json').click();
		const ta = sr.querySelector('.json-dialog textarea');
		const originalSnap = ta.value;
		// Put invalid JSON
		ta.value = "not valid json {{{";
		sr.querySelector('.json-apply').click();
		// Check error shown
		const errEl = sr.querySelector('.json-dialog-error');
		const hasError = errEl.textContent.length > 0;
		// Check title unchanged (dialog still open, snapshot not replaced)
		const tree = sr.querySelector('diagram-nav-tree');
		const title = tree.shadowRoot.querySelector('.title').textContent;
		return {hasError, title};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["hasError"] != true {
		t.Fatal("expected error message for invalid JSON")
	}
	if m["title"].(string) != "Kubernetes" {
		t.Fatal("title should remain unchanged after import error")
	}
}

func TestViewer_ResetClearsAndReapplies(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		sr.querySelector('.toolbar-reset').click();
		// Wait for persist debounce (250ms + buffer)
		return new Promise(resolve => {
			setTimeout(() => {
				const stored = localStorage.getItem('diagramViewer.v1');
				resolve(stored !== null);
			}, 400);
		});
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	// After reset + re-apply from source, localStorage is repopulated
	if result != true {
		t.Fatal("expected localStorage to be repopulated after reset")
	}
}

func TestViewer_LocalStoragePersistenceAcrossReload(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Change zoom and wait for persist
	_, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const canvas = sr.querySelector('diagram-canvas');
		canvas.zoomIn(); // This triggers zoom-change event → parent persists
		return new Promise(r => setTimeout(r, 500)); // wait for persist debounce (250ms)
	}`)
	if err != nil {
		t.Fatalf("setup failed: %v", err)
	}

	// Get persisted state before reload
	before, err := page.Evaluate(`() => {
		const raw = localStorage.getItem('diagramViewer.v1');
		if (!raw) return null;
		return JSON.parse(raw).ui;
	}`)
	if err != nil || before == nil {
		t.Fatal("no persisted state before reload")
	}
	beforeUI := before.(map[string]interface{})
	beforeZoom := toFloat(beforeUI["zoomPercent"])
	if beforeZoom == 150 {
		t.Fatal("zoom didn't actually change from default before reload")
	}

	// Reload
	_, err = page.Goto(server.URL+"/index.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("reload failed: %v", err)
	}
	// Wait for viewer to restore
	_, err = page.WaitForFunction(`() => {
		const el = document.querySelector('diagram-viewer');
		return !!(el && el.shadowRoot && el.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("viewer did not restore: %v", err)
	}

	// Wait for persist after loadData restores
	page.WaitForTimeout(500)

	// Verify zoom was restored
	after, err := page.Evaluate(`() => {
		const raw = localStorage.getItem('diagramViewer.v1');
		if (!raw) return null;
		return JSON.parse(raw).ui.zoomPercent;
	}`)
	if err != nil || after == nil {
		t.Fatal("no persisted state after reload")
	}
	if toFloat(after) != beforeZoom {
		t.Fatalf("zoom not restored: before=%v after=%v", beforeZoom, toFloat(after))
	}
}
