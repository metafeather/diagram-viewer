package tests

import (
	"os"
	"strings"
	"testing"

	"github.com/playwright-community/playwright-go"
)

const manifestRefreshDir = "../tests/fixtures/manifest_refresh/"

func TestManifestRefresh_StaleManifestBug(t *testing.T) {
	// Read v1 and v2 manifests
	v1, err := os.ReadFile(manifestRefreshDir + "manifest.v1.json")
	if err != nil {
		t.Fatalf("could not read manifest.v1.json: %v", err)
	}
	v2, err := os.ReadFile(manifestRefreshDir + "manifest.v2.json")
	if err != nil {
		t.Fatalf("could not read manifest.v2.json: %v", err)
	}

	// Serve v1 as manifest.json
	manifestPath := manifestRefreshDir + "manifest.json"
	if err := os.WriteFile(manifestPath, v1, 0644); err != nil {
		t.Fatalf("could not write manifest.json: %v", err)
	}
	t.Cleanup(func() { os.Remove(manifestPath) })

	page := newPage(t)

	// Navigate to fixture
	_, err = page.Goto(server.URL+"/tests/fixtures/manifest_refresh/index.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}

	// Wait for viewer to attach and load
	_, err = page.WaitForFunction(`() => {
		const el = document.querySelector('diagram-viewer');
		return !!(el && el.shadowRoot && el.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(15000)})
	if err != nil {
		t.Fatalf("diagram-viewer did not attach: %v", err)
	}

	// Wait for nav-tree items to render
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		if (!tree || !tree.shadowRoot) return false;
		return tree.shadowRoot.querySelectorAll('.nav-item').length >= 1;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("nav-tree items did not render: %v", err)
	}

	// Navigate to slide 'a'
	_, err = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const item = tree.shadowRoot.querySelector('.nav-item[data-id="a"]');
		if (!item) throw new Error('nav-item for "a" not found');
		item.click();
	}`)
	if err != nil {
		t.Fatalf("could not click nav item 'a': %v", err)
	}

	// Wait for slide to load
	waitForSlideLoaded(t, page)

	// Wait for initial persist to confirm loadData completed
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const key = 'diagramViewer.v1:' + viewer.dataset.instanceId;
		return !!localStorage.getItem(key);
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("initial persist did not happen: %v", err)
	}

	// Set zoom to 200% by dispatching zoom-change on the canvas
	_, err = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		canvas.dispatchEvent(
			new CustomEvent('zoom-change', { detail: { zoomPercent: 200 }, bubbles: false })
		);
	}`)
	if err != nil {
		t.Fatalf("could not set zoom: %v", err)
	}

	// Wait for localStorage write (persist is debounced 250ms)
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const key = 'diagramViewer.v1:' + viewer.dataset.instanceId;
		const raw = localStorage.getItem(key);
		if (!raw) return false;
		const snap = JSON.parse(raw);
		return snap.ui && snap.ui.zoomPercent === 200;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(5000)})
	if err != nil {
		t.Fatalf("localStorage did not persist zoom: %v", err)
	}

	// Swap manifest.json to v2 content
	if err := os.WriteFile(manifestPath, v2, 0644); err != nil {
		t.Fatalf("could not swap manifest.json to v2: %v", err)
	}

	// Reload the page
	_, err = page.Reload(playwright.PageReloadOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not reload: %v", err)
	}

	// Wait for viewer to re-attach with new manifest
	_, err = page.WaitForFunction(`() => {
		const el = document.querySelector('diagram-viewer');
		if (!el || !el.shadowRoot) return false;
		const tree = el.shadowRoot.querySelector('diagram-nav-tree');
		if (!tree || !tree.shadowRoot) return false;
		return tree.shadowRoot.querySelectorAll('.nav-item').length >= 1;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(15000)})
	if err != nil {
		t.Fatalf("viewer did not re-attach after reload: %v", err)
	}

	// Assertion 1: nav tree contains 'b' and not 'a'
	navResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const items = [...tree.shadowRoot.querySelectorAll('.nav-item')];
		const ids = items.map(el => el.dataset.id);
		return { ids };
	}`)
	if err != nil {
		t.Fatalf("could not query nav items: %v", err)
	}
	navMap := navResult.(map[string]interface{})
	ids := navMap["ids"].([]interface{})

	hasB := false
	hasA := false
	for _, id := range ids {
		if id.(string) == "b" {
			hasB = true
		}
		if id.(string) == "a" {
			hasA = true
		}
	}
	if !hasB {
		t.Errorf("expected nav tree to contain 'b', got ids: %v", ids)
	}
	if hasA {
		t.Errorf("expected nav tree NOT to contain 'a', got ids: %v", ids)
	}

	// Assertion 2: zoom level still 200%
	zoomResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const key = 'diagramViewer.v1:' + viewer.dataset.instanceId;
		const raw = localStorage.getItem(key);
		if (!raw) return { zoomPercent: 0 };
		const snap = JSON.parse(raw);
		return { zoomPercent: snap.ui ? snap.ui.zoomPercent : 0 };
	}`)
	if err != nil {
		t.Fatalf("could not read zoom from localStorage: %v", err)
	}
	zoomMap := zoomResult.(map[string]interface{})
	zoomPercent := toFloat(zoomMap["zoomPercent"])
	if zoomPercent != 200 {
		t.Errorf("expected zoom 200%%, got %.0f%%", zoomPercent)
	}

	// Assertion 3: displayed slide is 'b' (not stale 'a')
	waitForSlideLoaded(t, page)
	slideResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		return { src: iframe.src };
	}`)
	if err != nil {
		t.Fatalf("could not get iframe src: %v", err)
	}
	slideMap := slideResult.(map[string]interface{})
	src := slideMap["src"].(string)
	if !strings.Contains(src, "b.svg") {
		t.Errorf("expected displayed slide to be 'b.svg', got: %s", src)
	}
	if strings.Contains(src, "a.svg") {
		t.Errorf("expected displayed slide NOT to be 'a.svg', got: %s", src)
	}
}
