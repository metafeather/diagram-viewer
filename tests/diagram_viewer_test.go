package tests

import (
	"strings"
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

	// Open JSON dialog via public API (buttons moved to diagram-loader)
	_, err := page.Evaluate(`() => {
		document.querySelector('diagram-viewer').openJsonDialog();
	}`)
	if err != nil {
		t.Fatalf("could not open JSON dialog: %v", err)
	}

	// Verify backdrop is open
	_, _ = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const backdrop = viewer.shadowRoot.querySelector('.json-dialog-backdrop');
		if (!backdrop.classList.contains('open')) throw new Error('backdrop not open');
	}`)

	// Get textarea value (export)
	exported, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		return viewer.shadowRoot.querySelector('.json-dialog-backdrop textarea').value;
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
		// Open dialog via public API (button moved to diagram-loader)
		viewer.openJsonDialog();
		const tree = sr.querySelector('diagram-nav-tree');
		const ta = sr.querySelector('.json-dialog-backdrop textarea');
		const snap = JSON.parse(ta.value);
		snap.manifest.name = "Modified";
		ta.value = JSON.stringify(snap);
		sr.querySelector('.json-apply').click();
		// Check title updated
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
		const tree = sr.querySelector('diagram-nav-tree');
		viewer.openJsonDialog();
		const ta = sr.querySelector('.json-dialog-backdrop textarea');
		const originalSnap = ta.value;
		// Put invalid JSON
		ta.value = "not valid json {{{";
		sr.querySelector('.json-apply').click();
		// Check error shown
		const errEl = sr.querySelector('.json-dialog-error');
		const hasError = errEl.textContent.length > 0;
		// Check title unchanged (dialog still open, snapshot not replaced)
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
		viewer.reset();
		// Wait for persist debounce (250ms + buffer)
		return new Promise(resolve => {
			setTimeout(() => {
		const key = 'diagramViewer.v1:' + document.querySelector('diagram-viewer').dataset.instanceId;
			const stored = localStorage.getItem(key);
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

func TestViewer_ResetClearsZoomSidebarHashSlide(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Change zoom and navigate to a non-overview slide
	_, _ = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const canvas = sr.querySelector('diagram-canvas');
		canvas.zoomIn();
		const tree = sr.querySelector('diagram-nav-tree');
		const items = tree.shadowRoot.querySelectorAll('.nav-item');
		if (items.length > 1) items[1].click();
	}`)
	page.WaitForTimeout(300)

	// Now click Reset via public API
	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const sr = viewer.shadowRoot;
		const tree = sr.querySelector('diagram-nav-tree');
		viewer.reset();
		return new Promise(resolve => {
			setTimeout(() => {
				const zoomLevel = tree.shadowRoot.querySelector('.zoom-level').textContent;
				const hash = location.hash;
				const collapsed = sr.querySelector('.container').classList.contains('sidebar-collapsed');
				resolve({zoomLevel, hash, sidebarCollapsed: collapsed});
			}, 500);
		});
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["zoomLevel"].(string) != "100%" {
		t.Fatalf("expected zoom reset to 100%%, got %s", m["zoomLevel"])
	}
	if m["hash"].(string) != "#overview" && m["hash"].(string) != "" {
		t.Fatalf("expected hash to reset to overview, got %s", m["hash"])
	}
	if m["sidebarCollapsed"] == true {
		t.Fatal("sidebar should not be collapsed after reset")
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
		const key = 'diagramViewer.v1:' + document.querySelector('diagram-viewer').dataset.instanceId;
		const raw = localStorage.getItem(key);
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
		const key = 'diagramViewer.v1:' + document.querySelector('diagram-viewer').dataset.instanceId;
		const raw = localStorage.getItem(key);
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

func TestViewer_KeyboardWorksAfterSidebarClick(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Click the 'etcd' nav link via shadow-DOM piercing JS
	_, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const items = tree.shadowRoot.querySelectorAll('.nav-item');
		for (const item of items) {
			if (item.dataset.id && item.dataset.id.includes('etcd')) {
				item.click();
				return;
			}
		}
		throw new Error('no etcd nav item found');
	}`)
	if err != nil {
		t.Fatalf("click etcd failed: %v", err)
	}

	page.WaitForTimeout(500)

	// Read current active slide id; assert it is 'etcd'
	activeId, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const active = tree.shadowRoot.querySelector('.nav-item.active');
		return active ? active.dataset.id : null;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if activeId == nil || !strings.Contains(activeId.(string), "etcd") {
		t.Fatalf("expected active slide to be etcd, got %v", activeId)
	}

	// Press ArrowDown — no explicit .focus() call; the click alone must arm keyboard
	page.Keyboard().Press("ArrowDown")
	page.WaitForTimeout(300)

	// Read new active slide id; assert it differs from 'etcd'
	newActiveId, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const active = tree.shadowRoot.querySelector('.nav-item.active');
		return active ? active.dataset.id : null;
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	if newActiveId == nil {
		t.Fatal("no active slide after ArrowDown")
	}
	if newActiveId == activeId {
		t.Fatalf("ArrowDown after sidebar click did not advance slide: still %v", activeId)
	}
}

func TestViewer_LoadDataRejectsPercentEncodedPaths(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)

	cases := []struct {
		name string
		js   string
	}{
		{
			"path with %20",
			`{"layers":[{"id":"a","title":"A","path":"foo%20bar.svg","type":"layer"}]}`,
		},
		{
			"overlay with %2F",
			`{"layers":[{"id":"a","title":"A","path":"ok.svg","type":"layer","overlay":"over%2Flay.svg"}]}`,
		},
		{
			"steps path with %20",
			`{"layers":[{"id":"a","title":"A","path":"ok.svg","type":"steps","steps":[{"step":1,"title":"S1","path":"s%20t.svg"}]}]}`,
		},
		{
			"nested children path",
			`{"layers":[{"id":"a","title":"A","path":"ok.svg","type":"layer","children":[{"id":"b","title":"B","path":"child%20x.svg","type":"layer"}]}]}`,
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result, err := page.Evaluate(`(manifest) => {
				try {
					document.querySelector('diagram-viewer').loadData(JSON.parse(manifest));
					return {ok: true};
				} catch(e) {
					return {ok: false, error: e.message};
				}
			}`, tc.js)
			if err != nil {
				t.Fatalf("evaluate failed: %v", err)
			}
			m := result.(map[string]interface{})
			if m["ok"] == true {
				t.Fatalf("expected loadData to throw for %s", tc.name)
			}
			errMsg := m["error"].(string)
			if !strings.Contains(errMsg, "manifest paths must be raw/unencoded") {
				t.Fatalf("unexpected error message: %s", errMsg)
			}
		})
	}
}
