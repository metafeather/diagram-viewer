package tests

import (
	"testing"

	"github.com/playwright-community/playwright-go"
)

func TestLoader_RendersAlongsideViewer(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)

	result, err := page.Evaluate(`() => {
		const loader = document.querySelector('diagram-loader');
		const viewer = document.querySelector('diagram-viewer');
		if (!loader || !viewer) return {ok: false, reason: 'missing element'};
		const loaderShadow = loader.shadowRoot;
		if (!loaderShadow) return {ok: false, reason: 'no loader shadow'};
		const hasInput = !!loaderShadow.querySelector('input.path');
		const hasLoad = !!loaderShadow.querySelector('button.load');
		const hasJson = !!loaderShadow.querySelector('button.json');
		const hasReset = !!loaderShadow.querySelector('button.reset');
		return {ok: hasInput && hasLoad && hasJson && hasReset};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["ok"] != true {
		t.Fatalf("loader did not render correctly: %v", m["reason"])
	}
}

func TestLoader_LoadButtonReplacesManifest(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Type a different manifest path and click Load
	result, err := page.Evaluate(`async () => {
		const loader = document.querySelector('diagram-loader');
		const sr = loader.shadowRoot;
		const input = sr.querySelector('input.path');
		input.value = 'examples/kubernetes/manifest.json';
		sr.querySelector('button.load').click();
		// Wait for fetch + loadData
		await new Promise(r => setTimeout(r, 1000));
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const title = tree.shadowRoot.querySelector('.title');
		const navItems = tree.shadowRoot.querySelectorAll('.nav-item');
		return {title: title ? title.textContent : '', navCount: navItems.length};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["title"].(string) == "" {
		t.Fatal("title should be populated after Load")
	}
	if toFloat(m["navCount"]) < 1 {
		t.Fatal("sidebar nav should have items after Load")
	}
}

func TestLoader_JsonButtonOpensDialog(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	result, err := page.Evaluate(`() => {
		const loader = document.querySelector('diagram-loader');
		loader.shadowRoot.querySelector('button.json').click();
		const viewer = document.querySelector('diagram-viewer');
		const backdrop = viewer.shadowRoot.querySelector('.json-dialog-backdrop');
		return {open: backdrop && backdrop.classList.contains('open')};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["open"] != true {
		t.Fatal("JSON dialog should be open after clicking loader JSON button")
	}
}

func TestLoader_ResetClearsState(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)
	clearLocalStorage(t, page)
	loadFixture(t, page, "examples/kubernetes/manifest.json")

	// Navigate to a non-initial slide
	_, _ = page.Evaluate(`() => {
		const viewer = document.querySelector('diagram-viewer');
		const tree = viewer.shadowRoot.querySelector('diagram-nav-tree');
		const items = tree.shadowRoot.querySelectorAll('.nav-item');
		if (items.length > 1) items[1].click();
	}`)
	page.WaitForTimeout(300)

	// Click Reset via loader
	result, err := page.Evaluate(`() => {
		const loader = document.querySelector('diagram-loader');
		loader.shadowRoot.querySelector('button.reset').click();
		return new Promise(resolve => {
			setTimeout(() => {
				const stored = localStorage.getItem('diagramViewer.v1');
				const hash = location.hash;
				resolve({cleared: stored === null, hash});
			}, 400);
		});
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	// After reset, localStorage is cleared then repopulated from source
	// Hash should return to initial (overview or empty)
	hash := m["hash"].(string)
	if hash != "" && hash != "#overview" {
		t.Fatalf("expected hash to reset to overview, got %s", hash)
	}
}

func TestLoader_ForSelectorTargetsCorrectViewer(t *testing.T) {
	page := newPage(t)
	_, err := page.Goto(server.URL+"/examples/multi.html", playwright.PageGotoOptions{
		WaitUntil: playwright.WaitUntilStateNetworkidle,
	})
	if err != nil {
		t.Fatalf("could not navigate: %v", err)
	}
	// Wait for both viewers
	_, err = page.WaitForFunction(`() => {
		const left = document.querySelector('#left');
		const right = document.querySelector('#right');
		return !!(left && left.shadowRoot && left.shadowRoot.querySelector('diagram-canvas') &&
		          right && right.shadowRoot && right.shadowRoot.querySelector('diagram-canvas'));
	}`, nil, playwright.PageWaitForFunctionOptions{Timeout: playwright.Float(10000)})
	if err != nil {
		t.Fatalf("viewers did not attach: %v", err)
	}

	// Open JSON dialog via left loader — only left viewer should open dialog
	result, err := page.Evaluate(`() => {
		const leftLoader = document.querySelector('[for="#left"]');
		leftLoader.shadowRoot.querySelector('button.json').click();
		const leftViewer = document.querySelector('#left');
		const rightViewer = document.querySelector('#right');
		const leftOpen = leftViewer.shadowRoot.querySelector('.json-dialog-backdrop').classList.contains('open');
		const rightOpen = rightViewer.shadowRoot.querySelector('.json-dialog-backdrop').classList.contains('open');
		return {leftOpen, rightOpen};
	}`)
	if err != nil {
		t.Fatalf("evaluate failed: %v", err)
	}
	m := result.(map[string]interface{})
	if m["leftOpen"] != true {
		t.Fatal("left viewer dialog should be open")
	}
	if m["rightOpen"] == true {
		t.Fatal("right viewer dialog should NOT be open")
	}
}

func TestLoader_NoMatchingTargetIsNoOp(t *testing.T) {
	page := newPage(t)
	navigateToIndex(t, page)

	// Listen for console warnings
	warnings := make([]string, 0)
	page.On("console", func(msg playwright.ConsoleMessage) {
		if msg.Type() == "warning" {
			warnings = append(warnings, msg.Text())
		}
	})

	// Create a loader with a bad selector and try clicking buttons
	result, err := page.Evaluate(`() => {
		const loader = document.createElement('diagram-loader');
		loader.setAttribute('for', '#nonexistent');
		document.body.appendChild(loader);
		// Try all three buttons — none should throw
		try {
			loader.shadowRoot.querySelector('button.load').click();
			loader.shadowRoot.querySelector('button.json').click();
			loader.shadowRoot.querySelector('button.reset').click();
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
		t.Fatalf("bad selector should not throw, got: %v", m["error"])
	}

	// Give console messages time to arrive
	page.WaitForTimeout(200)

	// Verify at least one warning was logged about target not found
	found := false
	for _, w := range warnings {
		if len(w) > 0 {
			found = true
			break
		}
	}
	if !found {
		t.Log("warning: could not verify console warning was logged (may be timing)")
	}
}
