package tests

import (
	"strings"
	"testing"

	"github.com/playwright-community/playwright-go"
)

func TestSpacedPaths_SVGRequestContainsPercent20(t *testing.T) {
	page := newPage(t)

	// Navigate to the spaced fixture
	_, err := page.Goto(server.URL+"/tests/fixtures/spaced/index.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}

	// Wait for diagram-viewer to attach and load manifest
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
		const items = tree.shadowRoot.querySelectorAll('.nav-item');
		return items.length >= 1;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("nav-tree items did not render: %v", err)
	}

	// Set up a network request listener for the SVG fetch
	svgRequestCh := make(chan string, 1)
	page.On("request", func(req playwright.Request) {
		url := req.URL()
		if strings.Contains(url, "diagram.svg") {
			svgRequestCh <- url
		}
	})

	// Click the sidebar entry for the spaced-path slide
	_, err = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const item = tree.shadowRoot.querySelector('.nav-item[data-id="control-plane"]');
		if (!item) throw new Error('nav-item for control-plane not found');
		item.click();
	}`)
	if err != nil {
		t.Fatalf("could not click nav item: %v", err)
	}

	// Wait for the iframe to load the SVG
	waitForSlideLoaded(t, page)

	// Get the iframe src as the request URL (in case event didn't fire before click)
	iframeSrc, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const canvas = viewer.shadowRoot.querySelector('diagram-canvas');
		const iframe = canvas.shadowRoot.querySelector('iframe');
		return iframe.src;
	}`)
	if err != nil {
		t.Fatalf("could not get iframe src: %v", err)
	}

	svgURL := iframeSrc.(string)

	// Assert: URL contains exactly one %20 and zero %2520
	count20 := strings.Count(svgURL, "%20")
	count2520 := strings.Count(svgURL, "%2520")

	if count20 < 1 {
		t.Fatalf("expected at least one %%20 in SVG URL, got: %s", svgURL)
	}
	if count2520 != 0 {
		t.Fatalf("expected zero %%2520 (double-encoding) in SVG URL, got: %s", svgURL)
	}

	// Assert: the space in "Control Plane" is encoded as %20
	if !strings.Contains(svgURL, "Control%20Plane") {
		t.Fatalf("expected 'Control%%20Plane' in URL, got: %s", svgURL)
	}
}

func TestSpacedPaths_BookmarkableHashRoundTrip(t *testing.T) {
	page := newPage(t)

	_, err := page.Goto(server.URL+"/tests/fixtures/spaced/index.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}

	// Wait for viewer
	_, err = page.WaitForFunction(`() => {
		const el = document.querySelector('diagram-viewer');
		return !!(el && el.shadowRoot && el.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(15000)})
	if err != nil {
		t.Fatalf("diagram-viewer did not attach: %v", err)
	}

	// Wait for nav-tree
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		if (!tree || !tree.shadowRoot) return false;
		return tree.shadowRoot.querySelectorAll('.nav-item').length >= 1;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("nav-tree items did not render: %v", err)
	}

	// Click the nav item and check the hash
	result, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const item = tree.shadowRoot.querySelector('.nav-item[data-id="control-plane"]');
		if (!item) throw new Error('nav-item for control-plane not found');
		item.click();
		return { hash: location.hash, targetId: item.dataset.id };
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}

	m := result.(map[string]interface{})
	expectedHash := "#" + m["targetId"].(string)
	actualHash := m["hash"].(string)

	if actualHash != expectedHash {
		t.Fatalf("expected hash %s, got %s", expectedHash, actualHash)
	}
}
