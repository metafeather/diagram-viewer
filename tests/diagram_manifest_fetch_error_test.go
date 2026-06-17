package tests

import (
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/playwright-community/playwright-go"
)

func TestManifestFetchError_ShowsErrorNotCachedFallback(t *testing.T) {
	// Create a server that serves manifest.json successfully on first request,
	// then returns 500 on subsequent requests.
	requestCount := 0
	mux := http.NewServeMux()

	// Serve a fixture HTML with manifest attribute set on the viewer element
	mux.HandleFunc("/fixture.html", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/html")
		fmt.Fprint(w, `<!DOCTYPE html>
<html><head>
<script type="module" src="/dist/diagram-viewer.js"></script>
</head><body>
<diagram-viewer manifest="/manifest.json"></diagram-viewer>
</body></html>`)
	})

	// Serve the manifest conditionally
	mux.HandleFunc("/manifest.json", func(w http.ResponseWriter, r *http.Request) {
		requestCount++
		if requestCount == 1 {
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{
				"name": "FetchErrorTest",
				"layers": [
					{"id": "slide1", "title": "Slide One", "path": "slide1.svg", "type": "layer"}
				]
			}`)
		} else {
			http.Error(w, "Internal Server Error", http.StatusInternalServerError)
		}
	})

	// Serve a minimal SVG for the slide
	mux.HandleFunc("/slide1.svg", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "image/svg+xml")
		fmt.Fprint(w, `<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>`)
	})

	// Serve the dist from the project root for all other paths
	fileServer := http.FileServer(http.Dir(".."))
	mux.Handle("/", fileServer)

	testServer := httptest.NewServer(mux)
	defer testServer.Close()

	page := newPage(t)

	// --- First load: manifest attribute triggers fetch which succeeds ---
	_, err := page.Goto(testServer.URL+"/fixture.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}

	// Wait for the viewer to load the manifest and persist to localStorage
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		if (!viewer || !viewer.shadowRoot) return false;
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		if (!tree || !tree.shadowRoot) return false;
		return tree.shadowRoot.querySelectorAll('.nav-item').length > 0;
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("manifest did not load on first visit: %v", err)
	}

	// Wait for persist debounce
	_, err = page.Evaluate(`() => new Promise(r => setTimeout(r, 500))`)
	if err != nil {
		t.Fatalf("timeout failed: %v", err)
	}

	// Verify localStorage was populated
	storageResult, err := page.Evaluate(`() => {
		for (let i = 0; i < localStorage.length; i++) {
			const key = localStorage.key(i);
			if (key.startsWith('diagramViewer.v1:')) return true;
		}
		return false;
	}`)
	if err != nil {
		t.Fatalf("could not check localStorage: %v", err)
	}
	if storageResult != true {
		t.Fatal("localStorage should be populated after first successful load")
	}

	// --- Second load: same page, manifest fetch returns 500 ---
	// The manifest attribute is still set, so connectedCallback will fetch (not use storage).
	_, err = page.Goto(testServer.URL+"/fixture.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate on reload: %v", err)
	}

	// Wait for the error UI to appear
	_, err = page.WaitForFunction(`() => {
		const viewer = document.querySelector('diagram-viewer');
		if (!viewer || !viewer.shadowRoot) return false;
		return !!viewer.shadowRoot.querySelector('.error');
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("error UI did not appear: %v", err)
	}

	// Assert the error UI is visible
	errorResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		if (!viewer || !viewer.shadowRoot) return {error: false};
		const errorDiv = viewer.shadowRoot.querySelector('.error');
		const hasError = !!errorDiv;
		const errorText = errorDiv ? errorDiv.textContent : '';
		return {error: hasError, text: errorText};
	}`)
	if err != nil {
		t.Fatalf("could not check error UI: %v", err)
	}
	errMap := errorResult.(map[string]interface{})
	if errMap["error"] != true {
		t.Fatal("manifest-error UI should be visible after fetch failure")
	}

	// Assert nav tree is empty (cached manifest NOT rendered)
	navResult, err := page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		if (!viewer || !viewer.shadowRoot) return {navCount: -1};
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		if (!tree || !tree.shadowRoot) return {navCount: 0};
		const navItems = tree.shadowRoot.querySelectorAll('.nav-item');
		return {navCount: navItems.length};
	}`)
	if err != nil {
		t.Fatalf("could not check nav tree: %v", err)
	}
	navMap := navResult.(map[string]interface{})
	if toFloat(navMap["navCount"]) > 0 {
		t.Fatal("nav tree should be empty when manifest fetch fails (no cached fallback)")
	}
}
